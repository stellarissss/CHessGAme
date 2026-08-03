#!/usr/bin/env python3
"""
SpriteCook 像素画立绘生成器
============================
用 SpriteCook API 为林夜(boy)和陈默(chenmo)生成 256×256 透明背景
16-bit SFC/SNES 风像素画半身立绘。

一致性策略：每个角色先生成一张 hero 立绘，获取 asset_id，
后续所有表情立绘以该 asset_id 作为 reference_asset_id，保证角色一致。

免抠图：bg_mode="transparent" 直接输出透明 PNG。

用法：
    python generate_spritecook.py            # 全部（按 credit 预算自动停）
    python generate_spritecook.py --dry-run   # 仅打印计划不调用 API
依赖：标准库（urllib）
环境变量：SPRITECOOK_API_KEY（已内置默认 key）
"""
import argparse
import json
import os
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path

API_BASE = "https://api.spritecook.ai/v1/api"
API_KEY = os.getenv("SPRITECOOK_API_KEY",
                    "sc_live_fae481d7437170556396901d1406f2e6ba0a99ee54ffd76a")
CHAR_DIR = Path(__file__).resolve().parent / "characters"

# ── 模型与成本 ──
# gpt-image-2 @ 2K = 7 credits/张（最便宜且支持透明后处理）
MODEL = "gpt-image-2"
RESOLUTION = "2K"
COST_PER_IMAGE = 7

# ── 通用参数 ──
GEN_PARAMS = {
    "width": 256,
    "height": 256,
    "pixel": True,
    "pixel_perfect": True,
    "bg_mode": "transparent",
    "style": "16-bit SNES JRPG style, clean crisp pixel art",
    "aspect_ratio": "1:1",
    "smart_crop": True,
    "mode": "assets",
}

# ── 角色基础设定（来自项目设计书 CANON）──
# 林夜：高二男生，短乱黑发，白衬衫+深蓝校服外套+红色领带
BOY_BASE = (
    "16-bit SNES JRPG style pixel art bust portrait sprite, "
    "a 17-year-old Chinese high school boy student named Linne, "
    "short messy black hair, young RPG hero protagonist look, "
    "wearing a white shirt with a dark blue school uniform jacket and a red collar tie, "
    "head and shoulders bust portrait, centered composition, "
    "facing front, clean crisp pixel art, transparent background"
)

# 陈默：高二女生，齐肩黑色短发左侧小发夹，柔和杏眼，白衬衫+深蓝校服+红色领结，棋子胸针
CHENMO_BASE = (
    "16-bit SNES JRPG style pixel art bust portrait sprite, "
    "a 17-year-old Chinese high school girl student named Chenmo, "
    "shoulder-length black hair with a small hairpin on the left side, "
    "soft apricot-shaped eyes, cute and gentle appearance, calm and smart personality, "
    "wearing a white shirt with a dark blue school uniform jacket and a red bow tie, "
    "a small chess piece brooch on her chest, "
    "head and shoulders bust portrait, centered composition, "
    "facing front, clean crisp pixel art, transparent background"
)

# ── 立绘清单（按优先级排序，最重要的在前）──
# 每项: (folder, stem, base_prompt, emotion_suffix, is_hero)
# hero 立绘先生成，其余用 hero 的 asset_id 作 reference
SPECS = [
    # ── 先生成两个 hero（获取 asset_id 用于后续 reference）──
    ("boy", "boy_neutral",    BOY_BASE,    "calm neutral relaxed expression, gentle face, default portrait", True),
    ("chenmo", "chenmo_smile",     CHENMO_BASE, "gentle warm smile, soft kind eyes, friendly expression, default portrait", True),

    # ── 交替生成两角色最常用表情（确保 credit 不足时两角色都有覆盖）──
    ("boy", "boy_surprised",  BOY_BASE,    "surprised wide eyes, open mouth, shocked expression", False),
    ("chenmo", "chenmo_thinking",  CHENMO_BASE, "thoughtful expression, head tilted slightly, curious pondering look", False),
    ("boy", "boy_thinking",   BOY_BASE,    "thinking expression, looking up slightly, finger near chin, contemplative", False),
    ("chenmo", "chenmo_silent",    CHENMO_BASE, "quiet silent expression, calm neutral face, lips closed, peaceful", False),
    ("boy", "boy_sad",        BOY_BASE,    "sad downcast expression, slight frown, melancholic eyes", False),
    ("chenmo", "chenmo_surprised", CHENMO_BASE, "surprised expression, wide eyes, slight blush, astonished", False),
    ("boy", "boy_happy",      BOY_BASE,    "happy smiling expression, bright cheerful eyes, warm smile", False),

    # ── 次优先（credit 充足时才生成）──
    ("boy", "boy_determined", BOY_BASE,    "determined fierce eyes, furrowed brow, confident expression, strong will", False),
    ("chenmo", "chenmo_awkward",   CHENMO_BASE, "awkward shy expression, looking away slightly, embarrassed gentle smile", False),
    ("boy", "boy_confident",  BOY_BASE,    "confident smirk, arms slightly visible, self-assured expression", False),
    ("chenmo", "chenmo_playing",   CHENMO_BASE, "happily playing chess, holding a chess piece, focused joyful expression, slight action pose", False),
    ("boy", "boy_defeated",   BOY_BASE,    "defeated expression, downcast eyes, heavy heart, sorrowful", False),
    ("chenmo", "chenmo_portrait",  CHENMO_BASE, "clean neutral portrait, serene gentle expression, looking at viewer, refined", False),
]


