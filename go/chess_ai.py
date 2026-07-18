"""
围棋AI引擎 - 使用Minimax + Alpha-Beta剪枝
评估函数考虑：位置价值、气的数量、连通性、五连威胁、提子数
"""
import json
import re
import random
import copy
from typing import Dict, Any, List, Tuple, Optional
from rule_engine import RuleEngine

POSITION_VALUES = {
    (0, 0): 200, (0, 2): 100, (0, 3): 80, (0, 4): 60, (0, 5): 40,
    (0, 9): 40, (0, 13): 40, (0, 14): 60, (0, 15): 80, (0, 16): 100, (0, 18): 200,
    (2, 0): 100, (2, 2): 80, (2, 3): 60, (2, 4): 50, (2, 5): 30,
    (2, 9): 30, (2, 13): 30, (2, 14): 50, (2, 15): 60, (2, 16): 80, (2, 18): 100,
    (3, 0): 80, (3, 2): 60, (3, 3): 50, (3, 4): 40, (3, 5): 25,
    (3, 9): 25, (3, 13): 25, (3, 14): 40, (3, 15): 50, (3, 16): 60, (3, 18): 80,
    (9, 0): 40, (9, 2): 30, (9, 3): 25, (9, 4): 20, (9, 5): 15,
    (9, 9): 10, (9, 13): 15, (9, 14): 20, (9, 15): 25, (9, 16): 30, (9, 18): 40,
    (15, 0): 80, (15, 2): 60, (15, 3): 50, (15, 4): 40, (15, 5): 25,
    (15, 9): 25, (15, 13): 25, (15, 14): 40, (15, 15): 50, (15, 16): 60, (15, 18): 80,
    (16, 0): 100, (16, 2): 80, (16, 3): 60, (16, 4): 50, (16, 5): 30,
    (16, 9): 30, (16, 13): 30, (16, 14): 50, (16, 15): 60, (16, 16): 80, (16, 18): 100,
    (18, 0): 200, (18, 2): 100, (18, 3): 80, (18, 4): 60, (18, 5): 40,
    (18, 9): 40, (18, 13): 40, (18, 14): 60, (18, 15): 80, (18, 16): 100, (18, 18): 200,
}


