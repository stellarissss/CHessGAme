#!/usr/bin/env python3
"""
火山引擎通用图像分割（CVProcess / saliency_seg）批量精细抠图
================================================================
替代 cutout_rembg.py / cutout_all.py 的本地 rembg 抠图。
使用火山引擎"图像生成大模型"下的"通用图像分割-主体分割"能力，
对复杂背景/头发/衣服边缘做精细化分割，返回原图大小 BGRA 透明前景 PNG。

接入文档：
  能力介绍  https://www.volcengine.com/docs/86081/1660402
  主体分割  https://www.volcengine.com/docs/86081/1660404
  快速接入  https://www.volcengine.com/docs/6444/69729

接口：Action=CVProcess, Version=2022-08-31（同步接口）
  body(JSON):
    req_key              = "saliency_seg"          # 主体分割
    binary_data_base64   = [<图片base64>]           # 仅支持 1 张
    only_mask            = 3                        # 原图大小 BGRA 透明前景图
    rgb                  = [-1, -1, -1]             # 透明背景（Alpha 通道）
    refine_mask          = 1                        # 边缘增强（matting lite，更快）
  返回 data.binary_data_base64[0] = 透明前景 PNG 的 base64

功能：
  1. 静态立绘抠图：boy/chenmo 全部 *.jpg（不含 _f / .darkbg）→ 同名 .png
  2. 动画帧抠图：从 _anim_videos/*.mp4 用 ffmpeg 抽 48 帧 →
     逐帧火山抠图 → {char}_{emotion}_f{1..48}.png（覆盖旧 rembg 帧）

依赖：volcengine SDK + ffmpeg（无需 PIL / rembg）
  pip install volcengine

凭据：环境变量 VOLC_ACCESS_KEY_ID / VOLC_SECRET_ACCESS_KEY

用法：
  export VOLC_ACCESS_KEY_ID=...
  export VOLC_SECRET_ACCESS_KEY=...
  python cutout_volcano.py --test              # 仅测试 1 张（boy_neutral）→ _test_cutout.png
  python cutout_volcano.py                      # 全量：15 静态 + 10×48 动画帧
  python cutout_volcano.py --only boy/neutral   # 仅一个动画
  python cutout_volcano.py --no-anim            # 仅静态立绘
  python cutout_volcano.py --no-static          # 仅动画帧
  python cutout_volcano.py --parallel 2         # 并发数（默认 2，免费试用 QPS 较低）
"""
import argparse
import base64
import json
import os
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

# 火山引擎视觉 SDK
try:
    from volcengine.visual.VisualService import VisualService
except ImportError:
    print("❌ 缺少 volcengine SDK。请安装：pip install volcengine")
    sys.exit(1)

CHAR_DIR = Path(__file__).resolve().parent / "characters"
VIDEO_DIR = CHAR_DIR / "_anim_videos"

# ── 动画清单（与 generate_anim_frames.py 完全一致）──
# (char_dir, emotion, source_jpg, video_mp4)
ANIMATIONS = [
    ("boy", "neutral",    "boy_neutral.jpg",    "boy_neutral_anim.mp4"),
    ("boy", "happy",      "boy_happy.jpg",      "boy_happy_anim.mp4"),
    ("boy", "thinking",   "boy_thinking.jpg",   "boy_thinking_anim.mp4"),
    ("boy", "surprised",  "boy_surprised.jpg",  "boy_surprised_anim.mp4"),
    ("boy", "determined", "boy_determined.jpg", "boy_determined_anim.mp4"),
    ("boy", "sad",        "boy_sad.jpg",        "boy_sad_anim.mp4"),
    ("chenmo", "awkward",   "chenmo_awkward.jpg",   "chenmo_awkward_anim.mp4"),
    ("chenmo", "smile",     "chenmo_smile.jpg",     "chenmo_smile_anim.mp4"),
    ("chenmo", "surprised", "chenmo_surprised.jpg", "chenmo_surprised_anim.mp4"),
    ("chenmo", "thinking",  "chenmo_thinking.jpg",  "chenmo_thinking_anim.mp4"),
]
FRAME_COUNT = 48  # 24FPS × 2s