def api_get(path):
    req = urllib.request.Request(
        f"{API_BASE}{path}",
        headers={"Authorization": f"Bearer {API_KEY}"},
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def api_post(path, payload):
    req = urllib.request.Request(
        f"{API_BASE}{path}",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=180) as resp:
        return json.loads(resp.read().decode("utf-8"))


def download(url, target):
    """下载图片到目标路径"""
    target.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {API_KEY}"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        target.write_bytes(resp.read())


def generate_one(folder, stem, base_prompt, emotion_suffix, is_hero,
                 hero_asset_id=None):
    """生成一张立绘，返回 (ok, asset_id, error)"""
    target = CHAR_DIR / folder / f"{stem}.png"
    # 备份旧文件
    if target.exists():
        backup = target.with_suffix(".old_spritecook.png")
        if not backup.exists():
            target.rename(backup)

    prompt = f"{base_prompt}, {emotion_suffix}"
    payload = dict(GEN_PARAMS)
    payload["prompt"] = prompt
    payload["model"] = MODEL
    payload["resolution"] = RESOLUTION
    # 非 hero 立绘用 hero 的 asset_id 作风格参考
    if not is_hero and hero_asset_id:
        payload["reference_asset_id"] = hero_asset_id

    tag = "HERO" if is_hero else f"ref={hero_asset_id[:8]}" if hero_asset_id else "no-ref"
    print(f"  🎨 [{folder}/{stem}] ({tag})...", flush=True, end=" ")

    try:
        result = api_post("/generate-sync", payload)
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", errors="replace")[:200]
        print(f"✗ HTTP {e.code}: {err}")
        return False, None, f"HTTP {e.code}: {err}"
    except Exception as e:
        print(f"✗ {type(e).__name__}: {e}")
        return False, None, str(e)

    if result.get("status") != "succeeded":
        print(f"✗ status={result.get('status')}")
        return False, None, f"status={result.get('status')}"

    assets = result.get("assets", [])
    if not assets:
        print(f"✗ no assets in response")
        return False, None, "no assets"

    asset = assets[0]
    asset_id = asset.get("id")
    img_url = asset.get("sprite_url") or asset.get("url")
    if not img_url:
        print(f"✗ no image url")
        return False, None, "no image url"

    # 下载
    try:
        download(img_url, target)
    except Exception as e:
        print(f"✗ download: {e}")
        return False, asset_id, f"download: {e}"

    credits_used = result.get("credits_used", "?")
    credits_left = result.get("credits_remaining", "?")
    w = asset.get("width", "?")
    h = asset.get("height", "?")
    print(f"✓ {w}x{h} → {target.name}  (credits: {credits_used} used, {credits_left} left)")
    return True, asset_id, None


def main():
    ap = argparse.ArgumentParser(description="SpriteCook 像素画立绘生成")
    ap.add_argument("--dry-run", action="store_true", help="仅打印计划")
    ap.add_argument("--only", help="仅生成指定角色: boy 或 chenmo")
    args = ap.parse_args()

    specs = SPECS
    if args.only:
        specs = [s for s in SPECS if s[0] == args.only]

    print("=" * 64)
    print("SpriteCook 像素画立绘生成器")
    print(f"  模型: {MODEL} @ {RESOLUTION}  成本: {COST_PER_IMAGE} credits/张")
    print(f"  尺寸: {GEN_PARAMS['width']}x{GEN_PARAMS['height']}  透明背景  像素画")
    print(f"  风格: {GEN_PARAMS['style']}")
    print("=" * 64)

    # 检查 credits
    try:
        credits = api_get("/credits")
        available = credits.get("total", 0)
        print(f"\n💰 Credits: {available} 可用 (tier={credits.get('tier')})")
        max_images = available // COST_PER_IMAGE
        print(f"   可生成: {max_images} 张 (需 {len(specs)} 张)")
        if max_images < len(specs):
            print(f"   ⚠️  不足！将按优先级生成前 {max_images} 张，其余需充值")
    except Exception as e:
        print(f"⚠️  无法检查 credits: {e}")
        max_images = 999

    if args.dry_run:
        print("\n📋 生成计划:")
        for i, (folder, stem, _, suffix, is_hero) in enumerate(specs, 1):
            tag = "HERO" if is_hero else "ref"
            print(f"  {i:2d}. {folder}/{stem}.png  ({tag})  - {suffix[:50]}")
        return

    # 按角色分组：先生成 hero，再用 hero asset_id 作 reference
    hero_ids = {}  # folder -> hero asset_id
    results = []
    generated = 0

    for folder, stem, base, suffix, is_hero in specs:
        if generated >= max_images:
            print(f"\n⚠️  Credit 不足，停止生成（已完成 {generated}/{len(specs)}）")
            break

        hero_id = hero_ids.get(folder) if not is_hero else None
        ok, asset_id, err = generate_one(folder, stem, base, suffix,
                                          is_hero, hero_id)
        results.append({"stem": f"{folder}/{stem}", "ok": ok, "error": err})
        if ok:
            generated += 1
            if is_hero:
                hero_ids[folder] = asset_id
                print(f"     📌 {folder} hero asset_id: {asset_id}")
        # 避免并发限制（free tier concurrent_jobs=1）
        time.sleep(1)

    # 汇总
    ok = sum(1 for r in results if r["ok"])
    print("\n" + "=" * 64)
    print(f"✅ 成功 {ok}/{len(results)}")
    failed = [r for r in results if not r["ok"]]
    if failed:
        print(f"❌ 失败 {len(failed)} 张:")
        for r in failed:
            print(f"   - {r['stem']}: {r['error']}")

    # 最终 credits
    try:
        credits = api_get("/credits")
        print(f"\n💰 剩余 Credits: {credits.get('total', '?')}")
    except:
        pass


if __name__ == "__main__":
    main()
