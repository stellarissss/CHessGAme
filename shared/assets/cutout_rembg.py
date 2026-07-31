#!/usr/bin/env python3
"""
批量抠图（rembg ML 语义分割版）：
将 shared/assets/characters/*/*.jpg 抠图为同名 .png（RGBA 透明背景），
供对话页 galgame 半身像放大使用。

相比 cutout_all.py（颜色距离+连通域），rembg 基于 U2Net 语义分割，
对头发、复杂边缘、非纯色背景效果显著更好。

依赖：Pillow + rembg（onnxruntime）+ numpy
首次运行 rembg 会下载 u2net 模型（~170MB），需联网。

用法：
    python cutout_rembg.py            # 处理全部
    python cutout_rembg.py --fallback # rembg 失败时回退到颜色距离算法
"""
from pathlib import Path
import sys
import argparse

import numpy as np
from PIL import Image, ImageFilter

CHAR_DIR = Path(__file__).resolve().parent / "characters"


def cutout_rembg(src: Path, dst: Path) -> tuple:
    """用 rembg 去除背景，输出 RGBA PNG。
    对像素画友好：仅对 alpha 通道做轻度羽化，RGB 保持锐利。"""
    from rembg import remove  # 延迟导入，仅在实际抠图时加载模型
    img = Image.open(src).convert("RGB")
    # rembg 返回 RGBA（背景 alpha=0）
    out = remove(img)  # PIL Image RGBA

    # 仅对 alpha 轻度羽化，保留 RGB 像素画锐利
    r, g, b, a = out.split()
    a = a.filter(ImageFilter.GaussianBlur(0.8))
    out = Image.merge("RGBA", (r, g, b, a))

    out.save(dst, "PNG")
    return out.height, out.width


def cutout_color_distance(src: Path, dst: Path) -> tuple:
    """回退算法：颜色距离 + 连通域（同 cutout_all.py）"""
    from scipy import ndimage
    import numpy as np
    from PIL import Image, ImageFilter

    THRESH = 42
    img = Image.open(src).convert("RGB")
    arr = np.asarray(img).astype(np.int16)
    H, W, _ = arr.shape
    corners = np.array([arr[0, 0], arr[0, W - 1], arr[H - 1, 0], arr[H - 1, W - 1]])
    bg = np.median(corners, axis=0).astype(np.int16)
    dist = np.sqrt(((arr - bg) ** 2).sum(axis=2))
    mask_bg = dist < THRESH
    labeled, n = ndimage.label(mask_bg)
    if n > 0:
        border_labels = set()
        border_labels.update(labeled[0, :].tolist())
        border_labels.update(labeled[-1, :].tolist())
        border_labels.update(labeled[:, 0].tolist())
        border_labels.update(labeled[:, -1].tolist())
        border_labels.discard(0)
        bg_keep = np.isin(labeled, list(border_labels)) if border_labels else np.zeros_like(mask_bg)
    else:
        bg_keep = np.zeros_like(mask_bg)
    char_mask = ~bg_keep
    char_mask = ndimage.binary_erosion(char_mask, iterations=1)
    char_mask = ndimage.binary_dilation(char_mask, iterations=1)
    alpha = (char_mask.astype(np.uint8)) * 255
    alpha_img = Image.fromarray(alpha, "L").filter(ImageFilter.GaussianBlur(1.0))
    alpha = np.asarray(alpha_img)
    rgba = np.dstack([arr.astype(np.uint8), alpha])
    Image.fromarray(rgba, "RGBA").save(dst, "PNG")
    return H, W


def main():
    ap = argparse.ArgumentParser(description="rembg ML 批量抠图")
    ap.add_argument("--fallback", action="store_true",
                    help="rembg 失败时回退到颜色距离算法")
    args = ap.parse_args()

    jpgs = sorted(CHAR_DIR.glob("*/*.jpg"))
    if not jpgs:
        print("未找到角色立绘 jpg。")
        sys.exit(1)

    ok = 0
    fail = []
    rembg_available = True
    try:
        import rembg  # noqa
    except ImportError:
        rembg_available = False
        print("⚠️  rembg 未安装，将使用回退算法。")

    for i, src in enumerate(jpgs, 1):
        dst = src.with_suffix(".png")
        try:
            if rembg_available:
                h, w = cutout_rembg(src, dst)
            elif args.fallback:
                h, w = cutout_color_distance(src, dst)
            else:
                raise RuntimeError("rembg unavailable and --fallback not set")
            ok += 1
            print(f"[{i}/{len(jpgs)}] ✓ {src.parent.name}/{src.name} -> {dst.name} ({w}x{h})")
        except Exception as e:
            # rembg 失败则尝试回退
            if args.fallback and rembg_available:
                try:
                    h, w = cutout_color_distance(src, dst)
                    ok += 1
                    print(f"[{i}/{len(jpgs)}] ~ {src.parent.name}/{src.name} -> {dst.name} (回退算法, {w}x{h})")
                    continue
                except Exception as e2:
                    fail.append((src, f"rembg:{e} | fallback:{e2}"))
            else:
                fail.append((src, str(e)))
            print(f"[{i}/{len(jpgs)}] ✗ {src.parent.name}/{src.name} : {e}")

    print("\n" + "=" * 50)
    print(f"✅ 成功 {ok}/{len(jpgs)}，输出 PNG 至各角色目录。")
    if fail:
        print(f"❌ 失败 {len(fail)} 张。")


if __name__ == "__main__":
    main()
