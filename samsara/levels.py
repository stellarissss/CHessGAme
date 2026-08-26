import json
from pathlib import Path
from .state import SamsaraState, REALM_NAMES

BASE_DIR = Path(__file__).resolve().parent.parent
CONFIGS_DIR = BASE_DIR / "configs"
LEVEL_POOLS_FILE = CONFIGS_DIR / "level_pools.json"
PUZZLES_FILE = CONFIGS_DIR / "puzzles.json"
REALM_MAPS_FILE = CONFIGS_DIR / "realm_maps.json"


class LevelSystem:
    def __init__(self, state: SamsaraState):
        self.state = state
        self.level_pools = self._load_level_pools()
        self.puzzles = self._load_puzzles()
        self.realm_maps = self._load_realm_maps()

    def _load_realm_maps(self):
        """加载六道小世界大地图配置。"""
        if REALM_MAPS_FILE.exists():
            try:
                return json.loads(REALM_MAPS_FILE.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                pass
        return {}

    def _load_level_pools(self):
        if LEVEL_POOLS_FILE.exists():
            try:
                return json.loads(LEVEL_POOLS_FILE.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                pass
        return self._get_default_level_pools()

    def _load_puzzles(self):
        if PUZZLES_FILE.exists():
            try:
                return json.loads(PUZZLES_FILE.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                pass
        return {}

    def _get_default_level_pools(self):
        return {}

    def load_level(self, realm: str = None, level_index: int = None) -> dict:
        if realm is None:
            realm = self.state.get("current_realm")
        if level_index is None:
            level_index = self.state.get("current_level")
        pool = self.level_pools.get(realm)
        if not pool or level_index >= len(pool["levels"]):
            return None
        level = pool["levels"][level_index]
        result = {
            **level,
            "realm": realm,
            "realm_name": REALM_NAMES.get(realm, ""),
            "game_type": pool["game_type"],
            "realm_icon": pool["icon"],
            "level_index": level_index,
            "total_levels": len(pool["levels"]),
        }
        if level.get("type") == "puzzle" and level.get("puzzle_id"):
            puzzle = self.puzzles.get(pool["game_type"], {}).get(level["puzzle_id"])
            if puzzle:
                result["puzzle_data"] = puzzle
        return result

    def load_sandbox(self, realm: str = None) -> dict:
        if realm is None:
            realm = self.state.get("current_realm")
        pool = self.level_pools.get(realm)
        if not pool:
            return None
        sandbox_config = pool.get("sandbox", {})
        return {
            "type": "sandbox",
            "realm": realm,
            "realm_name": REALM_NAMES.get(realm, ""),
            "game_type": pool["game_type"],
            "realm_icon": pool["icon"],
            "name": sandbox_config.get("name", f"{REALM_NAMES.get(realm, '')} · 沙盒"),
            "description": sandbox_config.get("description", ""),
            "ai_personality": sandbox_config.get("ai_personality", "normal"),
            "ai_depth": sandbox_config.get("ai_depth", 3),
            "turn_limit": 40 if pool["game_type"] == "weiqi" else 20,
            "objective": {"type": "checkmate"},
        }

    def get_current_level(self) -> dict:
        return self.load_level()

    def get_total_levels(self, realm: str = None) -> int:
        if realm is None:
            realm = self.state.get("current_realm")
        pool = self.level_pools.get(realm)
        return len(pool["levels"]) if pool else 0

    def advance_to_next_level(self) -> dict:
        realm = self.state.get("current_realm")
        current_level = self.state.get("current_level")
        total = self.get_total_levels(realm)
        if current_level < total - 1:
            self.state.advance_level()
            return {"success": True, "new_level": self.load_level()}
        return {"success": False, "reason": "已到达最后一关"}

    def get_realm_progress(self, realm: str = None) -> dict:
        if realm is None:
            realm = self.state.get("current_realm")
        pool = self.level_pools.get(realm)
        progress = self.state.get("realm_progress", {}).get(realm, {})
        sandbox_unlocked = self.state.is_sandbox_unlocked(realm) if hasattr(self.state, "is_sandbox_unlocked") else False
        return {
            "realm": realm,
            "name": pool["name"] if pool else "",
            "icon": pool["icon"] if pool else "",
            "game_type": pool["game_type"] if pool else "",
            "total_levels": len(pool["levels"]) if pool else 0,
            "levels_passed": progress.get("levels_passed", 0),
            "completed": progress.get("completed", False),
            "sandbox_unlocked": sandbox_unlocked,
            "levels": pool["levels"] if pool else [],
        }

    def get_all_realms_progress(self) -> list:
        result = []
        for realm in self.level_pools:
            result.append(self.get_realm_progress(realm))
        return result

    def get_realm_levels(self, realm: str) -> dict:
        pool = self.level_pools.get(realm)
        if not pool:
            return None
        progress = self.state.get("realm_progress", {}).get(realm, {})
        levels_passed = progress.get("levels_passed", 0)
        sandbox_unlocked = self.state.is_sandbox_unlocked(realm) if hasattr(self.state, "is_sandbox_unlocked") else False
        levels_with_status = []
        for i, level in enumerate(pool["levels"]):
            level_copy = {**level}
            level_copy["index"] = i
            level_copy["status"] = "completed" if i < levels_passed else ("current" if i == levels_passed else "locked")
            levels_with_status.append(level_copy)
        return {
            "realm": realm,
            "name": pool["name"],
            "icon": pool["icon"],
            "game_type": pool["game_type"],
            "levels": levels_with_status,
            "total_levels": len(pool["levels"]),
            "levels_passed": levels_passed,
            "completed": progress.get("completed", False),
            "sandbox_unlocked": sandbox_unlocked,
            "sandbox": pool.get("sandbox", {}),
        }

    # ══════════════════════════════════════════════════════════════
    # 六道小世界大地图（v4）
    # ══════════════════════════════════════════════════════════════

    def load_map(self, realm: str) -> dict:
        """返回某道的大地图全量（节点/连线/状态/关卡信息/占位标记）。"""
        map_data = self.realm_maps.get(realm)
        if not map_data:
            return None
        # 首次访问懒初始化：start 节点 → cleared，其后继 → available
        if not self.state.get_map_progress(realm):
            self._init_map_state(realm, map_data)
        progress = self.state.get_map_progress(realm)
        edges = map_data.get("edges", [])
        nodes_payload = []
        for node in map_data.get("nodes", []):
            item = {**node}
            # 占位节点：明确带 TODO 标注（游戏内与代码内双重注明）
            if item.get("placeholder"):
                item["todo"] = item.get("placeholder_note", "TODO: 内容待制作")
            # 关联现有关卡信息
            level_id = item.get("level_id")
            if level_id:
                level = self._find_level_by_id(realm, level_id)
                if level:
                    item["level"] = {
                        "name": level.get("name", ""),
                        "type": level.get("type", ""),
                        "difficulty": level.get("difficulty", 1),
                        "description": level.get("description", ""),
                    }
            item["status"] = progress.get(item["id"], "locked")
            nodes_payload.append(item)
        return {
            "realm": realm,
            "grid": map_data.get("grid", {}),
            "game_type": map_data.get("game_type", ""),
            "nodes": nodes_payload,
            "edges": edges,
            "placeholder_count": sum(1 for n in map_data.get("nodes", []) if n.get("placeholder")),
        }

    def _init_map_state(self, realm: str, map_data: dict) -> None:
        """首次访问某道地图时初始化节点状态：
        - start 节点 → cleared（入口已通，不可再战斗）
        - start 的直接后继 → available（可直接挑战）
        - 其余 → locked
        """
        nodes = map_data.get("nodes", [])
        edges = map_data.get("edges", [])
        progress = {}
        for node in nodes:
            progress[node["id"]] = "locked"
        start_ids = [n["id"] for n in nodes if n.get("type") == "start"]
        for sid in start_ids:
            progress[sid] = "cleared"
        # start 直接后继解锁
        start_set = set(start_ids)
        for a, b in edges:
            if a in start_set and progress.get(b) == "locked":
                progress[b] = "available"
        for node_id, status in progress.items():
            self.state.set_map_node_status(realm, node_id, status)

    def _find_level_by_id(self, realm: str, level_id: str) -> dict:
        pool = self.level_pools.get(realm)
        if not pool:
            return None
        for level in pool.get("levels", []):
            if level.get("id") == level_id:
                return level
        return None

    def _node_available(self, realm: str, node_id: str) -> bool:
        """节点是否可进入：自身 available 且非占位（占位内容未制作，不可进）。"""
        map_data = self.realm_maps.get(realm, {})
        if not self.state.get_map_progress(realm):
            self._init_map_state(realm, map_data)
        progress = self.state.get_map_progress(realm)
        if progress.get(node_id) != "available":
            return False
        node = next((n for n in map_data.get("nodes", []) if n.get("id") == node_id), None)
        if node is None or node.get("placeholder"):
            return False
        return True

    def map_start(self, realm: str, node_id: str) -> dict:
        """进入某道地图节点：校验可用 → 置为当前节点 → 返回关联关卡。"""
        if not self._node_available(realm, node_id):
            return {"success": False, "reason": "节点不可进入（未解锁或内容待制作）"}
        map_data = self.realm_maps.get(realm, {})
        node = next((n for n in map_data.get("nodes", []) if n.get("id") == node_id), None)
        level_id = node.get("level_id") if node else None
        level = None
        if level_id:
            # 复用主关卡推进：通过 level_id 找到关卡池索引并置为 current_level
            pool = self.level_pools.get(realm, {})
            level_index = next(
                (i for i, lv in enumerate(pool.get("levels", [])) if lv.get("id") == level_id),
                None,
            )
            if level_index is not None:
                # 先切换道（会重置 current_level），再置为目标关卡索引
                self.state.set_realm(realm)
                self.state.set("current_level", level_index)
                level = self.load_level(realm, level_index)
        self.state.set_current_map_node(realm, node_id)
        return {"success": True, "node_id": node_id, "level": level}

    def map_resolve(self, realm: str, node_id: str, win: bool) -> dict:
        """结算某道地图节点。
        - 胜利：节点置 cleared，解锁相邻节点，推进现有关卡/道进度。
        - 失败：节点保持 available（可重试）。
        占位节点不可结算（内容未制作）。
        """
        map_data = self.realm_maps.get(realm)
        if not map_data:
            return {"success": False, "reason": "未知道"}
        if not self.state.get_map_progress(realm):
            self._init_map_state(realm, map_data)
        node = next((n for n in map_data.get("nodes", []) if n.get("id") == node_id), None)
        if node is None:
            return {"success": False, "reason": "未知节点"}
        if node.get("placeholder"):
            return {"success": False, "reason": "占位节点内容待制作，不可结算"}

        progress = self.state.get_map_progress(realm)
        if progress.get(node_id) != "available" and progress.get(node_id) != "cleared":
            return {"success": False, "reason": "节点未解锁"}

        if not win:
            return {"success": True, "won": False, "reason": "失败可重试", "node_status": "available"}

        # 胜利：置 cleared + 记录关卡推进（复用现有关卡系统，映射到关卡池索引）
        self.state.set_map_node_status(realm, node_id, "cleared")
        pool = self.level_pools.get(realm, {})
        level_id = node.get("level_id")
        level_index = next(
            (i for i, lv in enumerate(pool.get("levels", [])) if lv.get("id") == level_id),
            None,
        ) if level_id else None
        realm_progress = self.state.get("realm_progress", {}).get(realm, {})
        levels_passed = realm_progress.get("levels_passed", 0)
        if level_index is not None and level_index >= levels_passed:
            self.state.increment_realm_levels_passed(realm)
        # Boss 节点胜利：标记道通关 + 解锁沙盒
        if node.get("type") == "boss":
            self.state.mark_realm_completed(realm)
            self.state.unlock_sandbox(realm)
        # 解锁相邻节点
        unlocked = []
        for edge in map_data.get("edges", []):
            if edge[0] == node_id:
                neighbor_id = edge[1]
                if progress.get(neighbor_id, "locked") == "locked":
                    self.state.set_map_node_status(realm, neighbor_id, "available")
                    unlocked.append(neighbor_id)
        return {
            "success": True,
            "won": True,
            "node_status": "cleared",
            "unlocked": unlocked,
            "realm_completed": self.state.get("realm_progress", {}).get(realm, {}).get("completed", False),
        }
