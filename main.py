"""
无限制象棋 - 主服务器
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
from chess_ai import ChessAI
from mechanism_engine import MechanismEngine

# ═══════════════════════════════════════════════════════════════
# 配置
# ═══════════════════════════════════════════════════════════════

BASE_DIR = Path(__file__).parent
CONFIGS_DIR = BASE_DIR / "configs"
STATIC_DIR = BASE_DIR / "static"
STORY_EDITOR_DIR = BASE_DIR / "story-editor"
STORIES_DIR = STORY_EDITOR_DIR / "stories"
ASSETS_DIR = STORY_EDITOR_DIR / "assets"

import sys
sys.path.insert(0, str(STORY_EDITOR_DIR / "scripts"))

CONFIG_FILES = ["board_state", "board", "pieces_red", "pieces_black", "rules", "ui_config"]


def _ensure_stories_dir():
    STORIES_DIR.mkdir(parents=True, exist_ok=True)

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

# 挂载静态文件
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# 挂载剧情编辑器静态文件
if STORY_EDITOR_DIR.exists():
    app.mount("/story-editor", StaticFiles(directory=str(STORY_EDITOR_DIR), html=True), name="story-editor")

# 挂载 assets 目录（角色立绘等）
if ASSETS_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(ASSETS_DIR)), name="assets")


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
async def process_command(req: PlayerCommand):
    """处理玩家自然语言指令"""
    try:
        result = await state.ai_orchestrator.process_command(
            req.command, {"configs": state.configs}
        )

        # 如果成功修改了配置，应用更新
        if result.get("success") and result.get("type") == "applied":
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
    if target_piece:
        target_piece["is_alive"] = False

    # 记录历史
    board.setdefault("move_history", []).append(
        {
            "piece_id": piece["id"],
            "from": from_pos,
            "to": req.to,
            "captured": target_piece["id"] if target_piece else None,
        }
    )

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

    # 获取当前激活的机制摘要
    mechanisms_summary = []
    if state.mechanism_engine:
        mechanisms_summary = state.mechanism_engine.get_active_mechanisms_summary(board)

    state.save_config("board_state")
    return {
        "success": True,
        "board_state": board,
        "mechanisms": mechanisms_summary,
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


# ═══════════════════════════════════════════════════════════════
# 剧情编辑器 API
# ═══════════════════════════════════════════════════════════════


@app.get("/api/stories")
async def list_stories():
    """列出所有保存的剧情项目"""
    _ensure_stories_dir()
    stories = []
    for f in STORIES_DIR.glob("*.json"):
        try:
            with open(f, "r", encoding="utf-8") as fp:
                data = json.load(fp)
            stories.append({
                "id": f.stem,
                "meta": data.get("meta", {}),
                "scene_count": len(data.get("scenes", [])),
            })
        except Exception:
            stories.append({"id": f.stem, "meta": {"title": f.stem}, "scene_count": 0})
    # 按修改时间倒序
    stories.sort(key=lambda s: s.get("meta", {}).get("updated_at", ""), reverse=True)
    return stories


@app.get("/api/stories/{story_id}")
async def get_story(story_id: str):
    """获取单个剧情"""
    path = STORIES_DIR / f"{story_id}.json"
    if not path.exists():
        return JSONResponse({"error": "剧情不存在"}, status_code=404)
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


@app.post("/api/stories")
async def save_story(request: Request):
    """保存剧情（新建或覆盖）"""
    _ensure_stories_dir()
    try:
        data = await request.json()
    except Exception:
        return JSONResponse({"error": "无效的 JSON"}, status_code=400)

    # 生成或使用 ID
    story_id = data.get("id") or data.get("meta", {}).get("id")
    if not story_id:
        story_id = "story_" + str(int(__import__("time").time()))
    data["id"] = story_id

    path = STORIES_DIR / f"{story_id}.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    return {"success": True, "id": story_id, "path": str(path)}


@app.delete("/api/stories/{story_id}")
async def delete_story(story_id: str):
    """删除剧情"""
    path = STORIES_DIR / f"{story_id}.json"
    if not path.exists():
        return JSONResponse({"error": "剧情不存在"}, status_code=404)
    path.unlink()
    return {"success": True}


@app.get("/api/characters/list")
async def list_characters(debug: bool = False):
    """获取 assets/characters 下的可用角色列表

    Args:
        debug: 是否返回详细调试信息
    """
    characters = []
    debug_info = {
        "assets_dir": str(ASSETS_DIR),
        "characters_dir": str(ASSETS_DIR / "characters"),
        "dir_exists": False,
        "dirs_scanned": [],
        "errors": []
    }

    chars_dir = ASSETS_DIR / "characters"
    if not chars_dir.exists():
        debug_info["errors"].append(f"角色目录不存在: {chars_dir}")
        result = {"characters": characters}
        if debug:
            result["debug"] = debug_info
        return result

    debug_info["dir_exists"] = True

    for char_dir in sorted(chars_dir.iterdir()):
        if not char_dir.is_dir():
            continue
        char_id = char_dir.name
        debug_info["dirs_scanned"].append(char_id)
        portraits = []
        char_errors = []

        # 读取 manifest
        manifest_path = char_dir / "manifest.json"
        manifest_used = False
        if manifest_path.exists():
            try:
                with open(manifest_path, "r", encoding="utf-8") as f:
                    manifest = json.load(f)
                if not isinstance(manifest, dict):
                    char_errors.append("manifest 格式错误：不是 JSON 对象")
                    raise ValueError("invalid manifest format")
                images = manifest.get("images", [])
                if not isinstance(images, list):
                    char_errors.append("manifest.images 格式错误：不是数组")
                    raise ValueError("invalid images format")
                for img in images:
                    if not isinstance(img, dict) or "filename" not in img:
                        char_errors.append(f"跳过无效图片项: {img}")
                        continue
                    filename = img["filename"]
                    img_full_path = char_dir / filename
                    if not img_full_path.exists():
                        char_errors.append(f"图片文件不存在: {filename}")
                        continue
                    img_path = f"/assets/characters/{char_id}/{filename}"
                    expr_base = filename.replace(char_id + "_", "").replace(".png", "")
                    category = img.get("category", "")
                    expression = f"{category}_{expr_base}" if category else expr_base
                    portraits.append({
                        "expression": expression,
                        "image": img_path,
                        "category": category
                    })
                char_name = manifest.get("character", manifest.get("name", char_id))
                characters.append({
                    "id": char_id,
                    "name": char_name,
                    "description": manifest.get("description", ""),
                    "color": manifest.get("color", "#4ade80"),
                    "portraits": portraits,
                    "source": "manifest"
                })
                manifest_used = True
            except Exception as e:
                char_errors.append(f"manifest 解析失败: {str(e)}")
                if debug:
                    debug_info["errors"].append(f"[{char_id}] manifest 解析失败: {str(e)}")

        if not manifest_used:
            # fallback: 扫描目录下的 png 文件
            png_count = 0
            for img_file in sorted(char_dir.glob("*.png")):
                img_path = f"/assets/characters/{char_id}/{img_file.name}"
                expression = img_file.stem.replace(char_id + "_", "")
                portraits.append({"expression": expression, "image": img_path})
                png_count += 1

            if portraits:
                characters.append({
                    "id": char_id,
                    "name": char_id,
                    "portraits": portraits,
                    "source": "scan"
                })
            elif debug:
                debug_info["errors"].append(f"[{char_id}] 没有找到 PNG 图片")

        if char_errors and debug:
            debug_info[f"{char_id}_errors"] = char_errors

    result = {"characters": characters}
    if debug:
        result["debug"] = debug_info
    return result


@app.get("/api/characters/{char_id}")
async def get_character_detail(char_id: str):
    """获取单个角色的详细信息"""
    chars_dir = ASSETS_DIR / "characters"
    char_dir = chars_dir / char_id
    if not char_dir.exists() or not char_dir.is_dir():
        return JSONResponse({"error": "角色不存在"}, status_code=404)

    portraits = []
    manifest = None
    manifest_path = char_dir / "manifest.json"
    if manifest_path.exists():
        try:
            with open(manifest_path, "r", encoding="utf-8") as f:
                manifest = json.load(f)
            for img in manifest.get("images", []):
                filename = img["filename"]
                img_path = f"/assets/characters/{char_id}/{filename}"
                expr_base = filename.replace(char_id + "_", "").replace(".png", "")
                category = img.get("category", "")
                expression = f"{category}_{expr_base}" if category else expr_base
                portraits.append({
                    "expression": expression,
                    "image": img_path,
                    "category": category,
                    "prompt": img.get("prompt", "")
                })
        except Exception:
            pass

    if not portraits:
        for img_file in sorted(char_dir.glob("*.png")):
            img_path = f"/assets/characters/{char_id}/{img_file.name}"
            expression = img_file.stem.replace(char_id + "_", "")
            portraits.append({"expression": expression, "image": img_path})

    return {
        "id": char_id,
        "name": manifest.get("character", manifest.get("name", char_id)) if manifest else char_id,
        "description": manifest.get("description", "") if manifest else "",
        "color": manifest.get("color", "#4ade80") if manifest else "#4ade80",
        "portraits": portraits,
        "png_count": len(list(char_dir.glob("*.png")))
    }


# ═══════════════════════════════════════════════════════════════
# AI 角色生成 API
# ═══════════════════════════════════════════════════════════════

class CharacterGenerateRequest(BaseModel):
    char_id: str
    char_name: str
    description: str
    expressions: Optional[list] = None
    style: str = "pixel"
    color: str = "#4ade80"


@app.get("/api/ai/config")
async def get_ai_config():
    """获取 AI 配置状态"""
    try:
        from character_generator import ARK_API_KEY, STYLE_PRESETS, ALL_EXPRESSIONS, DEFAULT_EXPRESSIONS
        # 不在这里初始化 rembg（避免阻塞），只检查包是否安装
        rembg_installed = False
        try:
            import rembg
            rembg_installed = True
        except ImportError:
            pass
        
        return {
            "api_key_configured": bool(ARK_API_KEY),
            "style_presets": STYLE_PRESETS,
            "all_expressions": [
                {"key": e[0], "label": e[1], "category": e[2]}
                for e in ALL_EXPRESSIONS
            ],
            "default_expressions": DEFAULT_EXPRESSIONS,
            "background_removal": {
                "available": rembg_installed,
                "method": "rembg (local)" if rembg_installed else "none",
                "note": "首次使用时自动下载模型，可能需要一些时间" if rembg_installed else None,
            },
        }
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/api/ai/generate/character")
async def generate_character(req: CharacterGenerateRequest):
    """创建 AI 角色生成任务（异步）"""
    try:
        from character_generator import create_task, execute_task
        import asyncio
        
        task = create_task(
            char_id=req.char_id,
            char_name=req.char_name,
            description=req.description,
            expressions=req.expressions,
            style=req.style,
            color=req.color,
        )
        
        # 后台执行
        asyncio.create_task(execute_task(task, ASSETS_DIR))
        
        return {"success": True, "task_id": task.task_id, "task": task.to_dict()}
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"success": False, "error": str(e)}, status_code=500)


@app.get("/api/ai/generate/character/{task_id}")
async def get_generation_status(task_id: str):
    """获取角色生成任务状态"""
    try:
        from character_generator import get_task
        task = get_task(task_id)
        if not task:
            return JSONResponse({"error": "任务不存在"}, status_code=404)
        return {"success": True, "task": task.to_dict()}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/api/ai/generate/character/{task_id}/regenerate/{expression}")
async def regenerate_single(task_id: str, expression: str):
    """重新生成单张表情"""
    try:
        from character_generator import get_task, generate_image, build_prompt, download_image, remove_background
        import asyncio
        
        task = get_task(task_id)
        if not task:
            return JSONResponse({"error": "任务不存在"}, status_code=404)
        
        style_cfg = task.style
        
        # 构建提示词
        prompt = build_prompt(
            user_description=task.description,
            expression_key=expression,
            style=task.style,
            char_name=task.char_name,
        )
        
        # 生成图片
        from character_generator import STYLE_PRESETS
        size = STYLE_PRESETS.get(task.style, STYLE_PRESETS["pixel"])["size"]
        url = await generate_image(prompt, size=size)
        if not url:
            return JSONResponse({"success": False, "error": "生成失败"}, status_code=500)
        
        # 下载并抠图
        char_dir = ASSETS_DIR / "characters" / task.char_id
        raw_path = char_dir / f"{expression}_raw.png"
        output_path = char_dir / f"{expression}.png"
        
        success = await download_image(url, raw_path)
        if not success:
            return JSONResponse({"success": False, "error": "下载失败"}, status_code=500)
        
        bg_removed = remove_background(raw_path, output_path)
        if not bg_removed:
            # 抠图失败的话用原图
            output_path = raw_path
        
        # 更新任务状态
        if expression in task.images:
            task.images[expression]["url"] = url
            task.images[expression]["local_path"] = str(output_path)
            task.images[expression]["status"] = "done"
        
        # 更新 manifest
        manifest_path = char_dir / "manifest.json"
        if manifest_path.exists():
            try:
                with open(manifest_path, "r", encoding="utf-8") as f:
                    manifest = json.load(f)
                
                # 更新 portraits
                portraits = manifest.get("portraits", [])
                found = False
                for p in portraits:
                    if p.get("expression") == expression:
                        p["image"] = f"/assets/characters/{task.char_id}/{expression}.png"
                        found = True
                        break
                if not found:
                    from character_generator import ALL_EXPRESSIONS
                    exp_label = next(
                        (e[1] for e in ALL_EXPRESSIONS if e[0] == expression),
                        expression
                    )
                    portraits.append({
                        "expression": expression,
                        "label": exp_label,
                        "image": f"/assets/characters/{task.char_id}/{expression}.png",
                    })
                manifest["portraits"] = portraits
                
                with open(manifest_path, "w", encoding="utf-8") as f:
                    json.dump(manifest, f, ensure_ascii=False, indent=2)
            except Exception:
                pass
        
        return {
            "success": True,
            "expression": expression,
            "url": url,
            "image_path": f"/assets/characters/{task.char_id}/{expression}.png",
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"success": False, "error": str(e)}, status_code=500)


# ═══════════════════════════════════════════════════════════════
# 批量抠图 API
# ═══════════════════════════════════════════════════════════════

_bg_remove_tasks = {}


@app.post("/api/assets/batch-remove-bg")
async def api_batch_remove_bg():
    """启动批量抠图任务"""
    try:
        from character_generator import batch_remove_background
        import asyncio
        import uuid
        
        task_id = f"bg_{uuid.uuid4().hex[:12]}"
        _bg_remove_tasks[task_id] = {
            "status": "running",
            "progress": [],
            "result": None,
        }
        
        async def run_task():
            def on_progress(char_id, filename, status):
                _bg_remove_tasks[task_id]["progress"].append({
                    "char_id": char_id,
                    "filename": filename,
                    "status": status,
                })
            
            result = await batch_remove_background(ASSETS_DIR, on_progress=on_progress)
            _bg_remove_tasks[task_id]["status"] = "done"
            _bg_remove_tasks[task_id]["result"] = result
        
        asyncio.create_task(run_task())
        
        return {"success": True, "task_id": task_id}
    except Exception as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=500)


@app.get("/api/assets/batch-remove-bg/{task_id}")
async def get_batch_bg_status(task_id: str):
    """获取批量抠图任务状态"""
    task = _bg_remove_tasks.get(task_id)
    if not task:
        return JSONResponse({"error": "任务不存在"}, status_code=404)
    return {"success": True, **task}


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
    print("  无限制象棋 - 启动中...")
    print(f"  访问地址: http://localhost:8000")
    print("=" * 50)
    uvicorn.run(app, host="0.0.0.0", port=8000)
