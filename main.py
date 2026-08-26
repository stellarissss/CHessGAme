#!/usr/bin/env python3
"""
棋圣 (ChessSage) — 六道众生统一启动器
一键拉起六种 AI 作弊棋类服务（剧情模式）+ 六种沙盒棋类（共 12 个子服务），
并在本地启动“六道众生”总坛界面。
"""
import os
import sys
import json
import subprocess
import time
import threading
import webbrowser
from datetime import datetime
from pathlib import Path

# ═══════════════════════════════════════════════════════════════
# 彩色日志
# ═══════════════════════════════════════════════════════════════

_ANSI = {
    "reset":  "\033[0m",
    "green":  "\033[32m",
    "yellow": "\033[33m",
    "red":    "\033[31m",
    "cyan":   "\033[36m",
    "dim":    "\033[2m",
}
_NO_COLOR = not sys.stdout.isatty()


def _c(color, text):
    """为文本着色，非 TTY 环境自动降级为纯文本"""
    if _NO_COLOR:
        return text
    return f"{_ANSI[color]}{text}{_ANSI['reset']}"


def _classify_line(line: str) -> str:
    """根据日志内容判定颜色等级：green / yellow / red"""
    upper = line.upper()
    # 红色：错误
    for kw in ("ERROR", "CRITICAL", "TRACEBACK", "EXCEPTION",
               "FATAL", "FAILED", "✗"):
        if kw in upper:
            return "red"
    # 黄色：警告
    for kw in ("WARNING", "WARN", "DEPRECATED", "405", "404",
               "SKIP", "跳过"):
        if kw in upper:
            return "yellow"
    # 绿色：正常运行
    return "green"


def log_info(msg):
    """输出绿色信息"""
    print(_c("green", msg))


def log_warn(msg):
    """输出黄色警告"""
    print(_c("yellow", msg))


def log_error(msg):
    """输出红色错误"""
    print(_c("red", msg))

# 若环境未安装依赖，给出友好提示后再尝试启动
WORKSPACE_ROOT = Path(__file__).resolve().parent
HUB_DIR = WORKSPACE_ROOT / "hub"
SHARED_DIR = WORKSPACE_ROOT / "shared"
ACHIEVEMENTS_FILE = WORKSPACE_ROOT / "achievements.json"
HUB_PORT = int(os.environ.get("HUB_PORT", 8080))

# ═══════════════════════════════════════════════════════════════
# 成就定义
# ═══════════════════════════════════════════════════════════════

