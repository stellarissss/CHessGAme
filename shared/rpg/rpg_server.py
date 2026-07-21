"""
棋圣 (ChessSage) RPG 主服务器 - 端口 80
RPG 外壳后端，编排三种棋类子项目 + VN 故事层 + 作弊评估系统。

架构（执行方案 Option A）：
  - rpg_server (端口 80) 作为 RPG 外壳，编排三种棋类服务
  - xiangqi:8000 / wuziqi:8001 / go:8002 作为棋类 iframe 后端
  - 跨域 postMessage 协议: RPG_INIT / RPG_READY / RPG_APPLY_CHEAT / RPG_MOVE_COMPLETE / RPG_GAME_END
"""
import os
import sys
import json
import random
from pathlib import Path
from typing import Dict, Any, Optional

# ═══════════════════════════════════════════════════════════════
# 路径常量
# ═══════════════════════════════════════════════════════════════

BASE_DIR = Path(__file__).resolve().parent          # shared/rpg/
WORKSPACE_ROOT = BASE_DIR.parent.parent              # /workspace
SHARED_DIR = WORKSPACE_ROOT / "shared"
RPG_DATA_DIR = WORKSPACE_ROOT / "rpg_data"
XIANGQI_DIR = WORKSPACE_ROOT / "xiangqi"
WUZIQI_DIR = WORKSPACE_ROOT / "wuziqi"
GO_DIR = WORKSPACE_ROOT / "go"
ROOT_CONFIG_FILE = WORKSPACE_ROOT / "config.json"
API_KEY_FILES = [
    ("根目录 config.json", ROOT_CONFIG_FILE),
    ("象棋 api密钥.txt", XIANGQI_DIR / "api密钥.txt"),
    ("五子棋 api密钥.txt", WUZIQI_DIR / "api密钥.txt"),
    ("围棋 api密钥.txt", GO_DIR / "api密钥.txt"),
]

# 将 shared/ 加入 sys.path（复用 schema_validator / json_patch_utils 如需）
if str(SHARED_DIR) not in sys.path:
    sys.path.insert(0, str(SHARED_DIR))

from fastapi import FastAPI, Request, Query
from fastapi.responses import JSONResponse, HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

try:
    import httpx
except ImportError:  # pragma: no cover
    httpx = None  # 没装 httpx 时降级


# ═══════════════════════════════════════════════════════════════
# 棋类服务端口映射
# ═══════════════════════════════════════════════════════════════

CHESS_PORTS = {
    "xiangqi": 8000,
    "wuziqi": 8001,
    "go": 8002,
}

# ═══════════════════════════════════════════════════════════════
# 章节配置（执行方案第 1 章）
# ═══════════════════════════════════════════════════════════════

CHAPTERS = {
    "ch00_prologue": {
        "title": "序章·觉醒",
        "chess_type": None,
        "next": "ch01_tutorial_wuziqi",
        "story_id": "ch00_prologue",
        "opponent": None,
        "player_side": None,
    },
    "ch01_tutorial_wuziqi": {
        "title": "第 0 章·教程",
        "chess_type": "wuziqi",
        "next": "ch02_city_xiangqi",
        "story_id": "ch01_tutorial_wuziqi",
        "opponent": {"id": "robot", "name": "棋圣系统"},
        "player_side": "black",
    },
    "ch02_city_xiangqi": {
        "title": "第 1 章·入门",
        "chess_type": "xiangqi",
        "next": "ch03_go_intro",
        "story_id": "ch02_city_xiangqi",
        "opponent": {"id": "robot", "name": "街亭棋客"},
        "player_side": "red",
    },
    "ch03_go_intro": {
        "title": "第 2 章·进阶",
        "chess_type": "go",
        "next": "ch04_boss_wuziqi",
        "story_id": "ch03_go_intro",
        "opponent": {"id": "robot", "name": "云子老人"},
        "player_side": "black",
    },
    "ch04_boss_wuziqi": {
        "title": "第 3 章·BOSS战",
        "chess_type": "wuziqi",
        "next": "ch05_final_xiangqi",
        "story_id": "ch04_boss_wuziqi",
        "opponent": {"id": "robot", "name": "夜枭"},
        "player_side": "black",
    },
    "ch05_final_xiangqi": {
        "title": "第 4 章·终极对决",
        "chess_type": "xiangqi",
        "next": "ch06_finale_go",
        "story_id": "ch05_final_xiangqi",
        "opponent": {"id": "robot", "name": "棋圣真身"},
        "player_side": "red",
    },
    "ch06_finale_go": {
        "title": "第 5 章·终局",
        "chess_type": "go",
        "next": None,
        "story_id": "ch06_finale_go",
        "opponent": {"id": "robot", "name": "执念化身"},
        "player_side": "black",
    },
}


