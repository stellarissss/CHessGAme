"""
目标判定引擎 - 支持多种胜利条件的判定
"""
from typing import Dict, Any, List, Tuple


class Objective:
    """目标定义"""

    OBJECTIVE_TYPES = [
        "checkmate",
        "capture_count",
        "piece_count",
        "board_coverage",
        "territory_control",
        "life_count",
        "score",
        "time_limit",
        "turn_limit",
        "special_condition",
    ]

    def __init__(self, objective_data: dict):
        self.type = objective_data.get("type", "")
        self.target = objective_data.get("target", 0)
        self.description = objective_data.get("description", "")
        self.current = 0
        self.completed = False

    def update(self, game_state: dict):
        """根据游戏状态更新目标进度"""
        self.current = self._calculate_current(game_state)
        self.completed = self.current >= self.target

    def _calculate_current(self, game_state: dict) -> float:
        """计算当前进度"""
        if self.type == "checkmate":
            return 1 if game_state.get("is_checkmate", False) else 0
        elif self.type == "capture_count":
            return game_state.get("capture_count", 0)
        elif self.type == "piece_count":
            return game_state.get("player_piece_count", 0)
        elif self.type == "board_coverage":
            return game_state.get("board_coverage_percent", 0)
        elif self.type == "territory_control":
            return game_state.get("territory_control_percent", 0)
        elif self.type == "life_count":
            return game_state.get("life_count", 0)
        elif self.type == "score":
            return game_state.get("score", 0)
        elif self.type == "time_limit":
            return game_state.get("remaining_time", 0)
        elif self.type == "turn_limit":
            return game_state.get("remaining_turns", 0)
        elif self.type == "special_condition":
            return 1 if game_state.get("special_condition_met", False) else 0
        return 0

    def get_progress(self) -> Dict[str, Any]:
        """获取目标进度"""
        return {
            "type": self.type,
            "target": self.target,
            "current": self.current,
            "completed": self.completed,
            "description": self.description,
            "progress_percent": min(100, (self.current / max(self.target, 1)) * 100),
        }


class ObjectiveEngine:
    """目标判定引擎"""

    def __init__(self):
        self.objectives = []
        self.main_objective = None
        self.sub_objectives = []

    def load_objectives(self, objectives_data: List[dict]):
        """加载目标配置"""
        self.objectives = []
        self.main_objective = None
        self.sub_objectives = []

        for obj_data in objectives_data:
            objective = Objective(obj_data)
            self.objectives.append(objective)

            if obj_data.get("is_main", True):
                self.main_objective = objective
            else:
                self.sub_objectives.append(objective)

        if not self.main_objective and self.objectives:
            self.main_objective = self.objectives[0]

    def update_all(self, game_state: dict):
        """更新所有目标进度"""
        for objective in self.objectives:
            objective.update(game_state)

    def check_victory(self) -> Tuple[bool, str]:
        """
        检查是否胜利

        Returns:
            (是否胜利, 胜利原因)
        """
        if self.main_objective and self.main_objective.completed:
            return True, self.main_objective.description

        for obj in self.sub_objectives:
            if obj.completed:
                return True, obj.description

        return False, ""

    def check_failure(self) -> Tuple[bool, str]:
        """
        检查是否失败

        Returns:
            (是否失败, 失败原因)
        """
        if self.main_objective:
            if self.main_objective.type == "time_limit" and self.main_objective.current <= 0:
                return True, "时间耗尽"
            if self.main_objective.type == "turn_limit" and self.main_objective.current <= 0:
                return True, "回合耗尽"

        return False, ""

    def get_all_progress(self) -> List[Dict[str, Any]]:
        """获取所有目标进度"""
        return [obj.get_progress() for obj in self.objectives]

    def get_main_objective_progress(self) -> Dict[str, Any]:
        """获取主目标进度"""
        if self.main_objective:
            return self.main_objective.get_progress()
        return {}

    def get_completed_objectives(self) -> List[Objective]:
        """获取已完成的目标"""
        return [obj for obj in self.objectives if obj.completed]

    def has_active_objectives(self) -> bool:
        """检查是否有活跃目标"""
        return len(self.objectives) > 0

    def get_objective_by_type(self, objective_type: str) -> Objective:
        """根据类型获取目标"""
        for obj in self.objectives:
            if obj.type == objective_type:
                return obj
        return None


objective_engine = ObjectiveEngine()