# 凭据（从环境变量读取，绝不硬编码）
AK = os.getenv("VOLC_ACCESS_KEY_ID", "")
SK = os.getenv("VOLC_SECRET_ACCESS_KEY", "")

# 全局 VisualService 实例（线程安全：仅持有 AK/SK 配置，每次调用独立 HTTP）
_visual = None


def _get_visual():
    global _visual
    if _visual is None:
        if not AK or not SK:
            raise RuntimeError("缺少凭据：请设置 VOLC_ACCESS_KEY_ID / VOLC_SECRET_ACCESS_KEY")
        _visual = VisualService()
        _visual.set_ak(AK)
        _visual.set_sk(SK)
    return _visual


# ════════════════════════════════════════════════════════════
#  CVProcess / saliency_seg 调用
# ════════════════════════════════════════════════════════════
def cv_segment(image_bytes: bytes, refine_mask: int = 1, timeout: int = 90) -> bytes:
    """调用 CVProcess(saliency_seg)，返回原图大小 BGRA 透明前景 PNG 的原始字节。

    refine_mask=1 开启边缘精细抠图（matting lite，更快）。
    only_mask=3 + rgb=[-1,-1,-1] 返回原图大小 BGRA 透明前景图。
    """
    b64 = base64.b64encode(image_bytes).decode("ascii")
    params = {
        "req_key": "saliency_seg",
        "binary_data_base64": [b64],
        "only_mask": 3,
        "rgb": [-1, -1, -1],
        "refine_mask": refine_mask,
    }
    resp = _get_visual().cv_process(params)
    code = resp.get("code")
    if code != 10000:
        raise RuntimeError(f"CVProcess 业务错误 code={code}: {json.dumps(resp, ensure_ascii=False)[:400]}")
    data = resp.get("data") or {}
    b64_list = data.get("binary_data_base64") or []
    if not b64_list:
        raise RuntimeError(f"响应无 binary_data_base64: {json.dumps(resp, ensure_ascii=False)[:400]}")
    png = base64.b64decode(b64_list[0])
    # 校验 PNG 魔数
    if png[:8] != b"\x89PNG\r\n\x1a\n":
        raise RuntimeError(f"返回数据非 PNG（前8字节: {png[:8]!r}）")
    return png


def cv_segment_retry(image_bytes: bytes, retries: int = 5) -> bytes:
    """带重试的抠图（QPS限流50429/5xx/网络错误时指数退避重试）。

    SDK 在 QPS 超限时抛出异常，错误消息含 50429 / "Request Has Reached API Limit"。
    """
    last = None
    for i in range(retries):
        try:
            return cv_segment(image_bytes)
        except Exception as e:
            last = e
            msg = str(e)
            # 可重试：QPS 限流(50429) / 服务端错误(5xx) / 超时 / 网络错误
            retriable = ("50429" in msg or "Request Has Reached API Limit" in msg
                         or "HTTP 429" in msg or "HTTP 5" in msg
                         or "timed out" in msg.lower() or "ConnectionError" in msg
                         or "code=50429" in msg or "code': 50429" in msg
                         or '"code":50429' in msg)
            if not retriable:
                raise
            # 指数退避：2s, 4s, 8s, 16s, 32s
            wait = 2.0 * (2 ** i)
            time.sleep(wait)
    raise last  # type: ignore[misc]


# ════════════════════════════════════════════════════════════
#  ffmpeg 抽帧
# ════════════════════════════════════════════════════════════
def extract_frames(video: Path, out_dir: Path, frames: int) -> list:
    """用 ffmpeg 从视频抽帧，返回按序排列的 PNG 路径列表。"""
    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob("*.png"):
        old.unlink()
    cmd = [
        "ffmpeg", "-y", "-i", str(video),
        "-vf", "fps=24",
        "-frames:v", str(frames),
        str(out_dir / "f%03d.png"),
    ]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if r.returncode != 0:
        raise RuntimeError(f"ffmpeg 抽帧失败: {r.stderr[-300:]}")
    return sorted(out_dir.glob("f*.png"), key=lambda p: int(p.stem[1:]))


