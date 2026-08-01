#!/usr/bin/env python3
"""多线程分段下载脚本（HTTP Range 并行）
用法: python3 parallel_download.py URL OUTPUT_PATH [THREADS]
服务器限速 20KB/s，单连接需 6 小时。
16 线程并行理论 ~25 分钟（若服务器不限总带宽）。
"""
import sys
import os
import time
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock

URL = sys.argv[1]
OUTPUT = sys.argv[2]
THREADS = int(sys.argv[3]) if len(sys.argv) > 3 else 16


def get_size(url):
    req = urllib.request.Request(url, method='HEAD')
    with urllib.request.urlopen(req, timeout=30) as r:
        return int(r.headers['Content-Length'])


def download_chunk(url, start, end, part_file, idx, progress):
    """下载一个分段 [start, end]"""
    retry = 0
    while retry < 5:
        try:
            req = urllib.request.Request(url)
            req.add_header('Range', f'bytes={start}-{end}')
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            with open(part_file, 'wb') as f:
                f.write(data)
            with progress['lock']:
                progress['done'] += len(data)
                downloaded = progress['done']
                total = progress['total']
                pct = downloaded / total * 100
                print(f"  [{idx+1:2d}] {start//1024}-{end//1024}KB ✓ "
                      f"总进度 {pct:.1f}% ({downloaded//1024//1024}/{total//1024//1024}MB)",
                      flush=True)
            return True
        except Exception as e:
            retry += 1
            print(f"  [{idx+1:2d}] 重试 {retry}: {e}", flush=True)
            time.sleep(2)
    return False


def main():
    print(f"获取文件大小...", flush=True)
    total = get_size(URL)
    print(f"文件大小: {total/1024/1024:.1f}MB, 分 {THREADS} 线程下载", flush=True)

    chunk = total // THREADS
    ranges = []
    for i in range(THREADS):
        start = i * chunk
        end = (start + chunk - 1) if i < THREADS - 1 else (total - 1)
        ranges.append((i, start, end))

    parts_dir = OUTPUT + '.parts'
    os.makedirs(parts_dir, exist_ok=True)

    progress = {'done': 0, 'total': total, 'lock': Lock()}
    t0 = time.time()

    with ThreadPoolExecutor(max_workers=THREADS) as exe:
        futures = []
        for idx, start, end in ranges:
            part_file = os.path.join(parts_dir, f'part_{idx:03d}')
            if os.path.exists(part_file) and os.path.getsize(part_file) == (end - start + 1):
                # 已下载，跳过
                with progress['lock']:
                    progress['done'] += os.path.getsize(part_file)
                print(f"  [{idx+1:2d}] 已存在，跳过", flush=True)
                continue
            futures.append(exe.submit(download_chunk, URL, start, end, part_file, idx, progress))

        results = []
        for f in as_completed(futures):
            results.append(f.result())

    ok = sum(1 for r in results if r) + (THREADS - len(futures))
    print(f"\n下载完成: {ok}/{THREADS} 段成功, 用时 {time.time()-t0:.0f}s", flush=True)

    if ok < THREADS:
        print("❌ 部分段失败，请重跑", flush=True)
        sys.exit(1)

    # 合并分段
    print("合并分段...", flush=True)
    with open(OUTPUT, 'wb') as out:
        for idx, _, _ in ranges:
            part_file = os.path.join(parts_dir, f'part_{idx:03d}')
            with open(part_file, 'rb') as f:
                out.write(f.read())
    # 清理分段
    for idx, _, _ in ranges:
        part_file = os.path.join(parts_dir, f'part_{idx:03d}')
        os.remove(part_file)
    os.rmdir(parts_dir)

    final_size = os.path.getsize(OUTPUT)
    print(f"✅ 完成: {OUTPUT} ({final_size/1024/1024:.1f}MB)", flush=True)
    if final_size != total:
        print(f"⚠️ 大小不匹配: {final_size} vs {total}", flush=True)
        sys.exit(1)


if __name__ == '__main__':
    main()
