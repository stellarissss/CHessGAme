"""
无限制象棋 - 主服务器
象棋子项目的 FastAPI 入口。剧情编辑器与共享资产已分离至各自子项目。
"""
import os
import sys
import json
import copy
from pathlib import Path
from typing import Dict, Any, Optional

# 将 shared/ 加入 sys.path，以便复用 schema_validator / json_patch_utils
BASE_DIR = Path(__file__).resolve().parent
WORKSPACE_ROOT = BASE_DIR.parent
SHARED_DIR = WORKSPACE_ROOT / "shared"
if str(SHARED_DIR) not in sys.path:
    sys.path.insert(0, str(SHARED_DIR))

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, Query
from fastapi.responses import JSONResponse, HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from ai_orchestrator import AIOrchestrator
from rule_engine import RuleEngine
from chess_ai import ChessAI
from mechanism_engine import MechanismEngine

# 六道众生集成
from samsara_integration import SamsaraIntegration

# ═══════════════════════════════════════════════════════════════
# 配置
# ═══════════════════════════════════════════════════════════════

CONFIGS_DIR = BASE_DIR / "configs"
STATIC_DIR = BASE_DIR / "static"

CONFIG_FILES = ["board_state", "board", "pieces_red", "pieces_black", "rules", "ui_config"]

# ═══════════════════════════════════════════════════════════════
# 状态管理
# ═══════════════════════════════════════════════════════════════


class GameState:
    """全局游戏状态"""

    def __init__(self):
        self.configs: Dict[str, dict] = {}
        self.ai_orchestrator = AIOrchestrator()
        self.rule_engine: Optional[RuleEngine] = None
        self.chess_ai: Optional[ChessAI] = None
        self.mechanism_engine: Optional[MechanismEngine] = None
        self.undo_stack: list = []  # 修改历史，用于撤回AI修改
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
        pieces_red = self.configs.get("pieces_red", {})
        pieces_black = self.configs.get("pieces_black", {})
        rules_config = self.configs.get("rules", {})
        self.rule_engine = RuleEngine(board_config, pieces_red, pieces_black, rules_config)
        self.chess_ai = ChessAI(
            board_config, pieces_red, pieces_black, rules_config,
            rules_config.get("ai_difficulty", {}).get("current", "medium"),
            api_key=getattr(self.ai_orchestrator, 'api_key', ''),
            token_stats_callback=getattr(self.ai_orchestrator, '_record_token_usage', None),
        )
        self.mechanism_engine = MechanismEngine(rules_config)
        # 应用AI性格
        self.mechanism_engine.apply_personality_to_ai(self.chess_ai)

    def apply_config_update(self, updates: Dict[str, dict]):
        """应用配置更新"""
        # 保存当前状态到撤销栈
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
        """重置棋盘到初始状态 - 重置所有配置"""
        # 从初始备份目录加载所有配置
        initial_dir = CONFIGS_DIR / "initial"
        for name in CONFIG_FILES:
            initial_path = initial_dir / f"{name}.json.initial"
            if initial_path.exists():
                with open(initial_path, "r", encoding="utf-8") as f:
                    self.configs[name] = json.load(f)

        # 清空撤销栈
        self.undo_stack.clear()
        self._rebuild_engines()
        self.save_all()


state = GameState()
samsara = SamsaraIntegration("xiangqi")

# ═══════════════════════════════════════════════════════════════
# FastAPI 应用
# ═══════════════════════════════════════════════════════════════

app = FastAPI(title="无限制象棋", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 挂载静态文件（象棋前端）
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# 挂载共享 assets 目录（角色立绘等，便于前端引用）
SHARED_ASSETS_DIR = SHARED_DIR / "assets"
if SHARED_ASSETS_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(SHARED_ASSETS_DIR)), name="assets")


# ═══════════════════════════════════════════════════════════════
# 数据模型
# ═══════════════════════════════════════════════════════════════


class PlayerCommand(BaseModel):
    command: str


class SetApiKey(BaseModel):
    api_key: str


class MoveRequest(BaseModel):
    piece_id: str
    to: list  # [x, y]


class DifficultyRequest(BaseModel):
    difficulty: str  # easy | medium | hard


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
    """获取所有配置（必须放在 /{config_name} 路由之前）"""
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
    if state.chess_ai:
        state.chess_ai.set_api_key(req.api_key)
    return {"success": True, "message": "API密钥已设置"}


