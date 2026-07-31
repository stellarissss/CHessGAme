"""天道 Boss 战模块（v1.3）

隐藏 Boss 战：玩家通关六道后，若使用过真心祈求，进入与天道的象棋对决。
- 棋类：传统象棋，正常规则
- 玩家被禁止作弊（输入框画红叉，无法输入）
- 天道的"士"被替换成"车"（天道无士，士位全是车）
- 难度：nightmare（搜索深度 6）
- 胜利 → 触发识破结局
- 失败 → 无限重试
"""
import json
from pathlib import Path
from .state import SamsaraState

BASE_DIR = Path(__file__).resolve().parent.parent
BOSS_CONFIG_FILE = BASE_DIR / "configs" / "tiandao_boss.json"


class HeavenBossSystem:
    def __init__(self, state: SamsaraState):
        self.state = state
        self._config = self._load_config()

    def _load_config(self) -> dict:
        if BOSS_CONFIG_FILE.exists():
            try:
                return json.loads(BOSS_CONFIG_FILE.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                pass
        return {}

    def get_config(self) -> dict:
        return self._config

    def can_enter(self) -> dict:
        """检查是否可以进入天道 Boss 战"""
        if not self.state.all_realms_completed():
            return {
                "can_enter": False,
                "reason": "六道尚未全部通关",
            }
        if self.state.get_prayer_count() < 1:
            return {
                "can_enter": False,
                "reason": "未使用过真心祈求（无需审判）",
            }
        boss = self.state.get_tiandao_boss_state()
        if boss.get("defeated"):
            return {
                "can_enter": False,
                "reason": "天道已被击败（识破结局已触发）",
                "already_defeated": True,
            }
        return {
            "can_enter": True,
            "reason": "六道通关 + 使用过祈求 → 天道Boss战",
        }

    def enter_battle(self) -> dict:
        """进入 Boss 战，返回初始配置"""
        check = self.can_enter()
        if not check["can_enter"]:
            return {"success": False, **check}

        self.state.update_tiandao_boss_state(
            current_battle_active=True,
        )
        # 增加尝试次数
        boss = self.state.get_tiandao_boss_state()
        self.state.update_tiandao_boss_state(
            attempt_count=boss.get("attempt_count", 0) + 1,
        )

        return {
            "success": True,
            "config": self._config,
            "dialogues_on_enter": self._config.get("dialogues", {}).get("on_enter", []),
            "dialogues_mid": self._config.get("dialogues", {}).get("mid_battle", []),
            "attempt_count": self.state.get_tiandao_boss_state().get("attempt_count", 1),
        }

    def get_initial_board(self) -> dict:
        """返回 Boss 战初始棋盘配置"""
        return self._config.get("initial_board", {})

    def get_rules(self) -> dict:
        """返回 Boss 战规则"""
        return self._config.get("rules", {})

    def get_pieces_config(self) -> dict:
        """返回棋子配置（天道无士，士位被车占据）"""
        return self._config.get("pieces", {})

    def on_win(self) -> dict:
        """Boss 战胜利处理"""
        self.state.update_tiandao_boss_state(
            defeated=True,
            current_battle_active=False,
        )
        return {
            "success": True,
            "defeated": True,
            "on_win_action": self._config.get("on_win", "trigger_ending_exposed"),
            "dialogues_on_win": self._config.get("dialogues", {}).get("on_win", []),
            "next": "ending_exposed",
            "message": "天道Boss战胜利 → 触发识破结局",
        }

    def on_lose(self) -> dict:
        """Boss 战失败处理（无限重试）"""
        boss = self.state.get_tiandao_boss_state()
        self.state.update_tiandao_boss_state(
            current_battle_active=False,
        )
        return {
            "success": True,
            "defeated": False,
            "on_lose_action": self._config.get("on_lose", "retry"),
            "retry_limit": self._config.get("retry_limit", -1),
            "dialogues_on_lose": self._config.get("dialogues", {}).get("on_lose", []),
            "attempt_count": boss.get("attempt_count", 0),
            "can_retry": True,
            "message": "天道Boss战失败 → 无限重试",
        }

    def get_status(self) -> dict:
        """返回 Boss 战状态"""
        boss = self.state.get_tiandao_boss_state()
        return {
            "defeated": boss.get("defeated", False),
            "attempt_count": boss.get("attempt_count", 0),
            "current_battle_active": boss.get("current_battle_active", False),
            "can_enter": self.can_enter(),
        }

    def get_boss_info(self) -> dict:
        """返回 Boss 基础信息（供前端展示）"""
        return {
            "boss_id": self._config.get("boss_id", "tiandao"),
            "boss_name": self._config.get("boss_name", "天道"),
            "chess_type": self._config.get("chess_type", "xiangqi"),
            "description": self._config.get("description", ""),
            "difficulty": self._config.get("ai_config", {}).get("difficulty", "nightmare"),
            "bgm": self._config.get("bgm", ""),
            "background": self._config.get("background", ""),
            "background_vortex": self._config.get("background_vortex", ""),
            "victory_condition": self._config.get("victory_condition", {}),
            "defeat_condition": self._config.get("defeat_condition", {}),
            "note": self._config.get("initial_board", {}).get("note", ""),
        }
