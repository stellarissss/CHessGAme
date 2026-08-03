#!/usr/bin/env python3
"""
Seedream 5.0 Pro 精细像素立绘全套生成
=====================================
为林夜(boy)和陈默(chenmo)生成全套透明像素立绘 PNG，覆盖 story.json 引用的所有表情。

方案：
- 林夜: 已有 linne_neutral_white.png 作 base，用图生图(strength 0.45)生成 7 个表情变体
- 陈默: 重新设计提示词(苗条年轻活泼可爱版)，先生成 base，再图生图生成 6 个变体
- 输出: /shared/assets/characters/{boy,chenmo}/{stem}.png (透明, 2048×2048)
- 与原 .jpg 共存：dialogue.js 优先加载 .png，自动透明显示

人设来源: 轻RPG化剧情实现草案 v1.4 + 用户反馈
- 林夜: 17岁高二男生，内向阴郁，"作弊者"身份 (用户已确认形象)
- 陈默(女版): 17岁高二女生，苗条年轻活泼可爱，棋艺高超
"""
import json
import os
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path

# ── 配置 ──
API_KEY = os.getenv("ARK_API_KEY") or os.getenv("MODEL_IMAGE_API_KEY")
ENDPOINT = "https://ark.cn-beijing.volces.com/api/v3/images/generations"
MODEL = "doubao-seedream-5-0-pro-260628"
GEN_SIZE = "2048x2048"
STRENGTH = 0.45  # 图生图强度，平衡一致性与表情变化

CHAR_DIR = Path(__file__).resolve().parent / "characters"
PREVIEW_DIR = CHAR_DIR / "_preview"
PREVIEW_DIR.mkdir(parents=True, exist_ok=True)

# ── 像素艺术公共描述 ──
PIXEL_STYLE = (
    "pixel art style, retro 16-bit RPG character portrait sprite, "
    "limited color palette (about 32 colors), flat colors with minimal shading, "
    "hard pixel edges, no anti-aliasing, no gradients, no soft blur, "
    "crisp pixel-perfect outlines, dithering for shading transitions, "
    "NES SNES era JRPG visual style, inspired by Final Fantasy VI and Chrono Trigger portraits"
)

# ── 林夜人设(用户已确认)──
LINNE_NEUTRAL = (
    "Pixel art bust portrait, half body from chest up, "
    "a 17-year-old Chinese high school boy student, "
    "short messy black hair slightly covering forehead, "
    "dark brown irises with introverted melancholic gaze, looking slightly downward and to the side, "
    "subtle tired dark circles under eyes, guarded defensive expression, "
    "introverted gloomy withdrawn personality, secret guilt of being a cheater, "
    "wearing a white dress shirt under a dark navy blue school uniform blazer "
    "with a thin dark red collar tie, collar slightly loose, "
    "young RPG protagonist with troubled past vibe, "
    "centered composition, facing 3/4 front view, "
    f"{PIXEL_STYLE}, "
    "pure solid white background (#FFFFFF), isolated subject on white backdrop, "
    "no shadow on background, character sprite for game cutout, "
    "high quality pixel art, clean readable silhouette"
)

# ── 陈默人设(苗条年轻活泼可爱新版)──
CHENMO_NEUTRAL = (
    "Pixel art bust portrait, half body from chest up, "
    "a 17-year-old Chinese high school girl student, slim and petite build, youthful and lively, "
    "shoulder-length straight black hair with a small cute hair clip on the left side, "
    "soft gentle apricot-shaped eyes with warm bright brown irises, "
    "lively cheerful cute expression with a gentle shy smile, "
    "energetic but introverted personality, cute and gentle coexisting, vibrant youthful vibe, "
    "wearing a white dress shirt under a dark navy blue school uniform blazer "
    "with a red bow tie, a small chess piece brooch pinned on chest, "
    "young RPG heroine vibe, "
    "centered composition, facing 3/4 front view, "
    f"{PIXEL_STYLE}, "
    "pure solid white background (#FFFFFF), isolated subject on white backdrop, "
    "no shadow on background, character sprite for game cutout, "
    "high quality pixel art, clean readable silhouette"
)

