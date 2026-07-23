"""
升降道与技能点获取系统 - 道的切换、技能点分配、轮回机制
"""
from typing import Dict, Any, Tuple


class ProgressionSystem:
    """升降道与技能点系统"""

    REALM_ORDER = ["hell", "hungry", "animal", "human", "asura", "heaven"]

    REALM_SKILL_POINTS = {
        "hell": 1,
        "hungry": 1,
        "animal": 2,
        "human": 2,
        "asura": 3,
        "heaven": 3,
    }

    def __init__(self, state_manager, skill_tree):
        self.state_manager = state_manager
        self.skill_tree = skill_tree

    def advance_realm(self) -> Tuple[bool, str]:
        """
        升道（进入下一道）

        Returns:
            (是否成功, 新道名称)
        """
        state = self.state_manager.get_state()
        current_realm = state["current_realm"]

        if current_realm == "heaven":
            return False, "已达到最高道"

        current_index = self.REALM_ORDER.index(current_realm)
        next_realm = self.REALM_ORDER[current_index + 1]

        self.state_manager.set_realm(next_realm)
        self._grant_realm_skill_points(next_realm)

        return True, next_realm

    def regress_realm(self) -> Tuple[bool, str]:
        """
        降道（回到上一道）

        Returns:
            (是否成功, 新道名称)
        """
        state = self.state_manager.get_state()
        current_realm = state["current_realm"]

        if current_realm == "hell":
            return False, "已达到最低道"

        current_index = self.REALM_ORDER.index(current_realm)
        prev_realm = self.REALM_ORDER[current_index - 1]

        self.state_manager.set_realm(prev_realm)

        return True, prev_realm

    def _grant_realm_skill_points(self, realm: str):
        """
        根据道给予技能点
        """
        base_points = self.REALM_SKILL_POINTS.get(realm, 1)

        effects = self.skill_tree.get_effects()
        extra_points = effects.get("extra_skill_points_on_realm_change", 0)

        total_points = base_points + int(extra_points)
        self.state_manager.add_skill_points(total_points)

    def get_realm_skill_points(self, realm: str) -> int:
        """获取道对应的技能点"""
        return self.REALM_SKILL_POINTS.get(realm, 1)

    def get_realm_index(self, realm: str) -> int:
        """获取道在序列中的索引"""
        try:
            return self.REALM_ORDER.index(realm)
        except ValueError:
            return -1

    def get_realm_position(self) -> dict:
        """获取当前道位置信息"""
        state = self.state_manager.get_state()
        current_realm = state["current_realm"]
        index = self.get_realm_index(current_realm)

        return {
            "current_realm": current_realm,
            "current_index": index,
            "total_realms": len(self.REALM_ORDER),
            "can_advance": index < len(self.REALM_ORDER) - 1,
            "can_regress": index > 0,
            "next_realm": self.REALM_ORDER[index + 1] if index < len(self.REALM_ORDER) - 1 else None,
            "prev_realm": self.REALM_ORDER[index - 1] if index > 0 else None,
        }

    def complete_realm(self, realm: str):
        """完成道的所有关卡"""
        state = self.state_manager.get_state()
        completed = state["realm_progress"].get(realm, [])
        all_levels = state["total_levels_per_realm"].get(realm, 5)
        completed = list(range(all_levels))
        self.state_manager.set_realm_progress(realm, completed)

    def check_realm_completion(self, realm: str) -> bool:
        """检查道是否完成"""
        state = self.state_manager.get_state()
        completed = state["realm_progress"].get(realm, [])
        total_levels = state["total_levels_per_realm"].get(realm, 5)
        return len(completed) >= total_levels

    def start_new_game_plus(self):
        """进入 New Game+"""
        state = self.state_manager.get_state()
        current_points = state["skill_points"]

        effects = self.skill_tree.get_effects()
        retain_ratio = effects.get("retain_skill_points_on_reset", 0)

        retained_points = int(current_points * retain_ratio)

        self.state_manager.reset_all()
        self.state_manager.add_skill_points(retained_points)
        self.state_manager.increment_new_game_plus()

    def get_progression_summary(self) -> Dict[str, Any]:
        """获取进度摘要"""
        state = self.state_manager.get_state()

        return {
            "current_realm": state["current_realm"],
            "current_level": state["current_level"],
            "skill_points": state["skill_points"],
            "unlocked_skills_count": len(state["unlocked_skills"]),
            "realm_progress": state["realm_progress"],
            "new_game_plus": state["new_game_plus"],
            "total_cheat_count": state["cheat_count"],
            "no_cheat_levels_count": len(state["no_cheat_levels"]),
        }