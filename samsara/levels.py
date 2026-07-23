"""
关卡管理系统 - 关卡配置加载、关卡生成、关卡进度管理
"""
import json
import random
from pathlib import Path
from typing import Dict, Any, List

WORKSPACE_ROOT = Path(__file__).resolve().parent.parent
CONFIGS_DIR = WORKSPACE_ROOT / "configs"
LEVEL_POOLS_FILE = CONFIGS_DIR / "level_pools.json"
PUZZLES_FILE = CONFIGS_DIR / "puzzles.json"


class LevelConfig:
    """关卡配置"""

    def __init__(self, level_data: dict):
        self.id = level_data.get("id", "")
        self.name = level_data.get("name", level_data.get("id", ""))
        self.type = level_data.get("type", "normal")
        self.game_type = level_data.get("game_type", "xiangqi")
        self.difficulty = level_data.get("difficulty", "normal")
        self.objectives = level_data.get("objectives", [])
        self.turn_limit = level_data.get("turn_limit", 20)
        self.initial_karma = level_data.get("initial_karma", 0)
        self.is_boss_level = level_data.get("is_boss_level", False)
        self.boss_id = level_data.get("boss_id", "")
        self.board_config = level_data.get("board_config", {})
        self.piece_config = level_data.get("piece_config", {})
        self.rules_config = level_data.get("rules_config", {})
        self.description = level_data.get("description", "")
        self.puzzle_id = level_data.get("puzzle_id", "")


