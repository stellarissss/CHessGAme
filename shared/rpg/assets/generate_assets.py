#!/usr/bin/env python3
"""
棋圣 RPG 像素画资产生成器
使用 Seedream 5.0-lite 生成所有章节背景、Logo、UI 图标。
所有图片下载到 /workspace/shared/rpg/assets/{bgs,icons,ui}/
"""
import asyncio
import base64
import json
import os
import sys
from pathlib import Path

import httpx

API_KEY = "a00a7825-a82f-4417-8a04-b23aa46c7d9d"
API_BASE = "https://ark.cn-beijing.volces.com/api/v3"
MODEL = "doubao-seedream-5-0-260128"

ASSETS_DIR = Path("/workspace/shared/rpg/assets")

# 像素画风格统一前缀
PIXEL_STYLE = (
    "16-bit pixel art, retro SNES JRPG style, "
    "crisp pixels, vibrant colors, detailed pixel shading, "
    "no anti-aliasing, no smooth gradients, "
    "atmospheric lighting, cinematic composition, "
    "highly detailed pixel work, professional game asset"
)

ASSETS = [
    # ────────── 标题屏 ──────────
    {
        "name": "bgs/title_screen.png",
        "prompt": f"{PIXEL_STYLE}, epic title screen background, "
                  "ancient Chinese chess sage sitting on a jade throne in the clouds, "
                  "glowing chess pieces floating around him, "
                  "xiangqi board with red and black pieces in foreground, "
                  "moonlit sky with stars and aurora, "
                  "mystical energy aura, golden particles, "
                  "ancient temple architecture, "
                  "widescreen cinematic, dark blue and gold palette",
        "size": "2560x1440",
    },
    # ────────── 章节背景 ──────────
    {
        "name": "bgs/ch00_prologue.png",
        "prompt": f"{PIXEL_STYLE}, dark bedroom interior at night, "
                  "a young scholar asleep at a wooden desk, "
                  "candle nearly burnt out, ancient chess book open, "
                  "moonlight through paper window, ink stones and brushes, "
                  "traditional Chinese room with wooden furniture, "
                  "dreamy ethereal atmosphere, blue and amber palette",
        "size": "2560x1440",
    },
    {
        "name": "bgs/ch01_tutorial.png",
        "prompt": f"{PIXEL_STYLE}, cyber digital chess dimension, "
                  "floating holographic gomoku board (five-in-a-row) "
                  "in a vast data void, glowing grid floor, "
                  "circuit patterns on walls, neon cyan and orange lights, "
                  "binary code rain in background, "
                  "futuristic sacred geometry, digital temple",
        "size": "2560x1440",
    },
    {
        "name": "bgs/ch02_city_xiangqi.png",
        "prompt": f"{PIXEL_STYLE}, bustling ancient Chinese street market at dusk, "
                  "a wooden chess stall with red awning, "
                  "lanterns hanging, crowds of pixel people in distance, "
                  "xiangqi board with Chu river and Han border visible, "
                  "stone pavement, wooden architecture, "
                  "warm sunset palette, red and amber tones",
        "size": "2560x1440",
    },
    {
        "name": "bgs/ch03_go_intro.png",
        "prompt": f"{PIXEL_STYLE}, misty mountain pavilion at dawn, "
                  "an old sage with white beard playing weiqi (go) "
                  "on a stone table, pine trees around, "
                  "cloud sea below the peak, traditional Chinese painting aesthetic, "
                  "cranes flying in distance, waterfalls, "
                  "serene green and white palette, peaceful atmosphere",
        "size": "2560x1440",
    },
    {
        "name": "bgs/ch04_boss.png",
        "prompt": f"{PIXEL_STYLE}, dark neon alley at night in cyberpunk city, "
                  "a shadowy chess master figure with glowing red eyes, "
                  "rain pouring, puddles reflecting neon signs, "
                  "gomoku board glowing ominously on a metal table, "
                  "steam rising, broken holographic billboards, "
                  "dark purple and red palette, ominous atmosphere",
        "size": "2560x1440",
    },
    {
        "name": "bgs/ch05_final.png",
        "prompt": f"{PIXEL_STYLE}, cosmic chess realm at the end of universe, "
                  "giant xiangqi board floating in space, "
                  "galaxies and nebulas as backdrop, "
                  "two legendary chess sages facing off, "
                  "constellation patterns forming chess pieces, "
                  "supernova in distance, golden energy vortex, "
                  "epic cosmic palette of deep blue, purple and gold",
        "size": "2560x1440",
    },
    {
        "name": "bgs/ch06_finale.png",
        "prompt": f"{PIXEL_STYLE}, surreal dreamscape mindscape, "
                  "shattered floating islands with chess pieces growing like trees, "
                  "mirror realm reflecting different chess boards, "
                  "ethereal mist, floating memory fragments, "
                  "weiqi stones falling like rain, "
                  "transcendent purple and white palette, mystical",
        "size": "2560x1440",
    },
    # ────────── UI 图标 (square) ──────────
    {
        "name": "icons/logo.png",
        "prompt": f"{PIXEL_STYLE}, game logo for 'ChessSage 棋圣', "
                  "stylized Chinese calligraphy characters 棋圣 in gold, "
                  "a glowing chess king piece in center, "
                  "yin-yang symbol, ornate golden frame, "
                  "red and black xiangqi pieces flanking, "
                  "mystical aura, dark background, emblem style",
        "size": "2048x2048",
    },
    {
        "name": "icons/energy_orb.png",
        "prompt": f"{PIXEL_STYLE}, glowing cyan energy orb crystal, "
                  "pixel art icon, swirling energy inside, "
                  "small chess piece silhouette in center, "
                  "transparent dark background, game UI element, "
                  "mystical glow, vibrant cyan and blue",
        "size": "2048x2048",
    },
    {
        "name": "icons/detection_eye.png",
        "prompt": f"{PIXEL_STYLE}, mystical all-seeing eye icon, "
                  "pixel art, red iris with chess piece reflection, "
                  "glowing red veins, dark background, "
                  "ominous warning game UI element, crimson and gold",
        "size": "2048x2048",
    },
    {
        "name": "icons/menu_scroll.png",
        "prompt": f"{PIXEL_STYLE}, ancient Chinese scroll icon, "
                  "pixel art, rolled bamboo scroll with red ribbon, "
                  "golden tassel, dark background, "
                  "game UI menu button element, warm amber tones",
        "size": "2048x2048",
    },
    {
        "name": "icons/book_manual.png",
        "prompt": f"{PIXEL_STYLE}, ancient leather-bound tome book icon, "
                  "pixel art, glowing runes on cover, "
                  "chess piece emboss on front, bookmark ribbon, "
                  "dark background, game UI documentation element, "
                  "purple and gold magical aura",
        "size": "2048x2048",
    },
    # ────────── 装饰/UI 元素 ──────────
    {
        "name": "ui/border_ornate.png",
        "prompt": f"{PIXEL_STYLE}, ornate golden border frame, "
                  "Chinese dragon motifs on corners, "
                  "chess piece decorations, seamless tileable, "
                  "transparent center, decorative game UI frame, "
                  "gold and crimson palette",
        "size": "2048x2048",
    },
    {
        "name": "ui/vignette_overlay.png",
        "prompt": f"dark vignette overlay for game screen, "
                  "soft black gradient from edges to transparent center, "
                  "subtle film grain texture, "
                  "cinematic letterbox style, subtle, "
                  "transparent PNG overlay",
        "size": "2560x1440",
    },
]


