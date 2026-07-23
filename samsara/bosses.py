"""
Boss 技能系统 - Boss 定义、技能触发、效果应用
"""
import json
import random
from pathlib import Path
from typing import Dict, Any, List

WORKSPACE_ROOT = Path(__file__).resolve().parent.parent
CONFIGS_DIR = WORKSPACE_ROOT / "configs"
BOSS_DEFINITIONS_FILE = CONFIGS_DIR / "boss_definitions.json"


class BossSkill:
    """Boss 技能"""

    def __init__(self, skill_data: dict):
        self.id = skill_data.get("id", "")
        self.name = skill_data.get("name", "")
        self.description = skill_data.get("description", "")
        self.trigger_type = skill_data.get("trigger_type", "passive")
        self.trigger_condition = skill_data.get("trigger_condition", "")
        self.effect_type = skill_data.get("effect_type", "")
        self.effect_value = skill_data.get("effect_value", 0)
        self.cooldown = skill_data.get("cooldown", 0)
        self.current_cooldown = 0

    def can_trigger(self, game_state: dict = None) -> bool:
        """检查是否可以触发技能"""
        if self.current_cooldown > 0:
            return False

        if self.trigger_type == "passive":
            return True

        if self.trigger_type == "on_turn_start" and game_state:
            return game_state.get("is_ai_turn", False)

        if self.trigger_type == "on_player_action" and game_state:
            return game_state.get("last_action", "") == "player_move"

        if self.trigger_type == "on_capture" and game_state:
            return game_state.get("last_action", "") == "capture"

        if self.trigger_type == "on_karma_consume" and game_state:
            return game_state.get("karma_consumed", 0) > 0

        return False

    def apply_effect(self, game_state: dict = None) -> dict:
        """应用技能效果"""
        result = {
            "skill_id": self.id,
            "skill_name": self.name,
            "effect_type": self.effect_type,
            "effect_value": self.effect_value,
            "message": f"{self.name}: {self.description}",
        }

        if self.effect_type == "reduce_karma_recovery":
            result["modifier"] = {"karma_recovery_multiplier": 1 - self.effect_value}

        elif self.effect_type == "increase_detection_probability":
            result["modifier"] = {"detection_increase": self.effect_value}

        elif self.effect_type == "restrict_player_moves":
            result["modifier"] = {"move_restriction": self.effect_value}

        elif self.effect_type == "force_ai_advantage":
            result["modifier"] = {"ai_advantage_bonus": self.effect_value}

        elif self.effect_type == "random_event":
            result["modifier"] = {"trigger_random_event": True}

        elif self.effect_type == "reduce_max_karma":
            result["modifier"] = {"max_karma_reduction": self.effect_value}

        elif self.effect_type == "steal_karma":
            result["modifier"] = {"karma_steal_amount": self.effect_value}

        elif self.effect_type == "block_cheat":
            result["modifier"] = {"cheat_blocked": True}

        if self.cooldown > 0:
            self.current_cooldown = self.cooldown

        return result

    def tick(self):
        """冷却计时"""
        if self.current_cooldown > 0:
            self.current_cooldown -= 1


class Boss:
    """Boss 定义"""

    def __init__(self, boss_data: dict):
        self.id = boss_data.get("id", "")
        self.name = boss_data.get("name", "")
        self.title = boss_data.get("title", "")
        self.realm = boss_data.get("realm", "")
        self.description = boss_data.get("description", "")
        self.image = boss_data.get("image", "")
        self.initial_detection_probability = boss_data.get("initial_detection_probability", 0)
        self.karma_multiplier = boss_data.get("karma_multiplier", 1.0)
        self.skills = [BossSkill(skill_data) for skill_data in boss_data.get("skills", [])]

    def get_active_skills(self, game_state: dict = None) -> List[BossSkill]:
        """获取当前可以触发的技能"""
        return [skill for skill in self.skills if skill.can_trigger(game_state)]

    def trigger_random_skill(self, game_state: dict = None) -> dict:
        """随机触发一个可用技能"""
        active_skills = self.get_active_skills(game_state)
        if not active_skills:
            return None

        skill = random.choice(active_skills)
        return skill.apply_effect(game_state)

    def tick_all_skills(self):
        """所有技能冷却计时"""
        for skill in self.skills:
            skill.tick()


