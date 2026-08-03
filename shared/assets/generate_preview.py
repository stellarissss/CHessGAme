#!/usr/bin/env python3
"""
Seedream 5.0 Pro 精细像素立绘预览生成器
=====================================
用 Pro 模型文生图生成林夜+女版陈默的 base 立绘（精细像素艺术风格 / 纯白背景），
保持 2048x2048 原始尺寸，rembg 抠图为透明 PNG。

人设来源：轻RPG化剧情实现草案 v1.4 + generate_all.py 提示词
- 林夜：17岁高二男生，内向阴郁、自尊心强、内心善良但嘴硬（"作弊者"身份）
- 陈默(女版)：17岁高二女生，温和内向+棋艺高超，齐肩黑发+小发夹

最终交付规格：2048x2048 精细像素艺术 PNG，透明背景。
"""
import json
import os
import sys
import urllib.request
import urllib.error
from pathlib import Path

# ── 配置 ──
API_KEY = os.getenv("ARK_API_KEY") or os.getenv("MODEL_IMAGE_API_KEY")
ENDPOINT = "https://ark.cn-beijing.volces.com/api/v3/images/generations"
MODEL = "doubao-seedream-5-0-pro-260628"  # Pro 模型
PIXEL_SIZE = 2048  # 最终交付尺寸（保持 Pro 生成原尺寸）
GEN_SIZE = "2048x2048"  # Pro 生成尺寸（API 最小 ~1920x1920）

CHAR_DIR = Path(__file__).resolve().parent / "characters"
PREVIEW_DIR = CHAR_DIR / "_preview"
PREVIEW_DIR.mkdir(parents=True, exist_ok=True)

# ── 像素艺术公共描述（保证像素风一致）──
PIXEL_STYLE = (
    "pixel art style, retro 16-bit RPG character portrait sprite, "
    "limited color palette (about 32 colors), flat colors with minimal shading, "
    "hard pixel edges, no anti-aliasing, no gradients, no soft blur, "
    "crisp pixel-perfect outlines, dithering for shading transitions, "
    "NES SNES era JRPG visual style, inspired by Final Fantasy VI and Chrono Trigger portraits"
)

# ── 人设提示词（基于草案 v1.4，调整林夜为内向阴郁）──

# 林夜：17岁高二男生，内向阴郁、聪明但自尊心强，"作弊者"身份
# 嘴硬心善，眼神带忧郁/逃避感，不像传统阳光男主
LINNE_BASE = (
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

# 陈默(女版)：原男二改为女主，保留温和内向+棋艺高超特质
CHENMO_F_BASE = (
    "Pixel art bust portrait, half body from chest up, "
    "a 17-year-old Chinese high school girl student, "
    "shoulder-length straight black hair with a small cute hair clip on the left side, "
    "soft gentle apricot-shaped eyes with warm brown irises, "
    "gentle shy smile, calm and introverted personality, cute and gentle coexisting, "
    "wearing a white dress shirt under a dark navy blue school uniform blazer "
    "with a red bow tie, a small chess piece brooch pinned on chest, "
    "young RPG heroine vibe, "
    "centered composition, facing 3/4 front view, "
    f"{PIXEL_STYLE}, "
    "pure solid white background (#FFFFFF), isolated subject on white backdrop, "
    "no shadow on background, character sprite for game cutout, "
    "high quality pixel art, clean readable silhouette"
)


def generate_pro(prompt: str, out_path: Path, size: str = GEN_SIZE,
                 ref_image_path: Path = None, strength: float = None) -> bool:
    """用 Pro 模型文生图/图生图，下载到 out_path"""
    payload = {
        "model": MODEL,
        "prompt": prompt,
        "size": size,
        "watermark": False,
        "response_format": "url",
        "output_format": "png",
    }
    # 图生图：传 base64 引用图
    if ref_image_path is not None and ref_image_path.exists():
        import base64
        with open(ref_image_path, "rb") as f:
            b64 = base64.b64encode(f.read()).decode("ascii")
        # Pro 模型 image 参数支持 base64 data url
        payload["image"] = f"data:image/png;base64,{b64}"
        if strength is not None:
            payload["strength"] = strength  # 0.4-0.55 平衡一致性与变化

    req = urllib.request.Request(
        ENDPOINT,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {API_KEY}",
        },
        method="POST",
    )
    mode = "图生图" if ref_image_path else "文生图"
    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            data = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", errors="replace")[:500]
        print(f"  ❌ {mode} HTTP {e.code}: {err}")
        return False
    except Exception as e:
        print(f"  ❌ {mode} {type(e).__name__}: {e}")
        return False

    images = data.get("data", [])
    if not images:
        print(f"  ❌ 无图片: {json.dumps(data, ensure_ascii=False)[:300]}")
        return False

    url = images[0].get("url")
    if not url:
        print(f"  ❌ 无URL: {json.dumps(images[0], ensure_ascii=False)[:200]}")
        return False

    out_path.parent.mkdir(parents=True, exist_ok=True)
    urllib.request.urlretrieve(url, str(out_path))
    print(f"  ✅ {mode}下载: {out_path.name} ({out_path.stat().st_size // 1024}KB)")
    return True