ACHIEVEMENT_DEFINITIONS = [
    # 棋盘操控类
    {"id": "ambush", "name": "十面埋伏", "desc": "象棋中你的棋子数量≥20", "icon": "♟", "category": "board", "rarity": "rare", "games": ["xiangqi"]},
    {"id": "sea_of_pieces", "name": "人海战术", "desc": "棋盘上总棋子数≥40", "icon": "👥", "category": "board", "rarity": "rare", "games": ["all"]},
    {"id": "last_man_standing", "name": "孤勇者", "desc": "你只剩1个棋子且游戏未结束", "icon": "🦸", "category": "board", "rarity": "common", "games": ["all"]},
    {"id": "palette", "name": "调色板", "desc": "让棋盘变色", "icon": "🎨", "category": "board", "rarity": "common", "games": ["all"]},
    {"id": "reality_stone", "name": "现实宝石", "desc": "改变棋盘线条/框架", "icon": "💎", "category": "board", "rarity": "common", "games": ["all"]},
    {"id": "bigger_picture", "name": "格局打开", "desc": "修改棋盘尺寸", "icon": "📐", "category": "board", "rarity": "rare", "games": ["all"]},
    {"id": "lawn_party", "name": "草坪派对", "desc": "棋盘变成绿色系", "icon": "🌱", "category": "board", "rarity": "common", "games": ["all"]},
    {"id": "genshin", "name": "我超，原", "desc": "棋盘变成紫色系", "icon": "✨", "category": "board", "rarity": "common", "games": ["all"]},
    # AI 创造类
    {"id": "clone_wars", "name": "克隆战争", "desc": "创建了自定义棋子", "icon": "🧬", "category": "ai_create", "rarity": "rare", "games": ["all"]},
    {"id": "zoo", "name": "动物园", "desc": "在斗兽棋中创建新的动物棋子", "icon": "🦁", "category": "ai_create", "rarity": "rare", "games": ["dongwuqi"]},
    {"id": "alchemist", "name": "炼金术士", "desc": "AI成功创建了自定义棋子", "icon": "⚗️", "category": "ai_create", "rarity": "rare", "games": ["all"]},
    {"id": "architect", "name": "建筑师", "desc": "AI成功修改了棋盘外观", "icon": "🏗️", "category": "ai_create", "rarity": "common", "games": ["all"]},
    {"id": "lawmaker", "name": "立法者", "desc": "AI成功修改了规则", "icon": "📜", "category": "ai_create", "rarity": "common", "games": ["all"]},
    {"id": "what_a_guy", "name": "好家伙", "desc": "创建了名字超过10字的棋子", "icon": "😱", "category": "ai_create", "rarity": "rare", "games": ["all"]},
    # 规则破坏类
    {"id": "outlaw", "name": "无法无天", "desc": "激活10条以上自定义规则", "icon": "🏴", "category": "rule_break", "rarity": "legendary", "games": ["all"]},
    {"id": "rewrite_fate", "name": "改写命运", "desc": "成功修改了棋子走法", "icon": "✏️", "category": "rule_break", "rarity": "common", "games": ["all"]},
    {"id": "god_hand", "name": "上帝之手", "desc": "直接设置游戏胜负", "icon": "👁️", "category": "rule_break", "rarity": "legendary", "games": ["all"]},
    # AI 对话类
    {"id": "what_are_you_doing", "name": "你在干嘛", "desc": "和ChatAI谈论无关的事情", "icon": "🤔", "category": "chat", "rarity": "common", "games": ["all"]},
    {"id": "id_revealed", "name": "报身份证号", "desc": "AI拒绝了你的指令", "icon": "🪪", "category": "chat", "rarity": "common", "games": ["all"]},
    {"id": "chatterbox", "name": "话痨", "desc": "累计发送50条AI指令", "icon": "💬", "category": "chat", "rarity": "rare", "games": ["all"]},
    {"id": "all_in_one", "name": "这波是肉身开团", "desc": "一步触发3种以上修改类型", "icon": "🌊", "category": "chat", "rarity": "rare", "games": ["all"]},
    # 机制类
    {"id": "ceasefire", "name": "停战协议", "desc": "使用了跳过回合机制", "icon": "⏸️", "category": "mechanism", "rarity": "common", "games": ["all"]},
    {"id": "body_snatch", "name": "夺舍", "desc": "使用了AI接管机制", "icon": "🤖", "category": "mechanism", "rarity": "common", "games": ["all"]},
    {"id": "giving_up", "name": "开摆", "desc": "使用了随机走棋机制", "icon": "🎲", "category": "mechanism", "rarity": "common", "games": ["all"]},
    {"id": "clone_jutsu", "name": "分身术", "desc": "使用了额外回合机制", "icon": "⚡", "category": "mechanism", "rarity": "common", "games": ["all"]},
    {"id": "no_longer_human", "name": "我不做人了", "desc": "使用了玩家控制切换机制", "icon": "🎭", "category": "mechanism", "rarity": "rare", "games": ["all"]},
    # 游戏事件类
    {"id": "speedrun", "name": "就这？", "desc": "5步内获胜", "icon": "⚡", "category": "event", "rarity": "legendary", "games": ["all"]},
    {"id": "suffering", "name": "受苦", "desc": "连续被AI吃5子", "icon": "💀", "category": "event", "rarity": "common", "games": ["all"]},
    {"id": "got_cketched", "name": "我大意了啊", "desc": "被AI获胜", "icon": "😅", "category": "event", "rarity": "common", "games": ["all"]},
    {"id": "winner", "name": "胜利者", "desc": "赢得一场比赛", "icon": "🏆", "category": "event", "rarity": "common", "games": ["all"]},
    # 围棋特别
    {"id": "go_five", "name": "五子棋？", "desc": "在围棋中把自己方棋子连成五子", "icon": "🔗", "category": "event", "rarity": "legendary", "games": ["weiqi"]},
    # 消耗类
    {"id": "broke", "name": "你币没了", "desc": "Token消耗超过10000", "icon": "🪙", "category": "usage", "rarity": "common", "games": ["all"]},
    {"id": "money_power", "name": "钞能力", "desc": "Token消耗超过50000", "icon": "💸", "category": "usage", "rarity": "legendary", "games": ["all"]},
    # 元成就
    {"id": "samsara", "name": "六道轮回", "desc": "在所有6种棋类中各触发至少1个成就", "icon": "♻️", "category": "meta", "rarity": "legendary", "games": ["all"]},
    {"id": "collector", "name": "收藏家", "desc": "解锁10个成就", "icon": "📦", "category": "meta", "rarity": "rare", "games": ["all"]},
    {"id": "completionist", "name": "成就党", "desc": "解锁25个成就", "icon": "🎖️", "category": "meta", "rarity": "legendary", "games": ["all"]},
    {"id": "pokedex", "name": "全图鉴", "desc": "解锁所有成就", "icon": "📖", "category": "meta", "rarity": "legendary", "games": ["all"]},
]