# ═══════════════════════════════════════════════════════════════
# RPG 全局状态
# ═══════════════════════════════════════════════════════════════

class RpgState:
    """RPG 全局状态（内存中，与现有棋类 GameState 模式一致）"""

    # 能量规则（执行方案 2.1 节）
    ENERGY_MAX = 100
    ENERGY_MIN = -100  # 透支下限兜底
    ENERGY_THRESHOLD = 30  # 使用门槛（实际允许透支，门槛仅作 UI 提示）

    # 识破规则（执行方案 2.2 节）
    DETECTION_CAP = 95.0

    def __init__(self):
        self.energy = 20               # 初始能量，让玩家有起步资源
        self.detection = 0.0           # 识破概率 0-95，只增不减
        self.was_detected = False      # 是否曾被发现（影响结局）
        self.cheats_used = 0
        self.turn_count = 0
        self.current_chapter = "ch00_prologue"
        self.chess_type: Optional[str] = None
        self.player_side = "red"
        self.api_key = ""
        self.chapter_progress: Dict[str, str] = {}
        self.battle_started = False
        self.dialogue_templates = self._load_dialogue_templates()
        self.api_key = self._load_default_api_key()

    # ---------- 加载辅助 ----------

    def _load_default_api_key(self) -> str:
        import re
        for source_name, file_path in API_KEY_FILES:
            if not file_path.exists():
                continue
            try:
                content = file_path.read_text(encoding="utf-8")
            except Exception:
                continue
            # config.json 格式
            if file_path.suffix == ".json":
                try:
                    data = json.loads(content)
                    key = data.get("api_key", "").strip()
                    if key:
                        print(f"[API Key] 已从 {source_name} 加载")
                        return key
                except Exception:
                    pass
            # 文本文件格式：提取首个 sk- 开头的 token
            m = re.search(r"sk-[A-Za-z0-9]+", content)
            if m:
                print(f"[API Key] 已从 {source_name} 加载")
                return m.group(0)
            # 兜底：取首个非空白行
            for line in content.splitlines():
                line = line.strip()
                if line and not line.startswith("#") and not line.startswith("-"):
                    print(f"[API Key] 已从 {source_name} 加载")
                    return line
        print("[API Key] 未找到默认密钥，请在设置界面手动输入")
        return ""

    def _load_dialogue_templates(self) -> Dict[str, list]:
        path = BASE_DIR / "dialogue_templates.json"
        if path.exists():
            try:
                with open(path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
        # 默认兜底
        return {"default": ["……这步棋……你说不上来哪里奇怪，但也说不上来哪里不对。"]}

    # ---------- 战斗流程 ----------

    def reset_battle(self, chapter_id: str, chess_type: Optional[str], player_side: str):
        """每局开始：重置能量与回合数；识破/作弊次数全局保留"""
        self.current_chapter = chapter_id
        self.chess_type = chess_type
        self.player_side = player_side or "red"
        self.energy = 20                # 每局开始给予初始能量
        self.turn_count = 0
        self.battle_started = True

    def add_energy(self, delta: int):
        self.energy = max(self.ENERGY_MIN, min(self.ENERGY_MAX, self.energy + delta))

    def use_energy(self, cost: int):
        """扣能量，允许透支"""
        self.energy -= cost
        if self.energy < self.ENERGY_MIN:
            self.energy = self.ENERGY_MIN

    def increment_turn(self):
        self.turn_count += 1
        # 每 5 回合被动 +2
        if self.turn_count % 5 == 0:
            self.add_energy(2)

    # ---------- 识破系统 ----------

    def calc_detection_increase(self, cost_energy: int) -> float:
        """增量 = 2% + cost_energy×0.5% + max(0,-能量/10)×3%"""
        base = 2.0
        cost_penalty = cost_energy * 0.5
        overdraw_penalty = max(0, -self.energy / 10.0) * 3.0
        return base + cost_penalty + overdraw_penalty

    def apply_cheat_detection(self, cost_energy: int) -> Dict[str, Any]:
        """作弊后累加识破 + 掷骰判定 was_detected"""
        inc = self.calc_detection_increase(cost_energy)
        self.detection = min(self.DETECTION_CAP, self.detection + inc)
        roll = random.uniform(0, 100)
        if roll < self.detection:
            self.was_detected = True
        self.cheats_used += 1
        return {
            "detection_after": round(self.detection, 2),
            "was_detected": self.was_detected,
            "roll": round(roll, 2),
            "increment": round(inc, 2),
        }

    # ---------- 对手台词 ----------

    def get_opponent_dialogue(self, classification: str) -> str:
        templates = (
            self.dialogue_templates.get(classification)
            or self.dialogue_templates.get("default")
            or []
        )
        if not templates:
            return "……"
        return random.choice(templates)

    # ---------- 结局判定 ----------

    def determine_ending(self) -> str:
        """Good: was_detected=False 且 cheats_used>0；Bad: was_detected=True；Secret: cheats_used=0"""
        if self.cheats_used == 0:
            return "secret"
        elif self.was_detected:
            return "bad"
        else:
            return "good"

    def to_dict(self) -> Dict[str, Any]:
        ending = None
        if self.current_chapter == "ch06_finale_go" and not self.battle_started:
            ending = self.determine_ending()
        return {
            "energy": self.energy,
            "detection": round(self.detection, 2),
            "was_detected": self.was_detected,
            "cheats_used": self.cheats_used,
            "turn_count": self.turn_count,
            "current_chapter": self.current_chapter,
            "chess_type": self.chess_type,
            "player_side": self.player_side,
            "has_api_key": bool(self.api_key),
            "chapter_progress": self.chapter_progress,
            "ending": ending,
        }


rpg_state = RpgState()


# ═══════════════════════════════════════════════════════════════
# FastAPI
# ═══════════════════════════════════════════════════════════════

app = FastAPI(title="棋圣 RPG", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 挂载 RPG 静态资源：JS/CSS/preview.js 等
if BASE_DIR.exists():
    app.mount("/shared/rpg", StaticFiles(directory=str(BASE_DIR)), name="rpg_static")

# 挂载共享 assets（角色立绘等）
SHARED_ASSETS_DIR = SHARED_DIR / "assets"
if SHARED_ASSETS_DIR.exists():
    app.mount("/shared/assets", StaticFiles(directory=str(SHARED_ASSETS_DIR)), name="shared_assets")


# ═══════════════════════════════════════════════════════════════
# 数据模型
# ═══════════════════════════════════════════════════════════════

class CheatAssessReq(BaseModel):
    command: str
    chapter_id: Optional[str] = None


class CheatUseReq(BaseModel):
    command: str
    chapter_id: Optional[str] = None


class MoveCompleteReq(BaseModel):
    captured: Optional[str] = None
    mover: Optional[str] = None
    is_check: bool = False
    game_ended: bool = False
    winner: Optional[str] = None
    is_five_in_a_row: bool = False
    go_captures: int = 0


class BattleStartReq(BaseModel):
    chapter_id: str


class BattleEndReq(BaseModel):
    chapter_id: str
    winner: Optional[str] = None


class ApiKeyReq(BaseModel):
    api_key: str


# ═══════════════════════════════════════════════════════════════
# 棋类代理工具
# ═══════════════════════════════════════════════════════════════

def chess_port(chess_type: Optional[str]) -> Optional[int]:
    return CHESS_PORTS.get(chess_type)


async def chess_proxy(chess_type: str, path: str, method: str = "POST",
                      json_body: Optional[dict] = None, params: Optional[dict] = None,
                      timeout: float = 30.0) -> dict:
    """代理到棋类服务"""
    if httpx is None:
        return {"success": False, "message": "服务端缺少 httpx"}
    port = chess_port(chess_type)
    if port is None:
        return {"success": False, "message": f"未知棋类: {chess_type}"}
    url = f"http://localhost:{port}{path}"
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            if method == "POST":
                resp = await client.post(url, json=json_body, params=params)
            else:
                resp = await client.get(url, params=params)
            try:
                return resp.json()
            except Exception:
                return {"success": False, "message": f"棋类返回非 JSON: {resp.text[:200]}"}
    except httpx.ConnectError:
        return {"success": False, "message": f"{chess_type} 服务未启动（端口 {port}）", "service_down": True}
    except httpx.TimeoutException:
        return {"success": False, "message": f"{chess_type} 请求超时", "timeout": True}
    except Exception as e:
        return {"success": False, "message": f"代理请求失败: {str(e)}"}


async def chess_health_check(chess_type: str) -> bool:
    """探活棋类服务"""
    if httpx is None:
        return False
    port = chess_port(chess_type)
    if port is None:
        return False
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            resp = await client.get(f"http://localhost:{port}/api/config/all")
            return resp.status_code == 200
    except Exception:
        return False


async def broadcast_api_key(api_key: str) -> Dict[str, dict]:
    """下发 api_key 到三个棋类服务"""
    results = {}
    if httpx is None:
        return {ct: {"success": False, "message": "无 httpx"} for ct in CHESS_PORTS}
    for chess_type, port in CHESS_PORTS.items():
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.post(
                    f"http://localhost:{port}/api/apikey",
                    json={"api_key": api_key},
                )
                results[chess_type] = resp.json()
        except Exception as e:
            results[chess_type] = {"success": False, "message": str(e)}
    return results


# ═══════════════════════════════════════════════════════════════
# 路由
# ═══════════════════════════════════════════════════════════════

@app.get("/")
async def index():
    """返回 RPG 外壳"""
    html_path = BASE_DIR / "rpg_shell.html"
    if html_path.exists():
        return HTMLResponse(html_path.read_text(encoding="utf-8"))
    return HTMLResponse("<h1>RPG 外壳未找到 rpg_shell.html</h1>", status_code=404)


@app.get("/api/rpg/chapters")
async def list_chapters():
    return {"chapters": CHAPTERS}


@app.get("/api/rpg/chapter/{chapter_id}")
async def get_chapter(chapter_id: str):
    """获取章节元信息 + iframe_url + 服务探活"""
    chapter = CHAPTERS.get(chapter_id)
    if not chapter:
        return JSONResponse({"error": "未知章节"}, status_code=404)

    chess_type = chapter.get("chess_type")
    service_up = True
    if chess_type:
        service_up = await chess_health_check(chess_type)

    iframe_url = None
    if chess_type and service_up:
        port = chess_port(chess_type)
        iframe_url = f"http://localhost:{port}/?rpg=1"

    return {
        "chapter_id": chapter_id,
        "title": chapter["title"],
        "chess_type": chess_type,
        "iframe_url": iframe_url,
        "service_up": service_up,
        "player_side": chapter.get("player_side"),
        "opponent": chapter.get("opponent"),
        "story_id": chapter.get("story_id"),
        "next_chapter": chapter.get("next"),
    }


@app.post("/api/rpg/battle/start")
async def battle_start(req: BattleStartReq):
    """开始对战：重置能量、记录章节、调用棋类 reset"""
    chapter = CHAPTERS.get(req.chapter_id)
    if not chapter:
        return JSONResponse({"error": "未知章节"}, status_code=404)

    chess_type = chapter.get("chess_type")
    if chess_type:
        health = await chess_health_check(chess_type)
        if not health:
            return {"success": False, "message": f"{chess_type} 服务未启动", "service_down": True}
        # 重置棋类棋盘
        await chess_proxy(chess_type, "/api/reset_configs", method="POST", json_body={})

    rpg_state.reset_battle(
        chapter_id=req.chapter_id,
        chess_type=chess_type,
        player_side=chapter.get("player_side", "red"),
    )
    rpg_state.chapter_progress[req.chapter_id] = "active"

    return {
        "success": True,
        "chapter_id": req.chapter_id,
        "chess_type": chess_type,
        "player_side": rpg_state.player_side,
        "energy": rpg_state.energy,
        "detection": rpg_state.detection,
    }


@app.post("/api/rpg/cheat/assess")
async def cheat_assess(req: CheatAssessReq):
    """评估作弊消耗（仅意图解析，不应用）"""
    if not rpg_state.api_key:
        return {"success": False, "message": "未设置 API Key，无法评估作弊", "no_api_key": True}

    chess_type = rpg_state.chess_type
    if not chess_type:
        return {"success": False, "message": "当前章节无对战，无需作弊"}

    # dry_run=1：让棋类只解析不应用
    result = await chess_proxy(
        chess_type, "/api/command",
        method="POST", json_body={"command": req.command},
        params={"dry_run": "1"},
    )

    if not result.get("success"):
        return {
            "success": False,
            "message": result.get("message", "意图解析失败"),
            "classification": result.get("classification"),
        }

    cost_energy = int(result.get("cost_energy", 0))
    cost_energy = max(0, min(10, cost_energy))

    return {
        "success": True,
        "command": req.command,
        "cost_energy": cost_energy,
        "classification": result.get("classification"),
        "feasible": result.get("feasible", True),
        "message": result.get("message", "评估完成"),
        "current_energy": rpg_state.energy,
        "after_energy": rpg_state.energy - cost_energy,
    }


@app.post("/api/rpg/cheat/use")
async def cheat_use(req: CheatUseReq):
    """执行作弊：扣能量、累加识破、掷骰、返回对手台词"""
    if not rpg_state.api_key:
        return {"success": False, "message": "未设置 API Key", "no_api_key": True}

    chess_type = rpg_state.chess_type
    if not chess_type:
        return {"success": False, "message": "当前章节无对战"}

    # 完整执行（不带 dry_run）
    result = await chess_proxy(
        chess_type, "/api/command",
        method="POST", json_body={"command": req.command},
    )

    if not result.get("success"):
        return {
            "success": False,
            "message": result.get("message", "作弊执行失败"),
            "energy": rpg_state.energy,
            "detection": rpg_state.detection,
        }

    cost_energy = int(result.get("cost_energy", 0))
    cost_energy = max(0, min(10, cost_energy))

    # 扣能量（可透支）
    rpg_state.use_energy(cost_energy)

    # 累加识破 + 掷骰
    detection_result = rpg_state.apply_cheat_detection(cost_energy)

    # 选对手台词
    classification = result.get("classification") or "default"
    dialogue = rpg_state.get_opponent_dialogue(classification)

    modified_configs = result.get("modified_configs", {})

    return {
        "success": True,
        "command": req.command,
        "cost_energy": cost_energy,
        "classification": classification,
        "energy_after": rpg_state.energy,
        "detection": detection_result["detection_after"],
        "was_detected": detection_result["was_detected"],
        "opponent_dialogue": dialogue,
        "modified_configs": modified_configs,
        "opponent": CHAPTERS.get(rpg_state.current_chapter, {}).get("opponent"),
    }


@app.post("/api/rpg/move_complete")
async def move_complete(req: MoveCompleteReq):
    """棋类走棋完成回调：根据规则加能量"""
    energy_delta = 0
    reason = []

    # 吃子加成
    if req.captured:
        if req.mover == rpg_state.player_side:
            energy_delta += 10
            reason.append("吃子 +10")
        else:
            energy_delta += 5
            reason.append("被吃 +5")

    # 将军（仅象棋）
    if req.is_check and rpg_state.chess_type == "xiangqi":
        energy_delta += 3
        reason.append("将军 +3")

    # 五子棋成五连
    if req.is_five_in_a_row and rpg_state.chess_type == "wuziqi":
        if req.mover == rpg_state.player_side:
            energy_delta += 15
            reason.append("成五连 +15")

    # 围棋提子
    if req.go_captures > 0 and rpg_state.chess_type == "go":
        energy_delta += req.go_captures * 8
        reason.append(f"提子 +{req.go_captures * 8}")

    if energy_delta:
        rpg_state.add_energy(energy_delta)

    # 回合数 +1（每 5 回合被动 +2）
    rpg_state.increment_turn()
    if rpg_state.turn_count % 5 == 0:
        reason.append("每 5 回合被动 +2")

    return {
        "success": True,
        "energy_delta": energy_delta,
        "reason": reason,
        "energy": rpg_state.energy,
        "turn_count": rpg_state.turn_count,
        "game_ended": req.game_ended,
        "winner": req.winner,
    }


@app.post("/api/rpg/battle/end")
async def battle_end(req: BattleEndReq):
    """结束对战"""
    rpg_state.chapter_progress[req.chapter_id] = "completed"
    rpg_state.battle_started = False
    return {
        "success": True,
        "chapter_id": req.chapter_id,
        "winner": req.winner,
        "ending": rpg_state.determine_ending() if req.chapter_id == "ch06_finale_go" else None,
        "state": rpg_state.to_dict(),
    }


@app.get("/api/rpg/state")
async def get_state():
    return rpg_state.to_dict()


@app.get("/api/rpg/vn/{story_id}")
async def get_vn_story(story_id: str):
    """获取章节 VN JSON"""
    story_path = RPG_DATA_DIR / "chapters" / f"{story_id}.json"
    if not story_path.exists():
        return JSONResponse({"error": f"故事 {story_id} 未找到"}, status_code=404)
    try:
        with open(story_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        return JSONResponse({"error": f"故事加载失败: {e}"}, status_code=500)


@app.post("/api/rpg/apikey")
async def set_api_key(req: ApiKeyReq):
    """设置 API Key 并下发到三个棋类服务"""
    rpg_state.api_key = req.api_key
    results = await broadcast_api_key(req.api_key)
    return {
        "success": True,
        "message": "API Key 已设置并下发",
        "broadcast_results": results,
    }


@app.get("/api/rpg/apikey")
async def get_api_key():
    """获取掩码后的 API Key（仅用于前端显示，不返回明文）"""
    key = rpg_state.api_key
    if not key:
        return {"has_api_key": False, "masked": ""}
    if len(key) <= 8:
        masked = "*" * len(key)
    else:
        masked = key[:6] + "..." + key[-4:]
    return {"has_api_key": True, "masked": masked}


@app.get("/api/rpg/health/{chess_type}")
async def chess_health(chess_type: str):
    up = await chess_health_check(chess_type)
    return {"chess_type": chess_type, "up": up, "port": chess_port(chess_type)}


# ═══════════════════════════════════════════════════════════════
# 启动
# ═══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import uvicorn
    port = 8080
    print("=" * 50)
    print("  棋圣 RPG - 启动中...")
    print(f"  访问地址: http://localhost:{port}")
    print(f"  API Key: {'已加载' if rpg_state.api_key else '未加载（请在设置界面输入）'}")
    print("=" * 50)
    uvicorn.run(app, host="0.0.0.0", port=port)
