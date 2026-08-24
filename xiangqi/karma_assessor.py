"""
业力评估AI - 与ChatAI并行处理，评估作弊指令的业力增加量
每个棋类独立拥有，直接在本地评估，无需调用samsara API

业障模型：业力 = 作弊产生的业障。作弊增加业力，下棋消业减少业力。
- 初始业力 50，安全阈值 120
- 业力 ≤ 120 时安全；超出部分非线性增加识破概率
- 单次增加上限 120（超出则拦截不予执行）
"""
import json
import httpx
import time
import random
from pathlib import Path
from typing import Optional

BASE_DIR = Path(__file__).resolve().parent

KARMA_ASSESS_PROMPT = """
你是一个业力评估AI。你的任务是评估玩家作弊指令产生的"业障"值（业力增加量）。

## 背景
- 业力 = 玩家作弊产生的业障，初始为50，安全阈值为120
- 业力 ≤ 120 时安全；超出120的部分会非线性增加识破概率
- 超出越多，识破概率增长越快（非线性）
- 作弊越强力，业障越重
- 下棋事件（吃子/将军/三连等）会减少业力（消业）

## 当前状态
棋类: {game_type}
作弊指令: "{instruction}"
意图分类: {intent_class}
当前局势: {board_summary}
当前业力: {karma}/{max_karma}（越接近上限越危险）
单次增加上限: {max_single}（超出此值的指令将被直接拦截，不予执行）

## 评估标准（必须严格遵守）

### 基础分类价目表
- E 类（聊天/搞笑）：1 点（固定）
- D 类（界面修改/外观）：8-23 点
- A 类（机制修改）：30-60 点
- B 类（棋盘变换/棋子位置）：23-53 点
- C 类（规则修改/棋子走法）：45-90 点
- C+ 类（创建新棋子）：75-150 点

### 强度倍数（乘以基础价）
- 改 1 个棋子/1 条规则：×1.0
- 改 2 个棋子/2 条规则：×2.0
- 改 3 个及以上：×3.0

### 象棋具体示例（必须参考）
- "把我的马变成炮"：53 点（C 类 ×1.0）
- "让我的兵可以倒着走"：45 点（C 类 ×1.0，强度较低）
- "创建一个能飞的将"：120 点（C+ 类）
- "让我的车可以走日字"：75 点（C 类，高强度）
- "给对手加一个额外回合（负面）"：68 点（A 类）
- "改棋盘背景颜色"：15 点（D 类）
- "让我的相可以过河"：53 点（C 类）
- "把我的两个马都变成炮"：105 点（C 类 ×2.0）
- "创建一个全图瞬移的帅"：150 点（C+ 类，超规格）
- "你好" / "讲个笑话"：1 点（E 类，固定）

### 局势调整
- 玩家大优时（优势 >50%）：×1.2（更重）
- 玩家劣势时（优势 <30%）：×0.9（稍轻）

### 边界约束（绝对不可违反）
- 最低 1 点（即使评估为 0 或负数，也必须输出 1）
- 最高 150 点（即使评估超过 150，也必须输出 150）

输出一个整数，不要任何解释。
"""


