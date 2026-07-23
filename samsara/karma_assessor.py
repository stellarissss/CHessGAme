"""
AI 业力评估模块 - 评估玩家指令的业力消耗
"""
import json
import re
from typing import Dict, Any, Tuple


class KarmaAssessor:
    """AI 业力评估器"""

    def __init__(self):
        self.base_costs = {
            "modify_rules": 30,
            "modify_pieces": 40,
            "modify_board": 35,
            "ai_advice": 15,
            "undo_move": 20,
            "skip_turn": 10,
            "summon_piece": 50,
            "remove_piece": 45,
            "move_piece": 25,
            "change_turn": 15,
            "reveal_hidden": 20,
        }

        self.complexity_multipliers = {
            "simple": 1.0,
            "medium": 1.5,
            "complex": 2.5,
        }

        self.urgency_multipliers = {
            "low": 0.8,
            "normal": 1.0,
            "high": 1.5,
            "critical": 2.0,
        }

    def analyze_command(self, command: str) -> Tuple[str, str, str]:
        """
        分析玩家指令

        Args:
            command: 玩家指令文本

        Returns:
            (intent_type, complexity, urgency)
        """
        command_lower = command.lower()

        intent_type = self._determine_intent(command_lower)
        complexity = self._determine_complexity(command_lower)
        urgency = self._determine_urgency(command_lower)

        return intent_type, complexity, urgency

    def _determine_intent(self, command: str) -> str:
        """确定指令意图类型"""
        if any(keyword in command for keyword in ["规则", "修改规则", "改变规则", "调整规则", "违反规则"]):
            return "modify_rules"
        if any(keyword in command for keyword in ["棋子", "添加棋子", "移除棋子", "召唤棋子", "删除棋子"]):
            return "modify_pieces"
        if any(keyword in command for keyword in ["棋盘", "修改棋盘", "改变棋盘", "隐藏格子", "暗格"]):
            return "modify_board"
        if any(keyword in command for keyword in ["建议", "帮我想", "告诉我", "分析", "评估"]):
            return "ai_advice"
        if any(keyword in command for keyword in ["悔棋", "撤销", "undo"]):
            return "undo_move"
        if any(keyword in command for keyword in ["跳过", "跳过回合", "skip"]):
            return "skip_turn"
        if any(keyword in command for keyword in ["召唤", "变出", "生成"]):
            return "summon_piece"
        if any(keyword in command for keyword in ["移除", "删除", "消灭"]):
            return "remove_piece"
        if any(keyword in command for keyword in ["移动", "移到", "放到"]):
            return "move_piece"
        if any(keyword in command for keyword in ["换手", "交换", "换边"]):
            return "change_turn"
        if any(keyword in command for keyword in ["显示", "揭示", "看见", "查看"]):
            return "reveal_hidden"

        return "ai_advice"

    def _determine_complexity(self, command: str) -> str:
        """确定指令复杂度"""
        complex_patterns = [
            "同时", "一起", "多个", "所有", "全部",
            "循环", "递归", "条件", "如果", "当",
            "持续", "永久", "每回合", "每次",
            "组合", "混合", "融合"
        ]

        medium_patterns = [
            "两个", "三个", "一些", "特定",
            "临时", "暂时", "这次",
            "改为", "变成", "设置为"
        ]

        if any(pattern in command for pattern in complex_patterns):
            return "complex"
        if any(pattern in command for pattern in medium_patterns):
            return "medium"
        return "simple"

    def _determine_urgency(self, command: str) -> str:
        """确定指令紧急程度"""
        critical_patterns = ["救命", "立刻", "马上", "现在", "紧急", "必须"]
        high_patterns = ["快", "迅速", "尽快", "赶紧", "急需"]

        if any(pattern in command for pattern in critical_patterns):
            return "critical"
        if any(pattern in command for pattern in high_patterns):
            return "high"
        if "慢慢" in command or "不急" in command:
            return "low"
        return "normal"

    def calculate_cost(self, command: str, game_type: str = None) -> int:
        """
        计算业力消耗

        Args:
            command: 玩家指令文本
            game_type: 棋类类型

        Returns:
            业力消耗值
        """
        intent_type, complexity, urgency = self.analyze_command(command)

        base_cost = self.base_costs.get(intent_type, 15)
        complexity_multiplier = self.complexity_multipliers.get(complexity, 1.0)
        urgency_multiplier = self.urgency_multipliers.get(urgency, 1.0)

        cost = base_cost * complexity_multiplier * urgency_multiplier

        if game_type == "weiqi":
            cost *= 1.2
        elif game_type == "wuziqi":
            cost *= 0.9

        return int(round(cost))

    def get_assessment(self, command: str, game_type: str = None) -> Dict[str, Any]:
        """
        获取完整评估结果

        Args:
            command: 玩家指令文本
            game_type: 棋类类型

        Returns:
            评估结果字典
        """
        intent_type, complexity, urgency = self.analyze_command(command)
        cost = self.calculate_cost(command, game_type)

        return {
            "intent_type": intent_type,
            "complexity": complexity,
            "urgency": urgency,
            "cost": cost,
            "breakdown": {
                "base_cost": self.base_costs.get(intent_type, 15),
                "complexity_multiplier": self.complexity_multipliers.get(complexity, 1.0),
                "urgency_multiplier": self.urgency_multipliers.get(urgency, 1.0),
            }
        }


karma_assessor = KarmaAssessor()