#!/usr/bin/env python3
"""
棋圣 (ChessSage) - 统一启动器
启动所有棋类服务。
"""
import os
import sys
import subprocess
import time
import threading
from pathlib import Path


WORKSPACE_ROOT = Path(__file__).resolve().parent


def print_banner():
    print("=" * 50)
    print("  棋圣 ChessSage")
    print("  统一启动器")
    print("=" * 50)


def check_dependencies():
    print("\n[检查依赖]")
    try:
        import fastapi
        import uvicorn
        import httpx
        import pydantic
        print("✓ 所有依赖已安装")
        return True
    except ImportError as e:
        print(f"✗ 缺少依赖: {e}")
        print("  请运行: pip install -r requirements.txt")
        return False


def _pipe_logger(process, name):
    """后台线程：实时读取子进程 stdout 并打印到主终端"""
    try:
        for line in process.stdout:
            line = line.rstrip()
            if line:
                print(f"[{name}] {line}")
    except Exception:
        pass


def start_process(name, script_path, port, cwd=None):
    print(f"\n启动 {name} (端口 {port})...")
    if cwd is None:
        cwd = script_path.parent

    env = os.environ.copy()
    env['PYTHONPATH'] = str(WORKSPACE_ROOT) + os.pathsep + env.get('PYTHONPATH', '')

    try:
        process = subprocess.Popen(
            [sys.executable, str(script_path)],
            cwd=str(cwd),
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1
        )
        # 启动日志输出线程
        t = threading.Thread(target=_pipe_logger, args=(process, name), daemon=True)
        t.start()
        return process
    except Exception as e:
        print(f"✗ 启动失败: {e}")
        return None


def main():
    print_banner()

    if not check_dependencies():
        sys.exit(1)

    processes = []

    xiangqi_path = WORKSPACE_ROOT / "xiangqi" / "main.py"
    if xiangqi_path.exists():
        proc = start_process("象棋服务", xiangqi_path, 8000)
        if proc:
            processes.append(("象棋服务", proc))

    wuziqi_path = WORKSPACE_ROOT / "wuziqi" / "main.py"
    if wuziqi_path.exists():
        proc = start_process("五子棋服务", wuziqi_path, 8001)
        if proc:
            processes.append(("五子棋服务", proc))

    go_path = WORKSPACE_ROOT / "go" / "main.py"
    if go_path.exists():
        proc = start_process("围棋服务", go_path, 8002)
        if proc:
            processes.append(("围棋服务", proc))

    print("\n" + "=" * 50)
    print("服务启动完成！")
    print("=" * 50)
    print("\n访问地址:")
    print("  象棋: http://localhost:8000/")
    print("  五子棋: http://localhost:8001/")
    print("  围棋: http://localhost:8002/")
    print("\n按 Ctrl+C 停止所有服务")
    print("=" * 50)

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n\n正在停止所有服务...")
        for name, proc in processes:
            print(f"停止 {name}...")
            proc.terminate()
            proc.wait()
        print("所有服务已停止")


if __name__ == "__main__":
    main()