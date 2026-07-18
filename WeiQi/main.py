"""
无限制围棋 - 主服务器
HTML前端 + Python后端 + 多层AI融合的围棋游戏
"""
import os
import json
import copy
from pathlib import Path
from typing import Dict, Any, Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.responses import JSONResponse, HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from ai_orchestrator import AIOrchestrator
from rule_engine import RuleEngine
from go_ai import GoAI
from mechanism_engine import MechanismEngine

# ═══════════════════════════════════════════════════════════════
# 配置
# ═══════════════════════════════════════════════════════════════

BASE_DIR = Path(__file__).parent
CONFIGS_DIR = BASE_DIR / "configs"
STATIC_DIR = BASE_DIR / "static"

CONFIG_FILES = ["board_state", "board", "pieces_white", "pieces_black", "rules", "ui_config"]


# ═══════════════════════════════════════════════════════════════
# 状态管理
# ═══════════════════════════════════════════════════════════════


class GameState:
    """全局游戏状态"""

    def __init__(self):
        self.configs: Dict[str, dict] = {}
        self.ai_orchestrator = AIOrchestrator()
        self.rule_engine: Optional[RuleEngine] = None
        self.go_ai: Optional[GoAI] = None
        self.mechanism_engine: Optional[MechanismEngine] = None
        self.undo_stack: list = []
        self.load_configs()

    def load_configs(self):
        """加载所有配置文件"""
        for name in CONFIG_FILES:
            path = CONFIGS_DIR / f"{name}.json"
            if path.exists():
                with open(path, "r", encoding="utf-8") as f:
                    self.configs[name] = json.load(f)
        self._rebuild_engines()

    def save_config(self, name: str):
        """保存配置到文件"""
        path = CONFIGS_DIR / f"{name}.json"
        with open(path, "w", encoding="utf-8") as f:
            json.dump(self.configs[name], f, ensure_ascii=False, indent=2)

    def save_all(self):
        """保存所有配置"""
        for name in CONFIG_FILES:
            self.save_config(name)

    def _rebuild_engines(self):
        """重建规则引擎和AI引擎"""
        board_config = self.configs.get("board", {})
        pieces_white = self.configs.get("pieces_white", {})
        pieces_black = self.configs.get("pieces_black", {})
        rules_config = self.configs.get("rules", {})

        self.rule_engine = RuleEngine(board_config, pieces_white, pieces_black, rules_config)
        self.go_ai = GoAI(
            board_config, pieces_white, pieces_black, rules_config,
            rules_config.get("ai_difficulty", {}).get("current", "medium"),
            api_key=getattr(self.ai_orchestrator, 'api_key', ''),
            token_stats_callback=getattr(self.ai_orchestrator, '_record_token_usage', None),
        )
        self.mechanism_engine = MechanismEngine(rules_config)
        self.mechanism_engine.apply_personality_to_ai(self.go_ai)

    def apply_config_update(self, updates: Dict[str, dict]):
        """应用配置更新"""
        snapshot = {}
        for name in updates:
            if name in self.configs:
                snapshot[name] = copy.deepcopy(self.configs[name])
        if snapshot:
            self.undo_stack.append(snapshot)
            if len(self.undo_stack) > 10:
                self.undo_stack.pop(0)

        for name, data in updates.items():
            self.configs[name] = data
            self.save_config(name)

        self._rebuild_engines()

    def undo_last_config_change(self) -> bool:
        """撤回上一次AI配置修改"""
        if not self.undo_stack:
            return False
        snapshot = self.undo_stack.pop()
        for name, data in snapshot.items():
            self.configs[name] = data
            self.save_config(name)
        self._rebuild_engines()
        return True

    def reset_board(self):
        """重置棋盘到初始状态"""
        initial_dir = CONFIGS_DIR / "initial"
        for name in CONFIG_FILES:
            initial_path = initial_dir / f"{name}.json.initial"
            if initial_path.exists():
                with open(initial_path, "r", encoding="utf-8") as f:
                    self.configs[name] = json.load(f)

        self.undo_stack.clear()
        self._rebuild_engines()
        self.save_all()


state = GameState()

# ═══════════════════════════════════════════════════════════════
# FastAPI 应用
# ═══════════════════════════════════════════════════════════════

