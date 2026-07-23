"""
业力系统 - 业力计算、事件回复、透支处理、退还逻辑
"""
import json
from pathlib import Path
from typing import Dict, Any, Tuple

WORKSPACE_ROOT = Path(__file__).resolve().parent.parent
CONFIGS_DIR = WORKSPACE_ROOT / "configs"
KARMA_EVENTS_FILE = CONFIGS_DIR / "karma_events.json"


class KarmaSystem:
    """业力系统"""

    def __init__(self, state_manager):
        self.state_manager = state_manager
        self.events_config = self._load_events_config()

    def _load_events_config(self) -> dict:
        """加载业力事件配置"""
        if KARMA_EVENTS_FILE.exists():
            try:
                return json.loads(KARMA_EVENTS_FILE.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                pass
        return self._create_default_events()

    def _create_default_events(self) -> dict:
        """创建默认业力事件配置"""
        return {
            "xiangqi": {
                "capture": {
                    "pawn": 8,
                    "medium": 15,
                    "rook": 25,
                },
                "check": 20,
                "checkmate": 35,
                "pawn_cross": 10,
                "captured": 5,
            },
            "wuziqi": {
                "three": 10,
                "four": 20,
                "block_three": 8,
                "block_four": 18,
                "double_three": 15,
                "win": 35,
            },
            "weiqi": {
                "capture_small": 10,
                "capture_large": 20,
                "life": 15,
                "corner": 12,
                "endgame_profit": 8,
                "captured": 5,
            },
            "dongwuqi": {
                "capture_normal": 10,
                "capture_overrank": 25,
                "captured": 5,
                "approach": 12,
                "win": 35,
            },
            "tiaoqi": {
                "jump_3": 10,
                "jump_5": 20,
                "home": 15,
                "single_move": 3,
                "all_home": 35,
            },
            "heibaiqi": {
                "flip_small": 8,
                "flip_medium": 15,
                "flip_large": 25,
                "corner": 20,
                "flipped": 5,
                "win": 35,
            },
        }

    def get_state(self) -> dict:
        """返回当前业力状态"""
        state = self.state_manager.get_state()
        return {
            "current_karma": state["karma"],
            "max_karma": state["max_karma"],
            "max_single_karma": state["max_single_karma"],
        }

    def recover(self, game_type: str, event_type: str, event_data: dict = None) -> int:
        """
        根据事件回复业力，使用提高后的值

        Args:
            game_type: 棋类类型（xiangqi/wuziqi/weiqi/dongwuqi/tiaoqi/heibaiqi）
            event_type: 事件类型
            event_data: 事件数据

        Returns:
            实际回复的业力量
        """
        if game_type not in self.events_config:
            return 0

        game_events = self.events_config[game_type]
        
        if event_type == "capture":
            piece_type = event_data.get("piece", "") if event_data else ""
            if piece_type == "pawn" or piece_type == "soldier":
                amount = game_events["capture"].get("pawn", 8)
            elif piece_type == "rook" or piece_type == "chariot":
                amount = game_events["capture"].get("rook", 25)
            else:
                amount = game_events["capture"].get("medium", 15)
        elif event_type == "flip":
            count = event_data.get("count", 0) if event_data else 0
            if count >= 5:
                amount = game_events.get("flip_large", 25)
            elif count >= 3:
                amount = game_events.get("flip_medium", 15)
            else:
                amount = game_events.get("flip_small", 8)
        elif event_type == "jump":
            steps = event_data.get("steps", 0) if event_data else 0
            if steps >= 5:
                amount = game_events.get("jump_5", 20)
            else:
                amount = game_events.get("jump_3", 10)
        elif event_type == "sub_objective":
            amount = event_data.get("value", 15) if event_data else 15
        else:
            amount = game_events.get(event_type, 0)

        if amount <= 0:
            return 0

        state = self.state_manager.get_state()
        current = state["karma"]
        max_karma = state["max_karma"]
        
        actual_recover = min(amount, max_karma - current)
        if actual_recover > 0:
            self.state_manager.modify_karma(actual_recover)

        return actual_recover

    def consume(self, amount: int, allow_overdraft: bool = True) -> Tuple[int, bool, float]:
        """
        消耗业力

        Args:
            amount: 消耗数量
            allow_overdraft: 是否允许透支

        Returns:
            (实际消耗, 是否透支, 透支量)
        """
        state = self.state_manager.get_state()
        current_karma = state["karma"]
        max_single = state["max_single_karma"]

        if amount > max_single:
            return 0, False, 0.0

        if current_karma >= amount:
            self.state_manager.modify_karma(-amount)
            return amount, False, 0.0
        else:
            if allow_overdraft:
                overdraft = amount - current_karma
                self.state_manager.modify_karma(-amount)
                return amount, True, overdraft
            else:
                return 0, False, 0.0

    def refund(self, amount: int) -> None:
        """退还业力（修改失败时）"""
        state = self.state_manager.get_state()
        current = state["karma"]
        max_karma = state["max_karma"]
        
        if current < 0:
            actual_refund = min(amount, abs(current))
            self.state_manager.modify_karma(actual_refund)
            remaining = amount - actual_refund
            if remaining > 0:
                self.state_manager.modify_karma(min(remaining, max_karma - max(current + actual_refund, 0)))
        else:
            self.state_manager.modify_karma(min(amount, max_karma - current))

    def can_cheat(self) -> bool:
        """检查是否可以作弊（业力非负）"""
        state = self.state_manager.get_state()
        return state["karma"] >= 0

    def get_max_available(self) -> int:
        """获取当前可使用的最大业力"""
        state = self.state_manager.get_state()
        return min(state["karma"], state["max_single_karma"])