class BossManager:
    """Boss 管理器"""

    def __init__(self):
        self.boss_definitions = self._load_boss_definitions()
        self.bosses_by_realm = self._index_by_realm()

    def _load_boss_definitions(self) -> list:
        """加载 Boss 定义配置"""
        if BOSS_DEFINITIONS_FILE.exists():
            try:
                data = json.loads(BOSS_DEFINITIONS_FILE.read_text(encoding="utf-8"))
                return data.get("bosses", [])
            except (json.JSONDecodeError, OSError):
                pass
        return self._create_default_bosses()

    def _create_default_bosses(self) -> list:
        """创建默认 Boss 定义"""
        return [
            {
                "id": "boss_hell",
                "name": "阎罗王",
                "title": "地狱主宰",
                "realm": "hell",
                "description": "地狱道之主，掌管众生轮回。他能看穿一切作弊行为。",
                "image": "",
                "initial_detection_probability": 15,
                "karma_multiplier": 0.8,
                "skills": [
                    {
                        "id": "skill_hell_1",
                        "name": "业火凝视",
                        "description": "每当你消耗业力，阎罗王都会增加识破概率。",
                        "trigger_type": "on_karma_consume",
                        "trigger_condition": "",
                        "effect_type": "increase_detection_probability",
                        "effect_value": 5,
                        "cooldown": 0,
                    },
                    {
                        "id": "skill_hell_2",
                        "name": "因果报应",
                        "description": "降低你获得的业力回复。",
                        "trigger_type": "passive",
                        "trigger_condition": "",
                        "effect_type": "reduce_karma_recovery",
                        "effect_value": 0.3,
                        "cooldown": 0,
                    },
                ],
            },
            {
                "id": "boss_hungry",
                "name": "饿鬼修罗",
                "title": "无尽饥渴",
                "realm": "hungry",
                "description": "饿鬼道之主，永远处于饥渴状态，会夺取你的业力。",
                "image": "",
                "initial_detection_probability": 10,
                "karma_multiplier": 0.6,
                "skills": [
                    {
                        "id": "skill_hungry_1",
                        "name": "吞噬业力",
                        "description": "每回合偷取你的业力。",
                        "trigger_type": "on_turn_start",
                        "trigger_condition": "",
                        "effect_type": "steal_karma",
                        "effect_value": 10,
                        "cooldown": 2,
                    },
                    {
                        "id": "skill_hungry_2",
                        "name": "贪婪诅咒",
                        "description": "大幅降低你的最大业力值。",
                        "trigger_type": "passive",
                        "trigger_condition": "",
                        "effect_type": "reduce_max_karma",
                        "effect_value": 30,
                        "cooldown": 0,
                    },
                ],
            },
            {
                "id": "boss_animal",
                "name": "百兽之王",
                "title": "丛林霸主",
                "realm": "animal",
                "description": "畜生道之主，拥有野兽般的直觉，能本能地察觉异常。",
                "image": "",
                "initial_detection_probability": 20,
                "karma_multiplier": 0.9,
                "skills": [
                    {
                        "id": "skill_animal_1",
                        "name": "野兽直觉",
                        "description": "初始识破概率较高。",
                        "trigger_type": "passive",
                        "trigger_condition": "",
                        "effect_type": "increase_detection_probability",
                        "effect_value": 10,
                        "cooldown": 0,
                    },
                    {
                        "id": "skill_animal_2",
                        "name": "狂怒",
                        "description": "当棋子被吃时，野兽会发怒，增加 AI 优势。",
                        "trigger_type": "on_capture",
                        "trigger_condition": "",
                        "effect_type": "force_ai_advantage",
                        "effect_value": 2,
                        "cooldown": 1,
                    },
                ],
            },
            {
                "id": "boss_human",
                "name": "围棋大师",
                "title": "人间棋圣",
                "realm": "human",
                "description": "人道之主，精通各种棋艺，善于布局和预判。",
                "image": "",
                "initial_detection_probability": 5,
                "karma_multiplier": 1.0,
                "skills": [
                    {
                        "id": "skill_human_1",
                        "name": "棋艺洞察",
                        "description": "限制你的部分移动选择。",
                        "trigger_type": "on_player_action",
                        "trigger_condition": "",
                        "effect_type": "restrict_player_moves",
                        "effect_value": 0.5,
                        "cooldown": 2,
                    },
                    {
                        "id": "skill_human_2",
                        "name": "神机妙算",
                        "description": "AI 获得额外优势。",
                        "trigger_type": "passive",
                        "trigger_condition": "",
                        "effect_type": "force_ai_advantage",
                        "effect_value": 1.5,
                        "cooldown": 0,
                    },
                ],
            },
            {
                "id": "boss_asura",
                "name": "阿修罗王",
                "title": "战斗之神",
                "realm": "asura",
                "description": "阿修罗道之主，好战且强大，能强力抵抗作弊行为。",
                "image": "",
                "initial_detection_probability": 25,
                "karma_multiplier": 0.7,
                "skills": [
                    {
                        "id": "skill_asura_1",
                        "name": "修罗天眼",
                        "description": "极高的初始识破概率。",
                        "trigger_type": "passive",
                        "trigger_condition": "",
                        "effect_type": "increase_detection_probability",
                        "effect_value": 15,
                        "cooldown": 0,
                    },
                    {
                        "id": "skill_asura_2",
                        "name": "战吼",
                        "description": "有几率直接阻止你的作弊行为。",
                        "trigger_type": "on_karma_consume",
                        "trigger_condition": "",
                        "effect_type": "block_cheat",
                        "effect_value": 0.3,
                        "cooldown": 3,
                    },
                ],
            },
            {
                "id": "boss_heaven",
                "name": "玉皇大帝",
                "title": "三界至尊",
                "realm": "heaven",
                "description": "天道之主，全知全能，作弊几乎不可能逃脱他的眼睛。",
                "image": "",
                "initial_detection_probability": 30,
                "karma_multiplier": 0.5,
                "skills": [
                    {
                        "id": "skill_heaven_1",
                        "name": "天眼神通",
                        "description": "极高的识破概率加成。",
                        "trigger_type": "passive",
                        "trigger_condition": "",
                        "effect_type": "increase_detection_probability",
                        "effect_value": 20,
                        "cooldown": 0,
                    },
                    {
                        "id": "skill_heaven_2",
                        "name": "天命",
                        "description": "触发随机事件，可能对你不利。",
                        "trigger_type": "on_player_action",
                        "trigger_condition": "",
                        "effect_type": "random_event",
                        "effect_value": 0,
                        "cooldown": 2,
                    },
                    {
                        "id": "skill_heaven_3",
                        "name": "天罚",
                        "description": "大幅降低业力回复。",
                        "trigger_type": "passive",
                        "trigger_condition": "",
                        "effect_type": "reduce_karma_recovery",
                        "effect_value": 0.5,
                        "cooldown": 0,
                    },
                ],
            },
        ]

    def _index_by_realm(self) -> Dict[str, Boss]:
        """按道索引 Boss"""
        result = {}
        for boss_data in self.boss_definitions:
            boss = Boss(boss_data)
            result[boss.realm] = boss
        return result

    def get_boss_by_realm(self, realm: str) -> Boss:
        """根据道获取 Boss"""
        return self.bosses_by_realm.get(realm)

    def get_all_bosses(self) -> List[Boss]:
        """获取所有 Boss"""
        return list(self.bosses_by_realm.values())

    def get_boss_definition(self, boss_id: str) -> dict:
        """获取 Boss 定义数据"""
        for boss_data in self.boss_definitions:
            if boss_data.get("id") == boss_id:
                return boss_data
        return None


boss_manager = BossManager()