ALL_GAME_IDS = ["xiangqi", "wuziqi", "weiqi", "dongwuqi", "tiaoqi", "heibaiqi"]
META_ACHIEVEMENT_IDS = {"samsara", "collector", "completionist", "pokedex"}


def _load_achievements():
    """读取成就存档，不存在则创建空存档"""
    if not ACHIEVEMENTS_FILE.exists():
        _save_achievements({"version": 1, "unlocked": {}, "stats": {"total_commands": 0, "total_moves": 0, "total_captures": 0, "games_played": {}}})
    try:
        return json.loads(ACHIEVEMENTS_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {"version": 1, "unlocked": {}, "stats": {"total_commands": 0, "total_moves": 0, "total_captures": 0, "games_played": {}}}


def _save_achievements(data):
    """写入成就存档，失败前先写入 .bak 回滚备份"""
    # 先备份旧文件（如果存在）
    try:
        if ACHIEVEMENTS_FILE.exists():
            bak = ACHIEVEMENTS_FILE.with_suffix(ACHIEVEMENTS_FILE.suffix + ".bak")
            bak.write_bytes(ACHIEVEMENTS_FILE.read_bytes())
    except OSError:
        pass
    ACHIEVEMENTS_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def _check_meta_achievements(data):
    """检查并解锁元成就，返回新解锁的元成就列表"""
    newly_unlocked = []
    unlocked = data["unlocked"]
    count = len(unlocked)

    # collector: 10个
    if count >= 10 and "collector" not in unlocked:
        unlocked["collector"] = {"unlocked_at": datetime.now().isoformat(), "game": "meta", "context": f"已解锁{count}个成就"}
        newly_unlocked.append("collector")

    # completionist: 25个
    if count >= 25 and "completionist" not in unlocked:
        unlocked["completionist"] = {"unlocked_at": datetime.now().isoformat(), "game": "meta", "context": f"已解锁{count}个成就"}
        newly_unlocked.append("completionist")

    # samsara: 6种棋各至少1个
    games_with_achievements = set()
    for info in unlocked.values():
        g = info.get("game", "")
        if g in ALL_GAME_IDS:
            games_with_achievements.add(g)
    if len(games_with_achievements) >= 6 and "samsara" not in unlocked:
        unlocked["samsara"] = {"unlocked_at": datetime.now().isoformat(), "game": "meta", "context": "六道棋境均已解锁成就"}
        newly_unlocked.append("samsara")

    # pokedex: 全部成就
    non_meta_count = sum(1 for aid in unlocked if aid not in META_ACHIEVEMENT_IDS)
    total_non_meta = sum(1 for a in ACHIEVEMENT_DEFINITIONS if a["id"] not in META_ACHIEVEMENT_IDS)
    if non_meta_count >= total_non_meta and "pokedex" not in unlocked and total_non_meta > 0:
        unlocked["pokedex"] = {"unlocked_at": datetime.now().isoformat(), "game": "meta", "context": "全图鉴达成"}
        newly_unlocked.append("pokedex")

    return newly_unlocked

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

# 沙盒模式棋类（纯净版，无业力/识破/成就/RPG 集成，与 RPG 完全隔离）
SANDBOX_GAMES = [
    {"id": "xiangqi",  "name": "纯净象棋",   "icon": "♜", "sub": "楚河汉界 · 自由对弈",
     "description": "纯净象棋，AI 改规无业力束缚。", "port": 8010},
    {"id": "wuziqi",   "name": "纯净五子棋", "icon": "⚫", "sub": "五连登仙 · 自由对弈",
     "description": "纯净五子棋，连珠成线无拘束。", "port": 8011},
    {"id": "weiqi",    "name": "纯净围棋",   "icon": "⚪", "sub": "混沌气局 · 自由对弈",
     "description": "纯净围棋，十九路自由改写。", "port": 8012},
    {"id": "dongwuqi", "name": "纯净动物棋", "icon": "🐘", "sub": "斗兽丛林 · 自由对弈",
     "description": "纯净动物棋，鼠象狮各显神通。", "port": 8013},
    {"id": "tiaoqi",   "name": "纯净跳棋",   "icon": "⬢", "sub": "六角星途 · 自由对弈",
     "description": "纯净跳棋，连跳奔袭无止境。", "port": 8014},
    {"id": "heibaiqi", "name": "纯净黑白棋", "icon": "☯", "sub": "阴阳翻转 · 自由对弈",
     "description": "纯净黑白棋，夹吃翻转自定义。", "port": 8015},
]

REALMS = {
    "hell": {"name": "地狱道", "icon": "☯", "game": "heibaiqi", "description": "黑白棋 · 阴阳翻转"},
    "hungry": {"name": "饿鬼道", "icon": "👹", "game": "tiaoqi", "description": "跳棋 · 六角星途"},
    "animal": {"name": "畜生道", "icon": "🐅", "game": "dongwuqi", "description": "动物棋 · 斗兽丛林"},
    "human": {"name": "人道", "icon": "🧠", "game": "xiangqi", "description": "象棋 · 楚河汉界"},
    "asura": {"name": "阿修罗道", "icon": "⚔️", "game": "weiqi", "description": "围棋 · 混沌气局"},
    "heaven": {"name": "天道", "icon": "☸️", "game": "wuziqi", "description": "五子棋 · 五连登仙"},
}


def print_banner():
    print(_c("cyan", "=" * 58))
    print(_c("green", "  棋圣 ChessSage · 六道众生"))
    print(_c("cyan", "  统一启动器"))
    print(_c("cyan", "=" * 58))


def check_dependencies():
    print(_c("dim", "\n[检查依赖]"))
    try:
        import fastapi  # noqa: F401
        import uvicorn  # noqa: F401
        import httpx    # noqa: F401
        import pydantic # noqa: F401
        log_info("✓ 所有依赖已安装")
        return True
    except ImportError as e:
        log_error(f"✗ 缺少依赖: {e}")
        log_warn("  请运行: pip install -r requirements.txt")
        return False


def _pipe_logger(process, name):
    """后台线程：实时读取子进程 stdout 并按内容着色打印"""
    try:
        for line in process.stdout:
            line = line.rstrip()
            if not line:
                continue
            level = _classify_line(line)
            tag = _c("dim", f"[{name}]")
            print(f"{tag} {_c(level, line)}")
    except Exception:
        pass


def start_process(name, script_path, port, cwd=None):
    log_info(f"  启动 {name} (端口 {port})...")
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
        log_error(f"  ✗ 启动失败: {e}")
        return None


def build_hub_app():
    """构建总界面的 FastAPI 应用"""
    from fastapi import FastAPI, Request
    from fastapi.responses import HTMLResponse, JSONResponse
    from fastapi.staticfiles import StaticFiles
    from fastapi.middleware.cors import CORSMiddleware

    NO_STORE = {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Pragma": "no-cache",
        "Expires": "0",
    }

    def _nc(payload):
        return JSONResponse(content=payload, headers=NO_STORE)

    app = FastAPI(title="棋圣 · 六道众生", version="1.4.1")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    if HUB_DIR.exists():
        app.mount("/static", StaticFiles(directory=str(HUB_DIR)), name="hub_static")
    if SHARED_DIR.exists():
        app.mount("/shared", StaticFiles(directory=str(SHARED_DIR)), name="shared_static")

    @app.get("/")
    async def title_page():
        # 标题页（双模式入口：剧情模式 / 沙盒模式）
        html_path = HUB_DIR / "title.html"
        if html_path.exists():
            return HTMLResponse(html_path.read_text(encoding="utf-8"))
        return HTMLResponse("<h1>标题页未找到</h1>", status_code=404)

    @app.get("/hub")
    async def hub_index():
        # RPG 总坛（剧情模式主界面）
        html_path = HUB_DIR / "index.html"
        if html_path.exists():
            return HTMLResponse(html_path.read_text(encoding="utf-8"))
        return HTMLResponse("<h1>六道众生总坛文件未找到</h1>", status_code=404)

    @app.get("/sandbox")
    async def sandbox_page():
        # 沙盒总坛（纯净棋类入口，与 RPG 隔离）
        html_path = HUB_DIR / "sandbox.html"
        if html_path.exists():
            return HTMLResponse(html_path.read_text(encoding="utf-8"))
        return HTMLResponse("<h1>沙盒总坛未找到</h1>", status_code=404)

    @app.get("/achievements")
    async def achievements_page():
        html_path = HUB_DIR / "achievements.html"
        if html_path.exists():
            return HTMLResponse(html_path.read_text(encoding="utf-8"))
        return HTMLResponse("<h1>成就殿堂未找到</h1>", status_code=404)

    # ── RPG 页面路由 ──
    @app.get("/dialogue")
    async def dialogue_page():
        html_path = HUB_DIR / "dialogue.html"
        if html_path.exists():
            return HTMLResponse(html_path.read_text(encoding="utf-8"))
        return HTMLResponse("<h1>剧情对话页未找到</h1>", status_code=404)

    @app.get("/memory-album")
    async def memory_album_page():
        html_path = HUB_DIR / "memory_album.html"
        if html_path.exists():
            return HTMLResponse(html_path.read_text(encoding="utf-8"))
        return HTMLResponse("<h1>记忆相册页未找到</h1>", status_code=404)

    @app.get("/ending")
    async def ending_page():
        html_path = HUB_DIR / "ending.html"
        if html_path.exists():
            return HTMLResponse(html_path.read_text(encoding="utf-8"))
        return HTMLResponse("<h1>结局页未找到</h1>", status_code=404)

    @app.get("/heaven-boss")
    async def heaven_boss_page():
        html_path = HUB_DIR / "heaven_boss.html"
        if html_path.exists():
            return HTMLResponse(html_path.read_text(encoding="utf-8"))
        return HTMLResponse("<h1>天道Boss战页未找到</h1>", status_code=404)

    @app.get("/api/games")
    async def list_games():
        return _nc([
            {
                **game,
                "url": f"http://localhost:{game['port']}/",
            }
            for game in GAMES
        ])

    @app.get("/api/sandbox/games")
    async def list_sandbox_games():
        # 沙盒模式棋类列表（纯净版，与 RPG 隔离）
        return _nc([
            {
                **game,
                "url": f"http://localhost:{game['port']}/",
            }
            for game in SANDBOX_GAMES
        ])

    @app.get("/api/health")
    async def health():
        return _nc({"status": "ok", "hub_port": HUB_PORT})

    # ── 六道轮回 API ──
    sys.path.insert(0, str(WORKSPACE_ROOT))
    from samsara.api import app as samsara_app
    app.mount("/samsara", samsara_app)

    @app.get("/api/samsara/realms")
    async def get_realms_list():
        return _nc(REALMS)

    # ── 成就 API ──

    @app.get("/api/achievements")
    async def get_achievements():
        data = _load_achievements()
        unlocked = data.get("unlocked", {})
        achievements = []
        for adef in ACHIEVEMENT_DEFINITIONS:
            info = unlocked.get(adef["id"])
            achievements.append({
                "id": adef["id"],
                "name": adef["name"],
                "desc": adef["desc"],
                "icon": adef["icon"],
                "category": adef["category"],
                "rarity": adef["rarity"],
                "games": adef["games"],
                "unlocked": info is not None,
                "unlocked_at": info.get("unlocked_at") if info else None,
                "game": info.get("game") if info else None,
                "context": info.get("context") if info else None,
            })
        return _nc({
            "total": len(ACHIEVEMENT_DEFINITIONS),
            "unlocked_count": len(unlocked),
            "achievements": achievements,
        })

    @app.post("/api/achievements/unlock")
    async def unlock_achievement(request: Request):
        body = await request.json()
        achievement_id = body.get("achievement_id", "")
        game = body.get("game", "unknown")
        context = body.get("context", "")

        valid_ids = {a["id"] for a in ACHIEVEMENT_DEFINITIONS}
        if achievement_id not in valid_ids:
            return JSONResponse({"error": "unknown achievement"}, headers=NO_STORE, status_code=400)

        data = _load_achievements()
        unlocked = data["unlocked"]

        if achievement_id in unlocked:
            return _nc({"newly_unlocked": False, "achievement_id": achievement_id, "meta_unlocked": []})

        unlocked[achievement_id] = {
            "unlocked_at": datetime.now().isoformat(),
            "game": game,
            "context": context,
        }

        meta_unlocked = _check_meta_achievements(data)
        _save_achievements(data)
        return _nc({"newly_unlocked": True, "achievement_id": achievement_id, "meta_unlocked": meta_unlocked})

    @app.get("/api/achievements/stats")
    async def get_stats():
        data = _load_achievements()
        return _nc(data.get("stats", {}))

    @app.post("/api/achievements/stats")
    async def update_stats(request: Request):
        body = await request.json()
        data = _load_achievements()
        stats = data.setdefault("stats", {"total_commands": 0, "total_moves": 0, "total_captures": 0, "games_played": {}})

        if "field" in body and "increment" in body:
            field = body["field"]
            inc = body["increment"]
            if field in ("total_commands", "total_moves", "total_captures"):
                stats[field] = stats.get(field, 0) + inc
            elif field == "games_played":
                game_id = body.get("game_id", "unknown")
                gp = stats.setdefault("games_played", {})
                gp[game_id] = gp.get(game_id, 0) + inc
        elif "fields" in body:
            for k, v in body["fields"].items():
                stats[k] = v

        _save_achievements(data)
        return _nc({"ok": True, "stats": stats})

    @app.post("/api/achievements/reset")
    async def reset_achievements(request: Request):
        """成就重置。默认重置 stats 与 unlocked，保留成就定义不变。"""
        try:
            body = await request.json()
        except Exception:
            body = {}
        # 先备份
        if ACHIEVEMENTS_FILE.exists():
            try:
                bak = ACHIEVEMENTS_FILE.with_suffix(ACHIEVEMENTS_FILE.suffix + ".bak")
                bak.write_bytes(ACHIEVEMENTS_FILE.read_bytes())
            except OSError:
                pass
        mode = body.get("mode", "all")
        if mode == "stats_only":
            data = _load_achievements()
            data["stats"] = {"total_commands": 0, "total_moves": 0, "total_captures": 0, "games_played": {}}
            _save_achievements(data)
            return _nc({"ok": True, "mode": mode, "data": data})
        # all: 整个成就结构恢复空
        empty = {
            "version": 1,
            "unlocked": {},
            "stats": {"total_commands": 0, "total_moves": 0, "total_captures": 0, "games_played": {}},
        }
        _save_achievements(empty)
        return _nc({"ok": True, "mode": "all", "data": empty})


    return app


def start_hub_server(port):
    import uvicorn

    hub_app = build_hub_app()
    log_info(f"  启动 六道众生总坛 (端口 {port})...")
    uvicorn.run(hub_app, host="0.0.0.0", port=port, log_level="warning")


def open_browser(url, no_browser=False):
    if no_browser:
        return
    # 给总坛服务一点启动时间
    time.sleep(1.2)
    try:
        webbrowser.open(url, new=2)
        log_info(f"\n  已尝试唤起浏览器: {url}")
    except Exception as e:
        log_warn(f"\n  未能自动打开浏览器: {e}")


def _hub_ready(port: int, timeout: float = 25.0) -> bool:
    """等待总坛服务可访问（桌面窗口/浏览器打开前就绪检查）。"""
    import urllib.request

    url = f"http://127.0.0.1:{port}/api/health"
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=1) as resp:
                if resp.status == 200:
                    return True
        except Exception:
            pass
        time.sleep(0.3)
    return False


