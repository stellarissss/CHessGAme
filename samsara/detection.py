"""
识破概率系统 - 仅透支时增加识破概率
"""
import random
from typing import Tuple


class DetectionSystem:
    """识破概率系统"""

    def __init__(self, state_manager):
        self.state_manager = state_manager
        self.C = 0.5
        self.alpha = 1.8

    def calculate_delta(self, overdraft_amount: float) -> float:
        """
        计算识破概率增量，仅当透支时 > 0

        公式：Δ识破概率(%) = C × O^α（C = 0.5, α = 1.8）
        返回值为百分比增量（如 5.0 表示增加5%）
        """
        if overdraft_amount <= 0:
            return 0.0
        return min(100.0, self.C * (overdraft_amount ** self.alpha))

    def check(self, current_detection: float) -> bool:
        """
        识破判定

        Args:
            current_detection: 当前识破概率（0-100）

        Returns:
            是否被识破
        """
        if current_detection >= 100:
            return True
        roll = random.uniform(0, 100)
        return roll < current_detection

    def apply_overdraft_penalty(self, overdraft_amount: float) -> Tuple[bool, float]:
        """
        应用透支惩罚

        Args:
            overdraft_amount: 透支量

        Returns:
            (是否被识破, 识破概率增量)
        """
        delta = self.calculate_delta(overdraft_amount)
        if delta <= 0:
            return False, 0.0

        self.state_manager.record_overdraft(overdraft_amount)
        self.state_manager.modify_detection_probability(delta)
        
        new_prob = self.state_manager.get_state()["detection_probability"]
        is_detected = self.check(new_prob)
        
        return is_detected, delta

    def get_current_probability(self) -> float:
        """获取当前识破概率"""
        return self.state_manager.get_state().get("detection_probability", 0.0)

    def set_coefficients(self, C: float = None, alpha: float = None):
        """设置惩罚系数"""
        if C is not None:
            self.C = C
        if alpha is not None:
            self.alpha = alpha