app = FastAPI(title="无限制围棋", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


# ═══════════════════════════════════════════════════════════════
# 数据模型
# ═══════════════════════════════════════════════════════════════


class PlayerCommand(BaseModel):
    command: str


class SetApiKey(BaseModel):
    api_key: str


class PlaceRequest(BaseModel):
    position: list  # [x, y]


class PassRequest(BaseModel):
    pass


class DifficultyRequest(BaseModel):
    difficulty: str


# ═══════════════════════════════════════════════════════════════
# API 路由
# ═══════════════════════════════════════════════════════════════


@app.get("/")
async def index():
    """返回主页面"""
    html_path = STATIC_DIR / "index.html"
    if html_path.exists():
        return HTMLResponse(html_path.read_text(encoding="utf-8"))
    return HTMLResponse("<h1>前端文件未找到</h1>", status_code=404)


@app.get("/api/config/all")
async def get_all_configs():
    """获取所有配置"""
    return state.configs


@app.get("/api/config/{config_name}")
async def get_config(config_name: str):
    """获取配置"""
    if config_name not in CONFIG_FILES:
        return JSONResponse({"error": "无效的配置名"}, status_code=400)
    return state.configs.get(config_name, {})


@app.post("/api/apikey")
async def set_api_key(req: SetApiKey):
    """设置API密钥"""
    state.ai_orchestrator.set_api_key(req.api_key)
    if state.go_ai:
        state.go_ai.set_api_key(req.api_key)
    return {"success": True, "message": "API密钥已设置"}


@app.get("/api/apikey/status")
async def api_key_status():
    """检查API密钥状态"""
    return {"has_key": bool(state.ai_orchestrator.api_key)}


@app.post("/api/command")
async def process_command(req: PlayerCommand):
    """处理玩家自然语言指令"""
    try:
        result = await state.ai_orchestrator.process_command(
            req.command, {"configs": state.configs}
        )

        if result.get("success") and result.get("type") == "applied":
            modified = result.get("modified_configs", {})
            if modified:
                state.apply_config_update(modified)

        return result
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"success": False, "type": "error", "message": f"服务器内部错误: {str(e)}"}


@app.post("/api/place")
async def place_stone(req: PlaceRequest):
    """玩家落子"""
    board = state.configs["board_state"]

    if board.get("game_status", {}).get("state") == "ended":
        return {"success": False, "message": "游戏已结束"}

    current_turn = board.get("current_turn", "black")

    if state.mechanism_engine and state.mechanism_engine.is_ai_controlled(board, current_turn):
        return {"success": False, "message": "本回合由AI接管中，请等待AI走棋", "ai_controlled": True}

    x, y = req.position[0], req.position[1]

    new_state, info = state.rule_engine.place_stone(x, y, current_turn, board)
    if not info.get("is_valid", False):
        return {"success": False, "message": info.get("error", "非法落子")}

    state.configs["board_state"] = new_state
    board = state.configs["board_state"]

    board.setdefault("move_history", []).append(
        {
            "side": current_turn,
            "position": [x, y],
            "move_type": "place",
            "captured_count": info.get("captured_count", 0),
            "captured_positions": info.get("captured_positions", []),
        }
    )

    board["pass_count"] = 0

    game_over, winner, win_condition = state.rule_engine.is_game_over(board)
    if game_over:
        board["game_status"] = {
            "state": "ended",
            "winner": winner,
            "win_condition": win_condition,
            "custom_rules_active": board.get("game_status", {}).get("custom_rules_active", []),
        }
    else:
        switch_turn = True
        if state.mechanism_engine:
            board, post_info = state.mechanism_engine.apply_post_move_mechanisms(board, current_turn)
            switch_turn = post_info.get("switch_turn", True)

        if switch_turn:
            board["current_turn"] = "white" if current_turn == "black" else "black"

    mechanisms_summary = []
    if state.mechanism_engine:
        mechanisms_summary = state.mechanism_engine.get_active_mechanisms_summary(board)

    state.save_config("board_state")
    return {
        "success": True,
        "board_state": board,
        "captured_count": info.get("captured_count", 0),
        "mechanisms": mechanisms_summary,
    }