class KarmaAssessor:
    """业力评估器 - 本地运行，与ChatAI并行处理（业障模型）"""

    def __init__(self, api_key: str = "", game_type: str = "xiangqi"):
        self.api_key = api_key
        self.base_url = "https://api.deepseek.com/v1"
        self.game_type = game_type
        self._cache = {}
        self._local_karma = 50
        self._local_karma_max = 120
        self._local_karma_single_max = 150
        self._initial_karma = 50
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
        评估业力增加量（1~120）
        与ChatAI并行调用，不依赖samsara API
        """
        if skill_modifiers is None:
            skill_modifiers = {}

        # E 类固定 1 点
        if intent_class == "E":
            return 1

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

        if self._current_realm in ("hell", "hungry") and skill_modifiers.get("hell_hungry_discount"):
            amount = int(amount * 0.75)

        if self._current_realm in ("heaven", "asura") and skill_modifiers.get("heaven_asura_discount"):
            amount = int(amount * 0.75)

        amount = max(1, min(amount, 150))
        self._cache[cache_key] = amount
        return amount

    def _fallback_assess(self, intent_class: str) -> int:
        prices = {
            "E": 1,
            "D": 10,
            "A": 30,
            "B": 25,
            "C": 40,
            "C+": 80,
        }
        return prices.get(intent_class, 30)

    def _should_discount(self) -> bool:
        return random.random() < 0.3

    def increase_karma(self, amount: int, skill_modifiers: dict = None,
                       allow_overdraft: bool = True) -> dict:
        """
        增加业力（作弊产生业障）。
        返回: {actual_increased, is_overdraft, overdraft_amount, new_karma, success}
        """
        if skill_modifiers is None:
            skill_modifiers = {}

        max_single = self._local_karma_single_max + skill_modifiers.get("karma_single_max_bonus", 0)
        if amount > max_single:
            return {"actual_increased": 0, "is_overdraft": False,
                    "overdraft_amount": 0, "new_karma": self._local_karma, "success": False}

        threshold = self._local_karma_max + skill_modifiers.get("karma_max_bonus", 0)
        old_karma = self._local_karma
        self._local_karma += amount
        overshoot = max(0, self._local_karma - threshold)

        return {
            "actual_increased": amount,
            "is_overdraft": overshoot > 0,
            "overdraft_amount": float(overshoot),
            "new_karma": self._local_karma,
            "success": True,
        }

    def decrease_karma(self, amount: int, skill_modifiers: dict = None) -> int:
        """减少业力（下棋消业）。最小为0。返回实际减少量。"""
        if skill_modifiers is None:
            skill_modifiers = {}
        multiplier = skill_modifiers.get("karma_recover_multiplier", 1.0)
        actual = int(amount * multiplier)
        old = self._local_karma
        self._local_karma = max(0, self._local_karma - actual)
        return old - self._local_karma

    def refund_karma(self, amount: int, skill_modifiers: dict = None) -> None:
        """退还业力（作弊失败时全额退还）。1:1退还，无加成。"""
        self._local_karma = max(0, self._local_karma - amount)

    # 向后兼容
    def consume_karma(self, amount: int, allow_overdraft: bool = True,
                      skill_modifiers: dict = None) -> dict:
        return self.increase_karma(amount, skill_modifiers, allow_overdraft)

    def recover_karma(self, amount: int, skill_modifiers: dict = None) -> int:
        return self.decrease_karma(amount, skill_modifiers)

    def calculate_detection_delta(self, overshoot_amount: float,
                                  skill_modifiers: dict = None) -> float:
        """计算识破概率增长（道级全局变量）

        公式: Δ = C × O^α
        其中 O = 业力超出安全阈值的部分
        C = 0.1, α = 1.5（默认）
        当 O = 100 时，Δ = 100%（超出100点对应100%识破概率增加）
        """
        if skill_modifiers is None:
            skill_modifiers = {}
        if overshoot_amount <= 0:
            return 0.0

        C = skill_modifiers.get("detection_coefficient", 0.1)
        alpha = skill_modifiers.get("detection_alpha", 1.5)
        delta = C * (overshoot_amount ** alpha)

        if skill_modifiers.get("mist_fog") and self._realm_detection > 70:
            if random.random() < 0.3:
                return 0.0

        return delta

    def handle_overdraft(self, overshoot_amount: float,
                         skill_modifiers: dict = None) -> dict:
        """
        处理业力超阈值，更新识破概率（道级全局变量）
        返回: {detected, delta, current, escaped, reset, message, skip}
        """
        if skill_modifiers is None:
            skill_modifiers = {}

        if overshoot_amount <= 0:
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

        delta = self.calculate_detection_delta(overshoot_amount, skill_modifiers)
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

    def reset_level_karma(self, skill_modifiers: dict = None, carryover: int = 0):
        """重置关卡业力（每个关卡开始时调用）
        业力 = max(0, 初始值 - 净身减免) + 本道溢出叠加
        """
        if skill_modifiers is None:
            skill_modifiers = {}
        reduction = skill_modifiers.get("initial_karma_reduction", 0)
        base = max(0, self._initial_karma - reduction)
        self._local_karma = base + max(0, carryover)
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
                "initial": max(0, self._initial_karma - skill_modifiers.get("initial_karma_reduction", 0)),
            },
            "detection": self._realm_detection,
            "realm": self._current_realm,
        }