# ════════════════════════════════════════════════════════════
#  静态立绘抠图
# ════════════════════════════════════════════════════════════
def list_static_jpgs() -> list:
    """列出 boy/chenmo 下需抠图的静态立绘 jpg（排除 _f 动画帧、.darkbg 备份）。"""
    targets = []
    for char in ("boy", "chenmo"):
        for jpg in sorted((CHAR_DIR / char).glob("*.jpg")):
            stem = jpg.stem
            # 排除 .darkbg.jpg 备份
            if stem.endswith(".darkbg"):
                continue
            # 排除动画帧 _fN（jpg 目录里不应有，但防御性排除）
            if "_f" in stem and stem.split("_f")[-1].isdigit():
                continue
            targets.append(jpg)
    return targets


def cutout_one_static(jpg: Path) -> dict:
    dst = jpg.with_suffix(".png")
    try:
        png = cv_segment_retry(jpg.read_bytes())
        dst.write_bytes(png)
        return {"src": str(jpg), "ok": True, "dst": str(dst), "bytes": len(png)}
    except Exception as e:
        return {"src": str(jpg), "ok": False, "error": str(e)}


# ════════════════════════════════════════════════════════════
#  动画帧抠图
# ════════════════════════════════════════════════════════════
def cutout_one_animation(char_dir: str, emotion: str, src_jpg: str,
                         video_mp4: str, frames: int, parallel: int) -> dict:
    """抽帧 → 并发火山抠图 → 重命名为 {char}_{emotion}_f{1..N}.png"""
    video = VIDEO_DIR / video_mp4
    target_dir = CHAR_DIR / char_dir
    if not video.exists():
        return {"anim": f"{char_dir}/{emotion}", "ok": False,
                "error": f"视频不存在: {video}"}

    # 抽帧到临时目录
    tmp = CHAR_DIR / "_tmp_frames_volcano"
    try:
        frame_paths = extract_frames(video, tmp, frames)
    except Exception as e:
        return {"anim": f"{char_dir}/{emotion}", "ok": False, "error": f"抽帧: {e}"}
    if len(frame_paths) == 0:
        return {"anim": f"{char_dir}/{emotion}", "ok": False, "error": "抽得 0 帧"}

    # 并发抠图（原地覆盖 tmp 里的 PNG 为透明版）
    def _do_frame(fp: Path) -> tuple:
        try:
            png = cv_segment_retry(fp.read_bytes())
            fp.write_bytes(png)
            return (fp, True, None)
        except Exception as e:
            return (fp, False, str(e))

    fail = []
    with ThreadPoolExecutor(max_workers=parallel) as ex:
        futs = {ex.submit(_do_frame, fp): fp for fp in frame_paths}
        for fut in as_completed(futs):
            fp, ok, err = fut.result()
            if not ok:
                fail.append((fp.name, err))

    # 删除旧 _f 帧，重命名新帧
    prefix = char_dir  # boy / chenmo
    for old in target_dir.glob(f"{prefix}_{emotion}_f*.png"):
        old.unlink()
    for i, fp in enumerate(frame_paths, 1):
        dst = target_dir / f"{prefix}_{emotion}_f{i}.png"
        fp.replace(dst)

    # 清理临时目录
    for f in tmp.glob("*.png"):
        try:
            f.unlink()
        except Exception:
            pass
    try:
        tmp.rmdir()
    except Exception:
        pass

    if fail:
        return {"anim": f"{char_dir}/{emotion}", "ok": True, "frames": len(frame_paths),
                "fail": fail}
    return {"anim": f"{char_dir}/{emotion}", "ok": True, "frames": len(frame_paths)}