@app.get("/api/apikey/status")
async def api_key_status():
    """检查API密钥状态"""
    return {"has_key": bool(state.ai_orchestrator.api_key)}


@app.post("/api/command")
async def process_command(req: PlayerCommand, dry_run: str = Query(None)):
    """处理玩家自然语言指令

    dry_run=1 时仅解析意图与评估 cost_energy，不写入配置（供 RPG cheat/assess 使用）。
    """
    try:
        result = await state.ai_orchestrator.process_command(
            req.command, {"configs": state.configs}
        )

        # dry_run 模式下不应用配置变更，仅返回解析结果（含 cost_energy/classification）
        is_dry_run = dry_run == "1"
        if (not is_dry_run) and result.get("success") and result.get("type") == "applied":
            modified = result.get("modified_configs", {})
            if modified:
                state.apply_config_update(modified)

        return result
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"success": False, "type": "error", "message": f"服务器内部错误: {str(e)}"}


@app.post("/api/move")
async def make_move(req: MoveRequest):
    """玩家走棋（集成机制引擎）"""
    board = state.configs["board_state"]

    if board.get("game_status", {}).get("state") == "ended":
        return {"success": False, "message": "游戏已结束"}

    current_turn = board.get("current_turn", "red")

    # 回合前机制检查（skip_turn等 - 这里只做状态提示，实际跳过在前端/AI走棋时触发）
    pre_info = {}

    # 检查是否被AI接管（如果当前方被AI接管，则不允许玩家手动走棋）
    if state.mechanism_engine and state.mechanism_engine.is_ai_controlled(board, current_turn):
        return {"success": False, "message": "本回合由AI接管中，请等待AI走棋", "ai_controlled": True}

    # 检查当前方是否由玩家控制（通过player_control机制判断）
    if state.mechanism_engine and not state.mechanism_engine.is_player_controlled(board, current_turn):
        return {"success": False, "message": "当前方不由玩家控制", "not_player_controlled": True}

    # 找到棋子
    piece = None
    for p in board["pieces"]:
        if p["id"] == req.piece_id and p.get("is_alive", True):
            piece = p
            break

    if not piece:
        return {"success": False, "message": "棋子不存在"}

    if piece["side"] != current_turn:
        return {"success": False, "message": "不是该方回合"}

    # 验证移动合法性
    valid_moves = state.rule_engine.get_valid_moves(piece, board)
    if req.to not in valid_moves:
        return {"success": False, "message": "非法移动"}

    # 执行移动
    from_pos = list(piece["position"])
    target_piece = state.rule_engine._get_piece_at(req.to, board)

    piece["position"] = req.to
    captured_piece_type = ""
    if target_piece:
        target_piece["is_alive"] = False
        captured_piece_type = target_piece.get("type", "medium")

    # 记录历史
    board.setdefault("move_history", []).append(
        {
            "piece_id": piece["id"],
            "from": from_pos,
            "to": req.to,
            "captured": target_piece["id"] if target_piece else None,
        }
    )

    # 六道众生：记录业力事件
    karma_events = []
    if captured_piece_type:
        karma_gained = samsara.record_capture(captured_piece_type)
        if karma_gained > 0:
            karma_events.append(f"吃子获得 {karma_gained} 业力")

    # 检查游戏结束
    winner = state.rule_engine.is_general_captured(board)
    if winner:
        board["game_status"] = {
            "state": "ended",
            "winner": winner,
            "win_condition": "general_captured",
            "custom_rules_active": board.get("game_status", {}).get("custom_rules_active", []),
        }
        
        if winner == "red":
            karma_gained = samsara.record_checkmate()
            if karma_gained > 0:
                karma_events.append(f"将死获得 {karma_gained} 业力")
            
            # 六道众生：关卡胜利结算
            samsara.state_manager.record_level_victory()
    else:
        # 走棋后机制处理
        switch_turn = True
        post_info = {}
        if state.mechanism_engine:
            board, post_info = state.mechanism_engine.apply_post_move_mechanisms(board, current_turn)
            switch_turn = post_info.get("switch_turn", True)

        if switch_turn:
            board["current_turn"] = "black" if current_turn == "red" else "red"

            # 检查下一回合是否被跳过，如果被跳过，继续切换直到找到不被跳过的一方
            skip_count = 0
            while state.mechanism_engine and state.mechanism_engine.should_skip_turn(board, board["current_turn"]):
                board, skip_info = state.mechanism_engine.apply_pre_turn_mechanisms(board, board["current_turn"])
                skip_count += 1
                if skip_count > 4:
                    break
                board["current_turn"] = "black" if board["current_turn"] == "red" else "red"

            # 检查是否被将死
            if state.rule_engine.is_checkmate(board["current_turn"], board):
                board["game_status"] = {
                    "state": "ended",
                    "winner": "red" if board["current_turn"] == "black" else "black",
                    "win_condition": "checkmate",
                    "custom_rules_active": board.get("game_status", {}).get("custom_rules_active", []),
                }
                
                if board["game_status"]["winner"] == "red":
                    karma_gained = samsara.record_checkmate()
                    if karma_gained > 0:
                        karma_events.append(f"将死获得 {karma_gained} 业力")

    # 获取当前激活的机制摘要
    mechanisms_summary = []
    if state.mechanism_engine:
        mechanisms_summary = state.mechanism_engine.get_active_mechanisms_summary(board)

    # 六道众生：玩家回合结束
    turn_info = samsara.on_player_turn()
    
    # 六道众生：更新目标进度
    objective_result = samsara.update_objectives(board)

    state.save_config("board_state")
    return {
        "success": True,
        "board_state": board,
        "mechanisms": mechanisms_summary,
        "karma_events": karma_events,
        "turn_info": turn_info,
        "karma": samsara.get_karma_state(),
        "detection_probability": samsara.get_detection_probability(),
        "objective_result": objective_result,
    }