def open_desktop_window(url: str) -> None:
    """以 pywebview 原生 WebView 打开总坛，替代外部浏览器。

    高性能说明：
    - Windows 优先使用 WebView2/EdgeChromium（Chromium 内核），
      与系统浏览器无关，渲染与渲染后的交互性能最佳，且无浏览器工具栏。
    - macOS 使用 WKWebView，Linux 使用 GTK(WKWebKit2)。
    在 pygame 设置下，主线程运行 GUI 事件循环，阻塞直至窗口关闭。
    """
    import webview  # 延迟导入：仅桌面窗口模式需要

    webview.create_window(
        "棋圣 ChessSage · 六道众生",
        url=url,
        width=1440,
        height=900,
        min_size=(1024, 640),
        background_color="#0a0a16",
        text_select=False,
        zoomable=True,
        easy_drag=True,
    )
    log_info(f"\n  [独立桌面窗口] 已打开: {url}")
    log_info("  " + "=" * 54)
    log_info("  关闭窗口即停止全部服务。")
    log_info("  Windows 使用 WebView2(Chromium) 内核，性能最佳。")
    log_info("  " + "=" * 54)
    # GUI 事件循环在主线程运行，阻塞直至所有窗口关闭
    webview.start(gui=None, private_mode=False, debug=False)