# ════════════════════════════════════════════════════════════
#  main
# ════════════════════════════════════════════════════════════
def main():
    ap = argparse.ArgumentParser(description="火山引擎 CVProcess 通用图像分割批量精细抠图")
    ap.add_argument("--test", action="store_true",
                    help="仅测试 1 张静态立绘（输出到 _test_cutout.png，不覆盖原文件）")
    ap.add_argument("--only", help="仅处理指定动画，如 boy/neutral")
    ap.add_argument("--no-static", action="store_true", help="跳过静态立绘抠图")
    ap.add_argument("--no-anim", action="store_true", help="跳过动画帧抠图")
    ap.add_argument("--frames", type=int, default=FRAME_COUNT, help="抽帧数（默认 48）")
    ap.add_argument("--parallel", type=int, default=2,
                    help="并发数（默认 2；免费试用 QPS 较低，调高易触发 50429 限流）")
    args = ap.parse_args()

    if not AK or not SK:
        print("❌ 缺少凭据。请设置环境变量：")
        print("   export VOLC_ACCESS_KEY_ID=你的AK")
        print("   export VOLC_SECRET_ACCESS_KEY=你的SK")
        sys.exit(1)

    # ── 测试模式 ──
    if args.test:
        jpg = CHAR_DIR / "boy" / "boy_neutral.jpg"
        print(f"🧪 测试模式：抠图 {jpg.name} → _test_cutout.png")
        try:
            png = cv_segment(jpg.read_bytes())
            out = CHAR_DIR / "boy" / "_test_cutout.png"
            out.write_bytes(png)
            print(f"   ✓ 成功，输出 {len(png)} 字节 → {out}")
            print(f"   PNG 魔数校验: {'✓' if png[:8]==b'\x89PNG\r\n\x1a\n' else '✗'}")
        except Exception as e:
            print(f"   ✗ 失败: {e}")
            sys.exit(1)
        return

    results = []

    # ── 静态立绘 ──
    if not args.no_static:
        jpgs = list_static_jpgs()
        print(f"🖼  静态立绘抠图：{len(jpgs)} 张（并发 {args.parallel}）\n")
        with ThreadPoolExecutor(max_workers=args.parallel) as ex:
            futs = {ex.submit(cutout_one_static, j): j for j in jpgs}
            for i, fut in enumerate(as_completed(futs), 1):
                r = fut.result()
                results.append(r)
                rel = Path(r["src"]).relative_to(CHAR_DIR)
                if r["ok"]:
                    print(f"  [{i}/{len(jpgs)}] ✓ {rel} → .png ({r['bytes']} B)")
                else:
                    print(f"  [{i}/{len(jpgs)}] ✗ {rel} : {r['error']}")
        print()

    # ── 动画帧 ──
    if not args.no_anim:
        anims = ANIMATIONS
        if args.only:
            parts = args.only.split("/")
            if len(parts) == 2:
                anims = [a for a in anims if a[0] == parts[0] and a[1] == parts[1]]
        print(f"🎞  动画帧抠图：{len(anims)} 个动画 × {args.frames} 帧 "
              f"= {len(anims)*args.frames} 张（每动画内并发 {args.parallel}）\n")
        for i, (char_dir, emotion, src_jpg, video_mp4) in enumerate(anims, 1):
            print(f"  [{i}/{len(anims)}] {char_dir}/{emotion} 抽帧+抠图...")
            r = cutout_one_animation(char_dir, emotion, src_jpg, video_mp4,
                                     args.frames, args.parallel)
            results.append(r)
            if r["ok"]:
                msg = f"     ✓ {r.get('frames', '?')} 帧"
                if r.get("fail"):
                    msg += f"（失败 {len(r['fail'])}）"
                print(msg)
            else:
                print(f"     ✗ {r['error']}")
        print()

    # ── 汇总 ──
    ok = sum(1 for r in results if r.get("ok"))
    fail = [r for r in results if not r.get("ok")]
    print("=" * 60)
    print(f"✅ 成功 {ok}/{len(results)}")
    if fail:
        print(f"❌ 失败 {len(fail)}：")
        for r in fail:
            print(f"   - {r.get('anim') or r.get('src')}: {r.get('error')}")


if __name__ == "__main__":
    main()
