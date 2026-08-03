#!/usr/bin/env python3
"""SpriteCook API 连通性测试：检查 credits、模型列表、做一次测试生成"""
import json
import os
import sys
import urllib.request

API_BASE = "https://api.spritecook.ai/v1/api"
API_KEY = os.getenv("SPRITECOOK_API_KEY", "sc_live_fae481d7437170556396901d1406f2e6ba0a99ee54ffd76a")

def _get(path):
    req = urllib.request.Request(
        f"{API_BASE}{path}",
        headers={"Authorization": f"Bearer {API_KEY}"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.getcode(), resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", errors="replace")
    except Exception as e:
        return -1, str(e)

print("=== 1. 检查 Credits ===")
code, body = _get("/credits")
print(f"HTTP {code}")
try:
    print(json.dumps(json.loads(body), indent=2, ensure_ascii=False)[:500])
except:
    print(body[:500])

print("\n=== 2. 模型列表 ===")
code, body = _get("/models")
print(f"HTTP {code}")
try:
    print(json.dumps(json.loads(body), indent=2, ensure_ascii=False)[:800])
except:
    print(body[:800])

print("\n=== 3. 测试生成（1 张 64x64 透明像素画）===")
payload = {
    "prompt": "a cute black cat sprite, side view, pixel art",
    "width": 64, "height": 64,
    "pixel": True,
    "bg_mode": "transparent",
    "style": "16-bit SNES style",
}
req = urllib.request.Request(
    f"{API_BASE}/generate-sync",
    data=json.dumps(payload).encode("utf-8"),
    headers={
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
    },
    method="POST",
)
try:
    with urllib.request.urlopen(req, timeout=120) as resp:
        code = resp.getcode()
        body = resp.read().decode("utf-8")
        print(f"HTTP {code}")
        data = json.loads(body)
        # 打印结构（截断长 URL）
        print(json.dumps(data, indent=2, ensure_ascii=False)[:1500])
except urllib.error.HTTPError as e:
    print(f"HTTP {e.code}")
    print(e.read().decode("utf-8", errors="replace")[:800])
except Exception as e:
    print(f"Error: {type(e).__name__}: {e}")