@app.post("/api/ai_move")
async def ai_move():
    """AI走棋（集成机制引擎）"""
    board = state.configs["board_state"]

    current_turn = board.get("current_turn", "black")

    if board.get("game_status", {}).get("state") == "ended":
        return {"success": False, "message": "游戏已结束"}

    # 检查是否应该由AI走棋
    # 条件：当前方被AI接管，或者当前方不由玩家控制（默认行为：黑方不由玩家控制）
    ai_should_move = False
    if state.mechanism_engine:
        if state.mechanism_engine.is_ai_controlled(board, current_turn):
            ai_should_move = True
        elif not state.mechanism_engine.is_player_controlled(board, current_turn):
            ai_should_move = True

    if not ai_should_move:
        return {"success": False, "message": "不是AI回合"}

    move = None
    is_random_move = False

    # 检查是否需要随机走棋
    if state.mechanism_engine and state.mechanism_engine.is_random_move_required(board, current_turn):
        is_random_move = True
        # 随机走一步
        import random
        moves = []
        for p in board.get("pieces", []):
            if not p.get("is_alive", True) or p["side"] != current_turn:
                continue
            valid = state.rule_engine.get_valid_moves(p, board)
            for pos in valid:
                target = state.rule_engine._get_piece_at(pos, board)
                moves.append({
                    "piece_id": p["id"],
                    "from": list(p["position"]),
                    "to": pos,
                    "captured": target["id"] if target else None,
                })
        if moves:
            move = random.choice(moves)
    else:
        # 获取AI最佳移动
        await state.chess_ai.precompute_custom_piece_values()
        move = state.chess_ai.get_best_move(board)

    if not move:
        board["game_status"] = {
            "state": "ended",
            "winner": "red" if current_turn == "black" else "black",
            "win_condition": "stalemate",
            "custom_rules_active": board.get("game_status", {}).get("custom_rules_active", []),
        }
        state.save_config("board_state")
        winner_side = "红方" if current_turn == "black" else "黑方"
        return {"success": True, "board_state": board, "message": f"AI无棋可走，{winner_side}获胜"}

    # 执行AI移动
    piece = None
    for p in board["pieces"]:
        if p["id"] == move["piece_id"]:
            piece = p
            break

    if not piece:
        return {"success": False, "message": "AI移动异常"}

    target_piece = None
    if move.get("captured"):
        for p in board["pieces"]:
            if p["id"] == move["captured"]:
                target_piece = p
                break

    piece["position"] = move["to"]
    if target_piece:
        target_piece["is_alive"] = False
        samsara.record_captured()

    board.setdefault("move_history", []).append(move)

    # 检查游戏结束
    winner = state.rule_engine.is_general_captured(board)
    if winner:
        board["game_status"] = {
            "state": "ended",
            "winner": winner,
            "win_condition": "general_captured",
            "custom_rules_active": board.get("game_status", {}).get("custom_rules_active", []),
        }
    else:
        # 走棋后机制处理
        switch_turn = True
        post_info = {}
        if state.mechanism_engine:
            board, post_info = state.mechanism_engine.apply_post_move_mechanisms(board, current_turn)
            switch_turn = post_info.get("switch_turn", True)

        if switch_turn:
            board["current_turn"] = "red" if current_turn == "black" else "black"

            # 检查下一回合是否被跳过，如果被跳过，继续切换
            skip_count = 0
            while state.mechanism_engine and state.mechanism_engine.should_skip_turn(board, board["current_turn"]):
                board, skip_info = state.mechanism_engine.apply_pre_turn_mechanisms(board, board["current_turn"])
                skip_count += 1
                if skip_count > 4:
                    break
                board["current_turn"] = "red" if board["current_turn"] == "black" else "black"

            # 检查是否被将死
            if state.rule_engine.is_checkmate(board["current_turn"], board):
                board["game_status"] = {
                    "state": "ended",
                    "winner": "red" if board["current_turn"] == "black" else "black",
                    "win_condition": "checkmate",
                    "custom_rules_active": board.get("game_status", {}).get("custom_rules_active", []),
                }

    # 获取当前激活的机制摘要
    mechanisms_summary = []
    if state.mechanism_engine:
        mechanisms_summary = state.mechanism_engine.get_active_mechanisms_summary(board)

    state.save_config("board_state")
    return {
        "success": True,
        "board_state": board,
        "ai_move": move,
        "is_random": is_random_move,
        "mechanisms": mechanisms_summary,
    }


