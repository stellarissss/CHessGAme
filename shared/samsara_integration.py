"""
六道众生 - 共享集成模块
为各棋类提供业力事件上报、回合限制、目标判定等统一接口
"""
import json
import sys
from pathlib import Path
from typing import Dict, Any, Optional

WORKSPACE_ROOT = Path(__file__).resolve().parent.parent
SAMSARA_DIR = WORKSPACE_ROOT / "samsara"
if str(SAMSARA_DIR) not in sys.path:
    sys.path.insert(0, str(SAMSARA_DIR))

from state import SamsaraState
from karma import KarmaSystem
from detection import DetectionSystem
from levels import LevelManager
from objectives import ObjectiveEngine
from turn_limit import TurnLimitSystem


class SamsaraIntegration:
    """六道众生集成器"""

    GAME_TYPE_MAP = {
        "xiangqi": "xiangqi",
        "wuziqi": "wuziqi",
        "weiqi": "weiqi",
        "dongwuqi": "dongwuqi",
        "tiaoqi": "tiaoqi",
        "heibaiqi": "heibaiqi",
    }

    def __init__(self, game_type: str):
        self.game_type = self.GAME_TYPE_MAP.get(game_type, game_type)
        self.state_manager = SamsaraState()
        self.karma_system = KarmaSystem(self.state_manager)
        self.detection_system = DetectionSystem(self.state_manager)
        self.level_manager = LevelManager(self.state_manager)
        self.objective_engine = ObjectiveEngine()
        self.turn_limit_system = TurnLimitSystem(self.level_manager)

        self.level_manager.state_manager = self.state_manager

    def record_karma_event(self, event_type: str, event_data: dict = None) -> int:
        """
        上报业力事件，获得业力回复

        Args:
            event_type: 事件类型
            event_data: 事件数据

        Returns:
            获得的业力量
        """
        return self.karma_system.recover(self.game_type, event_type, event_data)

    def consume_karma(self, amount: int, allow_overdraft: bool = True) -> dict:
        """
        消耗业力（用于作弊）

        Args:
            amount: 消耗数量
            allow_overdraft: 是否允许透支

        Returns:
            结果字典
        """
        actual_cost, is_overdraft, overdraft_amount = self.karma_system.consume(amount, allow_overdraft)

        if actual_cost == 0:
            return {
                "success": False,
                "message": "业力不足",
            }

        is_detected = False
        detection_delta = 0.0

        if is_overdraft and overdraft_amount > 0:
            is_detected, detection_delta = self.detection_system.apply_overdraft_penalty(overdraft_amount)

        self.state_manager.increment_cheat_count()

        return {
            "success": True,
            "cost": actual_cost,
            "is_overdraft": is_overdraft,
            "overdraft_amount": overdraft_amount,
            "is_detected": is_detected,
            "detection_increase": detection_delta,
            "new_detection_probability": self.detection_system.get_current_probability(),
            "new_karma": self.karma_system.get_state()["current_karma"],
        }

    def refund_karma(self, amount: int):
        """退还业力（作弊失败时）"""
        self.karma_system.refund(amount)

    def get_samsara_state(self) -> dict:
        """获取轮回状态"""
        return self.state_manager.get_state()

    def get_karma_state(self) -> dict:
        """获取业力状态"""
        return self.karma_system.get_state()

    def get_detection_probability(self) -> float:
        """获取识破概率"""
        return self.detection_system.get_current_probability()

    def start_level(self, realm: str = None, level_index: int = None) -> dict:
        """开始关卡"""
        level = self.level_manager.start_level(realm, level_index)
        if not level:
            return {"success": False, "message": "关卡不存在"}

        self.turn_limit_system.initialize(level.turn_limit)
        self.objective_engine.load_objectives(level.objectives)

        return {
            "success": True,
            "level": self.level_manager.get_level_summary(),
            "turn_limit": self.turn_limit_system.get_turn_info(),
        }

    def on_player_turn(self) -> dict:
        """玩家回合结束时调用"""
        self.turn_limit_system.on_player_turn()
        is_timeout, remaining = self.turn_limit_system.check_timeout()

        if is_timeout:
            return {
                **self.turn_limit_system.get_turn_info(),
                "game_over": True,
                "reason": "turn_limit_exceeded",
            }

        return self.turn_limit_system.get_turn_info()

    def get_turn_info(self) -> dict:
        """获取回合信息"""
        return self.turn_limit_system.get_turn_info()

    def update_objectives(self, game_state: dict) -> dict:
        """更新目标进度"""
        self.objective_engine.update_all(game_state)

        victory, victory_reason = self.objective_engine.check_victory()
        failure, failure_reason = self.objective_engine.check_failure()

        return {
            "victory": victory,
            "victory_reason": victory_reason,
            "failure": failure,
            "failure_reason": failure_reason,
            "objectives": self.objective_engine.get_all_progress(),
        }

    def check_victory(self) -> tuple:
        """检查是否胜利"""
        return self.objective_engine.check_victory()

    def check_failure(self) -> tuple:
        """检查是否失败"""
        return self.objective_engine.check_failure()

    def get_objective_progress(self) -> list:
        """获取目标进度"""
        return self.objective_engine.get_all_progress()

    def record_capture(self, piece_type: str = "") -> int:
        """
        记录吃子事件

        Args:
            piece_type: 棋子类型（pawn/medium/rook 等）

        Returns:
            获得的业力量
        """
        return self.record_karma_event("capture", {"piece": piece_type})

    def record_check(self) -> int:
        """记录将军事件"""
        return self.record_karma_event("check")

    def record_checkmate(self) -> int:
        """记录将死事件"""
        return self.record_karma_event("checkmate")

    def record_win(self) -> int:
        """记录胜利事件"""
        return self.record_karma_event("win")

    def record_captured(self) -> int:
        """记录被吃事件"""
        return self.record_karma_event("captured")

    def record_jump(self, steps: int) -> int:
        """记录跳跃事件（跳棋）"""
        return self.record_karma_event("jump", {"steps": steps})

    def record_flip(self, count: int) -> int:
        """记录翻转事件（黑白棋）"""
        return self.record_karma_event("flip", {"count": count})

    def record_sub_objective(self, value: int = 15) -> int:
        """记录子目标完成"""
        return self.record_karma_event("sub_objective", {"value": value})

    def reset_level_state(self):
        """重置关卡状态"""
        self.state_manager.reset_level_state()

    def advance_to_next_level(self) -> dict:
        """进入下一关卡"""
        success, level = self.level_manager.advance_to_next_level()
        if not success:
            return {"success": False, "message": "本道已完成"}

        self.turn_limit_system.initialize(level.turn_limit)
        self.objective_engine.load_objectives(level.objectives)

        return {
            "success": True,
            "level": self.level_manager.get_level_summary(),
        }

    def get_level_summary(self) -> dict:
        """获取当前关卡摘要"""
        return self.level_manager.get_level_summary()

    def is_last_level(self) -> bool:
        """检查是否是最后一关"""
        return self.level_manager.is_last_level()


def get_samsara_integration(game_type: str) -> SamsaraIntegration:
    """获取指定棋类的轮回集成器"""
    return SamsaraIntegration(game_type)