@app.post("/api/pass")
async def pass_move():
    """玩家虚手（pass）"""
    board = state.configs["board_state"]

    if board.get("game_status", {}).get("state") == "ended":
        return {"success": False, "message": "游戏已结束"}

    current_turn = board.get("current_turn", "black")

    pass_count = board.get("pass_count", 0) + 1
    board["pass_count"] = pass_count
    board["ko_point"] = None

    board.setdefault("move_history", []).append(
        {
            "side": current_turn,
            "position": None,
            "move_type": "pass",
            "captured_count": 0,
        }
    )

    double_pass = state.configs["rules"].get("win_conditions", {}).get("double_pass", {}).get("enabled", True)
    if double_pass and pass_count >= 2:
        territory = state.rule_engine.count_territory(board)
        winner = "black" if territory["black"] > territory["white"] else "white"
        board["game_status"] = {
            "state": "ended",
            "winner": winner,
            "win_condition": "double_pass",
            "territory": territory,
            "custom_rules_active": board.get("game_status", {}).get("custom_rules_active", []),
        }
    else:
        board["current_turn"] = "white" if current_turn == "black" else "black"

    mechanisms_summary = []
    if state.mechanism_engine:
        mechanisms_summary = state.mechanism_engine.get_active_mechanisms_summary(board)

    state.save_config("board_state")
    return {
        "success": True,
        "board_state": board,
        "pass_count": pass_count,
        "mechanisms": mechanisms_summary,
    }


@app.post("/api/ai_move")
async def ai_move():
    """AI落子"""
    board = state.configs["board_state"]
    current_turn = board.get("current_turn", "white")

    if board.get("game_status", {}).get("state") == "ended":
        return {"success": False, "message": "游戏已结束"}

    ai_should_move = False
    if state.mechanism_engine:
        if state.mechanism_engine.is_ai_controlled(board, current_turn):
            ai_should_move = True
        elif not state.mechanism_engine.is_player_controlled(board, current_turn):
            ai_should_move = True
    else:
        ai_should_move = True

    if not ai_should_move:
        return {"success": False, "message": "不是AI回合"}

    move = state.go_ai.get_best_move(board)

    if not move:
        return {"success": False, "message": "AI无法落子"}

    if move.get("move_type") == "pass":
        pass_count = board.get("pass_count", 0) + 1
        board["pass_count"] = pass_count
        board["ko_point"] = None

        board.setdefault("move_history", []).append(
            {
                "side": current_turn,
                "position": None,
                "move_type": "pass",
                "captured_count": 0,
            }
        )

        double_pass = state.configs["rules"].get("win_conditions", {}).get("double_pass", {}).get("enabled", True)
        if double_pass and pass_count >= 2:
            territory = state.rule_engine.count_territory(board)
            winner = "black" if territory["black"] > territory["white"] else "white"
            board["game_status"] = {
                "state": "ended",
                "winner": winner,
                "win_condition": "double_pass",
                "territory": territory,
                "custom_rules_active": board.get("game_status", {}).get("custom_rules_active", []),
            }
        else:
            board["current_turn"] = "black" if current_turn == "white" else "white"

        state.save_config("board_state")
        return {
            "success": True,
            "board_state": board,
            "ai_move": move,
        }

    pos = move["position"]
    x, y = pos[0], pos[1]
    new_state, info = state.rule_engine.place_stone(x, y, current_turn, board)

    state.configs["board_state"] = new_state
    board = state.configs["board_state"]

    board["pass_count"] = 0

    board.setdefault("move_history", []).append(
        {
            "side": current_turn,
            "position": [x, y],
            "move_type": "place",
            "captured_count": info.get("captured_count", 0),
            "captured_positions": info.get("captured_positions", []),
        }
    )

    game_over, winner, win_condition = state.rule_engine.is_game_over(board)
    if game_over:
        board["game_status"] = {
            "state": "ended",
            "winner": winner,
            "win_condition": win_condition,
            "custom_rules_active": board.get("game_status", {}).get("custom_rules_active", []),
        }
    else:
        switch_turn = True
        if state.mechanism_engine:
            board, post_info = state.mechanism_engine.apply_post_move_mechanisms(board, current_turn)
            switch_turn = post_info.get("switch_turn", True)

        if switch_turn:
            board["current_turn"] = "black" if current_turn == "white" else "white"

    mechanisms_summary = []
    if state.mechanism_engine:
        mechanisms_summary = state.mechanism_engine.get_active_mechanisms_summary(board)

    state.save_config("board_state")
    return {
        "success": True,
        "board_state": board,
        "ai_move": move,
        "captured_count": info.get("captured_count", 0),
        "mechanisms": mechanisms_summary,
    }


