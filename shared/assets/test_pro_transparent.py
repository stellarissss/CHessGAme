#!/usr/bin/env python3
"""测试 Seedream 5.0 Pro 图层分离 + 透明背景能力"""
import json
import os
import sys
import urllib.request
import urllib.error
from pathlib import Path

API_KEY = os.getenv("ARK_API_KEY") or os.getenv("MODEL_IMAGE_API_KEY")
ENDPOINT = "https://ark.cn-beijing.volces.com/api/v3/images/generations"

# Pro 模型 ID
MODELS = {
    "pro": "doubao-seedream-5-0-pro-260628",
    "lite": "doubao-seedream-5-0-260128",
}

def test_model(model_key: str, prompt: str, label: str, out_path: Path):
    """测试单个模型+提示词，检查返回 PNG 的 alpha 通道"""
    model = MODELS[model_key]
    print(f"\n{'='*60}")
    print(f"测试: {label}")
    print(f"模型: {model_key} ({model})")
    print(f"输出: {out_path}")

    payload = {
        "model": model,
        "prompt": prompt,
        "size": "2048x2048",
        "watermark": False,
        "response_format": "url",
        "output_format": "png",
    }

    req = urllib.request.Request(
        ENDPOINT,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {API_KEY}",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            body = resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", errors="replace")[:500]
        print(f"  ❌ HTTP {e.code}: {err}")
        return False
    except Exception as e:
        print(f"  ❌ {type(e).__name__}: {e}")
        return False

    data = json.loads(body)
    if "error" in data:
        print(f"  ❌ API error: {json.dumps(data['error'], ensure_ascii=False)[:300]}")
        return False

    images = data.get("data", [])
    if not images:
        print(f"  ❌ 无图片返回: {body[:300]}")
        return False

    print(f"  返回 {len(images)} 张图")
    for i, img_data in enumerate(images):
        url = img_data.get("url")
        if not url:
            b64 = img_data.get("b64_json")
            print(f"  图{i}: b64_json (len={len(b64) if b64 else 0})")
            continue
        print(f"  图{i}: URL={url[:80]}...")

        # 下载
        out_path.parent.mkdir(parents=True, exist_ok=True)
        dl = urllib.request.urlretrieve(url, str(out_path))
        print(f"  下载到: {out_path}")

        # 检查 alpha 通道
        try:
            from PIL import Image
            import numpy as np
            img = Image.open(out_path)
            print(f"  格式: {img.format}, 模式: {img.mode}, 尺寸: {img.size}")
            if img.mode == "RGBA":
                a = np.array(img.split()[3])
                opaque = (a > 200).sum() / a.size * 100
                fully_transparent = (a == 0).sum() / a.size * 100
                print(f"  🎉 有 ALPHA 通道! 不透明={opaque:.1f}%, 全透明={fully_transparent:.1f}%")
                return True
            elif img.mode == "RGB":
                print(f"  ⚠️ RGB 无 alpha 通道 (不透明)")
                return False
            elif img.mode == "P":
                print(f"  调色板模式, 转换检查...")
                rgba = img.convert("RGBA")
                a = np.array(rgba.split()[3])
                if a.min() < 255:
                    print(f"  P 模式有透明索引!")
                    return True
                print(f"  P 模式无透明")
                return False
            else:
                print(f"  模式 {img.mode}")
                return False
        except Exception as e:
            print(f"  PIL 检查失败: {e}")
            return False

    return False


if __name__ == "__main__":
    out_dir = Path("/workspace/shared/assets/_test_transparent")
    out_dir.mkdir(parents=True, exist_ok=True)

    # 测试 1: Pro 模型 + 图层分离提示词
    test_model(
        "pro",
        "A cute anime girl character bust portrait, half body, "
        "big eyes, short black hair with a small hair clip on left, "
        "wearing white shirt and navy blue school uniform jacket with red bow tie, "
        "soft gentle smile, centered composition, "
        "isolated subject on transparent background, "
        "PNG with alpha channel, transparent background, no background, "
        "clean pixel art RPG game sprite, high quality",
        "Pro + 透明背景提示词",
        out_dir / "test_pro_transparent.png",
    )

    # 测试 2: Pro 模型 + 明确图层分离要求
    test_model(
        "pro",
        "Output as editable transparent layers: "
        "a high school boy character bust portrait, short messy black hair, "
        "wearing white shirt and dark blue school uniform jacket, "
        "determined expression, half body, centered, "
        "anime style, transparent background, isolated subject, "
        "export as transparent PNG with alpha channel",
        "Pro + 图层分离提示词",
        out_dir / "test_pro_layers.png",
    )

    print("\n" + "="*60)
    print("测试完成")