class LevelManager:
    """关卡管理器"""

    REALM_LEVEL_COUNTS = {
        "hell": 5,
        "hungry": 5,
        "animal": 6,
        "human": 6,
        "asura": 7,
        "heaven": 7,
    }

    def __init__(self, state_manager):
        self.state_manager = state_manager
        self.level_pools = self._load_level_pools()
        self.puzzles = self._load_puzzles()
        self.current_level = None

    def _load_level_pools(self) -> dict:
        """加载关卡池配置"""
        if LEVEL_POOLS_FILE.exists():
            try:
                return json.loads(LEVEL_POOLS_FILE.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                pass
        return self._create_default_level_pools()

    def _create_default_level_pools(self) -> dict:
        """创建默认关卡池"""
        return {
            "hell": [
                {"id": "hell_1", "type": "normal", "game_type": "tiaoqi", "difficulty": "easy", "turn_limit": 20, "initial_karma": 20},
                {"id": "hell_2", "type": "normal", "game_type": "heibaiqi", "difficulty": "easy", "turn_limit": 20, "initial_karma": 20},
                {"id": "hell_3", "type": "puzzle", "game_type": "xiangqi", "difficulty": "easy", "turn_limit": 5, "puzzle_id": "xiangqi_puzzle_1"},
                {"id": "hell_4", "type": "normal", "game_type": "dongwuqi", "difficulty": "normal", "turn_limit": 20, "initial_karma": 15},
                {"id": "hell_5", "type": "boss", "game_type": "xiangqi", "difficulty": "hard", "turn_limit": 20, "is_boss_level": True, "boss_id": "boss_hell"},
            ],
            "hungry": [
                {"id": "hungry_1", "type": "normal", "game_type": "heibaiqi", "difficulty": "easy", "turn_limit": 20, "initial_karma": 15},
                {"id": "hungry_2", "type": "normal", "game_type": "tiaoqi", "difficulty": "normal", "turn_limit": 20, "initial_karma": 15},
                {"id": "hungry_3", "type": "puzzle", "game_type": "wuziqi", "difficulty": "normal", "turn_limit": 5, "puzzle_id": "wuziqi_puzzle_1"},
                {"id": "hungry_4", "type": "normal", "game_type": "xiangqi", "difficulty": "normal", "turn_limit": 20, "initial_karma": 10},
                {"id": "hungry_5", "type": "boss", "game_type": "wuziqi", "difficulty": "hard", "turn_limit": 20, "is_boss_level": True, "boss_id": "boss_hungry"},
            ],
            "animal": [
                {"id": "animal_1", "type": "normal", "game_type": "dongwuqi", "difficulty": "easy", "turn_limit": 20, "initial_karma": 20},
                {"id": "animal_2", "type": "normal", "game_type": "heibaiqi", "difficulty": "normal", "turn_limit": 20, "initial_karma": 15},
                {"id": "animal_3", "type": "puzzle", "game_type": "dongwuqi", "difficulty": "normal", "turn_limit": 5, "puzzle_id": "dongwuqi_puzzle_1"},
                {"id": "animal_4", "type": "normal", "game_type": "xiangqi", "difficulty": "normal", "turn_limit": 20, "initial_karma": 15},
                {"id": "animal_5", "type": "special", "game_type": "wuziqi", "difficulty": "hard", "turn_limit": 20, "initial_karma": 10, "objectives": [{"type": "capture_count", "target": 10}]},
                {"id": "animal_6", "type": "boss", "game_type": "dongwuqi", "difficulty": "hard", "turn_limit": 20, "is_boss_level": True, "boss_id": "boss_animal"},
            ],
            "human": [
                {"id": "human_1", "type": "normal", "game_type": "xiangqi", "difficulty": "normal", "turn_limit": 20, "initial_karma": 20},
                {"id": "human_2", "type": "normal", "game_type": "weiqi", "difficulty": "normal", "turn_limit": 20, "initial_karma": 15},
                {"id": "human_3", "type": "puzzle", "game_type": "xiangqi", "difficulty": "hard", "turn_limit": 5, "puzzle_id": "xiangqi_puzzle_2"},
                {"id": "human_4", "type": "normal", "game_type": "wuziqi", "difficulty": "normal", "turn_limit": 20, "initial_karma": 15},
                {"id": "human_5", "type": "special", "game_type": "weiqi", "difficulty": "hard", "turn_limit": 20, "initial_karma": 10, "objectives": [{"type": "territory_control", "target": 50}]},
                {"id": "human_6", "type": "boss", "game_type": "weiqi", "difficulty": "hard", "turn_limit": 20, "is_boss_level": True, "boss_id": "boss_human"},
            ],
            "asura": [
                {"id": "asura_1", "type": "normal", "game_type": "xiangqi", "difficulty": "hard", "turn_limit": 20, "initial_karma": 15},
                {"id": "asura_2", "type": "normal", "game_type": "weiqi", "difficulty": "hard", "turn_limit": 20, "initial_karma": 15},
                {"id": "asura_3", "type": "puzzle", "game_type": "wuziqi", "difficulty": "hard", "turn_limit": 5, "puzzle_id": "wuziqi_puzzle_2"},
                {"id": "asura_4", "type": "normal", "game_type": "dongwuqi", "difficulty": "hard", "turn_limit": 20, "initial_karma": 10},
                {"id": "asura_5", "type": "special", "game_type": "xiangqi", "difficulty": "hard", "turn_limit": 20, "initial_karma": 10, "objectives": [{"type": "checkmate", "target": 1}]},
                {"id": "asura_6", "type": "special", "game_type": "weiqi", "difficulty": "extreme", "turn_limit": 15, "initial_karma": 5, "objectives": [{"type": "life_count", "target": 3}]},
                {"id": "asura_7", "type": "boss", "game_type": "xiangqi", "difficulty": "extreme", "turn_limit": 20, "is_boss_level": True, "boss_id": "boss_asura"},
            ],
            "heaven": [
                {"id": "heaven_1", "type": "normal", "game_type": "weiqi", "difficulty": "hard", "turn_limit": 20, "initial_karma": 15},
                {"id": "heaven_2", "type": "normal", "game_type": "xiangqi", "difficulty": "hard", "turn_limit": 20, "initial_karma": 15},
                {"id": "heaven_3", "type": "puzzle", "game_type": "weiqi", "difficulty": "hard", "turn_limit": 5, "puzzle_id": "weiqi_puzzle_1"},
                {"id": "heaven_4", "type": "normal", "game_type": "wuziqi", "difficulty": "extreme", "turn_limit": 20, "initial_karma": 10},
                {"id": "heaven_5", "type": "special", "game_type": "xiangqi", "difficulty": "extreme", "turn_limit": 15, "initial_karma": 5, "objectives": [{"type": "capture_count", "target": 15}]},
                {"id": "heaven_6", "type": "special", "game_type": "weiqi", "difficulty": "extreme", "turn_limit": 15, "initial_karma": 5, "objectives": [{"type": "score", "target": 200}]},
                {"id": "heaven_7", "type": "boss", "game_type": "weiqi", "difficulty": "extreme", "turn_limit": 20, "is_boss_level": True, "boss_id": "boss_heaven"},
            ],
        }

    def _load_puzzles(self) -> dict:
        """加载残局数据库"""
        if PUZZLES_FILE.exists():
            try:
                return json.loads(PUZZLES_FILE.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                pass
        return self._create_default_puzzles()

    def _create_default_puzzles(self) -> dict:
        """创建默认残局"""
        return {
            "xiangqi_puzzle_1": {
                "id": "xiangqi_puzzle_1",
                "game_type": "xiangqi",
                "description": "红方三步内取胜",
                "initial_state": {},
                "solution": [],
            },
            "xiangqi_puzzle_2": {
                "id": "xiangqi_puzzle_2",
                "game_type": "xiangqi",
                "description": "红方五步内取胜",
                "initial_state": {},
                "solution": [],
            },
            "wuziqi_puzzle_1": {
                "id": "wuziqi_puzzle_1",
                "game_type": "wuziqi",
                "description": "找到必胜落子点",
                "initial_state": {},
                "solution": [],
            },
            "wuziqi_puzzle_2": {
                "id": "wuziqi_puzzle_2",
                "game_type": "wuziqi",
                "description": "四三杀取胜",
                "initial_state": {},
                "solution": [],
            },
            "dongwuqi_puzzle_1": {
                "id": "dongwuqi_puzzle_1",
                "game_type": "dongwuqi",
                "description": "吃掉对方狮子",
                "initial_state": {},
                "solution": [],
            },
            "weiqi_puzzle_1": {
                "id": "weiqi_puzzle_1",
                "game_type": "weiqi",
                "description": "活棋",
                "initial_state": {},
                "solution": [],
            },
        }

    def get_level_by_realm_and_index(self, realm: str, level_index: int) -> LevelConfig:
        """获取指定道和索引的关卡"""
        realm_levels = self.level_pools.get(realm, [])
        if 0 <= level_index < len(realm_levels):
            return LevelConfig(realm_levels[level_index])
        return None

    def get_current_level(self) -> LevelConfig:
        """获取当前关卡"""
        state = self.state_manager.get_state()
        realm = state["current_realm"]
        level = state["current_level"]
        return self.get_level_by_realm_and_index(realm, level)

    def load_level(self, level_config: LevelConfig):
        """加载关卡"""
        self.current_level = level_config

        if level_config.puzzle_id:
            puzzle = self.puzzles.get(level_config.puzzle_id)
            if puzzle:
                level_config.board_config = puzzle.get("initial_state", {})

        self.state_manager.reset_level_state()
        self.state_manager.set_karma(level_config.initial_karma)

    def advance_to_next_level(self) -> Tuple[bool, LevelConfig]:
        """进入下一关卡"""
        state = self.state_manager.get_state()
        realm = state["current_realm"]
        current_level = state["current_level"]

        realm_levels = self.level_pools.get(realm, [])
        next_level_index = current_level + 1

        if next_level_index >= len(realm_levels):
            return False, None

        self.state_manager.set_level(next_level_index)
        next_level = self.get_level_by_realm_and_index(realm, next_level_index)
        self.load_level(next_level)

        return True, next_level

    def get_realm_levels(self, realm: str) -> List[LevelConfig]:
        """获取道的所有关卡"""
        return [LevelConfig(data) for data in self.level_pools.get(realm, [])]

    def get_total_levels(self, realm: str) -> int:
        """获取道的总关卡数"""
        return len(self.level_pools.get(realm, []))

    def is_last_level(self) -> bool:
        """检查是否是最后一关"""
        state = self.state_manager.get_state()
        realm = state["current_realm"]
        level = state["current_level"]
        return level >= len(self.level_pools.get(realm, [])) - 1

    def get_level_summary(self) -> Dict[str, Any]:
        """获取当前关卡摘要"""
        level = self.get_current_level()
        if not level:
            return {}

        return {
            "level_id": level.id,
            "level_type": level.type,
            "game_type": level.game_type,
            "difficulty": level.difficulty,
            "turn_limit": level.turn_limit,
            "initial_karma": level.initial_karma,
            "is_boss_level": level.is_boss_level,
            "boss_id": level.boss_id,
            "objectives": level.objectives,
            "description": level.description,
        }

    def start_level(self, realm: str = None, level_index: int = None):
        """开始指定关卡"""
        if realm is None:
            state = self.state_manager.get_state()
            realm = state["current_realm"]
            level_index = state["current_level"]

        level = self.get_level_by_realm_and_index(realm, level_index)
        if level:
            self.load_level(level)
            return level
        return None


level_manager = LevelManager(None)