# ── 表情变体提示词(基于 base 人设 + 表情描述)──
# 林夜 7 个变体(覆盖 story.json 引用)，neutral 已生成
LINNE_VARIANTS = {
    "smile": "a gentle faint smile, slightly softened eyes, subtle warmth breaking through the gloomy facade",
    "happy": "a bright genuine smile, eyes slightly crinkled in joy, rare moment of happiness",
    "surprised": "wide eyes with raised eyebrows, mouth slightly open in shock, startled expression",
    "thinking": "eyes looking up and to the side, one eyebrow slightly raised, thoughtful pensive expression, hand near chin",
    "determined": "fierce determined gaze, furrowed brow, clenched jaw, resolute unwavering expression",
    "sad": "downcast eyes, slight frown, melancholic sorrowful expression, hint of tears in eyes",
    "confident": "subtle smirk, raised chin, confident knowing look, half-lidded eyes",
    "defeated": "head bowed low, eyes hidden under hair, broken despondent expression, slumped shoulders",
}

# 陈默 6 个变体(覆盖 story.json 引用)，neutral/portrait 用 base
CHENMO_VARIANTS = {
    "smile": "a warm bright cheerful smile, eyes crinkled in joy, cute happy expression",
    "silent": "quiet calm neutral expression, lips closed gently, soft contemplative gaze",
    "thinking": "head tilted slightly, finger near chin, curious pondering expression with furrowed brow",
    "awkward": "embarrassed awkward expression, blushing cheeks, nervous forced smile, looking away",
    "surprised": "wide eyes, mouth open in cute surprise, raised eyebrows, startled expression",
    "playing": "playing chess with focused intense gaze, holding a chess piece, clever sharp expression",
    "portrait": "neutral default portrait pose, gentle calm expression, slight smile, looking forward",
}


def _read_image_b64(path: Path) -> str:
    import base64
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode("ascii")


def generate_pro(prompt: str, out_path: Path, ref_image_path: Path = None,
                  strength: float = None, size: str = GEN_SIZE) -> bool:
    """Pro 文生图/图生图，下载到 out_path"""
    payload = {
        "model": MODEL,
        "prompt": prompt,
        "size": size,
        "watermark": False,
        "response_format": "url",
        "output_format": "png",
    }
    if ref_image_path is not None and ref_image_path.exists():
        b64 = _read_image_b64(ref_image_path)
        payload["image"] = f"data:image/png;base64,{b64}"
        if strength is not None:
            payload["strength"] = strength

    req = urllib.request.Request(
        ENDPOINT,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {API_KEY}"},
        method="POST",
    )
    mode = f"图生图(s={strength})" if ref_image_path else "文生图"
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=600) as resp:
            data = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", errors="replace")[:300]
        print(f"  ❌ {mode} HTTP {e.code} ({time.time()-t0:.0f}s): {err}")
        return False
    except Exception as e:
        print(f"  ❌ {mode} {type(e).__name__} ({time.time()-t0:.0f}s): {e}")
        return False

    images = data.get("data", [])
    if not images or not images[0].get("url"):
        print(f"  ❌ {mode} 无图片: {json.dumps(data, ensure_ascii=False)[:200]}")
        return False

    out_path.parent.mkdir(parents=True, exist_ok=True)
    urllib.request.urlretrieve(images[0]["url"], str(out_path))
    print(f"  ✅ {mode} ({time.time()-t0:.0f}s): {out_path.name} ({out_path.stat().st_size//1024}KB)")
    return True


def rembg_cutout(src: Path, dst: Path):
    """rembg 抠图 + alpha 二值化 + 边缘羽化"""
    from rembg import remove
    from PIL import Image, ImageFilter
    import numpy as np

    BINARY_THRESHOLD = 128
    EDGE_BLUR = 1.2

    img = Image.open(src).convert("RGB")
    out = remove(img)
    r, g, b, a = out.split()

    a_arr = np.array(a)
    binary = (a_arr > BINARY_THRESHOLD).astype(np.uint8) * 255
    a_final = Image.fromarray(binary, "L").filter(ImageFilter.GaussianBlur(EDGE_BLUR))
    a_arr2 = np.array(a_final)
    a_arr2 = np.where(a_arr2 > 200, 255, a_arr2)
    a_final = Image.fromarray(a_arr2.astype(np.uint8), "L")

    Image.merge("RGBA", (r, g, b, a_final)).save(dst, "PNG")
    opaque = (a_arr2 > 200).sum() / a_arr2.size * 100
    print(f"  ✂ 抠图: {dst.name} (不透明 {opaque:.1f}%)")


def build_variant_prompt(base_prompt: str, emotion_desc: str) -> str:
    """在 base 提示词中替换表情描述部分"""
    # 移除原表情相关描述，加入新表情
    # 简化方案：直接在 base 后追加表情指令，让模型优先采用
    return f"{base_prompt}, EXPRESSION OVERRIDE: {emotion_desc}"


