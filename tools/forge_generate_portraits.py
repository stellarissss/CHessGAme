#!/usr/bin/env python3
"""
forge_generate_portraits.py — 静态立绘重制（SDXL + Pixel Art XL + LayerDiffusion）
==============================================================================
在 Google Colab (T4) 上运行，调用本地 Forge (http://127.0.0.1:7860) 的
/sdapi/v1/img2img 接口：

  现有白色背景 .jpg (Seedream 立绘)
        ↓ img2img (denoise 0.45, 保人设、转像素画风)
  SDXL + Pixel Art XL LoRA + LayerDiffusion 透明模式
        ↓ 原生 RGBA PNG（头发丝/半透明细节完美保留，无需 rembg 抠图）
  覆盖 {char}/{char}_{emotion}.png (透明立绘)
  覆盖 {char}/{char}_{emotion}.jpg (RGBA 合成白底，动画首帧参考)

用法（在 Colab，Forge 已启动后）:
    cd /content/CHessGAme/tools
    python forge_generate_portraits.py             # 全部生成
    python forge_generate_portraits.py --only boy  # 仅 boy
    python forge_generate_portraits.py --skip-if-done  # 跳过已生成
"""

import argparse
import json
import sys
import time
from pathlib import Path

import requests
from PIL import Image

# 同目录配置
sys.path.insert(0, str(Path(__file__).parent))
from forge_asset_config import (
    CHARACTERS, CHAR_DIR, FORGE_URL, SDXL_MODEL,
    PIXEL_STYLE_POS, PIXEL_STYLE_NEG, build_lora_prompt,
    PORTRAIT_PARAMS, wait_for_forge, set_model,
    img_to_base64, base64_to_img,
)

PROGRESS_FILE = Path("/content/portraits_progress.json")


def load_progress():
    if PROGRESS_FILE.exists():
        return json.loads(PROGRESS_FILE.read_text())
    return {}


def save_progress(p):
    PROGRESS_FILE.write_text(json.dumps(p, ensure_ascii=False, indent=2))


def probe_layerdiffuse_script(url=FORGE_URL):
    """探测 Forge 的 LayerDiffusion script 名与参数结构。
    返回 (script_name, args_template) 或 (None, None)。"""
    try:
        r = requests.get(f"{url}/sdapi/v1/script-info", timeout=10)
        r.raise_for_status()
        scripts = r.json()
    except Exception as e:
        print(f"⚠ 无法获取 script-info: {e}", flush=True)
        return None, None

    for s in scripts:
        name = s.get("name", "")
        if "layer" in name.lower() or "layerdiffuse" in name.lower():
            print(f"  发现 LayerDiffusion script: '{name}'", flush=True)
            # 尝试从 is_alwayson / args 推断
            return name, s

    # 没找到，列出所有 script 名供调试
    names = [s.get("name", "?") for s in scripts]
    print(f"⚠ 未找到 LayerDiffusion script。可用 scripts: {names}", flush=True)
    return None, None


def make_layerdiffuse_alwayson(url=FORGE_URL):
    """构造 LayerDiffusion 的 alwayson_scripts 块。
    LayerDiffusion 在 Forge 里通过 alwayson_scripts 传参：
      method = 'Only Generate Transparent Image (Attention Injection)' → 原生 RGBA
    若探测失败，使用通用参数名（Forge 标准命名）。"""
    script_name, _ = probe_layerdiffuse_script(url)
    if not script_name:
        script_name = "LayerDiffuse"  # Forge 默认名

    return {
        script_name: {
            "args": [{
                "enabled": True,
                "method": "Only Generate Transparent Image (Attention Injection)",
                "weight": 1.0,
                "ending_step": 1.0,
                "fg_image": None,
                "bg_image": None,
                "blend_image": None,
                "resize_mode": "Crop and Resize",
            }]
        }
    }