def _hold_and_monitor(processes):
    """浏览器 / 纯服务模式：保持主流程存活并按需健康告警（Ctrl+C 后返回）。"""
    _alerted_exits = {i: False for i in range(len(processes))}
    _health_tick = 0
    try:
        while True:
            time.sleep(1)
            _health_tick += 1
            # 每 30 秒轮询一次子进程存活状态（仅告警不重启，避免覆盖副作用重置棋盘状态）
            if _health_tick % 30 == 0:
                for idx, (name, proc) in enumerate(processes):
                    rc = proc.poll()
                    if rc is not None and not _alerted_exits[idx]:
                        log_error(f"  ⚠ 进程异常退出: {name} (退出码 {rc})，请检查日志或手动重启")
                        _alerted_exits[idx] = True
    except KeyboardInterrupt:
        print()


def _stop_all(processes):
    """终止全部棋类子服务。"""
    log_info("\n  正在停止所有服务...")
    for name, proc in processes:
        log_info(f"    停止 {name}...")
        try:
            proc.terminate()
            proc.wait(timeout=5)
        except Exception:
            proc.kill()
    log_info("  所有服务已停止")


def main():
    print_banner()

    no_browser = "--no-browser" in sys.argv
    browser_mode = "--browser" in sys.argv or "--no-window" in sys.argv
    # 默认（未指定参数）：独立桌面窗口模式
    window_mode = not no_browser and not browser_mode

    if not check_dependencies():
        sys.exit(1)

    processes = []

    # 1a. 启动六个 RPG 棋类服务（端口 8000-8005）
    for game in GAMES:
        script_path = WORKSPACE_ROOT / game["id"] / "main.py"
        if script_path.exists():
            proc = start_process(game["name"], script_path, game["port"])
            if proc:
                processes.append((game["name"], proc))
        else:
            log_warn(f"  跳过 {game['name']}: 未找到 {script_path}")

    # 1b. 启动六个沙盒棋类服务（端口 8010-8015，纯净模式，与 RPG 隔离）
    for game in SANDBOX_GAMES:
        script_path = WORKSPACE_ROOT / "sandbox" / game["id"] / "main.py"
        if script_path.exists():
            proc = start_process(f"[沙盒]{game['name']}", script_path, game["port"])
            if proc:
                processes.append((f"[沙盒]{game['name']}", proc))
        else:
            log_warn(f"  跳过 [沙盒]{game['name']}: 未找到 {script_path}")

    # 2. 在后台线程启动总坛服务
    hub_thread = threading.Thread(
        target=start_hub_server,
        args=(HUB_PORT,),
        daemon=True,
    )
    hub_thread.start()

    hub_url = f"http://localhost:{HUB_PORT}/"

    print(_c("cyan", "\n" + "=" * 58))
    log_info("  服务启动完成！")
    print(_c("cyan", "  " + "=" * 56))
    log_info(f"  六道众生标题页: {hub_url}")
    print(_c("dim", "\n  RPG 棋类入口（剧情模式）:"))
    for game in GAMES:
        print(_c("green", f"    {game['name']}: http://localhost:{game['port']}/"))
    print(_c("dim", "\n  沙盒棋类入口（纯净模式）:"))
    for game in SANDBOX_GAMES:
        print(_c("green", f"    [沙盒]{game['name']}: http://localhost:{game['port']}/"))
    print(_c("yellow", "\n  关闭窗口 / 按 Ctrl+C 停止所有服务"))
    print(_c("cyan", "  " + "=" * 56))

    # 3. 打开方式：
    #    默认：pywebview 独立桌面窗口（原生 WebView，Chromium 高性能）
    #    --browser / --no-window：兼容旧版，唤起系统浏览器
    #    --no-browser：仅启动服务，不打开任何界面
    if window_mode:
        if _hub_ready(HUB_PORT):
            try:
                open_desktop_window(hub_url)  # 阻塞直至窗口关闭
            except Exception as e:
                log_warn(f"\n  pywebview 启动失败: {e}")
                log_warn("  若需独立窗口请安装: pip install pywebview")
                log_warn("  本次退回浏览器模式")
                browser_mode = True
            else:
                _stop_all(processes)
                return
        else:
            log_warn("  总坛服务启动超时，退回浏览器模式")
            browser_mode = True

    if browser_mode:
        browser_thread = threading.Thread(
            target=open_browser,
            args=(hub_url, no_browser),
            daemon=True,
        )
        browser_thread.start()

    _hold_and_monitor(processes)
    _stop_all(processes)


if __name__ == "__main__":
    main()
