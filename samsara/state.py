"""
轮回元状态管理 - 管理全局游戏状态、存档读写
"""
import json
import copy
from pathlib import Path
from typing import Dict, Any, Optional

WORKSPACE_ROOT = Path(__file__).resolve().parent.parent
CONFIGS_DIR = WORKSPACE_ROOT / "configs"
SAMSARA_STATE_FILE = CONFIGS_DIR / "samsara_state.json"


class SamsaraState:
    """轮回元状态管理器"""

    REALMS = ["hell", "hungry", "animal", "human", "asura", "heaven"]
    REALM_NAMES = {
        "hell": "地狱道",
        "hungry": "饿鬼道",
        "animal": "畜生道",
        "human": "人道",
        "asura": "阿修罗道",
        "heaven": "天道",
    }

    def __init__(self):
        self.state = self._load_state()
        self._ensure_defaults()

    def _load_state(self) -> dict:
        """加载轮回存档"""
        if SAMSARA_STATE_FILE.exists():
            try:
                return json.loads(SAMSARA_STATE_FILE.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                pass
        return self._create_default_state()

    def _create_default_state(self) -> dict:
        """创建默认状态"""
        return {
            "version": "1.0",
            "current_realm": "hell",
            "current_level": 0,
            "total_levels_per_realm": {},
            "karma": 0,
            "max_karma": 150,
            "max_single_karma": 80,
            "detection_probability": 0.0,
            "skill_points": 0,
            "unlocked_skills": [],
            "cheat_count": 0,
            "no_cheat_levels": [],
            "overdraft_history": [],
            "realm_progress": {},
            "new_game_plus": 0,
        }

    def _ensure_defaults(self):
        """确保所有默认字段存在"""
        defaults = self._create_default_state()
        for key, value in defaults.items():
            if key not in self.state:
                self.state[key] = value
            if key == "realm_progress" and not isinstance(self.state[key], dict):
                self.state[key] = {}

    def save(self):
        """保存状态到文件"""
        CONFIGS_DIR.mkdir(parents=True, exist_ok=True)
        SAMSARA_STATE_FILE.write_text(
            json.dumps(self.state, ensure_ascii=False, indent=2),
            encoding="utf-8"
        )

    def get_state(self) -> dict:
        """返回当前状态的深拷贝"""
        return copy.deepcopy(self.state)

    def update(self, updates: Dict[str, Any]):
        """批量更新状态"""
        self.state.update(updates)
        self.save()

    def set_realm(self, realm: str):
        """设置当前道"""
        if realm in self.REALMS:
            self.state["current_realm"] = realm
            self.state["current_level"] = 0
            self.save()

    def set_level(self, level: int):
        """设置当前关卡"""
        self.state["current_level"] = level
        self.save()

    def advance_level(self):
        """进入下一关卡"""
        self.state["current_level"] += 1
        self.save()

    def add_skill_points(self, points: int):
        """增加技能点"""
        self.state["skill_points"] += points
        self.save()

    def spend_skill_points(self, points: int) -> bool:
        """消耗技能点"""
        if self.state["skill_points"] >= points:
            self.state["skill_points"] -= points
            self.save()
            return True
        return False

    def unlock_skill(self, skill_id: str):
        """解锁技能"""
        if skill_id not in self.state["unlocked_skills"]:
            self.state["unlocked_skills"].append(skill_id)
            self.save()

    def is_skill_unlocked(self, skill_id: str) -> bool:
        """检查技能是否已解锁"""
        return skill_id in self.state["unlocked_skills"]

    def increment_cheat_count(self):
        """增加作弊次数"""
        self.state["cheat_count"] += 1
        self.save()

    def reset_cheat_count(self):
        """重置当前关卡作弊次数"""
        self.state["cheat_count"] = 0
        self.save()

    def record_no_cheat_level(self, realm: str, level: int):
        """记录无作弊通关"""
        key = f"{realm}_{level}"
        if key not in self.state["no_cheat_levels"]:
            self.state["no_cheat_levels"].append(key)
            self.save()

    def set_karma(self, karma: int):
        """设置业力值"""
        self.state["karma"] = karma
        self.save()

    def modify_karma(self, delta: int) -> int:
        """修改业力值，返回实际变化量"""
        new_karma = self.state["karma"] + delta
        actual_delta = new_karma - self.state["karma"]
        self.state["karma"] = new_karma
        self.save()
        return actual_delta

    def set_detection_probability(self, probability: float):
        """设置识破概率"""
        self.state["detection_probability"] = max(0.0, min(100.0, probability))
        self.save()

    def modify_detection_probability(self, delta: float):
        """修改识破概率"""
        new_prob = self.state["detection_probability"] + delta
        self.set_detection_probability(new_prob)

    def record_overdraft(self, amount: float):
        """记录透支记录"""
        self.state["overdraft_history"].append({
            "amount": amount,
            "detection_increase": min(100.0, 0.5 * (amount ** 1.8)),
        })
        if len(self.state["overdraft_history"]) > 20:
            self.state["overdraft_history"].pop(0)
        self.save()

    def reset_level_state(self):
        """重置关卡状态（业力、识破概率、作弊次数）"""
        self.state["karma"] = 0
        self.state["detection_probability"] = 0.0
        self.state["cheat_count"] = 0
        self.save()

    def set_realm_progress(self, realm: str, completed_levels: list):
        """设置道的进度"""
        self.state["realm_progress"][realm] = completed_levels
        self.save()

    def get_realm_progress(self, realm: str) -> list:
        """获取道的进度"""
        return self.state["realm_progress"].get(realm, [])

    def increment_new_game_plus(self):
        """进入 New Game+"""
        self.state["new_game_plus"] += 1
        self.save()

    def reset_all(self):
        """重置所有状态（新轮回）"""
        self.state = self._create_default_state()
        self.save()


samsara_state = SamsaraState()