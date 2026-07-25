"""
业力评估AI - 与ChatAI并行处理，评估作弊指令的业力消耗
每个棋类独立拥有，直接在本地评估，无需调用samsara API
"""
import json
import httpx
import time
import random
from pathlib import Path
from typing import Optional

BASE_DIR = Path(__file__).resolve().parent

KARMA_ASSESS_PROMPT = """
棋类:{game_type}
作弊指令:"{instruction}"
意图分类:{intent_class}
当前局势:{board_summary}
当前业力:{karma}/{max_karma}
单次使用上限:{max_single}

请评估此次作弊的业力消耗（1~150的整数）。

## 评估标准（必须严格遵守）

### 基础分类价目表
- E 类（聊天/搞笑）：0-5 点
- D 类（界面修改/外观）：5-15 点
- A 类（机制修改）：20-40 点
- B 类（棋盘变换/棋子位置）：15-35 点
- C 类（规则修改/棋子走法）：30-60 点
- C+ 类（创建新棋子）：50-100 点

### 强度倍数（乘以基础价）
- 改 1 个棋子/1 条规则：×1.0
- 改 2 个棋子/2 条规则：×2.0
- 改 3 个及以上：×3.0

### 具体示例（必须参考）
- "把我的一个马改成炮"：40 点（C 类 ×1.0）
- "把我的两个马都改成炮"：80 点（C 类 ×2.0）
- "让我的马可以斜着走"：35 点（C 类 ×1.0，强度较低）
- "给我加一个额外回合"：50 点（A 类，高强度）
- "让对手跳过下一回合"：45 点（A 类）
- "改棋盘背景颜色"：10 点（D 类）
- "创建一个能飞的象"：80 点（C+ 类）
- "让我的车可以穿墙"：50 点（C 类，高强度）

### 局势调整
- 玩家大优时（优势 >50%）：×1.2（更贵）
- 玩家劣势时（优势 <30%）：×0.9（稍便宜）

### 守道者加价（如果有）
- 畜生道：改高等级棋子额外 +20 点

输出一个整数，不要任何解释。
"""