@app.get("/api/mechanisms")
async def get_mechanisms():
    """获取当前激活的机制列表"""
    board = state.configs["board_state"]
    summary = []
    if state.mechanism_engine:
        summary = state.mechanism_engine.get_active_mechanisms_summary(board)
    return {"success": True, "mechanisms": summary, "raw": board.get("mechanisms", {})}


class StopMechanismRequest(BaseModel):
    mechanism_type: str  # skip_turns | ai_control | random_moves | extra_turns | move_limits | player_control
    side: str  # red | black | both


@app.post("/api/stop_mechanism")
async def stop_mechanism(req: StopMechanismRequest):
    """截停指定方的指定机制"""
    board = state.configs["board_state"]
    mech = board.get("mechanisms", {})
    if req.mechanism_type in mech and isinstance(mech[req.mechanism_type], list):
        # 移除指定方的所有激活机制
        # player_control机制没有remaining字段，始终有效
        if req.mechanism_type == "player_control":
            mech[req.mechanism_type] = [
                item for item in mech[req.mechanism_type]
                if not item.get("side") == req.side
            ]
        else:
            mech[req.mechanism_type] = [
                item for item in mech[req.mechanism_type]
                if not (item.get("side") == req.side and item.get("remaining", 0) != 0)
            ]
        board["mechanisms"] = mech
        state.save_config("board_state")

    summary = []
    if state.mechanism_engine:
        summary = state.mechanism_engine.get_active_mechanisms_summary(board)
    return {"success": True, "message": "机制已截停", "mechanisms": summary, "board_state": board}


@app.get("/api/token_stats")
async def get_token_stats():
    """获取Token消耗统计"""
    return state.ai_orchestrator.get_token_stats()


@app.post("/api/valid_moves")
async def get_valid_moves(req: MoveRequest):
    """获取棋子的合法移动"""
    board = state.configs["board_state"]
    for p in board["pieces"]:
        if p["id"] == req.piece_id and p.get("is_alive", True):
            moves = state.rule_engine.get_valid_moves(p, board)
            return {"success": True, "moves": moves}
    return {"success": False, "moves": []}


