#!/usr/bin/env python3
"""
forge_generate_animations.py — 动画重制（AnimateDiff-SDXL + RIFE + LayerDiffusion）
==============================================================================
在 Google Colab (T4) 上运行，调用本地 Forge 的 /sdapi/v1/img2img：

  现有/新生成白色背景 .jpg (立绘)
        ↓ img2img + AnimateDiff-SDXL (16帧/8fps=2秒, closed_loop=R+P)
  SDXL + Pixel Art XL LoRA + AnimateDiff 运动模块
        ↓ 16 帧 RGB PNG（微妙呼吸 + 眨眼 + 头发摆动，首尾衔接）
  RIFE 插帧 16 → 48 帧 (24FPS × 2秒)
        ↓
  LayerDiffusion 逐帧透明化 → 原生 RGBA PNG
        ↓
  覆盖 {char}/{char}_{emotion}_f{1-48}.png

仅重制现有 10 个动画：boy(6) + chenmo(4)。
前端 dialogue.js 探测 _f1.png 存在则播 24FPS 48帧循环，无需改前端。

用法（在 Colab，Forge 已启动且立绘已生成后）:
    cd /content/CHessGAme/tools
    python forge_generate_animations.py             # 全部
    python forge_generate_animations.py --only boy  # 仅 boy
    python forge_generate_animations.py --skip-if-done
"""

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

import requests
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from forge_asset_config import (
    CHARACTERS, ANIMATIONS, CHAR_DIR, FORGE_URL, SDXL_MODEL,
    PIXEL_STYLE_NEG, ANIM_PROMPT_TMPL, build_lora_prompt,
    ANIM_PARAMS, TARGET_FRAMES, TARGET_FPS,
    wait_for_forge, set_model, img_to_base64, base64_to_img,
)

PROGRESS_FILE = Path("/content/animations_progress.json")
ANIM_MOTION_MODEL = "mm_sdxl_v10_beta.ckpt"


def load_progress():
    if PROGRESS_FILE.exists():
        return json.loads(PROGRESS_FILE.read_text())
    return {}


def save_progress(p):
    PROGRESS_FILE.write_text(json.dumps(p, ensure_ascii=False, indent=2))


def make_animatediff_alwayson(first_frame_b64, url=FORGE_URL):
    """构造 AnimateDiff 的 alwayson_scripts 块（img2img 图生视频）。
    sd-webui-animatediff 扩展通过 alwayson_scripts.AnimateDiff.args 传参。
    batch_size 被 AnimateDiff 替换为帧数。"""
    return {
        "AnimateDiff": {
            "args": [{
                "model": ANIM_MOTION_MODEL,
                "format": ["PNG"],          # 保存帧到 outputs 目录
                "video_length": ANIM_PARAMS["video_length"],  # 16 帧
                "fps": ANIM_PARAMS["fps"],                    # 8 fps = 2秒
                "loop_number": 0,          # 单次生成
                "closed_loop": ANIM_PARAMS["closed_loop"],    # R+P 首尾衔接
                "batch_size": ANIM_PARAMS["video_length"],    # 帧数替换 batch_size
                "ui_frames": False,
                "opt_anim_args_x0_strength": 0.8,  # 首帧引导强度
                "opt_interp": "Disabled",
                "opt_stride": 1,
                "opt_closure": "R+P",
                "opt_skip": 1,
                "opt_max_ad_steps": 999,
                "first_frame": first_frame_b64,  # img2img 首帧
            }]
        }
    }


def make_layerdiffuse_alwayson(url=FORGE_URL):
    """LayerDiffusion 透明化（用于逐帧 RGBA 输出）。
    method = 'From Image to Transparent Image'（img→透明）"""
    try:
        r = requests.get(f"{url}/sdapi/v1/script-info", timeout=10)
        scripts = r.json() if r.status_code == 200 else []
    except Exception:
        scripts = []
    script_name = "LayerDiffuse"
    for s in scripts:
        if "layer" in s.get("name", "").lower():
            script_name = s["name"]
            break
    return {
        script_name: {
            "args": [{
                "enabled": True,
                "method": "From Image to Transparent Image",
                "weight": 1.0,
                "ending_step": 1.0,
                "fg_image": None,
                "bg_image": None,
                "blend_image": None,
                "resize_mode": "Crop and Resize",
            }]
        }
    }


