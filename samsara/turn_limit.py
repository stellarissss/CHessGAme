"""
回合限制系统 - 20回合限制、倒计时管理、超时判定
"""
from typing import Dict, Any, Tuple


class TurnLimitSystem:
    """回合限制系统"""

    DEFAULT_TURN_LIMIT = 20

    def __init__(self, level_manager):
        self.level_manager = level_manager
        self.remaining_turns = self.DEFAULT_TURN_LIMIT
        self.total_turns = self.DEFAULT_TURN_LIMIT
        self.current_turn = 0

    def initialize(self, turn_limit: int = None):
        """初始化回合限制"""
        if turn_limit is None:
            level = self.level_manager.get_current_level()
            if level:
                self.total_turns = level.turn_limit
            else:
                self.total_turns = self.DEFAULT_TURN_LIMIT
        else:
            self.total_turns = turn_limit

        self.remaining_turns = self.total_turns
        self.current_turn = 0

    def start_new_level(self):
        """开始新关卡时重置"""
        self.initialize()

    def on_player_turn(self):
        """玩家回合结束后触发"""
        self.current_turn += 1
        self.remaining_turns -= 1

    def on_ai_turn(self):
        """AI回合结束后触发（可选）"""
        pass

    def check_timeout(self) -> Tuple[bool, int]:
        """
        检查是否超时

        Returns:
            (是否超时, 剩余回合数)
        """
        return self.remaining_turns <= 0, self.remaining_turns

    def get_turn_info(self) -> Dict[str, Any]:
        """获取回合信息"""
        return {
            "current_turn": self.current_turn,
            "remaining_turns": self.remaining_turns,
            "total_turns": self.total_turns,
            "turn_progress": (self.current_turn / max(self.total_turns, 1)) * 100,
            "remaining_percent": (self.remaining_turns / max(self.total_turns, 1)) * 100,
            "is_timeout": self.remaining_turns <= 0,
        }

    def add_turns(self, count: int):
        """增加回合数"""
        self.remaining_turns += count
        if self.remaining_turns > self.total_turns:
            self.remaining_turns = self.total_turns

    def remove_turns(self, count: int):
        """减少回合数"""
        self.remaining_turns -= count
        if self.remaining_turns < 0:
            self.remaining_turns = 0

    def is_critical(self, threshold: int = 5) -> bool:
        """检查是否处于危急状态（剩余回合数少于阈值）"""
        return self.remaining_turns <= threshold