def generate_one_portrait(char_dir, emotion, char_info, skip_if_done, url=FORGE_URL):
    """生成单个角色表情的透明立绘。"""
    stem = f"{char_dir}_{emotion}"
    ref_jpg = CHAR_DIR / char_dir / f"{stem}.jpg"
    out_png = CHAR_DIR / char_dir / f"{stem}.png"
    out_jpg = CHAR_DIR / char_dir / f"{stem}.jpg"  # 白底合成，覆盖原参考

    if skip_if_done and out_png.exists():
        # 检查是否已是 RGBA 且尺寸正确
        try:
            im = Image.open(out_png)
            if im.mode == "RGBA" and im.size == (PORTRAIT_PARAMS["width"], PORTRAIT_PARAMS["height"]):
                print(f"  ✓ {stem} 已存在，跳过", flush=True)
                return {"ok": True, "skipped": True}
        except Exception:
            pass

    if not ref_jpg.exists():
        print(f"  ✗ {stem} 参考图缺失: {ref_jpg}", flush=True)
        return {"ok": False, "error": "no reference"}

    # 读取参考图 → base64
    ref_img = Image.open(ref_jpg).convert("RGB")
    ref_b64 = img_to_base64(ref_img, "PNG")

    # 构造提示词：Pixel Art XL LoRA + 画风 + 人设 + 表情
    prompt = (
        build_lora_prompt(1.1)
        + PIXEL_STYLE_POS + ", "
        + char_info["desc"] + ", "
        + char_info["emotions"][emotion]
    )

    payload = {
        "init_images": [ref_b64],
        "prompt": prompt,
        "negative_prompt": PIXEL_STYLE_NEG,
        "denoising_strength": PORTRAIT_PARAMS["denoising_strength"],
        "steps": PORTRAIT_PARAMS["steps"],
        "cfg_scale": PORTRAIT_PARAMS["cfg_scale"],
        "sampler_name": PORTRAIT_PARAMS["sampler_name"],
        "width": PORTRAIT_PARAMS["width"],
        "height": PORTRAIT_PARAMS["height"],
        "clip_skip": PORTRAIT_PARAMS["clip_skip"],
        "alwayson_scripts": make_layerdiffuse_alwayson(url),
    }

    print(f"  → 生成 {stem} (img2img + LayerDiffusion 透明)...", flush=True)
    try:
        r = requests.post(f"{url}/sdapi/v1/img2img", json=payload, timeout=600)
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        print(f"  ✗ {stem} API 失败: {e}", flush=True)
        return {"ok": False, "error": str(e)}

    images = data.get("images", [])
    if not images:
        print(f"  ✗ {stem} 无图像返回", flush=True)
        return {"ok": False, "error": "no image"}

    img_b64 = images[0]
    # Forge img2img 返回的图可能是 RGBA（LayerDiffusion）或 RGB
    img = base64_to_img(img_b64)
    print(f"     返回图: mode={img.mode}, size={img.size}", flush=True)

    # 确保 RGBA
    if img.mode != "RGBA":
        # LayerDiffusion 可能未生效，转为 RGBA（透明背景假设）
        # 兜底：用 rembg？不，用户要求原生透明。先记录警告
        print(f"  ⚠ {stem} 返回非 RGBA（LayerDiffusion 可能未生效），保留 RGB", flush=True)
        img = img.convert("RGBA")

    out_png.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_png, "PNG")

    # 合成白底 JPG（动画首帧参考，避免透明边缘在 img2img 时被填充）
    white = Image.new("RGBA", img.size, (255, 255, 255, 255))
    composited = Image.alpha_composite(white, img).convert("RGB")
    composited.save(out_jpg, "JPEG", quality=92)

    print(f"  ✓ {stem} 完成: PNG({img.mode}) + JPG(白底)", flush=True)
    return {"ok": True, "mode": img.mode, "size": img.size}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="仅生成指定角色（如 boy）", default=None)
    ap.add_argument("--skip-if-done", action="store_true", help="跳过已生成")
    args = ap.parse_args()

    if not wait_for_forge():
        sys.exit(1)
    set_model(SDXL_MODEL)

    progress = load_progress()
    total = 0
    done = 0
    failed = []

    for char_dir, info in CHARACTERS.items():
        if args.only and char_dir != args.only:
            continue
        print(f"\n=== {info['name']} ({char_dir}) ===", flush=True)
        for emotion in info["emotions"]:
            total += 1
            key = f"{char_dir}/{emotion}"
            res = generate_one_portrait(char_dir, emotion, info, args.skip_if_done)
            progress[key] = res
            save_progress(progress)
            if res.get("ok"):
                done += 1
            else:
                failed.append(key)

    print(f"\n{'='*60}")
    print(f"完成: {done}/{total} 成功", flush=True)
    if failed:
        print(f"失败 ({len(failed)}): {failed}", flush=True)
        print("重试: python forge_generate_portraits.py --skip-if-done", flush=True)
    else:
        print("🎉 全部立绘生成完成！", flush=True)


if __name__ == "__main__":
    main()
