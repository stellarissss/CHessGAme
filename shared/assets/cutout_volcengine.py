#!/usr/bin/env python3
"""
批量精细抠图：调用火山引擎视觉智能 CV 服务的 HumanSegment 接口（人像分割），
将 shared/assets/characters/*/*.jpg（排除 .darkbg.jpg）抠图为同名 .png（RGBA 透明背景）。

HumanSegment（2020-08-26）：检测前景人像主体并精细抠图，返回前景图（透明背景）。
对像素画风格的二次元人像同样适用，refine=1 进一步精细化头发等复杂边缘。

依赖：volcengine（pip install volcengine）
环境变量：
    VOLC_ACCESS_KEY / VOLC_SECRET_KEY  必填
用法：
    python cutout_volcengine.py            # 全部
    python cutout_volcengine.py boy_neutral  # 仅匹配文件名包含 boy_neutral 的图
"""
from __future__ import annotations

import base64
import io
import os
import sys
import time
from pathlib import Path

from PIL import Image
from volcengine.visual.VisualService import VisualService

CHAR_DIR = Path(__file__).resolve().parent / "characters"

AK = os.environ.get("VOLC_ACCESS_KEY", "")
SK = os.environ.get("VOLC_SECRET_KEY", "")
if not AK or not SK:
    print("ERROR: 请设置 VOLC_ACCESS_KEY 与 VOLC_SECRET_KEY 环境变量。")
    sys.exit(1)

REFINE = 1                    # 1 = 边缘精细化抠图（matting lite）
RETURN_FOREGROUND = 1         # 1 = 返回透明背景前景图
SUCCESS_CODE = 10000          # HumanSegment 成功码
MAX_RETRY = 3
SLEEP_BETWEEN = 0.2            # API 节流（秒）


def _b64(path: Path) -> str:
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode("ascii")


def _save_rgba_png(b64_str: str, dst: Path) -> tuple[int, int, float]:
    """把火山引擎返回的 base64 PNG 解码为 RGBA 并保存。返回 (H, W, 不透明率%)"""
    raw = base64.b64decode(b64_str)
    img = Image.open(io.BytesIO(raw)).convert("RGBA")
    img.save(dst, "PNG")

    # 统计不透明像素率
    alpha = img.split()[-1]
    hist = alpha.histogram()
    total = sum(hist)
    opaque = sum(hist[128:])
    return img.height, img.width, (opaque / total * 100.0 if total else 0.0)


def cutout_one(api: VisualService, src: Path, dst: Path) -> tuple[int, int, float]:
    form = {
        "image_base64": _b64(src),
        "refine": REFINE,
        "return_foreground_image": RETURN_FOREGROUND,
    }
    last_err = None
    for attempt in range(1, MAX_RETRY + 1):
        try:
            resp = api.human_segment(form)
            data = resp if isinstance(resp, dict) else (resp.to_dict() if hasattr(resp, "to_dict") else dict(resp))
            code = data.get("code", -1)
            if code != SUCCESS_CODE:
                last_err = f"code={code} message={data.get('message', '')}"
            else:
                payload = data.get("data", {}) or {}
                fg_b64 = payload.get("foreground_image") or payload.get("foreground_image_base64")
                if fg_b64:
                    return _save_rgba_png(fg_b64, dst)
                mask_b64 = payload.get("mask") or payload.get("mask_base64")
                if mask_b64:
                    return _compose_with_mask(src, mask_b64, dst)
                raise RuntimeError("响应未返回前景图或 mask")
        except Exception as e:  # noqa: BLE001
            last_err = f"{type(e).__name__}: {e}"
            time.sleep(0.6 * attempt)
    raise RuntimeError(f"调用失败重试 {MAX_RETRY} 次: {last_err}")


def _compose_with_mask(src: Path, mask_b64: str, dst: Path) -> tuple[int, int, float]:
    """如果 API 只返回 mask，则用 mask 为原图生成 RGBA PNG。"""
    raw = base64.b64decode(mask_b64)
    mask_img = Image.open(io.BytesIO(raw)).convert("L")
    rgb = Image.open(src).convert("RGB")
    # 对齐 mask 尺寸
    if mask_img.size != rgb.size:
        mask_img = mask_img.resize(rgb.size, Image.BILINEAR)
    rgba = Image.merge("RGBA", (*rgb.split(), mask_img))
    rgba.save(dst, "PNG")
    hist = mask_img.histogram()
    total = sum(hist)
    opaque = sum(hist[128:])
    return rgba.height, rgba.width, (opaque / total * 100.0 if total else 0.0)


def list_targets(filter_name: str | None) -> list[Path]:
    jpgs = sorted(CHAR_DIR.glob("*/*.jpg"))
    jpgs = [j for j in jpgs if not j.stem.endswith("darkbg")]
    if filter_name:
        jpgs = [j for j in jpgs if filter_name in j.stem]
    return jpgs


def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("filter", nargs="?", default=None,
                    help="只处理文件名包含该字符串的图（用于测试）")
    args = ap.parse_args()

    api = VisualService()
    api.set_ak(AK)
    api.set_sk(SK)

    jpgs = list_targets(args.filter)
    if not jpgs:
        print("未找到角色立绘 jpg。")
        sys.exit(1)

    print(f"== 火山引擎 HumanSegment 批量精细抠图 ==")
    print(f"目标：{len(jpgs)} 张  refine={REFINE}  return_foreground={RETURN_FOREGROUND}\n")

    ok, fail = 0, []
    for i, src in enumerate(jpgs, 1):
        dst = src.with_suffix(".png")
        try:
            h, w, opq = cutout_one(api, src, dst)
            ok += 1
            print(f"[{i:>2}/{len(jpgs)}] ✓ {src.parent.name}/{src.name} -> {dst.name} "
                  f"({w}x{h}, 不透明 {opq:.1f}%)")
        except Exception as e:  # noqa: BLE001
            fail.append((src, str(e)))
            print(f"[{i:>2}/{len(jpgs)}] ✗ {src.parent.name}/{src.name} : {e}")
        time.sleep(SLEEP_BETWEEN)

    print("\n" + "=" * 50)
    print(f"✅ 成功 {ok}/{len(jpgs)}")
    if fail:
        print(f"❌ 失败 {len(fail)} 张：")
        for src, err in fail:
            print(f"   - {src.parent.name}/{src.name}: {err}")


if __name__ == "__main__":
    main()
