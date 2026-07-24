import json
from pathlib import Path
from .state import SamsaraState, REALM_NAMES

BASE_DIR = Path(__file__).resolve().parent.parent
CONFIGS_DIR = BASE_DIR / "configs"
LEVEL_POOLS_FILE = CONFIGS_DIR / "level_pools.json"
PUZZLES_FILE = CONFIGS_DIR / "puzzles.json"


class LevelSystem:
    def __init__(self, state: SamsaraState):
        self.state = state
        self.level_pools = self._load_level_pools()
        self.puzzles = self._load_puzzles()

    def _load_level_pools(self):
        if LEVEL_POOLS_FILE.exists():
            try:
                return json.loads(LEVEL_POOLS_FILE.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                pass
        return self._get_default_level_pools()

    def _load_puzzles(self):
        if PUZZLES_FILE.exists():
            try:
                return json.loads(PUZZLES_FILE.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                pass
        return {}

    def _get_default_level_pools(self):
        return {
            "hell": {
                "game_type": "heibaiqi",
                "name": "地狱道",
                "icon": "☯",
                "levels": [
                    {"id": "hell_1", "type": "standard", "name": "暗之始", "difficulty": 1, "ai_personality": "normal"},
                    {"id": "hell_2", "type": "standard", "name": "深渊", "difficulty": 2, "ai_personality": "normal"},
                    {"id": "hell_3", "type": "standard", "name": "挣扎", "difficulty": 3, "ai_personality": "aggressive"},
                    {"id": "hell_4", "type": "puzzle", "name": "逆转", "difficulty": 3, "puzzle_id": "heibaiqi_1"},
                    {"id": "hell_5", "type": "boss", "name": "翻覆者", "difficulty": 4, "ai_personality": "aggressive"},
                ],
            },
            "hungry": {
                "game_type": "tiaoqi",
                "name": "饿鬼道",
                "icon": "👹",
                "levels": [
                    {"id": "hungry_1", "type": "standard", "name": "饥饿", "difficulty": 1, "ai_personality": "normal"},
                    {"id": "hungry_2", "type": "standard", "name": "吞噬", "difficulty": 2, "ai_personality": "normal"},
                    {"id": "hungry_3", "type": "standard", "name": "追逐", "difficulty": 3, "ai_personality": "aggressive"},
                    {"id": "hungry_4", "type": "puzzle", "name": "断桥", "difficulty": 3, "puzzle_id": "tiaoqi_1"},
                    {"id": "hungry_5", "type": "boss", "name": "饕餮者", "difficulty": 4, "ai_personality": "aggressive"},
                ],
            },
            "animal": {
                "game_type": "dongwuqi",
                "name": "畜生道",
                "icon": "🐅",
                "levels": [
                    {"id": "animal_1", "type": "standard", "name": "丛林法则", "difficulty": 1, "ai_personality": "normal"},
                    {"id": "animal_2", "type": "standard", "name": "弱肉强食", "difficulty": 2, "ai_personality": "normal"},
                    {"id": "animal_3", "type": "standard", "name": "等级", "difficulty": 3, "ai_personality": "aggressive"},
                    {"id": "animal_4", "type": "puzzle", "name": "逆袭", "difficulty": 3, "puzzle_id": "dongwuqi_1"},
                    {"id": "animal_5", "type": "boss", "name": "秩序者", "difficulty": 4, "ai_personality": "defensive"},
                ],
            },
            "human": {
                "game_type": "xiangqi",
                "name": "人道",
                "icon": "🧠",
                "levels": [
                    {"id": "human_1", "type": "standard", "name": "楚河汉界", "difficulty": 1, "ai_personality": "normal", "tutorial": True},
                    {"id": "human_2", "type": "standard", "name": "初窥天机", "difficulty": 2, "ai_personality": "normal", "tutorial": True},
                    {"id": "human_3", "type": "standard", "name": "兵临城下", "difficulty": 3, "ai_personality": "normal"},
                    {"id": "human_4", "type": "puzzle", "name": "绝杀", "difficulty": 4, "puzzle_id": "xiangqi_1"},
                    {"id": "human_5", "type": "objective", "name": "破军", "difficulty": 3, "objective": {"type": "capture_count", "target": 4}},
                    {"id": "human_6", "type": "boss", "name": "算计者", "difficulty": 5, "ai_personality": "hard"},
                ],
            },
            "asura": {
                "game_type": "weiqi",
                "name": "阿修罗道",
                "icon": "⚔️",
                "levels": [
                    {"id": "asura_1", "type": "standard", "name": "气之初始", "difficulty": 1, "ai_personality": "normal"},
                    {"id": "asura_2", "type": "standard", "name": "劫争", "difficulty": 2, "ai_personality": "normal"},
                    {"id": "asura_3", "type": "standard", "name": "天下布武", "difficulty": 3, "ai_personality": "aggressive"},
                    {"id": "asura_4", "type": "puzzle", "name": "活棋", "difficulty": 4, "puzzle_id": "weiqi_1"},
                    {"id": "asura_5", "type": "objective", "name": "屠龙", "difficulty": 4, "objective": {"type": "assassination", "target_piece": "dragon"}},
                    {"id": "asura_6", "type": "boss", "name": "狂乱者", "difficulty": 5, "ai_personality": "aggressive_random"},
                ],
            },
            "heaven": {
                "game_type": "wuziqi",
                "name": "天道",
                "icon": "☸️",
                "levels": [
                    {"id": "heaven_1", "type": "standard", "name": "五子登仙", "difficulty": 1, "ai_personality": "normal"},
                    {"id": "heaven_2", "type": "standard", "name": "连珠", "difficulty": 2, "ai_personality": "normal"},
                    {"id": "heaven_3", "type": "standard", "name": "悟道", "difficulty": 3, "ai_personality": "aggressive"},
                    {"id": "heaven_4", "type": "puzzle", "name": "一步登天", "difficulty": 4, "puzzle_id": "wuziqi_1"},
                    {"id": "heaven_5", "type": "objective", "name": "天光", "difficulty": 4, "objective": {"type": "color_coverage", "target_percentage": 80}},
                    {"id": "heaven_6", "type": "boss", "name": "禅定者", "difficulty": 5, "ai_personality": "defensive_hard"},
                ],
            },
        }

    def load_level(self, realm: str = None, level_index: int = None) -> dict:
        if realm is None:
            realm = self.state.get("current_realm")
        if level_index is None:
            level_index = self.state.get("current_level")
        pool = self.level_pools.get(realm)
        if not pool or level_index >= len(pool["levels"]):
            return None
        level = pool["levels"][level_index]
        result = {
            **level,
            "realm": realm,
            "realm_name": REALM_NAMES.get(realm, ""),
            "game_type": pool["game_type"],
            "realm_icon": pool["icon"],
        }
        if level.get("type") == "puzzle" and level.get("puzzle_id"):
            puzzle = self.puzzles.get(pool["game_type"], {}).get(level["puzzle_id"])
            if puzzle:
                result["puzzle_data"] = puzzle
        return result

    def get_current_level(self) -> dict:
        return self.load_level()

    def get_total_levels(self, realm: str = None) -> int:
        if realm is None:
            realm = self.state.get("current_realm")
        pool = self.level_pools.get(realm)
        return len(pool["levels"]) if pool else 0

    def advance_to_next_level(self) -> dict:
        realm = self.state.get("current_realm")
        current_level = self.state.get("current_level")
        total = self.get_total_levels(realm)
        if current_level < total - 1:
            self.state.advance_level()
            return {"success": True, "new_level": self.load_level()}
        return {"success": False, "reason": "已到达最后一关"}

    def get_realm_progress(self, realm: str = None) -> dict:
        if realm is None:
            realm = self.state.get("current_realm")
        pool = self.level_pools.get(realm)
        progress = self.state.get("realm_progress", {}).get(realm, {})
        return {
            "realm": realm,
            "name": pool["name"] if pool else "",
            "icon": pool["icon"] if pool else "",
            "total_levels": len(pool["levels"]) if pool else 0,
            "levels_passed": progress.get("levels_passed", 0),
            "completed": progress.get("completed", False),
        }

    def get_all_realms_progress(self) -> list:
        result = []
        for realm in self.level_pools:
            result.append(self.get_realm_progress(realm))
        return result