#!/usr/bin/env python3
"""补齐缺失的 8 个像素画资产（重试脚本）"""
import asyncio
import base64
import json
import sys
from pathlib import Path
import httpx

API_KEY = "a00a7825-a82f-4417-8a04-b23aa46c7d9d"
API_BASE = "https://ark.cn-beijing.volces.com/api/v3"
MODEL = "doubao-seedream-5-0-260128"
ASSETS_DIR = Path("/workspace/shared/rpg/assets")

PIXEL_STYLE = (
    "16-bit pixel art, retro SNES JRPG style, "
    "crisp pixels, vibrant colors, detailed pixel shading, "
    "no anti-aliasing, no smooth gradients, "
    "atmospheric lighting, cinematic composition, "
    "highly detailed pixel work, professional game asset"
)

# 仅生成缺失的 8 个
MISSING = [
    {"name": "bgs/ch05_final.png", "size": "2560x1440",
     "prompt": f"{PIXEL_STYLE}, cosmic chess realm at the end of universe, "
               "giant xiangqi board floating in space, "
               "galaxies and nebulas as backdrop, "
               "two legendary chess sages facing off, "
               "constellation patterns forming chess pieces, "
               "supernova in distance, golden energy vortex, "
               "epic cosmic palette of deep blue, purple and gold"},
    {"name": "bgs/ch06_finale.png", "size": "2560x1440",
     "prompt": f"{PIXEL_STYLE}, surreal dreamscape mindscape, "
               "shattered floating islands with chess pieces growing like trees, "
               "mirror realm reflecting different chess boards, "
               "ethereal mist, floating memory fragments, "
               "weiqi stones falling like rain, "
               "transcendent purple and white palette, mystical"},
    {"name": "icons/energy_orb.png", "size": "2048x2048",
     "prompt": f"{PIXEL_STYLE}, glowing cyan energy orb crystal, "
               "pixel art icon, swirling energy inside, "
               "small chess piece silhouette in center, "
               "transparent dark background, game UI element, "
               "mystical glow, vibrant cyan and blue"},
    {"name": "icons/detection_eye.png", "size": "2048x2048",
     "prompt": f"{PIXEL_STYLE}, mystical all-seeing eye icon, "
               "pixel art, red iris with chess piece reflection, "
               "glowing red veins, dark background, "
               "ominous warning game UI element, crimson and gold"},
    {"name": "icons/menu_scroll.png", "size": "2048x2048",
     "prompt": f"{PIXEL_STYLE}, ancient Chinese scroll icon, "
               "pixel art, rolled bamboo scroll with red ribbon, "
               "golden tassel, dark background, "
               "game UI menu button element, warm amber tones"},
    {"name": "icons/book_manual.png", "size": "2048x2048",
     "prompt": f"{PIXEL_STYLE}, ancient leather-bound tome book icon, "
               "pixel art, glowing runes on cover, "
               "chess piece emboss on front, bookmark ribbon, "
               "dark background, game UI documentation element, "
               "purple and gold magical aura"},
    {"name": "ui/border_ornate.png", "size": "2048x2048",
     "prompt": f"{PIXEL_STYLE}, ornate golden border frame, "
               "Chinese dragon motifs on corners, "
               "chess piece decorations, seamless tileable, "
               "transparent center, decorative game UI frame, "
               "gold and crimson palette"},
    {"name": "ui/vignette_overlay.png", "size": "2560x1440",
     "prompt": "dark vignette overlay for game screen, "
               "soft black gradient from edges to transparent center, "
               "subtle film grain texture, "
               "cinematic letterbox style, subtle, "
               "transparent PNG overlay"},
]


async def generate_one(client, asset, idx, total):
    name = asset["name"]
    out_path = ASSETS_DIR / name
    if out_path.exists() and out_path.stat().st_size > 100000:
        print(f"[{idx+1}/{total}] SKIP {name} (已存在)", flush=True)
        return {"name": name, "ok": True, "skipped": True}

    out_path.parent.mkdir(parents=True, exist_ok=True)
    body = {
        "model": MODEL,
        "prompt": asset["prompt"],
        "size": asset["size"],
        "response_format": "b64_json",
        "watermark": False,
        "output_format": "png",
    }
    print(f"[{idx+1}/{total}] 生成 {name} ({asset['size']})...", flush=True)
    for attempt in range(3):
        try:
            resp = await client.post(
                f"{API_BASE}/images/generations",
                headers={"Content-Type": "application/json",
                         "Authorization": f"Bearer {API_KEY}"},
                json=body, timeout=300.0,
            )
            resp.raise_for_status()
            data = resp.json()
            if "error" in data:
                print(f"  ❌ API error: {data['error']}", flush=True)
                await asyncio.sleep(3)
                continue
            images = data.get("data", [])
            if not images:
                print(f"  ❌ no data", flush=True)
                await asyncio.sleep(3)
                continue
            b64 = images[0].get("b64_json")
            if not b64:
                url = images[0].get("url")
                if url:
                    r = await client.get(url, timeout=120.0)
                    r.raise_for_status()
                    out_path.write_bytes(r.content)
                    print(f"  ✅ {name} ({len(r.content)} bytes from URL)", flush=True)
                    return {"name": name, "ok": True, "bytes": len(r.content)}
                print(f"  ❌ no b64/url", flush=True)
                await asyncio.sleep(3)
                continue
            raw = base64.b64decode(b64)
            out_path.write_bytes(raw)
            print(f"  ✅ {name} ({len(raw)} bytes)", flush=True)
            return {"name": name, "ok": True, "bytes": len(raw)}
        except Exception as e:
            print(f"  ⚠ attempt {attempt+1} 失败: {type(e).__name__}: {str(e)[:200]}", flush=True)
            await asyncio.sleep(5)
    print(f"  ❌ 给 up {name}", flush=True)
    return {"name": name, "ok": False}


async def main():
    print(f"=== 补齐 {len(MISSING)} 个缺失资产 ===", flush=True)
    results = []
    async with httpx.AsyncClient() as client:
        for idx, asset in enumerate(MISSING):
            r = await generate_one(client, asset, idx, len(MISSING))
            results.append(r)
            await asyncio.sleep(1)  # 避免限流
    ok = sum(1 for r in results if r["ok"])
    print(f"\n=== 汇总: {ok}/{len(results)} ===", flush=True)
    return 0 if ok == len(results) else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