class GoAI:
    """围棋AI引擎"""

    def __init__(self, board: dict, pieces_red: dict, pieces_black: dict, rules: dict, difficulty: str = "medium", api_key: str = "", base_url: str = "https://api.deepseek.com/v1", token_stats_callback=None):
        self.rule_engine = RuleEngine(board, pieces_red, pieces_black, rules)
        self.difficulty = difficulty
        self.api_key = api_key
        self.base_url = base_url
        self._token_stats_callback = token_stats_callback

        levels = rules.get("ai_difficulty", {}).get("levels", {})
        level_cfg = levels.get(difficulty, levels.get("medium", {}))
        self.depth = level_cfg.get("depth", 3)
        self.randomness = level_cfg.get("randomness", 0.1)

        self.personality_aggressiveness = 0.5
        self.personality_conservatism = 0.5

    def set_difficulty(self, difficulty: str):
        """设置难度"""
        self.difficulty = difficulty
        if difficulty == "easy":
            self.depth = 2
            self.randomness = 0.3
        elif difficulty == "medium":
            self.depth = 3
            self.randomness = 0.1
        else:
            self.depth = 4
            self.randomness = 0.0

    def set_api_key(self, api_key: str):
        """更新API密钥"""
        self.api_key = api_key

    def get_best_move(self, board_state: dict) -> Optional[Dict[str, Any]]:
        """
        获取AI的最佳落子

        Returns:
            {"piece_id": str, "from": None, "to": [x,y], "captured": list|None}
        """
        side = board_state.get("current_turn", "black")

        if self.randomness > 0 and random.random() < self.randomness:
            move = self._get_random_move(board_state, side)
            if move:
                return move

        best_move = None
        best_score = float("-inf")
        alpha = float("-inf")
        beta = float("inf")

        moves = self._generate_all_moves(board_state, side)

        if not moves:
            return None

        moves.sort(key=lambda m: self._move_score(m, board_state), reverse=True)

        for move in moves:
            new_state = self._simulate_move(board_state, move)
            score = self._minimax(new_state, self.depth - 1, alpha, beta, False, side)
            if score > best_score:
                best_score = score
                best_move = move
            alpha = max(alpha, score)

        return best_move

    def _get_random_move(self, board_state: dict, side: str) -> Optional[dict]:
        """随机选择一个合法落子"""
        moves = self._generate_all_moves(board_state, side)
        if not moves:
            return None
        return random.choice(moves)

    def _generate_all_moves(
        self, board_state: dict, side: str
    ) -> List[Dict[str, Any]]:
        """生成某方所有合法落子"""
        moves = []
        valid_positions = self.rule_engine.get_valid_moves(board_state, side)
        for pos in valid_positions:
            moves.append({
                "piece_id": None,
                "from": None,
                "to": pos,
                "captured": [],
            })
        return moves

    def _simulate_move(self, board_state: dict, move: dict) -> dict:
        """模拟落子，返回新的棋盘状态"""
        new_state = self.rule_engine.place_stone(
            board_state, move["to"][0], move["to"][1], board_state.get("current_turn", "black")
        )
        new_state["current_turn"] = "white" if new_state["current_turn"] == "black" else "black"
        return new_state

    def _move_score(self, move: dict, board_state: dict) -> int:
        """评估落子的即时价值（用于排序）"""
        score = 0
        x, y = move["to"]

        score += self._get_position_value(x, y)

        test_state = self.rule_engine.place_stone(
            board_state, x, y, board_state.get("current_turn", "black")
        )

        captures = test_state.get("captures", {})
        side = board_state.get("current_turn", "black")
        score += captures.get(side, 0) * 50

        if self.rule_engine.check_five_in_a_row(test_state) == side:
            score += 10000

        return score

    def _minimax(
        self,
        board_state: dict,
        depth: int,
        alpha: float,
        beta: float,
        is_max: bool,
        ai_side: str,
    ) -> float:
        """Minimax + Alpha-Beta剪枝"""
        winner = self.rule_engine.check_five_in_a_row(board_state)
        if winner:
            return 100000 if winner == ai_side else -100000

        if depth == 0:
            return self._evaluate(board_state, ai_side)

        current_side = board_state.get("current_turn", "black")
        moves = self._generate_all_moves(board_state, current_side)

        if not moves:
            return -5000 if current_side == ai_side else 5000

        if is_max:
            max_eval = float("-inf")
            for move in moves:
                new_state = self._simulate_move(board_state, move)
                eval_score = self._minimax(
                    new_state, depth - 1, alpha, beta, False, ai_side
                )
                max_eval = max(max_eval, eval_score)
                alpha = max(alpha, eval_score)
                if beta <= alpha:
                    break
            return max_eval
        else:
            min_eval = float("inf")
            for move in moves:
                new_state = self._simulate_move(board_state, move)
                eval_score = self._minimax(
                    new_state, depth - 1, alpha, beta, True, ai_side
                )
                min_eval = min(min_eval, eval_score)
                beta = min(beta, eval_score)
                if beta <= alpha:
                    break
            return min_eval

    def _evaluate(self, board_state: dict, ai_side: str) -> float:
        """评估棋盘局面"""
        score = 0.0
        agg = getattr(self, "personality_aggressiveness", 0.5)
        cons = getattr(self, "personality_conservatism", 0.5)

        black_count = 0
        white_count = 0
        black_liberties = 0
        white_liberties = 0
        black_groups = []
        white_groups = []
        visited = set()

        for p in board_state.get("pieces", []):
            if not p.get("is_alive", True):
                continue

            px, py = p["position"]
            if (px, py) in visited:
                continue

            group = self.rule_engine._get_group(board_state, px, py)
            group_liberties = self.rule_engine._count_liberties(board_state, group)

            for gp in group:
                visited.add((gp["position"][0], gp["position"][1]))

            if p["side"] == "black":
                black_count += len(group)
                black_liberties += group_liberties
                black_groups.append((len(group), group_liberties))
            else:
                white_count += len(group)
                white_liberties += group_liberties
                white_groups.append((len(group), group_liberties))

        captures = board_state.get("captures", {})
        black_captures = captures.get("black", 0)
        white_captures = captures.get("white", 0)

        score += (black_count - white_count) * 10
        score += (black_liberties - white_liberties) * 5
        score += (black_captures - white_captures) * 50

        for size, libs in black_groups:
            if libs == 0:
                score -= size * 100
            elif libs == 1:
                score -= size * 50 * cons
            elif libs >= 2:
                score += size * libs * 2

        for size, libs in white_groups:
            if libs == 0:
                score += size * 100
            elif libs == 1:
                score += size * 50 * cons
            elif libs >= 2:
                score -= size * libs * 2

        for p in board_state.get("pieces", []):
            if not p.get("is_alive", True):
                continue

            px, py = p["position"]
            pos_value = self._get_position_value(px, py)
            if p["side"] == ai_side:
                score += pos_value
            else:
                score -= pos_value

        threat_score = self._evaluate_threats(board_state, ai_side)
        score += threat_score

        return score

    def _evaluate_threats(self, board_state: dict, ai_side: str) -> float:
        """评估五连威胁"""
        score = 0.0

        for x in range(self.rule_engine._get_width()):
            for y in range(self.rule_engine._get_height()):
                piece = self.rule_engine._get_piece_at([x, y], board_state)
                if not piece:
                    continue

                for dx, dy in [(1, 0), (0, 1), (1, 1), (1, -1)]:
                    line_count = 1
                    open_ends = 0

                    for step in range(1, 5):
                        nx, ny = x + dx * step, y + dy * step
                        if not self.rule_engine._in_bounds(nx, ny):
                            break
                        p = self.rule_engine._get_piece_at([nx, ny], board_state)
                        if not p:
                            open_ends += 1
                            break
                        if p["side"] != piece["side"]:
                            break
                        line_count += 1

                    for step in range(1, 5):
                        nx, ny = x - dx * step, y - dy * step
                        if not self.rule_engine._in_bounds(nx, ny):
                            break
                        p = self.rule_engine._get_piece_at([nx, ny], board_state)
                        if not p:
                            open_ends += 1
                            break
                        if p["side"] != piece["side"]:
                            break
                        line_count += 1

                    threat_value = {
                        5: 10000,
                        4: {2: 2000, 1: 500, 0: 100}[min(open_ends, 2)],
                        3: {2: 300, 1: 50, 0: 10}[min(open_ends, 2)],
                        2: {2: 20, 1: 5, 0: 1}[min(open_ends, 2)],
                    }.get(line_count, 0)

                    if piece["side"] == ai_side:
                        score += threat_value
                    else:
                        score -= threat_value

        return score

    def _get_position_value(self, x: int, y: int) -> int:
        """获取位置价值"""
        if (x, y) in POSITION_VALUES:
            return POSITION_VALUES[(x, y)]

        dist_to_edge = min(x, 18 - x, y, 18 - y)
        if dist_to_edge == 0:
            return 100
        elif dist_to_edge == 1:
            return 60
        elif dist_to_edge == 2:
            return 40
        elif dist_to_edge == 3:
            return 30
        elif dist_to_edge == 4:
            return 20
        else:
            return 10

    async def precompute_custom_piece_values(self):
        """预计算自定义棋子价值（围棋中不使用）"""
        pass