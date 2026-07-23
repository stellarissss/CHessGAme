"""
技能树系统 - 技能定义、解锁、效果应用、技能点管理
"""
import json
from pathlib import Path
from typing import Dict, Any, List

WORKSPACE_ROOT = Path(__file__).resolve().parent.parent
CONFIGS_DIR = WORKSPACE_ROOT / "configs"
SKILL_TREE_FILE = CONFIGS_DIR / "skill_tree.json"


class Skill:
    """技能定义"""

    def __init__(self, skill_data: dict):
        self.id = skill_data.get("id", "")
        self.name = skill_data.get("name", "")
        self.description = skill_data.get("description", "")
        self.branch = skill_data.get("branch", "")
        self.level = skill_data.get("level", 1)
        self.cost = skill_data.get("cost", 1)
        self.prerequisites = skill_data.get("prerequisites", [])
        self.effect_type = skill_data.get("effect_type", "")
        self.effect_value = skill_data.get("effect_value", 0)
        self.effect_description = skill_data.get("effect_description", "")

    def can_unlock(self, unlocked_skills: List[str]) -> bool:
        """检查是否可以解锁（前提技能已解锁）"""
        for prereq in self.prerequisites:
            if prereq not in unlocked_skills:
                return False
        return True


class SkillTree:
    """技能树系统"""

    BRANCHES = ["karma", "stealth", "cheat", "realm"]
    BRANCH_NAMES = {
        "karma": "业力精通",
        "stealth": "潜行之术",
        "cheat": "作弊大师",
        "realm": "六道洞察",
    }

    def __init__(self, state_manager):
        self.state_manager = state_manager
        self.skill_definitions = self._load_skill_tree()
        self.skills_by_id = self._index_by_id()
        self.skills_by_branch = self._index_by_branch()

    def _load_skill_tree(self) -> list:
        """加载技能树配置"""
        if SKILL_TREE_FILE.exists():
            try:
                data = json.loads(SKILL_TREE_FILE.read_text(encoding="utf-8"))
                return data.get("skills", [])
            except (json.JSONDecodeError, OSError):
                pass
        return self._create_default_skills()

    def _create_default_skills(self) -> list:
        """创建默认技能定义"""
        return [
            {
                "id": "karma_1",
                "name": "业力储备",
                "description": "增加最大业力值。",
                "branch": "karma",
                "level": 1,
                "cost": 1,
                "prerequisites": [],
                "effect_type": "max_karma",
                "effect_value": 30,
                "effect_description": "最大业力 +30",
            },
            {
                "id": "karma_2",
                "name": "业力回复",
                "description": "增加业力回复速度。",
                "branch": "karma",
                "level": 2,
                "cost": 1,
                "prerequisites": ["karma_1"],
                "effect_type": "karma_recovery_rate",
                "effect_value": 0.2,
                "effect_description": "业力回复 +20%",
            },
            {
                "id": "karma_3",
                "name": "业力爆发",
                "description": "单次可消耗更多业力。",
                "branch": "karma",
                "level": 3,
                "cost": 2,
                "prerequisites": ["karma_2"],
                "effect_type": "max_single_karma",
                "effect_value": 40,
                "effect_description": "单次最大消耗 +40",
            },
            {
                "id": "karma_4",
                "name": "业力循环",
                "description": "允许业力略微透支而不增加识破。",
                "branch": "karma",
                "level": 4,
                "cost": 2,
                "prerequisites": ["karma_3"],
                "effect_type": "safe_overdraft",
                "effect_value": 10,
                "effect_description": "安全透支上限 +10",
            },
            {
                "id": "stealth_1",
                "name": "隐蔽",
                "description": "降低基础识破概率。",
                "branch": "stealth",
                "level": 1,
                "cost": 1,
                "prerequisites": [],
                "effect_type": "detection_reduction",
                "effect_value": 5,
                "effect_description": "识破概率 -5%",
            },
            {
                "id": "stealth_2",
                "name": "暗影",
                "description": "降低透支惩罚系数。",
                "branch": "stealth",
                "level": 2,
                "cost": 1,
                "prerequisites": ["stealth_1"],
                "effect_type": "overdraft_coefficient",
                "effect_value": 0.15,
                "effect_description": "透支惩罚系数 -15%",
            },
            {
                "id": "stealth_3",
                "name": "伪装",
                "description": "每次作弊后有几率不增加识破概率。",
                "branch": "stealth",
                "level": 3,
                "cost": 2,
                "prerequisites": ["stealth_2"],
                "effect_type": "detection_avoid_chance",
                "effect_value": 0.2,
                "effect_description": "20% 几率避免识破增加",
            },
            {
                "id": "stealth_4",
                "name": "无形",
                "description": "完全隐藏作弊行为，识破概率归零。",
                "branch": "stealth",
                "level": 4,
                "cost": 3,
                "prerequisites": ["stealth_3"],
                "effect_type": "detection_reset",
                "effect_value": 0.1,
                "effect_description": "10% 几率识破概率归零",
            },
            {
                "id": "cheat_1",
                "name": "初级作弊",
                "description": "降低简单作弊的业力消耗。",
                "branch": "cheat",
                "level": 1,
                "cost": 1,
                "prerequisites": [],
                "effect_type": "cheat_cost_reduction",
                "effect_value": 0.1,
                "effect_description": "简单作弊消耗 -10%",
            },
            {
                "id": "cheat_2",
                "name": "中级作弊",
                "description": "降低中等作弊的业力消耗。",
                "branch": "cheat",
                "level": 2,
                "cost": 1,
                "prerequisites": ["cheat_1"],
                "effect_type": "cheat_cost_reduction",
                "effect_value": 0.15,
                "effect_description": "中等作弊消耗 -15%",
            },
            {
                "id": "cheat_3",
                "name": "高级作弊",
                "description": "降低复杂作弊的业力消耗。",
                "branch": "cheat",
                "level": 3,
                "cost": 2,
                "prerequisites": ["cheat_2"],
                "effect_type": "cheat_cost_reduction",
                "effect_value": 0.2,
                "effect_description": "复杂作弊消耗 -20%",
            },
            {
                "id": "cheat_4",
                "name": "终极作弊",
                "description": "AI 生成的作弊方案更加高效。",
                "branch": "cheat",
                "level": 4,
                "cost": 3,
                "prerequisites": ["cheat_3"],
                "effect_type": "cheat_efficiency",
                "effect_value": 0.3,
                "effect_description": "作弊效果 +30%",
            },
            {
                "id": "realm_1",
                "name": "六道感知",
                "description": "进入新道时获得额外技能点。",
                "branch": "realm",
                "level": 1,
                "cost": 1,
                "prerequisites": [],
                "effect_type": "extra_skill_points_on_realm_change",
                "effect_value": 1,
                "effect_description": "换道时额外获得 1 技能点",
            },
            {
                "id": "realm_2",
                "name": "天道祝福",
                "description": "天道关卡获得额外业力回复。",
                "branch": "realm",
                "level": 2,
                "cost": 1,
                "prerequisites": ["realm_1"],
                "effect_type": "heaven_karma_bonus",
                "effect_value": 0.3,
                "effect_description": "天道业力回复 +30%",
            },
            {
                "id": "realm_3",
                "name": "地狱抗性",
                "description": "降低地狱道的识破惩罚。",
                "branch": "realm",
                "level": 3,
                "cost": 2,
                "prerequisites": ["realm_2"],
                "effect_type": "hell_detection_reduction",
                "effect_value": 0.25,
                "effect_description": "地狱道识破惩罚 -25%",
            },
            {
                "id": "realm_4",
                "name": "轮回掌控",
                "description": "新轮回时保留部分技能点。",
                "branch": "realm",
                "level": 4,
                "cost": 3,
                "prerequisites": ["realm_3"],
                "effect_type": "retain_skill_points_on_reset",
                "effect_value": 0.3,
                "effect_description": "新轮回保留 30% 技能点",
            },
        ]

    def _index_by_id(self) -> Dict[str, Skill]:
        """按 ID 索引技能"""
        result = {}
        for skill_data in self.skill_definitions:
            skill = Skill(skill_data)
            result[skill.id] = skill
        return result

    def _index_by_branch(self) -> Dict[str, List[Skill]]:
        """按分支索引技能"""
        result = {branch: [] for branch in self.BRANCHES}
        for skill_data in self.skill_definitions:
            skill = Skill(skill_data)
            if skill.branch in result:
                result[skill.branch].append(skill)
        return result

    def unlock_skill(self, skill_id: str) -> bool:
        """
        解锁技能

        Args:
            skill_id: 技能 ID

        Returns:
            是否成功解锁
        """
        skill = self.skills_by_id.get(skill_id)
        if not skill:
            return False

        state = self.state_manager.get_state()
        unlocked = state["unlocked_skills"]

        if skill_id in unlocked:
            return False

        if not skill.can_unlock(unlocked):
            return False

        if state["skill_points"] < skill.cost:
            return False

        self.state_manager.spend_skill_points(skill.cost)
        self.state_manager.unlock_skill(skill_id)

        return True

    def get_skill(self, skill_id: str) -> Skill:
        """获取技能"""
        return self.skills_by_id.get(skill_id)

    def get_all_skills(self) -> List[Skill]:
        """获取所有技能"""
        return list(self.skills_by_id.values())

    def get_skills_by_branch(self, branch: str) -> List[Skill]:
        """获取指定分支的技能"""
        return self.skills_by_branch.get(branch, [])

    def get_unlocked_skills(self) -> List[Skill]:
        """获取已解锁技能"""
        state = self.state_manager.get_state()
        unlocked_ids = state["unlocked_skills"]
        return [skill for skill in self.get_all_skills() if skill.id in unlocked_ids]

    def get_effects(self) -> Dict[str, Any]:
        """获取所有已解锁技能的效果"""
        effects = {}
        for skill in self.get_unlocked_skills():
            if skill.effect_type not in effects:
                effects[skill.effect_type] = 0
            effects[skill.effect_type] += skill.effect_value
        return effects

    def can_unlock_skill(self, skill_id: str) -> bool:
        """检查技能是否可以解锁"""
        skill = self.skills_by_id.get(skill_id)
        if not skill:
            return False

        state = self.state_manager.get_state()
        unlocked = state["unlocked_skills"]

        if skill_id in unlocked:
            return False

        if not skill.can_unlock(unlocked):
            return False

        if state["skill_points"] < skill.cost:
            return False

        return True


skill_tree = SkillTree(None)