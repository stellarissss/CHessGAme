"""
围棋AI下棋引擎 v1.0 - 启发式评估 + 贪心搜索
核心设计：地盘评估 + 提子价值 + 位置影响 + 性格系统
"""
import json
import re
import random
import copy
from typing import Dict, Any, List, Tuple, Optional
from rule_engine import RuleEngine


class GoAI:
    """围棋AI下棋引擎"""

    def __init__(self, board: dict, pieces_white: dict, pieces_black: dict, rules: dict,
                 difficulty: str = "medium", api_key: str = "",
                 base_url: str = "https://api.deepseek.com/v1", token_stats_callback=None):
        self.rule_engine = RuleEngine(board, pieces_white, pieces_black, rules)
        self.difficulty = difficulty
        self._pieces_by_side = {
            "white": pieces_white,
            "black": pieces_black,
        }
        self._custom_pieces_by_side = {
            "white": pieces_white.get("custom_pieces", []),
            "black": pieces_black.get("custom_pieces", []),
        }
        self.custom_pieces = pieces_white.get("custom_pieces", []) + pieces_black.get("custom_pieces", [])
        self.api_key = api_key
        self.base_url = base_url
        self._token_stats_callback = token_stats_callback

        levels = rules.get("ai_difficulty", {}).get("levels", {})
        level_cfg = levels.get(difficulty, levels.get("medium", {}))
        self.depth = level_cfg.get("depth", 2)
        self.randomness = level_cfg.get("randomness", 0.2)

        self.personality_aggressiveness = 0.5
        self.personality_conservatism = 0.5
        self.personality_value_biases: Dict[str, float] = {}

        self._width = board.get("geometry", {}).get("width", 19)
        self._height = board.get("geometry", {}).get("height", 19)

    def set_difficulty(self, difficulty: str):
        """设置难度"""
        self.difficulty = difficulty
        if difficulty == "easy":
            self.depth = 1
            self.randomness = 0.5
        elif difficulty == "medium":
            self.depth = 2
            self.randomness = 0.2
        else:
            self.depth = 2
            self.randomness = 0.0

    def set_personality(self, personality: dict):
        """设置AI性格参数"""
        self.personality_aggressiveness = personality.get("aggressiveness", 0.5)
        self.personality_conservatism = personality.get("conservatism", 0.5)
        self.personality_value_biases = personality.get("value_biases", {})

    def set_api_key(self, api_key: str):
        """更新API密钥"""
        self.api_key = api_key

    def get_best_move(self, board_state: dict) -> Optional[Dict[str, Any]]:
        """
        获取AI的最佳落子

        Returns:
            {"position": [x, y], "move_type": "place|pass", "captured_count": int}
        """
        side = board_state.get("current_turn", "black")

        valid_moves = self.rule_engine.get_valid_moves(side, board_state)

        if not valid_moves:
            return {"position": None, "move_type": "pass", "captured_count": 0}

        if self.randomness > 0 and random.random() < self.randomness:
            move = random.choice(valid_moves)
            return {"position": move, "move_type": "place", "captured_count": 0}

        scored_moves = []
        for move in valid_moves:
            score = self._evaluate_move(move[0], move[1], side, board_state)
            scored_moves.append((move, score))

        scored_moves.sort(key=lambda x: x[1], reverse=True)

        top_k = max(1, min(5, len(scored_moves) // 10))
        if self.randomness > 0.1:
            top_moves = scored_moves[:top_k]
            best_move = random.choice(top_moves)[0]
        else:
            best_move = scored_moves[0][0]

        _, info = self.rule_engine.place_stone(best_move[0], best_move[1], side, board_state)

        return {
            "position": best_move,
            "move_type": "place",
            "captured_count": info.get("captured_count", 0),
        }

    def _evaluate_move(self, x: int, y: int, side: str, board_state: dict) -> float:
        """评估一个落子的价值"""
        score = 0.0
        agg = self.personality_aggressiveness
        cons = self.personality_conservatism

        new_state, info = self.rule_engine.place_stone(x, y, side, board_state)
        if not info.get("is_valid", True):
            return -9999

        captured_count = info.get("captured_count", 0)
        score += captured_count * 100 * (0.5 + agg)

        my_group = self.rule_engine._get_group(x, y, new_state)
        my_liberties = self.rule_engine._count_liberties_of_group(my_group, new_state)
        if my_liberties <= 2:
            score -= (3 - my_liberties) * 30 * (0.5 + cons)

        enemy_side = "white" if side == "black" else "black"
        for dx, dy in [(1, 0), (-1, 0), (0, 1), (0, -1)]:
            nx, ny = x + dx, y + dy
            if not self.rule_engine._in_bounds(nx, ny):
                continue
            enemy = self.rule_engine._get_piece_at(nx, ny, board_state)
            if enemy and enemy["side"] == enemy_side:
                enemy_group = self.rule_engine._get_group(nx, ny, board_state)
                enemy_lib_before = self.rule_engine._count_liberties_of_group(enemy_group, board_state)
                enemy_group_after = self.rule_engine._get_group(nx, ny, new_state)
                enemy_lib_after = self.rule_engine._count_liberties_of_group(enemy_group_after, new_state)
                lib_reduction = enemy_lib_before - enemy_lib_after
                score += lib_reduction * 15 * (0.5 + agg)

        territory_score = self._territory_influence(x, y, side, board_state)
        score += territory_score * 2

        center_x = self._width / 2.0
        center_y = self._height / 2.0
        dist_to_center = abs(x - center_x) + abs(y - center_y)
        edge_bonus = (dist_to_center / (self._width + self._height)) * 10
        score += edge_bonus

        star_points = self.rule_engine.board_config.get("geometry", {}).get("star_points", [])
        for sp in star_points:
            if abs(x - sp[0]) <= 1 and abs(y - sp[1]) <= 1:
                score += 5

        if captured_count > 0:
            ko_point = info.get("ko_point_new")
            if ko_point:
                score -= 20 * cons

        return score

    def _territory_influence(self, x: int, y: int, side: str, board_state: dict) -> float:
        """评估落子对地盘的影响力（简化版）"""
        influence = 0.0
        radius = 3

        for dx in range(-radius, radius + 1):
            for dy in range(-radius, radius + 1):
                nx, ny = x + dx, y + dy
                if not self.rule_engine._in_bounds(nx, ny):
                    continue
                if not self.rule_engine._is_empty(nx, ny, board_state):
                    continue

                dist = abs(dx) + abs(dy)
                if dist > radius:
                    continue

                influence += (radius - dist) / radius * 1.0

        enemy_side = "white" if side == "black" else "black"
        enemy_influence = 0.0
        for p in board_state.get("pieces", []):
            if not p.get("is_alive", True):
                continue
            if p["side"] != enemy_side:
                continue
            px, py = p["position"]
            dist = abs(x - px) + abs(y - py)
            if dist <= radius:
                enemy_influence += (radius - dist) / radius * 0.5

        return influence - enemy_influence

    async def generate_move_explanation(self, move: dict, board_state: dict) -> str:
        """生成AI落子的解释"""
        if not self.api_key:
            return ""

        side = board_state.get("current_turn", "black")
        pos = move.get("position")

        system_prompt = """你是围棋AI解说员。用简洁生动的语言解释这步棋的意图。

输出要求：
- 只输出一句话解释（20-50字）
- 用围棋术语（如：打入、浅消、围空、收官、防守等）
- 语气自然，像职业棋手解说"""

        user_prompt = f"""当前棋局：第{len(board_state.get('move_history', [])) + 1}手
执棋方：{'黑方' if side == 'black' else '白方'}
落子位置：{pos}（坐标从0开始，x列y行）

请解释这步棋的意图。"""

        try:
            import httpx
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            }
            payload = {
                "model": "deepseek-v4-flash",
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "temperature": 0.7,
                "max_tokens": 100,
            }
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(
                    f"{self.base_url}/chat/completions", headers=headers, json=payload
                )
                resp.raise_for_status()
                data = resp.json()
                if self._token_stats_callback and 'usage' in data:
                    try:
                        self._token_stats_callback(data['usage'])
                    except Exception:
                        pass
                return data["choices"][0]["message"]["content"].strip()
        except Exception:
            return ""

    def _get_random_move(self, board_state: dict, side: str) -> Optional[list]:
        """随机选择一个合法落子"""
        valid = self.rule_engine.get_valid_moves(side, board_state)
        if not valid:
            return None
        return random.choice(valid)