def rembg_cutout(src: Path, dst: Path):
    """rembg 抠图 + alpha 二值化 + 边缘羽化，保持原尺寸"""
    from rembg import remove
    from PIL import Image, ImageFilter
    import numpy as np

    BINARY_THRESHOLD = 128
    EDGE_BLUR = 1.2

    img = Image.open(src).convert("RGB")
    out = remove(img)
    r, g, b, a = out.split()

    # alpha 二值化 + 边缘羽化
    a_arr = np.array(a)
    binary = (a_arr > BINARY_THRESHOLD).astype(np.uint8) * 255
    a_final = Image.fromarray(binary, "L").filter(ImageFilter.GaussianBlur(EDGE_BLUR))
    a_arr2 = np.array(a_final)
    a_arr2 = np.where(a_arr2 > 200, 255, a_arr2)
    a_final = Image.fromarray(a_arr2.astype(np.uint8), "L")

    Image.merge("RGBA", (r, g, b, a_final)).save(dst, "PNG")

    opaque = (a_arr2 > 200).sum() / a_arr2.size * 100
    print(f"  ✂ 抠图: {dst.name} (不透明 {opaque:.1f}%)")
    return opaque


def main():
    if not API_KEY:
        print("❌ 未设置 ARK_API_KEY")
        sys.exit(1)

    print("=" * 60)
    print("🎨 Seedream 5.0 Pro 像素立绘预览生成")
    print(f"模型: {MODEL} | 像素: {PIXEL_SIZE}×{PIXEL_SIZE} | 生成: {GEN_SIZE}")
    print(f"输出: {PREVIEW_DIR}")
    print("=" * 60)

    previews = [
        ("linne_neutral", LINNE_BASE, "林夜 neutral base (内向阴郁)"),
        ("chenmo_f_neutral", CHENMO_F_BASE, "女版陈默 neutral base"),
    ]

    for stem, prompt, label in previews:
        print(f"\n▶ [{label}]")
        white_png = PREVIEW_DIR / f"{stem}_white.png"        # 白底原图 2K
        cutout_png = PREVIEW_DIR / f"{stem}_cutout.png"      # 抠图透明 PNG

        # 1. Pro 文生图（白底 2K，精细像素艺术风格）
        print(f"  生成白底像素立绘 (Pro {GEN_SIZE})...")
        ok = generate_pro(prompt, white_png)
        if not ok:
            continue

        # 2. rembg 抠图（保持原尺寸）
        print(f"  rembg 抠图...")
        try:
            rembg_cutout(white_png, cutout_png)
        except Exception as e:
            print(f"  ❌ 抠图失败: {e}")

    print("\n" + "=" * 60)
    print("✅ 精细像素立绘预览生成完成！")
    print(f"📁 位置: {PREVIEW_DIR}")
    print("\n关键文件:")
    for f in sorted(PREVIEW_DIR.glob("*_white.png")):
        print(f"  {f.name} ({f.stat().st_size // 1024}KB)")
    for f in sorted(PREVIEW_DIR.glob("*_cutout.png")):
        print(f"  {f.name} ({f.stat().st_size // 1024}KB)")


if __name__ == "__main__":
    main()