@app.get("/api/valid_moves")
async def get_valid_moves():
    """获取当前方所有合法落子位置"""
    board = state.configs["board_state"]
    current_turn = board.get("current_turn", "black")
    moves = state.rule_engine.get_valid_moves(current_turn, board)
    return {"success": True, "moves": moves}


@app.get("/api/territory")
async def get_territory():
    """计算当前地盘"""
    board = state.configs["board_state"]
    territory = state.rule_engine.count_territory(board)
    return {"success": True, "territory": territory}


@app.get("/api/mechanisms")
async def get_mechanisms():
    """获取当前激活的机制列表"""
    board = state.configs["board_state"]
    summary = []
    if state.mechanism_engine:
        summary = state.mechanism_engine.get_active_mechanisms_summary(board)
    return {"success": True, "mechanisms": summary, "raw": board.get("mechanisms", {})}


@app.get("/api/token_stats")
async def get_token_stats():
    """获取Token消耗统计"""
    return state.ai_orchestrator.get_token_stats()


@app.post("/api/undo")
async def undo_move():
    """悔棋（回退一步）"""
    board = state.configs["board_state"]
    history = board.get("move_history", [])

    if not history:
        return {"success": False, "message": "没有可悔的棋"}

    steps_to_undo = min(2, len(history))

    for _ in range(steps_to_undo):
        if not history:
            break
        last = history.pop()
        if last.get("move_type") == "place":
            pos = last.get("position")
            if pos:
                board["pieces"] = [
                    p for p in board.get("pieces", [])
                    if not (p["position"][0] == pos[0] and p["position"][1] == pos[1] and p["side"] == last.get("side"))
                ]
            for cap_pos in last.get("captured_positions", []):
                cap_side = "white" if last.get("side") == "black" else "black"
                board.setdefault("pieces", []).append({
                    "id": f"restored_{cap_pos[0]}_{cap_pos[1]}",
                    "type": "stone",
                    "name": "●" if cap_side == "black" else "○",
                    "side": cap_side,
                    "position": cap_pos,
                    "is_alive": True,
                    "custom_properties": {},
                })

    board["current_turn"] = "black"
    board["move_history"] = history
    board["pass_count"] = 0
    board["ko_point"] = None
    board["game_status"] = {
        "state": "playing",
        "winner": None,
        "win_condition": None,
        "custom_rules_active": board.get("game_status", {}).get("custom_rules_active", []),
    }
    state.save_config("board_state")
    return {"success": True, "board_state": board, "message": f"已悔{steps_to_undo}步"}


@app.post("/api/undo_config")
async def undo_config_change():
    """撤回AI配置修改"""
    success = state.undo_last_config_change()
    if success:
        return {"success": True, "message": "已撤回上一次AI修改", "configs": state.configs}
    return {"success": False, "message": "没有可撤回的修改"}


@app.post("/api/restart")
async def restart_game():
    """重新开始游戏"""
    state.reset_board()
    return {"success": True, "message": "游戏已重新开始", "board_state": state.configs["board_state"]}


@app.post("/api/difficulty")
async def set_difficulty(req: DifficultyRequest):
    """设置AI难度"""
    if req.difficulty not in ["easy", "medium", "hard"]:
        return {"success": False, "message": "无效的难度"}

    state.configs["rules"]["ai_difficulty"]["current"] = req.difficulty
    state.save_config("rules")
    state.go_ai.set_difficulty(req.difficulty)
    return {"success": True, "message": f"难度已设置为{req.difficulty}"}


@app.post("/api/reset_configs")
async def reset_configs():
    """重置所有配置到初始状态"""
    state.reset_board()
    return {"success": True, "message": "所有配置已重置"}


@app.get("/api/logs")
async def get_logs(count: int = 10):
    """获取AI对话日志"""
    return {"logs": state.ai_orchestrator.get_logs(count)}


@app.get("/api/thinking_status")
async def get_thinking_status():
    """获取AI思考状态"""
    return state.ai_orchestrator.get_thinking_status()


@app.post("/api/clear_logs")
async def clear_logs():
    """清空日志"""
    state.ai_orchestrator.logger.clear()
    return {"success": True, "message": "日志已清空"}


# ═══════════════════════════════════════════════════════════════
# 启动
# ═══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import uvicorn

    print("=" * 50)
    print("  无限制围棋 - 启动中...")
    print(f"  访问地址: http://localhost:8000")
    print("=" * 50)
    uvicorn.run(app, host="0.0.0.0", port=8000)