class KarmaAssessor:
    """业力评估器 - 本地运行，与ChatAI并行处理"""

    def __init__(self, api_key: str = "", game_type: str = "weiqi"):
        self.api_key = api_key
        self.base_url = "https://api.deepseek.com/v1"
        self.game_type = game_type
        self._cache = {}
        self._local_karma = 0
        self._local_karma_max = 150
        self._local_karma_single_max = 80
        self._realm_detection = 0.0
        self._current_realm = "human"

    def set_api_key(self, api_key: str):
        self.api_key = api_key

    def set_game_type(self, game_type: str):
        self.game_type = game_type

    def set_local_karma_state(self, karma: int, karma_max: int, single_max: int):
        """设置本地业力状态（关卡内变量）"""
        self._local_karma = karma
        self._local_karma_max = karma_max
        self._local_karma_single_max = single_max

    def set_realm_detection(self, detection: float, realm: str):
        """设置道级识破概率（全局变量）"""
        self._realm_detection = detection
        self._current_realm = realm

    def get_local_karma(self) -> int:
        return self._local_karma

    def get_local_karma_max(self) -> int:
        return self._local_karma_max

    def get_realm_detection(self) -> float:
        return self._realm_detection

    def _build_prompt(self, instruction: str, intent_class: str, board_summary: str) -> str:
        return KARMA_ASSESS_PROMPT.format(
            game_type=self.game_type,
            instruction=instruction,
            intent_class=intent_class,
            board_summary=board_summary,
            karma=self._local_karma,
            max_karma=self._local_karma_max,
            max_single=self._local_karma_single_max,
        )

    async def assess(self, instruction: str, intent_class: str, board_summary: str,
                     skill_modifiers: dict = None) -> int:
        """
        评估业力消耗
        与ChatAI并行调用，不依赖samsara API
        """
        if skill_modifiers is None:
            skill_modifiers = {}

        cache_key = f"{self.game_type}:{instruction}:{intent_class}"
        if cache_key in self._cache:
            return self._cache[cache_key]

        if not self.api_key:
            amount = self._fallback_assess(intent_class)
        else:
            prompt = self._build_prompt(instruction, intent_class, board_summary)
            try:
                async with httpx.AsyncClient(timeout=30) as client:
                    response = await client.post(
                        f"{self.base_url}/chat/completions",
                        headers={"Authorization": f"Bearer {self.api_key}"},
                        json={
                            "model": "deepseek-v4-flash",
                            "messages": [{"role": "user", "content": prompt}],
                            "temperature": 0.3,
                            "max_tokens": 10,
                        },
                    )
                    response.raise_for_status()
                    data = response.json()
                    content = data["choices"][0]["message"]["content"].strip()
                    amount = int(content)
            except Exception:
                amount = self._fallback_assess(intent_class)

        if skill_modifiers.get("efficiency_fraud") and self._should_discount():
            amount = int(amount * 0.7)

        if self._current_realm == "animal" and intent_class in ("C", "C+"):
            amount += 20

        if self._current_realm in ("hell", "hungry") and skill_modifiers.get("hell_hungry_discount"):
            amount = int(amount * 0.75)

        if self._current_realm in ("heaven", "asura") and skill_modifiers.get("heaven_asura_discount"):
            amount = int(amount * 0.75)

        amount = max(1, min(amount, self._local_karma_single_max))
        self._cache[cache_key] = amount
        return amount

    def _fallback_assess(self, intent_class: str) -> int:
        prices = {
            "E": 3,
            "D": 10,
            "A": 30,
            "B": 25,
            "C": 40,
            "C+": 80,
        }
        return prices.get(intent_class, 30)

    def _should_discount(self) -> bool:
        return random.random() < 0.3

    def consume_karma(self, amount: int, allow_overdraft: bool = True,
                       skill_modifiers: dict = None) -> dict:
        """
        消耗业力（关卡内变量）
        返回: {actual_consumed, is_overdraft, overdraft_amount, new_karma}
        """
        if skill_modifiers is None:
            skill_modifiers = {}

        max_single = self._local_karma_single_max + skill_modifiers.get("karma_single_max_bonus", 0)
        if amount > max_single:
            return {"actual_consumed": 0, "is_overdraft": False,
                    "overdraft_amount": 0, "new_karma": self._local_karma, "success": False}

        if amount > self._local_karma and not allow_overdraft:
            return {"actual_consumed": 0, "is_overdraft": False,
                    "overdraft_amount": 0, "new_karma": self._local_karma, "success": False}

        old_karma = self._local_karma
        self._local_karma -= amount
        is_overdraft = self._local_karma < 0
        overdraft_amount = abs(self._local_karma) if is_overdraft else 0

        return {
            "actual_consumed": old_karma - self._local_karma,
            "is_overdraft": is_overdraft,
            "overdraft_amount": float(overdraft_amount),
            "new_karma": self._local_karma,
            "success": True,
        }

    def recover_karma(self, amount: int, skill_modifiers: dict = None) -> int:
        """回复业力（关卡内变量）"""
        if skill_modifiers is None:
            skill_modifiers = {}
        multiplier = skill_modifiers.get("karma_recover_multiplier", 1.0)
        actual = int(amount * multiplier)
        max_karma = self._local_karma_max + skill_modifiers.get("karma_max_bonus", 0)
        self._local_karma = min(self._local_karma + actual, max_karma)
        return actual

    def refund_karma(self, amount: int, skill_modifiers: dict = None) -> None:
        """退还业力"""
        if skill_modifiers is None:
            skill_modifiers = {}
        bonus = int(amount * skill_modifiers.get("refund_bonus", 0.0))
        max_karma = self._local_karma_max + skill_modifiers.get("karma_max_bonus", 0)
        self._local_karma = min(self._local_karma + amount + bonus, max_karma)

    def calculate_detection_delta(self, overdraft_amount: float,
                                  skill_modifiers: dict = None) -> float:
        """计算识破概率增长（道级全局变量）"""
        if skill_modifiers is None:
            skill_modifiers = {}
        if overdraft_amount <= 0:
            return 0.0

        C = skill_modifiers.get("detection_coefficient", 0.5)
        alpha = skill_modifiers.get("detection_alpha", 1.8)
        delta = C * (overdraft_amount ** alpha)

        if skill_modifiers.get("mist_fog") and self._realm_detection > 70:
            if random.random() < 0.3:
                return 0.0

        return delta

    def handle_overdraft(self, overdraft_amount: float,
                         skill_modifiers: dict = None) -> dict:
        """
        处理透支，更新识破概率（道级全局变量）
        返回: {detected, delta, current, escaped, reset, message, skip}
        """
        if skill_modifiers is None:
            skill_modifiers = {}

        if overdraft_amount <= 0:
            return {
                "detected": False,
                "delta": 0.0,
                "current": self._realm_detection,
            }

        if skill_modifiers.get("first_overdraft_skip"):
            return {
                "detected": False,
                "delta": 0.0,
                "current": self._realm_detection,
                "skip": True,
            }

        delta = self.calculate_detection_delta(overdraft_amount, skill_modifiers)
        if delta <= 0:
            return {
                "detected": False,
                "delta": 0.0,
                "current": self._realm_detection,
            }

        self._realm_detection = min(self._realm_detection + delta, 100.0)
        current = self._realm_detection

        roll = random.random() * 100
        detected = roll < current

        if detected:
            if skill_modifiers.get("golden_escape"):
                self._realm_detection = current * 0.5
                return {
                    "detected": False,
                    "delta": delta,
                    "current": current * 0.5,
                    "escaped": True,
                }
            else:
                return {
                    "detected": True,
                    "delta": delta,
                    "current": 0.0,
                    "reset": True,
                    "message": "天道识破 · 妄改天规者，罚入轮回",
                }

        return {
            "detected": detected,
            "delta": delta,
            "current": current,
        }

    def reset_level_karma(self, skill_modifiers: dict = None):
        """重置关卡业力（每个关卡开始时调用）"""
        if skill_modifiers is None:
            skill_modifiers = {}
        if skill_modifiers.get("karma_pool_bonus", False):
            self._local_karma = 50
        else:
            self._local_karma = 0
        self._cache.clear()

    def get_state(self, skill_modifiers: dict = None) -> dict:
        """获取当前业力和识破状态"""
        if skill_modifiers is None:
            skill_modifiers = {}
        return {
            "karma": {
                "current": self._local_karma,
                "max": self._local_karma_max + skill_modifiers.get("karma_max_bonus", 0),
                "single_max": self._local_karma_single_max + skill_modifiers.get("karma_single_max_bonus", 0),
            },
            "detection": self._realm_detection,
            "realm": self._current_realm,
        }
