import json
import asyncio
import httpx
from pathlib import Path
from .state import SamsaraState

BASE_DIR = Path(__file__).resolve().parent.parent
CONFIG_FILE = BASE_DIR / "config.json"

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
    def __init__(self, state: SamsaraState):
        self.state = state
        self._api_key = self._load_api_key()
        self._cache = {}

    def _load_api_key(self):
        if CONFIG_FILE.exists():
            try:
                config = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
                return config.get("api_key", "")
            except (json.JSONDecodeError, OSError):
                pass
        return ""

    def set_api_key(self, api_key):
        self._api_key = api_key

    def _build_prompt(self, game_type, instruction, intent_class, board_summary):
        karma_state = self.state.get("karma", 0)
        max_karma = self.state.get("karma_max", 150)
        max_single = self.state.get("karma_single_max", 80)
        modifiers = self.state.get_skill_modifiers()
        max_karma += modifiers["karma_max_bonus"]
        max_single += modifiers["karma_single_max_bonus"]
        return KARMA_ASSESS_PROMPT.format(
            game_type=game_type,
            instruction=instruction,
            intent_class=intent_class,
            board_summary=board_summary,
            karma=karma_state,
            max_karma=max_karma,
            max_single=max_single,
        )

    async def assess(self, game_type: str, instruction: str, intent_class: str, board_summary: str) -> int:
        cache_key = f"{game_type}:{instruction}:{intent_class}"
        if cache_key in self._cache:
            return self._cache[cache_key]
        if not self._api_key:
            return self._fallback_assess(intent_class)
        prompt = self._build_prompt(game_type, instruction, intent_class, board_summary)
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(
                    "https://api.deepseek.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {self._api_key}"},
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
                modifiers = self.state.get_skill_modifiers()
                if modifiers["efficiency_fraud"] and self._should_discount():
                    amount = int(amount * 0.7)
                current_realm = self.state.get("current_realm")
                if current_realm == "animal" and intent_class in ("C", "C+"):
                    amount += 20
                if current_realm in ("hell", "hungry") and modifiers["hell_hungry_discount"]:
                    amount = int(amount * 0.75)
                if current_realm in ("heaven", "asura") and modifiers["heaven_asura_discount"]:
                    amount = int(amount * 0.75)
                self._cache[cache_key] = amount
                return max(1, amount)
        except Exception:
            return self._fallback_assess(intent_class)

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
        import random
        return random.random() < 0.3