@app.post("/api/undo")
async def undo_move():
    """悔棋（回退一步）"""
    board = state.configs["board_state"]
    history = board.get("move_history", [])

    if not history:
        return {"success": False, "message": "没有可悔的棋"}

    # 悔两步（玩家一步+AI一步），如果只有一步就悔一步
    steps_to_undo = min(2, len(history))

    for _ in range(steps_to_undo):
        if not history:
            break
        last = history.pop()
        piece = None
        for p in board["pieces"]:
            if p["id"] == last["piece_id"]:
                piece = p
                break
        if piece:
            piece["position"] = last["from"]
        if last.get("captured"):
            for p in board["pieces"]:
                if p["id"] == last["captured"]:
                    p["is_alive"] = True
                    break

    board["current_turn"] = "red"
    board["move_history"] = history
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
    state.chess_ai.set_difficulty(req.difficulty)
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
# 六道众生 API 路由
# ═══════════════════════════════════════════════════════════════


@app.get("/api/samsara/state")
async def get_samsara_state():
    """获取轮回状态"""
    return samsara.get_samsara_state()


@app.get("/api/samsara/karma")
async def get_karma():
    """获取业力状态"""
    return {
        "karma": samsara.get_karma_state(),
        "detection_probability": samsara.get_detection_probability(),
    }


@app.post("/api/samsara/consume_karma")
async def consume_karma(amount: int = 20):
    """消耗业力（用于作弊）"""
    return samsara.consume_karma(amount)


@app.post("/api/samsara/refund_karma")
async def refund_karma(amount: int):
    """退还业力"""
    samsara.refund_karma(amount)
    return {"success": True, "karma": samsara.get_karma_state()}


@app.post("/api/samsara/start_level")
async def start_level(realm: str = None, level_index: int = None):
    """开始关卡"""
    return samsara.start_level(realm, level_index)


@app.post("/api/samsara/advance_level")
async def advance_level():
    """进入下一关卡"""
    return samsara.advance_to_next_level()


@app.get("/api/samsara/level")
async def get_level_info():
    """获取当前关卡信息"""
    return samsara.get_level_summary()


@app.get("/api/samsara/turns")
async def get_turn_info():
    """获取回合信息"""
    return samsara.get_turn_info()


@app.get("/api/samsara/objectives")
async def get_objectives():
    """获取目标进度"""
    return {"objectives": samsara.get_objective_progress()}


@app.post("/api/samsara/reset_level")
async def reset_level_state():
    """重置关卡状态"""
    samsara.reset_level_state()
    return {"success": True}


@app.post("/api/samsara/update_objectives")
async def update_objectives(game_state: dict):
    """更新目标进度"""
    return samsara.update_objectives(game_state)


# ═══════════════════════════════════════════════════════════════
# 启动
# ═══════════════════════════════════════════════════════════════

# ═══════════════════════════════════════════════════════════════
# RPG 代理路由（供 rpg_server:80 调用）
# ═══════════════════════════════════════════════════════════════

from json_patch_utils import apply_patch as _rpg_apply_patch  # noqa: E402


class RpgApplyPatchReq(BaseModel):
    patch: list
    target: str  # board_state / rules / pieces_red / pieces_black / board / ui_config


@app.post("/api/rpg/apply_patch")
async def rpg_apply_patch(req: RpgApplyPatchReq):
    """应用 JSON Patch 到指定配置文件"""
    if req.target not in CONFIG_FILES:
        return JSONResponse({"success": False, "message": f"无效 target: {req.target}"}, status_code=400)
    try:
        current = copy.deepcopy(state.configs.get(req.target, {}))
        patched = _rpg_apply_patch(current, req.patch)
        state.configs[req.target] = patched
        state.save_config(req.target)
        state._rebuild_engines()
        return {"success": True, "target": req.target, "configs": patched}
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"success": False, "message": f"应用 patch 失败: {e}"}


@app.post("/api/rpg/apply_rules")
async def rpg_apply_rules(req: RpgApplyPatchReq):
    """应用规则覆盖（target 强制为 rules）"""
    req.target = "rules"
    return await rpg_apply_patch(req)


@app.post("/api/rpg/reset_battle")
async def rpg_reset_battle():
    """RPG 每局开始时调用，重置棋盘到初始状态"""
    state.reset_board()
    return {"success": True, "message": "战斗已重置", "board_state": state.configs["board_state"]}


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("GAME_PORT", 8000))
    print("=" * 50)
    print("  无限制象棋 - 启动中...")
    print(f"  访问地址: http://localhost:{port}")
    print("=" * 50)
    uvicorn.run(app, host="0.0.0.0", port=port)
