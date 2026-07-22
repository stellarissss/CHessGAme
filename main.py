#!/usr/bin/env python3
"""
棋圣 (ChessSage) — 六道众生统一启动器
一键拉起六种 AI 作弊棋类服务，并在本地启动“六道众生”总坛界面。
"""
import os
import sys
import subprocess
import time
import threading
import webbrowser
from pathlib import Path

# 若环境未安装依赖，给出友好提示后再尝试启动
WORKSPACE_ROOT = Path(__file__).resolve().parent
HUB_DIR = WORKSPACE_ROOT / "hub"
HUB_PORT = int(os.environ.get("HUB_PORT", 8080))

GAMES = [
    {"id": "xiangqi", "name": "无限制象棋", "realm": "human", "icon": "♜", "sub": "人界 · 楚河汉界",
     "description": "传统象棋骨架，AI 实时改写走法、规则与胜负。", "port": 8000},
    {"id": "wuziqi", "name": "无限制五子棋", "realm": "heaven", "icon": "⚫", "sub": "天界 · 五连登仙",
     "description": "连珠成线即可登天，规则只在你一句话之间。", "port": 8001},
    {"id": "weiqi", "name": "无限制围棋", "realm": "asura", "icon": "⚪", "sub": "阿修罗 · 混沌气局",
     "description": "十九路战场，气、劫、提子皆可被自然语言重写。", "port": 8002},
    {"id": "dongwuqi", "name": "无限制动物棋", "realm": "animal", "icon": "🐘", "sub": "畜生界 · 斗兽丛林",
     "description": "鼠可吃象，狮可跳河，让动物们突破等级与水域。", "port": 8003},
    {"id": "tiaoqi", "name": "无限制跳棋", "realm": "hungry", "icon": "⬢", "sub": "饿鬼界 · 六角星途",
     "description": "六角星盘上连跳奔袭，AI 让 hunger 无止境。", "port": 8004},
    {"id": "heibaiqi", "name": "无限制黑白棋", "realm": "hell", "icon": "☯", "sub": "地狱界 · 阴阳翻转",
     "description": "夹吃翻转的 Othello，大模型赋予地狱般的自定义规则。", "port": 8005},
]


def print_banner():
    print("=" * 58)
    print("  棋圣 ChessSage · 六道众生")
    print("  统一启动器")
    print("=" * 58)


def check_dependencies():
    print("\n[检查依赖]")
    try:
        import fastapi  # noqa: F401
        import uvicorn  # noqa: F401
        import httpx    # noqa: F401
        import pydantic # noqa: F401
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
    env["PYTHONPATH"] = str(WORKSPACE_ROOT) + os.pathsep + env.get("PYTHONPATH", "")
    env["GAME_PORT"] = str(port)

    try:
        process = subprocess.Popen(
            [sys.executable, str(script_path)],
            cwd=str(cwd),
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
        t = threading.Thread(target=_pipe_logger, args=(process, name), daemon=True)
        t.start()
        return process
    except Exception as e:
        print(f"✗ 启动失败: {e}")
        return None


def build_hub_app():
    """构建总界面的 FastAPI 应用"""
    from fastapi import FastAPI
    from fastapi.responses import HTMLResponse
    from fastapi.staticfiles import StaticFiles
    from fastapi.middleware.cors import CORSMiddleware

    app = FastAPI(title="棋圣 · 六道众生", version="1.0.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    if HUB_DIR.exists():
        app.mount("/static", StaticFiles(directory=str(HUB_DIR)), name="hub_static")

    @app.get("/")
    async def index():
        html_path = HUB_DIR / "index.html"
        if html_path.exists():
            return HTMLResponse(html_path.read_text(encoding="utf-8"))
        return HTMLResponse("<h1>六道众生总坛文件未找到</h1>", status_code=404)

    @app.get("/api/games")
    async def list_games():
        return [
            {
                **game,
                "url": f"http://localhost:{game['port']}/",
            }
            for game in GAMES
        ]

    @app.get("/api/health")
    async def health():
        return {"status": "ok", "hub_port": HUB_PORT}

    return app


def start_hub_server(port):
    import uvicorn

    hub_app = build_hub_app()
    print(f"\n启动 六道众生总坛 (端口 {port})...")
    uvicorn.run(hub_app, host="0.0.0.0", port=port, log_level="warning")


def open_browser(url, no_browser=False):
    if no_browser:
        return
    # 给总坛服务一点启动时间
    time.sleep(1.2)
    try:
        webbrowser.open(url, new=2)
        print(f"\n已尝试唤起浏览器: {url}")
    except Exception as e:
        print(f"\n未能自动打开浏览器: {e}")


def main():
    print_banner()

    no_browser = "--no-browser" in sys.argv

    if not check_dependencies():
        sys.exit(1)

    processes = []

    # 1. 启动六个棋类服务
    for game in GAMES:
        script_path = WORKSPACE_ROOT / game["id"] / "main.py"
        if script_path.exists():
            proc = start_process(game["name"], script_path, game["port"])
            if proc:
                processes.append((game["name"], proc))
        else:
            print(f"\n跳过 {game['name']}: 未找到 {script_path}")

    # 2. 在后台线程启动总坛服务
    hub_thread = threading.Thread(
        target=start_hub_server,
        args=(HUB_PORT,),
        daemon=True,
    )
    hub_thread.start()

    hub_url = f"http://localhost:{HUB_PORT}/"

    # 3. 自动打开浏览器（可选）
    browser_thread = threading.Thread(
        target=open_browser,
        args=(hub_url, no_browser),
        daemon=True,
    )
    browser_thread.start()

    print("\n" + "=" * 58)
    print("服务启动完成！")
    print("=" * 58)
    print(f"\n六道众生总坛: {hub_url}")
    print("\n各棋类入口:")
    for game in GAMES:
        print(f"  {game['name']}: http://localhost:{game['port']}/")
    print("\n按 Ctrl+C 停止所有服务")
    print("=" * 58)

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n\n正在停止所有服务...")
        for name, proc in processes:
            print(f"停止 {name}...")
            try:
                proc.terminate()
                proc.wait(timeout=5)
            except Exception:
                proc.kill()
        print("所有服务已停止")


if __name__ == "__main__":
    main()
