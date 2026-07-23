import json
import copy
from pathlib import Path
from datetime import datetime

BASE_DIR = Path(__file__).resolve().parent.parent
CONFIGS_DIR = BASE_DIR / "configs"
STATE_FILE = CONFIGS_DIR / "samsara_state.json"

REALMS = ["hell", "hungry", "animal", "human", "asura", "heaven"]
REALM_NAMES = {
    "hell": "地狱道",
    "hungry": "饿鬼道",
    "animal": "畜生道",
    "human": "人道",
    "asura": "阿修罗道",
    "heaven": "天道",
}


class SamsaraState:
    def __init__(self):
        self._data = self._load_state()
        self._init_defaults()

    def _load_state(self):
        if STATE_FILE.exists():
            try:
                return json.loads(STATE_FILE.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                pass
        return {}

    def _init_defaults(self):
        defaults = {
            "version": 1,
            "current_realm": "hell",
            "current_level": 0,
            "skill_points": 0,
            "karma": 0,
            "karma_max": 150,
            "karma_single_max": 80,
            "detection": 0.0,
            "skills": {},
            "current_turn": 0,
            "turn_limit": 20,
            "cheat_count": 0,
            "overdraft_count": 0,
            "no_cheat_this_level": True,
            "total_levels_completed": 0,
            "bosses_defeated": [],
            "realm_progress": {r: {"completed": False, "levels_passed": 0} for r in REALMS},
            "last_modified": datetime.now().isoformat(),
        }
        for k, v in defaults.items():
            if k not in self._data:
                self._data[k] = v

    def _save(self):
        self._data["last_modified"] = datetime.now().isoformat()
        STATE_FILE.write_text(json.dumps(self._data, ensure_ascii=False, indent=2), encoding="utf-8")

    def get(self, key, default=None):
        return self._data.get(key, default)

    def set(self, key, value):
        self._data[key] = value
        self._save()

    def update(self, data):
        self._data.update(data)
        self._save()

    def get_full_state(self):
        return copy.deepcopy(self._data)

    def reset_level_state(self):
        self._data["karma"] = 0
        self._data["detection"] = 0.0
        self._data["current_turn"] = 0
        self._data["cheat_count"] = 0
        self._data["overdraft_count"] = 0
        self._data["no_cheat_this_level"] = True
        # 应用开局业力加成（karma_capacity_t3b技能）
        modifiers = self.get_skill_modifiers()
        if modifiers.get("start_karma_bonus", 0) > 0:
            self._data["karma"] = modifiers["start_karma_bonus"]
        # 重置一次性技能使用标记
        self._data["first_overdraft_skip_used"] = False
        self._data["golden_escape_used"] = False
        self._save()

    def advance_level(self):
        self._data["current_level"] += 1
        self._save()

    def set_realm(self, realm):
        self._data["current_realm"] = realm
        self._data["current_level"] = 0
        self._save()

    def add_skill_point(self, count=1):
        self._data["skill_points"] += count
        self._save()

    def spend_skill_point(self, count=1):
        if self._data["skill_points"] >= count:
            self._data["skill_points"] -= count
            self._save()
            return True
        return False

    def unlock_skill(self, skill_id, tier):
        if self._data["skills"].get(skill_id):
            return False
        self._data["skills"][skill_id] = {
            "unlocked_at": datetime.now().isoformat(),
            "tier": tier,
        }
        self._save()
        return True

    def is_skill_unlocked(self, skill_id, tier):
        return skill_id in self._data["skills"]

    def record_cheat(self):
        self._data["cheat_count"] += 1
        self._data["no_cheat_this_level"] = False
        self._save()

    def record_overdraft(self):
        self._data["overdraft_count"] += 1
        self._save()

    def add_karma(self, amount):
        max_karma = self._data["karma_max"]
        self._data["karma"] = min(self._data["karma"] + amount, max_karma)
        self._save()
        return self._data["karma"]

    def consume_karma(self, amount):
        current = self._data["karma"]
        self._data["karma"] -= amount
        self._save()
        return current - self._data["karma"], self._data["karma"] < 0

    def refund_karma(self, amount):
        max_karma = self._data["karma_max"]
        self._data["karma"] = min(self._data["karma"] + amount, max_karma)
        self._save()

    def set_detection(self, value):
        self._data["detection"] = value
        self._save()

    def increment_detection(self, delta):
        self._data["detection"] = min(self._data["detection"] + delta, 100.0)
        self._save()

    def increment_turn(self):
        self._data["current_turn"] += 1
        self._save()

    def reset_turn(self):
        self._data["current_turn"] = 0
        self._save()

    def set_turn_limit(self, limit):
        self._data["turn_limit"] = limit
        self._save()

    def mark_realm_completed(self, realm):
        self._data["realm_progress"][realm]["completed"] = True
        self._save()

    def increment_realm_levels_passed(self, realm):
        self._data["realm_progress"][realm]["levels_passed"] += 1
        self._save()

    def mark_boss_defeated(self, boss_id):
        if boss_id not in self._data["bosses_defeated"]:
            self._data["bosses_defeated"].append(boss_id)
            self._save()

    def get_skill_modifiers(self):
        modifiers = {
            "karma_max_bonus": 0,
            "karma_single_max_bonus": 0,
            "karma_recover_multiplier": 1.0,
            "detection_coefficient": 0.5,
            "detection_alpha": 1.8,
            "first_overdraft_skip": False,
            "consecutive_avoid": False,
            "golden_escape": False,
            "mist_fog": False,
            "efficiency_fraud": False,
            "free_cheat_count": 0,
            "refund_bonus": 0.0,
            "hell_hungry_discount": False,
            "heaven_asura_discount": False,
            "boss_skill_reduction": False,
            "reincarnation_buff": False,
            "transcendence_bonus": 0,
            "free_cheat_on_realm_change": False,
        }
        skills = self._data.get("skills", {})
        if "karma_capacity_t1" in skills:
            modifiers["karma_max_bonus"] += 30
        if "karma_capacity_t2a" in skills:
            modifiers["karma_single_max_bonus"] += 30
        if "karma_capacity_t2b" in skills:
            modifiers["karma_recover_multiplier"] = 1.3
        if "karma_capacity_t3a" in skills:
            modifiers["detection_alpha"] = 1.4
        if "karma_capacity_t3b" in skills:
            modifiers["start_karma_bonus"] = 50
        else:
            modifiers["start_karma_bonus"] = 0
        if "stealth_t1" in skills:
            modifiers["detection_coefficient"] = 0.35
        if "stealth_t2a" in skills:
            modifiers["first_overdraft_skip"] = True
        if "stealth_t2b" in skills:
            modifiers["consecutive_avoid"] = True
        if "stealth_t3a" in skills:
            modifiers["golden_escape"] = True
        if "stealth_t3b" in skills:
            modifiers["mist_fog"] = True
        if "cheat_mastery_t2a" in skills:
            modifiers["efficiency_fraud"] = True
        if "cheat_mastery_t3a" in skills:
            modifiers["free_cheat_count"] += 1
        if "cheat_mastery_t3b" in skills:
            modifiers["refund_bonus"] = 0.2
        if "realm_insight_t1a" in skills:
            modifiers["hell_hungry_discount"] = True
        if "realm_insight_t1b" in skills:
            modifiers["heaven_asura_discount"] = True
        if "realm_insight_t2a" in skills:
            modifiers["boss_skill_reduction"] = True
        if "realm_insight_t2b" in skills:
            modifiers["reincarnation_buff"] = True
        if "realm_insight_t3a" in skills:
            modifiers["transcendence_bonus"] -= 0.05
        if "realm_insight_t3b" in skills:
            modifiers["free_cheat_on_realm_change"] = True
        return modifiers

    def get_realm_index(self):
        return REALMS.index(self._data["current_realm"])