async def generate_one(client: httpx.AsyncClient, asset: dict, idx: int) -> dict:
    """生成单个资产并下载到本地"""
    name = asset["name"]
    prompt = asset["prompt"]
    size = asset.get("size", "1024x1024")
    out_path = ASSETS_DIR / name
    out_path.parent.mkdir(parents=True, exist_ok=True)

    body = {
        "model": MODEL,
        "prompt": prompt,
        "size": size,
        "response_format": "b64_json",
        "watermark": False,
        "output_format": "png",
    }

    print(f"\n[{idx+1}/{len(ASSETS)}] 生成 {name} ({size})...", flush=True)
    try:
        resp = await client.post(
            f"{API_BASE}/images/generations",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {API_KEY}",
            },
            json=body,
            timeout=300.0,
        )
        resp.raise_for_status()
        data = resp.json()
        if "error" in data:
            return {"name": name, "ok": False, "error": data["error"]}
        images = data.get("data", [])
        if not images:
            return {"name": name, "ok": False, "error": "no data returned"}
        img = images[0]
        b64 = img.get("b64_json")
        if not b64:
            url = img.get("url")
            if url:
                # 下载 URL
                r = await client.get(url, timeout=120.0)
                r.raise_for_status()
                out_path.write_bytes(r.content)
                print(f"  ✅ saved {name} ({len(r.content)} bytes from URL)")
                return {"name": name, "ok": True, "bytes": len(r.content)}
            return {"name": name, "ok": False, "error": "no b64 or url"}
        raw = base64.b64decode(b64)
        out_path.write_bytes(raw)
        print(f"  ✅ saved {name} ({len(raw)} bytes)")
        return {"name": name, "ok": True, "bytes": len(raw)}
    except Exception as e:
        print(f"  ❌ FAIL {name}: {type(e).__name__}: {str(e)[:200]}")
        return {"name": name, "ok": False, "error": str(e)[:200]}


async def main():
    print(f"=== 棋圣 RPG 资产生成器 ===")
    print(f"资产总数: {len(ASSETS)}")
    print(f"输出目录: {ASSETS_DIR}")
    results = []
    # 串行避免限流
    async with httpx.AsyncClient() as client:
        for idx, asset in enumerate(ASSETS):
            r = await generate_one(client, asset, idx)
            results.append(r)
    print("\n=== 汇总 ===")
    ok = sum(1 for r in results if r["ok"])
    print(f"成功: {ok}/{len(results)}")
    for r in results:
        status = "✅" if r["ok"] else "❌"
        extra = f" ({r['bytes']} bytes)" if r["ok"] else f" err={r.get('error','')[:100]}"
        print(f"  {status} {r['name']}{extra}")
    # 写入 manifest
    manifest_path = ASSETS_DIR / "manifest.json"
    manifest_path.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nmanifest: {manifest_path}")
    return 0 if ok == len(results) else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