def generate_animatediff_video(char_dir, emotion, char_info, url=FORGE_URL):
    """调用 AnimateDiff 生成 16 帧视频，返回帧 PNG 路径列表。"""
    stem = f"{char_dir}_{emotion}"
    ref_jpg = CHAR_DIR / char_dir / f"{stem}.jpg"
    if not ref_jpg.exists():
        print(f"  ✗ {stem} 首帧参考缺失", flush=True)
        return []

    ref_img = Image.open(ref_jpg).convert("RGB")
    # 缩放到动画分辨率
    if ref_img.size != (ANIM_PARAMS["width"], ANIM_PARAMS["height"]):
        ref_img = ref_img.resize((ANIM_PARAMS["width"], ANIM_PARAMS["height"]), Image.LANCZOS)
    first_b64 = img_to_base64(ref_img, "PNG")

    prompt = (
        build_lora_prompt(1.1)
        + ANIM_PROMPT_TMPL.format(character=char_info["desc"])
    )

    payload = {
        "init_images": [first_b64],
        "prompt": prompt,
        "negative_prompt": PIXEL_STYLE_NEG + ", scene change, camera movement, "
                          "character transformation, teleportation, sudden jump",
        "denoising_strength": ANIM_PARAMS["denoising_strength"],
        "steps": ANIM_PARAMS["steps"],
        "cfg_scale": ANIM_PARAMS["cfg_scale"],
        "sampler_name": ANIM_PARAMS["sampler_name"],
        "width": ANIM_PARAMS["width"],
        "height": ANIM_PARAMS["height"],
        "clip_skip": ANIM_PARAMS["clip_skip"],
        "batch_size": ANIM_PARAMS["video_length"],  # AnimateDiff 帧数
        "alwayson_scripts": make_animatediff_alwayson(first_b64, url),
    }

    print(f"  → AnimateDiff 生成 16 帧...", flush=True)
    try:
        r = requests.post(f"{url}/sdapi/v1/img2img", json=payload, timeout=900)
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        print(f"  ✗ AnimateDiff API 失败: {e}", flush=True)
        return []

    images = data.get("images", [])
    print(f"     返回 {len(images)} 帧", flush=True)
    if len(images) < 16:
        print(f"  ⚠ 帧数不足 16（{len(images)}），继续处理", flush=True)
    return images  # base64 列表


def save_frames_to_tmp(b64_frames, tmp_dir):
    """把 base64 帧保存为临时 PNG（编号 001, 002, ...）。"""
    tmp_dir.mkdir(parents=True, exist_ok=True)
    paths = []
    for i, b64 in enumerate(b64_frames, 1):
        img = base64_to_img(b64).convert("RGB")
        p = tmp_dir / f"{i:03d}.png"
        img.save(p, "PNG")
        paths.append(p)
    return paths


def rife_interpolate(input_dir, output_dir, target_fps=TARGET_FPS):
    """用 RIFE 将 16 帧（8fps）插帧到 48 帧（24fps）。
    需要 RIFE 已安装（Colab notebook 会预装）。
    若 RIFE 不可用，fallback：直接复制 16 帧 3 次凑 48 帧。"""
    output_dir.mkdir(parents=True, exist_ok=True)

    # 尝试 RIFE
    rife_script = Path("/content/RIFE/inference_img.py")
    if rife_script.exists():
        try:
            cmd = [
                "python", str(rife_script),
                "--img", str(input_dir),
                "--exp", "2",          # 2^2=4 倍插帧：16→64，取前48
                "--ratio", "0",
                "--output", str(output_dir),
            ]
            print(f"  → RIFE 插帧 ({input_dir} → {output_dir})...", flush=True)
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
            if r.returncode == 0:
                frames = sorted(output_dir.glob("*.png"))
                if len(frames) >= TARGET_FRAMES:
                    print(f"     RIFE 完成: {len(frames)} 帧", flush=True)
                    return frames[:TARGET_FRAMES]
        except Exception as e:
            print(f"  ⚠ RIFE 失败 ({e})，用复制法兜底", flush=True)

    # Fallback：复制帧凑 48（不流畅但保证帧数）
    print(f"  ⚠ RIFE 不可用，用复制法凑 {TARGET_FRAMES} 帧", flush=True)
    src_frames = sorted(input_dir.glob("*.png"))
    for i in range(TARGET_FRAMES):
        src = src_frames[i % len(src_frames)]
        dst = output_dir / f"{i+1:03d}.png"
        dst.write_bytes(src.read_bytes())
    return sorted(output_dir.glob("*.png"))[:TARGET_FRAMES]