def gen_character(name: str, base_prompt: str, neutral_stem: str,
                  variants: dict, target_dir: Path, target_prefix: str):
    """生成单个角色的全套立绘"""
    target_dir.mkdir(parents=True, exist_ok=True)

    # 1. 生成/复用 neutral base 白底图
    base_white = PREVIEW_DIR / f"{neutral_stem}_white.png"
    if base_white.exists():
        print(f"\n▶ [{name}] 复用已有 base: {base_white.name}")
    else:
        print(f"\n▶ [{name}] 生成 base 白底立绘...")
        if not generate_pro(base_prompt, base_white):
            print(f"  ⚠ base 生成失败，跳过 {name}")
            return False

    # 2. 抠图 base → 输出 {prefix}_neutral.png 或对应表情
    base_out = target_dir / f"{target_prefix}_neutral.png" if target_prefix == "boy" else None
    if base_out:
        print(f"  抠图 base → {base_out.name}")
        try: rembg_cutout(base_white, base_out)
        except Exception as e: print(f"  ❌ 抠图失败: {e}")

    # 3. 图生图生成每个变体
    for emotion, desc in variants.items():
        stem = f"{target_prefix}_{emotion}"
        out_white = PREVIEW_DIR / f"{neutral_stem}_{emotion}_white.png"
        out_png = target_dir / f"{stem}.png"

        print(f"\n▶ [{name}] {emotion}")
        prompt = build_variant_prompt(base_prompt, desc)
        if not generate_pro(prompt, out_white, ref_image_path=base_white, strength=STRENGTH):
            print(f"  ⚠ {emotion} 生成失败，跳过")
            continue
        try:
            rembg_cutout(out_white, out_png)
        except Exception as e:
            print(f"  ❌ {emotion} 抠图失败: {e}")
    return True


def main():
    if not API_KEY:
        print("❌ 未设置 ARK_API_KEY"); sys.exit(1)

    print("=" * 60)
    print("🎨 Seedream 5.0 Pro 全套像素立绘生成")
    print(f"模型: {MODEL} | 尺寸: {GEN_SIZE} | 图生图 strength: {STRENGTH}")
    print("=" * 60)

    # ── 林夜：复用已确认的 neutral base ──
    # 但 base_white 是旧版像素风，需要确认是否使用 PREVIEW_DIR/linne_neutral_white.png
    # 该文件已是用户确认的"内向阴郁"版本像素风
    gen_character(
        name="林夜",
        base_prompt=LINNE_NEUTRAL,
        neutral_stem="linne_neutral",
        variants=LINNE_VARIANTS,
        target_dir=CHAR_DIR / "boy",
        target_prefix="boy",
    )

    # ── 陈默：重新生成 base(苗条年轻活泼可爱版) ──
    # 先删除旧 base 强制重生
    old_base = PREVIEW_DIR / "chenmo_f_neutral_white.png"
    if old_base.exists():
        old_base.unlink()
        print(f"\n🗑 删除旧 chenmo base: {old_base.name}")

    gen_character(
        name="陈默(女版)",
        base_prompt=CHENMO_NEUTRAL,
        neutral_stem="chenmo_f_neutral",
        variants=CHENMO_VARIANTS,
        target_dir=CHAR_DIR / "chenmo",
        target_prefix="chenmo",
    )
    # 陈默 neutral 输出为 chenmo_portrait.png (story.json 默认立绘)
    chenmo_portrait = CHAR_DIR / "chenmo" / "chenmo_portrait.png"
    if not chenmo_portrait.exists():
        base_white = PREVIEW_DIR / "chenmo_f_neutral_white.png"
        if base_white.exists():
            print(f"\n▶ [陈默] 生成 chenmo_portrait.png (默认立绘)")
            try: rembg_cutout(base_white, chenmo_portrait)
            except Exception as e: print(f"  ❌ {e}")

    print("\n" + "=" * 60)
    print("✅ 全套立绘生成完成！")
    print(f"\n📁 boy/ 目录:")
    for f in sorted((CHAR_DIR / "boy").glob("*.png")):
        print(f"  {f.name} ({f.stat().st_size//1024}KB)")
    print(f"\n📁 chenmo/ 目录:")
    for f in sorted((CHAR_DIR / "chenmo").glob("*.png")):
        print(f"  {f.name} ({f.stat().st_size//1024}KB)")


if __name__ == "__main__":
    main()
