"""
AI下棋引擎 - Minimax + Alpha-Beta剪枝 + 性能优化
优化项：
  1. make/unmake 增量更新替代 deepcopy
  2. Zobrist 置换表
  3. 棋盘2D索引 O(1) 查找
  4. 静默搜索（Quiescence Search）
  5. 迭代加深 + 时间管理
  6. Killer moves + 历史启发走法排序
  7. 评估函数缓存将帅位置
"""
import json
import re
import random
import time
from typing import Dict, Any, List, Tuple, Optional
from rule_engine import RuleEngine

# 棋子价值表
PIECE_VALUES = {
    "general": 10000,
    "chariot": 900,
    "cannon": 450,
    "horse": 400,
    "elephant": 200,
    "advisor": 200,
    "soldier": 100,
}

# 兵位置加成表（红方视角，黑方翻转）
SOLDIER_POS_BONUS = [
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [70, 90, 110, 130, 140, 130, 110, 90, 70],  # 过河后
    [70, 90, 110, 130, 140, 130, 110, 90, 70],
    [70, 90, 110, 130, 140, 130, 110, 90, 70],
    [20, 30, 40, 50, 60, 50, 40, 30, 20],
    [20, 24, 28, 32, 36, 32, 28, 24, 20],
]


class ChessAI:
    """AI下棋引擎"""

    def __init__(self, board: dict, pieces_red: dict, pieces_black: dict, rules: dict, difficulty: str = "medium", api_key: str = "", base_url: str = "https://api.deepseek.com/v1", token_stats_callback=None):
        self.rule_engine = RuleEngine(board, pieces_red, pieces_black, rules)
        self.difficulty = difficulty
        self._pieces_by_side = {
            "red": pieces_red,
            "black": pieces_black,
        }
        self._custom_pieces_by_side = {
            "red": pieces_red.get("custom_pieces", []),
            "black": pieces_black.get("custom_pieces", []),
        }
        self.custom_pieces = pieces_red.get("custom_pieces", []) + pieces_black.get("custom_pieces", [])
        self.api_key = api_key
        self.base_url = base_url
        self._custom_piece_values: Dict[str, int] = {}
        self._token_stats_callback = token_stats_callback

        levels = rules.get("ai_difficulty", {}).get("levels", {})
        level_cfg = levels.get(difficulty, levels.get("medium", {}))
        self.depth = level_cfg.get("depth", 3)
        self.randomness = level_cfg.get("randomness", 0.1)

        self.personality_aggressiveness = 0.5
        self.personality_conservatism = 0.5
        self.personality_value_biases: Dict[str, float] = {}

        # --- 性能优化数据结构 ---
        self._board_width = board.get("geometry", {}).get("width", 9)
        self._board_height = board.get("geometry", {}).get("height", 10)
        self._max_time = 5.0  # 最大搜索时间（秒）
        self._start_time = 0.0
        self._node_count = 0
        self._time_up = False  # 时间到标志，用于快速终止搜索

        # Zobrist 置换表
        self._zobrist_table: Dict[str, List[int]] = {}
        self._transposition_table: Dict[int, Tuple[float, int, Optional[dict]]] = {}
        self._init_zobrist()

        # Killer moves [depth][2]
        self._killer_moves: Dict[int, List[Optional[dict]]] = {}
        # 历史启发表
        self._history_table: Dict[str, int] = {}

    def _init_zobrist(self):
        """初始化 Zobrist 随机数表"""
        rng = random.Random(42)  # 固定种子保证可复现
        for ptype in list(PIECE_VALUES.keys()) + [cp.get("type", "unknown") for cp in self.custom_pieces]:
            for side in ("red", "black"):
                for x in range(self._board_width):
                    for y in range(self._board_height):
                        key = f"{ptype}_{side}_{x}_{y}"
                        # 使用64位随机数
                        self._zobrist_table[key] = rng.getrandbits(63)

    def _compute_zobrist(self, board_state: dict) -> int:
        """计算当前局面的 Zobrist 哈希"""
        h = 0
        for p in board_state.get("pieces", []):
            if not p.get("is_alive", True):
                continue
            px, py = p["position"]
            key = f"{p['type']}_{p['side']}_{px}_{py}"
            h ^= self._zobrist_table.get(key, 0)
        return h

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
        """更新API密钥（无需重建引擎）"""
        self.api_key = api_key

    def get_best_move(self, board_state: dict) -> Optional[Dict[str, Any]]:
        """
        获取AI的最佳移动

        Returns:
            {"piece_id": str, "from": [x,y], "to": [x,y], "captured": str|None}
        """
        side = board_state.get("current_turn", "black")

        # 预计算自定义棋子价值（兜底）
        for cp in self.custom_pieces:
            cp_type = cp.get("type")
            if cp_type and cp_type not in self._custom_piece_values:
                self._heuristic_custom_piece_value(cp)

        # 构建棋盘索引（必须在随机走棋之前，因为_generate_all_moves依赖它）
        self._build_board_index(board_state)

        # 简单难度可能随机走
        if self.randomness > 0 and random.random() < self.randomness:
            move = self._get_random_move(board_state, side)
            if move:
                self.rule_engine._ai_board_index = None
                return move

        self._start_time = time.time()
        self._node_count = 0
        self._time_up = False
        self._transposition_table.clear()
        self._killer_moves.clear()
        self._history_table.clear()

        moves = self._generate_all_moves(board_state, side)
        if not moves:
            return None

        # 走法排序
        self._order_moves(moves, board_state, 0)

        best_move = None

        # 迭代加深
        for current_depth in range(1, self.depth + 1):
            alpha = float("-inf")
            beta = float("inf")
            local_best_move = None
            local_best_score = float("-inf")

            for move in moves:
                # make move
                undo = self._make_move(board_state, move)
                score = self._minimax(board_state, current_depth - 1, alpha, beta, False, side)
                # unmake move
                self._unmake_move(board_state, move, undo)

                if score > local_best_score:
                    local_best_score = score
                    local_best_move = move
                alpha = max(alpha, score)

                # 时间到则中断当前层搜索
                if self._time_up:
                    break

            if local_best_move:
                best_move = local_best_move

            # 时间到则停止迭代加深
            if self._time_up:
                break

            # 将最佳走法移到前面（PV优先）
            if best_move and best_move in moves:
                moves.remove(best_move)
                moves.insert(0, best_move)

        # 清理棋盘索引，避免后续 rule_engine 调用使用过期索引
        self.rule_engine._ai_board_index = None

        return best_move

    def _build_board_index(self, board_state: dict):
        """构建棋盘2D索引，O(1)查找棋子"""
        self._board_index = {}
        self._piece_dict = {}
        self._generals = []  # 缓存将帅引用，避免每节点遍历全部棋子
        for p in board_state.get("pieces", []):
            if p.get("is_alive", True):
                px, py = p["position"]
                self._board_index[(px, py)] = p
            self._piece_dict[p["id"]] = p
            if p["type"] in self.rule_engine._king_types:
                self._generals.append(p)
        # 将索引设置到 rule_engine 实例上（不污染 board_state，避免JSON序列化失败）
        self.rule_engine._ai_board_index = self._board_index

    def _get_random_move(self, board_state: dict, side: str) -> Optional[dict]:
        """随机选择一个合法移动"""
        moves = self._generate_all_moves(board_state, side)
        if not moves:
            return None
        return random.choice(moves)

    def _generate_all_moves(
        self, board_state: dict, side: str
    ) -> List[Dict[str, Any]]:
        """生成某方所有合法移动"""
        moves = []
        for p in board_state.get("pieces", []):
            if not p.get("is_alive", True):
                continue
            if p["side"] != side:
                continue
            valid = self.rule_engine.get_valid_moves(p, board_state)
            for pos in valid:
                target = self._board_index.get((pos[0], pos[1]))
                moves.append(
                    {
                        "piece_id": p["id"],
                        "from": list(p["position"]),
                        "to": pos,
                        "captured": target["id"] if target else None,
                    }
                )
        return moves

    def _make_move(self, board_state: dict, move: dict) -> dict:
        """
        增量执行移动（make），返回 undo 信息用于回退
        比 deepcopy 快 10-50 倍
        """
        piece = self._piece_dict[move["piece_id"]]
        old_pos = list(piece["position"])
        piece["position"] = list(move["to"])

        # 更新索引
        self._board_index.pop((old_pos[0], old_pos[1]), None)
        self._board_index[(move["to"][0], move["to"][1])] = piece

        captured_piece = None
        if move.get("captured"):
            captured_piece = self._piece_dict[move["captured"]]
            captured_piece["is_alive"] = False
            # 从索引移除被吃棋子
            cx, cy = captured_piece["position"]
            if (cx, cy) in self._board_index:
                del self._board_index[(cx, cy)]

        # 切换回合
        old_turn = board_state.get("current_turn", "red")
        board_state["current_turn"] = "red" if old_turn == "black" else "black"

        return {
            "piece_id": move["piece_id"],
            "old_pos": old_pos,
            "captured_id": move.get("captured"),
            "old_turn": old_turn,
        }

    def _unmake_move(self, board_state: dict, move: dict, undo: dict):
        """回退移动（unmake）"""
        piece = self._piece_dict[undo["piece_id"]]
        # 恢复位置
        current_pos = list(piece["position"])
        piece["position"] = undo["old_pos"]

        # 更新索引
        self._board_index.pop((current_pos[0], current_pos[1]), None)
        self._board_index[(undo["old_pos"][0], undo["old_pos"][1])] = piece

        # 恢复被吃棋子
        if undo["captured_id"]:
            captured_piece = self._piece_dict[undo["captured_id"]]
            captured_piece["is_alive"] = True
            cx, cy = captured_piece["position"]
            self._board_index[(cx, cy)] = captured_piece

        # 恢复回合
        board_state["current_turn"] = undo["old_turn"]

    def _order_moves(self, moves: List[dict], board_state: dict, depth: int):
        """走法排序：吃子优先 + killer moves + 历史启发"""
        def move_key(m):
            score = 0
            # 吃子价值
            if m.get("captured"):
                captured = self._piece_dict.get(m["captured"])
                if captured:
                    pt = captured["type"]
                    score += PIECE_VALUES.get(pt, self._custom_piece_values.get(pt, 200))
            # killer move 奖励
            killers = self._killer_moves.get(depth, [])
            for i, km in enumerate(killers):
                if km and km.get("piece_id") == m.get("piece_id") and km.get("to") == m.get("to"):
                    score += 500 - i * 100
            return score

        moves.sort(key=move_key, reverse=True)

    def _minimax(
        self,
        board_state: dict,
        depth: int,
        alpha: float,
        beta: float,
        is_max: bool,
        ai_side: str,
    ) -> float:
        """Minimax + Alpha-Beta剪枝 + 置换表"""
        self._node_count += 1

        # 时间检查（每512个节点检查一次，避免搜索超时）
        if (self._node_count & 511) == 0:
            if time.time() - self._start_time > self._max_time:
                self._time_up = True
                return self._evaluate(board_state, ai_side)

        # 已超时则快速返回
        if self._time_up:
            return self._evaluate(board_state, ai_side)

        # 终止条件：将帅被吃
        winner = self._check_general_alive()
        if winner:
            return 10000 if winner == ai_side else -10000

        if depth == 0:
            return self._quiescence(board_state, alpha, beta, ai_side, 0)

        # 置换表查找
        zobrist = self._compute_zobrist(board_state)
        tt_entry = self._transposition_table.get(zobrist)
        if tt_entry:
            tt_score, tt_depth, _ = tt_entry
            if tt_depth >= depth:
                return tt_score

        current_side = board_state.get("current_turn", "red")
        moves = self._generate_all_moves(board_state, current_side)

        if not moves:
            return -10000 if current_side == ai_side else 10000

        # 走法排序
        self._order_moves(moves, board_state, depth)

        if is_max:
            max_eval = float("-inf")
            best_move_at_depth = None
            for move in moves:
                undo = self._make_move(board_state, move)
                eval_score = self._minimax(
                    board_state, depth - 1, alpha, beta, False, ai_side
                )
                self._unmake_move(board_state, move, undo)
                if eval_score > max_eval:
                    max_eval = eval_score
                    best_move_at_depth = move
                alpha = max(alpha, eval_score)
                if self._time_up:
                    break
                if beta <= alpha:
                    # 记录 killer move
                    if move not in self._killer_moves.get(depth, []):
                        if depth not in self._killer_moves:
                            self._killer_moves[depth] = [None, None]
                        self._killer_moves[depth][1] = self._killer_moves[depth][0]
                        self._killer_moves[depth][0] = move
                    # 历史启发
                    move_key_str = f"{move['piece_id']}_{move['to']}"
                    self._history_table[move_key_str] = self._history_table.get(move_key_str, 0) + depth * depth
                    break
            # 存入置换表
            self._transposition_table[zobrist] = (max_eval, depth, best_move_at_depth)
            return max_eval
        else:
            min_eval = float("inf")
            best_move_at_depth = None
            for move in moves:
                undo = self._make_move(board_state, move)
                eval_score = self._minimax(
                    board_state, depth - 1, alpha, beta, True, ai_side
                )
                self._unmake_move(board_state, move, undo)
                if eval_score < min_eval:
                    min_eval = eval_score
                    best_move_at_depth = move
                beta = min(beta, eval_score)
                if self._time_up:
                    break
                if beta <= alpha:
                    if move not in self._killer_moves.get(depth, []):
                        if depth not in self._killer_moves:
                            self._killer_moves[depth] = [None, None]
                        self._killer_moves[depth][1] = self._killer_moves[depth][0]
                        self._killer_moves[depth][0] = move
                    move_key_str = f"{move['piece_id']}_{move['to']}"
                    self._history_table[move_key_str] = self._history_table.get(move_key_str, 0) + depth * depth
                    break
            self._transposition_table[zobrist] = (min_eval, depth, best_move_at_depth)
            return min_eval

    def _quiescence(self, board_state: dict, alpha: float, beta: float, ai_side: str, q_depth: int) -> float:
        """静默搜索：只搜索吃子走法，避免水平线效应
        q_depth: 静默搜索深度（限制最大深度防止爆炸）
        """
        self._node_count += 1

        # 静默搜索深度上限（防止吃子链过长导致指数爆炸）
        if q_depth >= 4:
            return self._evaluate(board_state, ai_side)

        # 时间检查
        if (self._node_count & 511) == 0:
            if time.time() - self._start_time > self._max_time:
                self._time_up = True
                return self._evaluate(board_state, ai_side)

        # 已超时则快速返回
        if self._time_up:
            return self._evaluate(board_state, ai_side)

        stand_pat = self._evaluate(board_state, ai_side)
        if stand_pat >= beta:
            return beta
        if alpha < stand_pat:
            alpha = stand_pat

        # delta剪枝：如果stand_pat +最大可能收益仍 < alpha，则剪枝
        if stand_pat + 2000 < alpha:
            return alpha

        current_side = board_state.get("current_turn", "red")
        # 只生成吃子走法
        capture_moves = self._generate_capture_moves(board_state, current_side)
        self._order_moves(capture_moves, board_state, 0)

        for move in capture_moves:
            # delta剪枝：吃子价值过低则跳过
            captured = self._piece_dict.get(move.get("captured"))
            if captured:
                cap_val = PIECE_VALUES.get(captured["type"], self._custom_piece_values.get(captured["type"], 200))
                if stand_pat + cap_val + 200 < alpha:
                    continue

            undo = self._make_move(board_state, move)
            # 递归静默搜索（保持 ai_side 视角）
            score = self._quiescence(board_state, alpha, beta, ai_side, q_depth + 1)
            self._unmake_move(board_state, move, undo)

            if self._time_up:
                return alpha
            if score >= beta:
                return beta
            if score > alpha:
                alpha = score

        return alpha

    def _generate_capture_moves(self, board_state: dict, side: str) -> List[dict]:
        """只生成吃子走法（用于静默搜索）"""
        moves = []
        for p in board_state.get("pieces", []):
            if not p.get("is_alive", True):
                continue
            if p["side"] != side:
                continue
            valid = self.rule_engine.get_valid_moves(p, board_state)
            for pos in valid:
                target = self._board_index.get((pos[0], pos[1]))
                if target and target["side"] != side:
                    moves.append({
                        "piece_id": p["id"],
                        "from": list(p["position"]),
                        "to": pos,
                        "captured": target["id"],
                    })
        return moves

    def _check_general_alive(self) -> Optional[str]:
        """通过缓存的将帅引用快速检查存活（O(1-2)而非O(n)）"""
        red_alive = False
        black_alive = False
        for p in self._generals:
            if p.get("is_alive", True):
                if p["side"] == "red":
                    red_alive = True
                else:
                    black_alive = True
        if not red_alive:
            return "black"
        if not black_alive:
            return "red"
        return None

    def _evaluate(self, board_state: dict, ai_side: str) -> float:
        """评估棋盘局面（考虑性格影响）- 优化版"""
        score = 0.0
        agg = getattr(self, "personality_aggressiveness", 0.5)
        cons = getattr(self, "personality_conservatism", 0.5)
        value_biases = getattr(self, "personality_value_biases", {})

        # 预缓存双方将帅位置（修复 O(n²) 问题）
        general_positions = {}
        if cons > 0.5:
            for p in board_state.get("pieces", []):
                if p.get("is_alive", True) and p["type"] in self.rule_engine._king_types:
                    general_positions[p["side"]] = p["position"]

        for p in board_state.get("pieces", []):
            if not p.get("is_alive", True):
                continue
            piece_type = p["type"]
            if piece_type in PIECE_VALUES:
                val = PIECE_VALUES[piece_type]
            elif piece_type in self._custom_piece_values:
                val = self._custom_piece_values[piece_type]
            else:
                cp_rule = None
                for cp in self.custom_pieces:
                    if cp.get("type") == piece_type:
                        cp_rule = cp
                        break
                if cp_rule:
                    val = self._heuristic_custom_piece_value(cp_rule)
                else:
                    val = 0

            if piece_type in value_biases:
                val = val * (1.0 + value_biases[piece_type])

            sign = 1 if p["side"] == ai_side else -1
            score += val * sign

            px, py = p["position"]

            # 兵位置加成（用预计算表替代动态计算）
            if piece_type == "soldier":
                if p["side"] == "red":
                    bonus = SOLDIER_POS_BONUS[py][px] if 0 <= py < 10 and 0 <= px < 9 else 0
                else:
                    bonus = SOLDIER_POS_BONUS[9 - py][px] if 0 <= py < 10 and 0 <= px < 9 else 0
                bonus = int(bonus * (0.5 + agg))
                score += bonus * sign

            # 车马炮中心控制
            if piece_type in ("chariot", "horse", "cannon"):
                center_bonus = (3.5 - abs(px - 4)) * 2 * (0.5 + agg)
                score += center_bonus * sign

            # 自定义棋子中心控制
            if piece_type not in PIECE_VALUES and piece_type in self._custom_piece_values:
                center_bonus = (3.5 - abs(px - 4)) * 1.0 * (0.5 + agg)
                score += center_bonus * sign

            # 保守性格防守加分（使用缓存的位置）
            if cons > 0.5:
                gen_pos = general_positions.get(p["side"])
                if gen_pos:
                    gx, gy = gen_pos
                    dist = abs(px - gx) + abs(py - gy)
                    if dist <= 2:
                        defense_bonus = (3 - dist) * 15 * (cons - 0.5) * 2
                        score += defense_bonus * sign

        return score

    async def _evaluate_custom_piece_value(self, piece_rule: dict) -> int:
        """通过AI动态评估自定义棋子的价值"""
        if not self.api_key:
            return self._heuristic_custom_piece_value(piece_rule)

        piece_type = piece_rule.get("type", "unknown")
        if piece_type in self._custom_piece_values:
            return self._custom_piece_values[piece_type]

        movement = piece_rule.get("movement", {})
        attack = piece_rule.get("attack", {})
        custom_modifiers = piece_rule.get("custom_modifiers", [])

        system_prompt = """你是中国象棋棋子价值评估专家。根据棋子的移动能力和攻击能力评估其价值。

参考价值表（标准棋子）：
- 將/帥(general): 10000（核心棋子，被吃即输）
- 車(chariot): 900（直线远距离移动，威力最大）
- 砲/炮(cannon): 450（隔子打，中等威力）
- 馬(horse): 400（日字移动，中等威力）
- 象/相(elephant): 200（田字移动，防守型）
- 士/仕(advisor): 200（九宫斜线，防守型）
- 兵/卒(soldier): 100（前进一格，低价值）

评估依据：
1. 移动范围（max_distance越大价值越高）
2. 移动灵活性（free > orthogonal/diagonal > L_shape > conditional）
3. 攻击能力（same_as_movement vs 特殊攻击如cannon_shot）
4. custom_modifiers中的extra_movement额外增加价值
5. 是否能过河（can_cross_river）

输出要求：
- 只输出一个整数（50-1000范围），表示该棋子的价值
- 不要输出任何其他内容"""

        user_prompt = f"""请评估以下自定义棋子的价值：

棋子类型: {piece_type}
棋子名称: {piece_rule.get('name', '未知')}

移动能力:
{json.dumps(movement, ensure_ascii=False, indent=2)}

攻击能力:
{json.dumps(attack, ensure_ascii=False, indent=2)}

自定义修饰器:
{json.dumps(custom_modifiers, ensure_ascii=False, indent=2)}

请评估这个棋子的价值（50-1000的整数），只输出数字。"""

        try:
            import httpx
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            }
            payload = {
                "model": "deepseek-chat",
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "temperature": 0,
                "max_tokens": 50,
            }
            async with httpx.AsyncClient(timeout=30.0) as client:
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
                content = data["choices"][0]["message"]["content"].strip()
                match = re.search(r'\d+', content)
                if match:
                    value = int(match.group())
                    value = max(50, min(1000, value))
                    self._custom_piece_values[piece_type] = value
                    return value
        except Exception:
            pass

        return self._heuristic_custom_piece_value(piece_rule)

    def _heuristic_custom_piece_value(self, piece_rule: dict) -> int:
        """启发式评估自定义棋子价值（当AI不可用时的回退方案）"""
        piece_type = piece_rule.get("type", "unknown")
        if piece_type in self._custom_piece_values:
            return self._custom_piece_values[piece_type]

        movement = piece_rule.get("movement", {})
        custom_modifiers = piece_rule.get("custom_modifiers", [])

        move_type = movement.get("type", "")
        base_value = {
            "free": 800,
            "orthogonal": 500,
            "diagonal": 300,
            "L_shape": 400,
            "conditional": 150,
        }.get(move_type, 200)

        max_dist = movement.get("max_distance", 1)
        if max_dist > 1:
            base_value += min(max_dist * 30, 200)

        for mod in custom_modifiers:
            if mod.get("type") == "extra_movement":
                extra_movement = mod.get("movement", {})
                extra_type = extra_movement.get("type", "")
                base_value += {
                    "free": 200,
                    "orthogonal": 100,
                    "diagonal": 80,
                    "L_shape": 100,
                }.get(extra_type, 50)

        if movement.get("can_cross_river", False):
            base_value += 50

        value = max(50, min(1000, base_value))
        self._custom_piece_values[piece_type] = value
        return value

    async def precompute_custom_piece_values(self):
        """预计算所有自定义棋子的价值（在get_best_move前调用）"""
        if not self.custom_pieces:
            return
        for cp in self.custom_pieces:
            cp_type = cp.get("type")
            if cp_type and cp_type not in self._custom_piece_values:
                await self._evaluate_custom_piece_value(cp)