def layerdiffuse_frames(frame_paths, url=FORGE_URL):
    """对 48 帧 RGB PNG 逐帧应用 LayerDiffusion 透明化 → RGBA。
    若 LayerDiffusion 不可用，fallback：rembg 抠图。"""
    rgba_paths = []
    for i, fp in enumerate(frame_paths, 1):
        img = Image.open(fp).convert("RGB")
        b64 = img_to_base64(img, "PNG")
        payload = {
            "init_images": [b64],
            "prompt": "pixel art, 16-bit, transparent background, game sprite",
            "negative_prompt": "background, scenery",
            "denoising_strength": 0.35,
            "steps": 15,
            "cfg_scale": 5.0,
            "sampler_name": "DPM++ 2M Karras",
            "width": img.width,
            "height": img.height,
            "alwayson_scripts": make_layerdiffuse_alwayson(url),
        }
        try:
            r = requests.post(f"{url}/sdapi/v1/img2img", json=payload, timeout=300)
            r.raise_for_status()
            out = base64_to_img(r.json()["images"][0])
            if out.mode != "RGBA":
                out = out.convert("RGBA")
        except Exception as e:
            print(f"  ⚠ 帧 {i} LayerDiffusion 失败 ({e})，用 rembg 兜底", flush=True)
            try:
                from rembg import remove
                out = remove(img)
            except Exception:
                out = img.convert("RGBA")
        rgba_paths.append(out)
        if i % 12 == 0:
            print(f"     透明化 {i}/{len(frame_paths)}", flush=True)
    return rgba_paths


def generate_one_animation(char_dir, emotion, skip_if_done, url=FORGE_URL):
    """生成单个动画：AnimateDiff 16帧 → RIFE 48帧 → LayerDiffusion 透明 → 覆盖。"""
    stem = f"{char_dir}_{emotion}"
    first_frame = CHAR_DIR / char_dir / f"{stem}_f1.png"

    if skip_if_done and first_frame.exists():
        # 检查是否已有 48 帧
        existing = list((CHAR_DIR / char_dir).glob(f"{stem}_f*.png"))
        if len(existing) >= TARGET_FRAMES:
            print(f"  ✓ {stem} 已有 {len(existing)} 帧，跳过", flush=True)
            return {"ok": True, "skipped": True}

    char_info = CHARACTERS[char_dir]
    work_dir = Path(f"/content/anim_work/{stem}")
    work_dir.mkdir(parents=True, exist_ok=True)

    # 1. AnimateDiff 生成 16 帧
    b64_frames = generate_animatediff_video(char_dir, emotion, char_info, url)
    if len(b64_frames) < 2:
        return {"ok": False, "error": "animatediff no frames"}
    raw_dir = work_dir / "raw"
    save_frames_to_tmp(b64_frames, raw_dir)

    # 2. RIFE 插帧 16 → 48
    interp_dir = work_dir / "interp"
    frame_paths = rife_interpolate(raw_dir, interp_dir)
    print(f"  ✓ 插帧完成: {len(frame_paths)} 帧", flush=True)

    # 3. LayerDiffusion 逐帧透明化
    print(f"  → LayerDiffusion 透明化 {len(frame_paths)} 帧...", flush=True)
    rgba_frames = layerdiffuse_frames(frame_paths, url)

    # 4. 覆盖保存 _f1.png ~ _f48.png
    char_out = CHAR_DIR / char_dir
    # 先删除旧帧
    for old in char_out.glob(f"{stem}_f*.png"):
        old.unlink()
    for i, img in enumerate(rgba_frames, 1):
        out = char_out / f"{stem}_f{i}.png"
        img.save(out, "PNG")

    print(f"  ✓ {stem} 完成: {len(rgba_frames)} 帧 RGBA", flush=True)
    return {"ok": True, "frames": len(rgba_frames)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="仅生成指定角色（如 boy）", default=None)
    ap.add_argument("--skip-if-done", action="store_true")
    args = ap.parse_args()

    if not wait_for_forge():
        sys.exit(1)
    set_model(SDXL_MODEL)

    progress = load_progress()
    done = 0
    failed = []

    for char_dir, emotion in ANIMATIONS:
        if args.only and char_dir != args.only:
            continue
        stem = f"{char_dir}/{emotion}"
        print(f"\n=== 动画 {stem} ===", flush=True)
        res = generate_one_animation(char_dir, emotion, args.skip_if_done)
        progress[stem] = res
        save_progress(progress)
        if res.get("ok"):
            done += 1
        else:
            failed.append(stem)

    print(f"\n{'='*60}")
    print(f"动画完成: {done}/{len(ANIMATIONS)} 成功", flush=True)
    if failed:
        print(f"失败: {failed}", flush=True)


if __name__ == "__main__":
    main()
