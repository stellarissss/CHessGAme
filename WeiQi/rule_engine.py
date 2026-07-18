"""
围棋规则引擎 v1.0 - place/capture/liberty 原语体系
核心设计：落子/提子双原语 + 气的计算引擎 + where条件表达式
"""
import copy
from typing import Dict, Any, List, Tuple, Optional, Set


class RuleEngine:
    """围棋规则引擎，根据pieces配置计算合法落子、提子、气等"""

    def __init__(self, board: dict, pieces_white: dict, pieces_black: dict, rules: dict):
        self.board_config = board
        self.rules = rules

        self._pieces_by_side = {
            "white": pieces_white.get("pieces", {}),
            "black": pieces_black.get("pieces", {}),
        }
        self._custom_pieces_by_side = {
            "white": pieces_white.get("custom_pieces", []),
            "black": pieces_black.get("custom_pieces", []),
        }

        self._king_types = set()
        for side in ["white", "black"]:
            for type_name, piece_def in self._pieces_by_side[side].items():
                if piece_def.get("is_king"):
                    self._king_types.add(type_name)
            for cp in self._custom_pieces_by_side[side]:
                if cp.get("is_king"):
                    cp_type = cp.get("type")
                    if cp_type:
                        self._king_types.add(cp_type)

    # ═══════════════════════════════════════════════════════════════
    # 公共 API
    # ═══════════════════════════════════════════════════════════════

    def get_valid_moves(self, side: str, board_state: dict) -> List[List[int]]:
        """
        获取某方所有合法落子位置

        Args:
            side: 方 (black/white)
            board_state: 棋盘状态

        Returns:
            合法位置列表 [[x, y], ...]
        """
        width = self._get_width()
        height = self._get_height()
        valid = []

        suicide_allowed = self.rules.get("special_rules", {}).get("suicide", {}).get("enabled", False)
        ko_enabled = self.rules.get("special_rules", {}).get("ko", {}).get("enabled", True)
        ko_point = board_state.get("ko_point")

        for x in range(width):
            for y in range(height):
                if not self._is_empty(x, y, board_state):
                    continue

                if ko_enabled and ko_point and ko_point[0] == x and ko_point[1] == y:
                    continue

                if not suicide_allowed:
                    if self._is_suicide_move(x, y, side, board_state):
                        continue

                valid.append([x, y])

        return valid

    def place_stone(self, x: int, y: int, side: str, board_state: dict) -> Tuple[dict, Dict[str, Any]]:
        """
        在指定位置落子，执行提子，返回新状态和信息

        Returns:
            (new_board_state, info)
            info包含: captured_count, captured_positions, ko_point_new, is_valid
        """
        new_state = copy.deepcopy(board_state)
        info = {
            "captured_count": 0,
            "captured_positions": [],
            "ko_point_new": None,
            "is_valid": True,
        }

        if not self._is_empty(x, y, new_state):
            info["is_valid"] = False
            info["error"] = "该位置已有棋子"
            return new_state, info

        suicide_allowed = self.rules.get("special_rules", {}).get("suicide", {}).get("enabled", False)
        ko_enabled = self.rules.get("special_rules", {}).get("ko", {}).get("enabled", True)
        ko_point = board_state.get("ko_point")

        if ko_enabled and ko_point and ko_point[0] == x and ko_point[1] == y:
            info["is_valid"] = False
            info["error"] = "打劫禁着点"
            return new_state, info

        new_piece = {
            "id": f"{side[0]}_stone_{len(new_state.get('pieces', [])) + 1}",
            "type": "stone",
            "name": "●" if side == "black" else "○",
            "side": side,
            "position": [x, y],
            "is_alive": True,
            "custom_properties": {},
        }
        new_state.setdefault("pieces", []).append(new_piece)

        captured = self._capture_adjacent_enemies(x, y, side, new_state)
        info["captured_count"] = len(captured)
        info["captured_positions"] = captured

        captured_key = "white" if side == "black" else "black"
        new_state.setdefault("captured_stones", {})[side] = new_state.get("captured_stones", {}).get(side, 0) + len(captured)

        if not suicide_allowed:
            my_liberties = self._count_liberties_at(x, y, new_state)
            if my_liberties == 0 and len(captured) == 0:
                new_state["pieces"].pop()
                info["is_valid"] = False
                info["error"] = "禁入点（自杀）"
                return new_state, info

        if ko_enabled and len(captured) == 1:
            my_group = self._get_group(x, y, new_state)
            if len(my_group) == 1 and self._count_liberties_of_group(my_group, new_state) == 1:
                info["ko_point_new"] = captured[0]

        new_state["ko_point"] = info["ko_point_new"]

        return new_state, info

    def count_territory(self, board_state: dict) -> Dict[str, Any]:
        """
        计算地盘（简化版：数子法）

        Returns:
            {"black": score, "white": score, "territory_black": [...], "territory_white": [...]}
        """
        width = self._get_width()
        height = self._get_height()

        visited = set()
        territory_black = []
        territory_white = []
        neutral = []

        black_stones = 0
        white_stones = 0

        for p in board_state.get("pieces", []):
            if p.get("is_alive", True):
                if p["side"] == "black":
                    black_stones += 1
                else:
                    white_stones += 1

        for x in range(width):
            for y in range(height):
                if (x, y) in visited:
                    continue
                if not self._is_empty(x, y, board_state):
                    continue

                region, owner = self._flood_fill_territory(x, y, board_state, visited)
                if owner == "black":
                    territory_black.extend(region)
                elif owner == "white":
                    territory_white.extend(region)
                else:
                    neutral.extend(region)

        komi = self.rules.get("win_conditions", {}).get("territory", {}).get("komi", 6.5)

        return {
            "black": black_stones + len(territory_black),
            "white": white_stones + len(territory_white) + komi,
            "territory_black": territory_black,
            "territory_white": territory_white,
            "neutral": neutral,
            "black_stones": black_stones,
            "white_stones": white_stones,
            "komi": komi,
        }

    def is_game_over(self, board_state: dict) -> Tuple[bool, Optional[str], Optional[str]]:
        """
        检查游戏是否结束

        Returns:
            (is_over, winner, win_condition)
        """
        status = board_state.get("game_status", {})
        if status.get("state") == "ended":
            return True, status.get("winner"), status.get("win_condition")

        double_pass = self.rules.get("win_conditions", {}).get("double_pass", {}).get("enabled", True)
        if double_pass and board_state.get("pass_count", 0) >= 2:
            territory = self.count_territory(board_state)
            winner = "black" if territory["black"] > territory["white"] else "white"
            return True, winner, "double_pass"

        capture_count_rule = self.rules.get("win_conditions", {}).get("capture_count", {})
        if capture_count_rule.get("enabled", False):
            target = capture_count_rule.get("target", 10)
            captured = board_state.get("captured_stones", {})
            if captured.get("black", 0) >= target:
                return True, "black", "capture_count"
            if captured.get("white", 0) >= target:
                return True, "white", "capture_count"

        return False, None, None

    # ═══════════════════════════════════════════════════════════════
    # 气与棋块
    # ═══════════════════════════════════════════════════════════════

    def _count_liberties_at(self, x: int, y: int, board_state: dict) -> int:
        """计算指定位置棋子所在棋块的气数"""
        group = self._get_group(x, y, board_state)
        return self._count_liberties_of_group(group, board_state)

    def _get_group(self, x: int, y: int, board_state: dict) -> List[List[int]]:
        """获取指定位置所在的连通棋块（正交连通的同色棋子）"""
        piece = self._get_piece_at(x, y, board_state)
        if not piece:
            return []

        side = piece["side"]
        visited = set()
        group = []
        stack = [[x, y]]

        while stack:
            cx, cy = stack.pop()
            if (cx, cy) in visited:
                continue
            if not self._in_bounds(cx, cy):
                continue
            p = self._get_piece_at(cx, cy, board_state)
            if not p or p["side"] != side:
                continue
            visited.add((cx, cy))
            group.append([cx, cy])
            for dx, dy in [(1, 0), (-1, 0), (0, 1), (0, -1)]:
                nx, ny = cx + dx, cy + dy
                if (nx, ny) not in visited:
                    stack.append([nx, ny])

        return group

    def _count_liberties_of_group(self, group: List[List[int]], board_state: dict) -> int:
        """计算一个棋块的气数"""
        liberties = set()
        for gx, gy in group:
            for dx, dy in [(1, 0), (-1, 0), (0, 1), (0, -1)]:
                nx, ny = gx + dx, gy + dy
                if self._in_bounds(nx, ny) and self._is_empty(nx, ny, board_state):
                    liberties.add((nx, ny))
        return len(liberties)

    def _capture_adjacent_enemies(self, x: int, y: int, side: str, board_state: dict) -> List[List[int]]:
        """提掉相邻的敌方无气棋块，返回被提子的位置列表"""
        captured = []
        enemy_side = "white" if side == "black" else "black"

        for dx, dy in [(1, 0), (-1, 0), (0, 1), (0, -1)]:
            nx, ny = x + dx, y + dy
            if not self._in_bounds(nx, ny):
                continue
            enemy = self._get_piece_at(nx, ny, board_state)
            if not enemy or enemy["side"] != enemy_side:
                continue
            enemy_group = self._get_group(nx, ny, board_state)
            if self._count_liberties_of_group(enemy_group, board_state) == 0:
                for gx, gy in enemy_group:
                    piece = self._get_piece_at(gx, gy, board_state)
                    if piece:
                        piece["is_alive"] = False
                        captured.append([gx, gy])

        board_state["pieces"] = [p for p in board_state.get("pieces", []) if p.get("is_alive", True)]
        return captured

    def _is_suicide_move(self, x: int, y: int, side: str, board_state: dict) -> bool:
        """判断在该位置落子是否是自杀（落子后己方无气且不能提子）"""
        test_state = copy.deepcopy(board_state)
        test_piece = {
            "id": "test",
            "type": "stone",
            "name": "test",
            "side": side,
            "position": [x, y],
            "is_alive": True,
            "custom_properties": {},
        }
        test_state.setdefault("pieces", []).append(test_piece)

        enemy_side = "white" if side == "black" else "black"
        captured_any = False
        for dx, dy in [(1, 0), (-1, 0), (0, 1), (0, -1)]:
            nx, ny = x + dx, y + dy
            if not self._in_bounds(nx, ny):
                continue
            enemy = self._get_piece_at(nx, ny, test_state)
            if not enemy or enemy["side"] != enemy_side:
                continue
            enemy_group = self._get_group(nx, ny, test_state)
            if self._count_liberties_of_group(enemy_group, test_state) == 0:
                captured_any = True
                break

        if captured_any:
            return False

        my_liberties = self._count_liberties_at(x, y, test_state)
        return my_liberties == 0

    # ═══════════════════════════════════════════════════════════════
    # 地盘计算
    # ═══════════════════════════════════════════════════════════════

    def _flood_fill_territory(self, start_x: int, start_y: int, board_state: dict, visited: Set[Tuple[int, int]]) -> Tuple[List[List[int]], Optional[str]]:
        """
        泛洪填充计算空点区域归属

        Returns:
            (region_positions, owner) - owner为black/white/None(中立)
        """
        region = []
        touches_black = False
        touches_white = False
        stack = [[start_x, start_y]]

        while stack:
            x, y = stack.pop()
            if (x, y) in visited:
                continue
            if not self._in_bounds(x, y):
                continue

            piece = self._get_piece_at(x, y, board_state)
            if piece:
                if piece["side"] == "black":
                    touches_black = True
                else:
                    touches_white = True
                continue

            visited.add((x, y))
            region.append([x, y])

            for dx, dy in [(1, 0), (-1, 0), (0, 1), (0, -1)]:
                nx, ny = x + dx, y + dy
                if (nx, ny) not in visited:
                    stack.append([nx, ny])

        if touches_black and not touches_white:
            return region, "black"
        elif touches_white and not touches_black:
            return region, "white"
        else:
            return region, None

    # ═══════════════════════════════════════════════════════════════
    # 工具函数
    # ═══════════════════════════════════════════════════════════════

    def _in_bounds(self, x: int, y: int) -> bool:
        geometry = self.board_config.get("geometry", {})
        width = geometry.get("width", 19)
        height = geometry.get("height", 19)
        return 0 <= x < width and 0 <= y < height

    def _get_width(self) -> int:
        return self.board_config.get("geometry", {}).get("width", 19)

    def _get_height(self) -> int:
        return self.board_config.get("geometry", {}).get("height", 19)

    def _is_empty(self, x: int, y: int, board_state: dict) -> bool:
        return self._get_piece_at(x, y, board_state) is None

    def _get_piece_at(self, x: int, y: int, board_state: dict) -> Optional[dict]:
        for p in board_state.get("pieces", []):
            if p.get("is_alive", True) and p["position"][0] == x and p["position"][1] == y:
                return p
        return None
