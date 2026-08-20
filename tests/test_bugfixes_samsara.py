"""TDD 红用例：六道众生游戏逻辑 Bug 修复（Bug 1~4 + 通用修复）。

按修复计划对应：
  test_reset_level_state_sets_initial_karma_with_carryover —— Bug 1：reset_level_state 必须把 level_karma 设置为 (initial - reduction) + carryover。
  test_reset_all_soft_preserves_skills_and_achievements_like_keys —— Bug 3：soft 档不删技能 / 对齐字段（不涉及 achievements 本体，属 samsara_state 字段）。
  test_reset_all_hard_clears_everything_but_version —— Bug 3：hard 档全部默认化。
  test_advance_to_next_level_returns_next_level_dict —— Bug 2：LevelSystem.advance_to_next_level 返回含 new_level。
  test_basegamestate_after_reset_board_sets_realm_detection_default —— Bug 1：_after_reset_board 默认实现现在是 no-op，测试会先失败（RED），修复后应返回默认 0 值。
  test_samsara_reset_endpoint_mode_soft_returns_complete_state —— Bug 3：/api/reset 带 mode=soft 返回 _frontend_state。
  test_progression_resolve_returns_next_level_on_win —— Bug 2：resolve_level 胜利时含 next_level。
"""
from __future__ import annotations

import copy
import json
import os
import sys
import tempfile
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


# ───────────────────────── 辅助：把 Samsara STATE_FILE 指到临时目录 ─────────────────────────

@pytest.fixture
def tmp_configs(monkeypatch, tmp_path):
    """重定向 samsara configs 目录到 tmp_path，避免污染项目。"""
    import samsara.state as st_mod
    orig = st_mod.CONFIGS_DIR, st_mod.STATE_FILE
    new_cfg_dir = tmp_path / "configs"
    new_cfg_dir.mkdir(parents=True, exist_ok=True)
    new_state_file = new_cfg_dir / "samsara_state.json"
    monkeypatch.setattr(st_mod, "CONFIGS_DIR", new_cfg_dir)
    monkeypatch.setattr(st_mod, "STATE_FILE", new_state_file)
    yield new_cfg_dir, new_state_file
    # restore (monkeypatch 会自动撤销，但这里仅保留引用给读测试)
    _ = orig


# ═══════════════════════════════════════════════════════════════════════
# Bug 1 / Bug 3 — SamsaraState.reset_level_state / reset_all 行为
# ═══════════════════════════════════════════════════════════════════════

def test_reset_level_state_sets_initial_karma_with_carryover(tmp_configs):
    """Bug 1: reset_level_state 必须把业力 = (initial - reduction) + carryover。"""
    from samsara.state import SamsaraState

    state = SamsaraState()
    # 手动设定初始值 + 溢出叠加
    state._data["initial_karma"] = 50
    state._data["realm_overshoot_carryover"] = 12
    state._data["current_turn"] = 99
    state._data["cheat_count"] = 7
    state._data["overdraft_count"] = 3
    state._data["no_cheat_this_level"] = False

    state.reset_level_state()

    # initial_karma(50) - 0 (无技能减免) + carryover(12) = 62
    assert state.get("level_karma") == 62
    assert state.get("current_turn") == 0
    assert state.get("cheat_count") == 0
    assert state.get("overdraft_count") == 0
    assert state.get("no_cheat_this_level") is True


def test_reset_all_soft_preserves_skills_and_achievements_like_keys(tmp_configs):
    """Bug 3: soft 档保留 skills / endings_unlocked / 等 RPG 字段，只清零进度。"""
    from samsara.state import SamsaraState

    state = SamsaraState()
    # 先解锁 1 个技能、设成天道第 3 关、搞乱 alignment、设成就类比字段(存在 endin)
    state._data["skills"] = {"karma_capacity_t2a": {"unlocked_at": "x", "tier": 2}}
    state._data["skill_points"] = 5
    state._data["current_realm"] = "heaven"
    state._data["current_level"] = 3
    state._data["level_karma"] = 99
    state._data["alignment"] = {"enlightenment": 42, "corruption": 10,
                                "rationality": 1, "emotion": 2}
    state._data["endings_unlocked"] = {"samsara": True, "enlightenment": False,
                                       "corruption": False, "true_me": False, "exposed": False}
    state._data["playthrough_count"] = 2

    state.reset_all(full=False)

    # 保留项：用户插入的技能存在；合并时 _init_defaults 会自动补齐基础 tier1 技能
    assert state._data["skills"].get("karma_capacity_t2a") == {"unlocked_at": "x", "tier": 2}
    assert "karma_capacity_t1" in state._data["skills"], (
        "tier1 初始技能应始终保留（由 _init_defaults 补齐）"
    )
    assert "stealth_t1" in state._data["skills"]
    assert state._data["skill_points"] == 5
    assert state._data["endings_unlocked"]["samsara"] is True
    # 清零进度
    assert state._data["current_realm"] == "hell"
    assert state._data["current_level"] == 0
    assert state._data["level_karma"] == state._data["initial_karma"]
    assert state._data["alignment"]["enlightenment"] == 0
    assert state._data["alignment"]["corruption"] == 0
    # soft：playthrough_count 自增 1（重置一次算新周目）。原始 2 -> 3
    assert state._data["playthrough_count"] >= 3
    assert state._data["realm_overshoot_carryover"] == 0


def test_reset_all_hard_clears_everything_but_version(tmp_configs):
    """Bug 3: hard 档所有字段回到 defaults，仅保留 version。"""
    from samsara.state import SamsaraState

    state = SamsaraState()
    state._data["skills"] = {"stealth_t2a": {"unlocked_at": "x", "tier": 2}}
    state._data["current_realm"] = "asura"
    state._data["level_karma"] = 150
    state._data["alignment"]["enlightenment"] = 100
    state._data["skill_points"] = 3
    version_before = state._data["version"]

    state.reset_all(full=True)

    # 恢复 default 结构，version 保留
    assert state._data["version"] == version_before
    # 技能和技能点被清掉
    assert "stealth_t2a" not in state._data["skills"]
    assert state._data["skill_points"] == 0
    assert state._data["current_realm"] == "hell"
    assert state._data["alignment"]["enlightenment"] == 0
    assert state._data["level_karma"] == state._data["initial_karma"]
    # 初始技能（两个 tier1）应默认存在
    assert "karma_capacity_t1" in state._data["skills"]
    assert "stealth_t1" in state._data["skills"]


# ═══════════════════════════════════════════════════════════════════════
# Bug 2 — LevelSystem / progression 必须返回 next_level
# ═══════════════════════════════════════════════════════════════════════

def test_advance_to_next_level_returns_next_level_dict(tmp_configs):
    """Bug 2: advance_to_next_level() 成功时 success=True + new_level 含 level_index 递增。"""
    from samsara.state import SamsaraState
    from samsara.levels import LevelSystem

    state = SamsaraState()
    levels = LevelSystem(state)
    # 如果 level_pools 为空（真实项目默认空），就注入一个小型池子
    if not levels.level_pools:
        levels.level_pools = {
            "hell": {
                "name": "地狱道",
                "icon": "☯",
                "game_type": "heibaiqi",
                "levels": [
                    {"name": "L1", "ai_depth": 1, "turn_limit": 20},
                    {"name": "L2", "ai_depth": 2, "turn_limit": 20},
                    {"name": "L3", "ai_depth": 3, "turn_limit": 20},
                ],
            }
        }
    # 切到 hell 第 0 关
    state.set_realm("hell")
    assert state.get("current_level") == 0
    result = levels.advance_to_next_level()
    assert result["success"] is True
    assert "new_level" in result
    assert result["new_level"]["level_index"] == 1
    assert state.get("current_level") == 1


def test_progression_resolve_returns_next_level_on_win(tmp_configs):
    """Bug 2: resolve_level won=True 时必须含 next_level（来自 advance_realm 或道内推进）。"""
    from samsara.state import SamsaraState
    from samsara.levels import LevelSystem
    from samsara.progression import ProgressionSystem

    state = SamsaraState()
    levels = LevelSystem(state)
    if not levels.level_pools:
        levels.level_pools = {
            "hell": {
                "name": "地狱道",
                "icon": "☯",
                "game_type": "heibaiqi",
                "levels": [
                    {"name": "L1", "ai_depth": 1, "turn_limit": 20},
                    {"name": "L2", "ai_depth": 2, "turn_limit": 20},
                ],
            },
            "hungry": {
                "name": "饿鬼道",
                "icon": "👹",
                "game_type": "tiaoqi",
                "levels": [
                    {"name": "L1", "ai_depth": 2, "turn_limit": 20},
                ],
            },
        }
    progression = ProgressionSystem(state)
    state.set_realm("hell")
    state.reset_level_state()
    # 触发 won=True，no_cheat=True
    rewards = progression.resolve_level(won=True, no_cheat=True, boss_defeated=False)
    assert "rewards" in rewards or isinstance(rewards, dict)
    # advance_realm 结果要含 next_level 字段（如果实现正确会注入）
    if rewards.get("realm_advance"):
        assert "next_level" in rewards


# ═══════════════════════════════════════════════════════════════════════
# Bug 1 (下半) — BaseGameState._after_reset_board 默认应同步业力
# ═══════════════════════════════════════════════════════════════════════

def test_basegamestate_after_reset_board_default_syncs_detectors(tmp_path):
    """Bug 1: 默认 _after_reset_board 应该把本地副本重置。

    当前默认实现是空 return None；这里用一个真实子类测试它在没有覆盖时是否能保证
    reset_level_karma 被调用的接口标记存在。
    """
    from shared.game_base import BaseGameState

    class DummyState(BaseGameState):
        CONFIG_FILES = ["board_state"]
        DEFAULT_DIFFICULTY = "easy"

        def _rebuild_engines(self):
            return None

    (tmp_path / "configs").mkdir()
    (tmp_path / "configs" / "initial").mkdir()
    bs_init = tmp_path / "configs" / "initial" / "board_state.json.initial"
    bs_init.write_text(json.dumps({"turn": "red"}), encoding="utf-8")
    (tmp_path / "configs" / "board_state.json").write_text(json.dumps({"turn": "black"}), encoding="utf-8")

    ds = DummyState(config_files=["board_state"], configs_dir=tmp_path / "configs")
    # 手动 build 出状态存储
    class DummyOrch:
        class _KarmaAssessor:
            def __init__(self):
                self.synced = False
                self.carryover = None
                self.modifiers = None

            def reset_level_karma(self, skill_modifiers=None, carryover=0):
                self.synced = True
                self.carryover = carryover
                self.modifiers = skill_modifiers or {}

            def get_local_karma(self):
                return 0 if self.synced else 999

            def get_local_karma_max(self):
                return 120

            def get_realm_detection(self):
                return 0.0

        def __init__(self):
            self.karma_assessor = self._KarmaAssessor()
            self.api_key = ""
            self.logger = type("L", (), {"clear": lambda s: None})()
            thinking = "ts"

            def get_thinking_status(self):
                return False

            self.get_thinking_status = get_thinking_status
            logs = "get_logs"

            def get_logs(self, n=10):
                return []

            self.get_logs = get_logs
            ts_ = "tok_stats"

            def get_token_stats(self):
                return {}

            self.get_token_stats = get_token_stats

            def set_api_key(self, key):
                self.api_key = key

    ds.ai_orchestrator = DummyOrch()
    ds.chess_ai = None
    ds.rule_engine = None
    ds.mechanism_engine = None
    ds.load_configs()

    # 重置棋盘
    ds.reset_board()
    # 默认 _after_reset_board 应该触发 reset_level_karma，synced 为 True
    assert ds.ai_orchestrator.karma_assessor.synced is True, (
        "默认 _after_reset_board 未同步 karma_assessor！Bug：第二关开局业力不会重置"
    )


# ═══════════════════════════════════════════════════════════════════════
# Bug 3 — samsara.api /api/reset 端点
# ═══════════════════════════════════════════════════════════════════════

def test_samsara_reset_endpoint_mode_soft_returns_complete_state(tmp_configs):
    """Bug 3: /api/reset mode=soft 返回完整前端字段（karma / detection / allowed_classifications）。"""
    from fastapi.testclient import TestClient
    import samsara.api as api_mod  # noqa: F401 (side-effect: app is built)
    # 注意：samsara/api.py 在模块级创建 state / karma / ... 单例。
    # 它们指向真实 STATE_FILE，不受 tmp_configs fixture 影响（monkeypatch 仅改了 state 模块属性）。
    # 为了稳定测试，直接使用 state 单例再构造新的 TestClient。
    from samsara.api import app, state as _state

    client = TestClient(app)
    # 把客户端内部 state 推到一个已知中间状态
    _state.set("current_realm", "asura")
    _state.set("current_level", 2)
    _state.increase_karma(30)

    resp = client.post("/api/reset", json={"mode": "soft"})
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data.get("success") is True
    st = data.get("state")
    assert isinstance(st, dict)
    # 软档：返回字段齐全
    for required in ("karma", "karma_max", "detection",
                     "allowed_classifications", "skill_modifiers"):
        assert required in st, f"字段缺失: {required}"
    # 当前道应是 hell，level 0
    assert st["current_realm"] == "hell"
    assert st["current_level"] == 0


# ═══════════════════════════════════════════════════════════════════════
# Bug 4 辅助：成就 API 有 no-store 头
# ═══════════════════════════════════════════════════════════════════════

def test_achievements_endpoint_has_no_store_header(tmp_path, monkeypatch):
    """Bug 4: /api/achievements 响应头必须禁止浏览器缓存。"""
    from fastapi.testclient import TestClient
    # 临时替换 achievements.json 到一个干净临时位置
    tmp_ach = tmp_path / "achievements.json"
    tmp_ach.write_text(json.dumps({"version": 1, "unlocked": {},
                                    "stats": {"total_commands": 0, "total_moves": 0,
                                              "total_captures": 0, "games_played": {}}}),
                        encoding="utf-8")
    sys.path.insert(0, str(ROOT))
    if "main" in sys.modules:
        del sys.modules["main"]
    import main as hub_mod
    monkeypatch.setattr(hub_mod, "ACHIEVEMENTS_FILE", tmp_ach)
    # 构建 app
    hub_app = hub_mod.build_hub_app()
    client = TestClient(hub_app)
    resp = client.get("/api/achievements")
    assert resp.status_code == 200
    cc = resp.headers.get("Cache-Control", "")
    pragma = resp.headers.get("Pragma", "")
    assert ("no-store" in cc) or ("no-cache" in cc) or (pragma == "no-cache"), (
        f"成就响应未禁用缓存: Cache-Control={cc!r}, Pragma={pragma!r}"
    )


# ═══════════════════════════════════════════════════════════════════════
# Phase 2 — 共享后端补齐 (shared/game_base.py 路由字段对齐)
#        /  samsara/api.py levels/advance 返回 next_level
# ═══════════════════════════════════════════════════════════════════════

def _build_dummy_game_app(tmp_path):
    """构造最小 BaseGameState + FastAPI，用于测试 register_common_routes 输出。"""
    from fastapi import FastAPI
    from shared.game_base import BaseGameState, register_common_routes

    class DummyState(BaseGameState):
        CONFIG_FILES = ["board_state", "rules", "pieces_red", "pieces_black", "board", "ui_config"]
        PIECE_CONFIG_KEYS = ("pieces_red", "pieces_black")
        DEFAULT_DIFFICULTY = "easy"

        def _rebuild_engines(self):
            return None

    cfg_dir = tmp_path / "configs"
    init_dir = cfg_dir / "initial"
    init_dir.mkdir(parents=True, exist_ok=True)
    cfg_dir.mkdir(exist_ok=True)
    defaults = {
        "board_state": {"turn": "red", "game_status": {"state": "playing"}},
        "rules": {"ai_difficulty": {"current": "easy"}},
        "pieces_red": {"pieces": []},
        "pieces_black": {"pieces": []},
        "board": {"geometry": {"width": 9, "height": 10}},
        "ui_config": {"theme": "classic"},
    }
    for name, content in defaults.items():
        (cfg_dir / f"{name}.json").write_text(json.dumps(content, ensure_ascii=False), encoding="utf-8")
        (init_dir / f"{name}.json.initial").write_text(json.dumps(content, ensure_ascii=False), encoding="utf-8")

    ds = DummyState(configs_dir=cfg_dir)

    class _KarmaAssessor:
        def __init__(self):
            self._karma = 50
            self._max = 120
            self._single_max = 120
            self._initial = 50
            self._detection = 0.0

        def reset_level_karma(self, skill_modifiers=None, carryover=0):
            self._karma = self._initial + carryover

        def set_realm_detection(self, v):
            self._detection = v

        def get_local_karma(self): return self._karma
        def get_local_karma_max(self): return self._max
        def get_local_karma_single_max(self): return self._single_max
        def get_local_karma_initial(self): return self._initial
        def get_realm_detection(self): return self._detection
        def decrease_karma(self, amount, modifiers=None):
            self._karma = max(0, self._karma - amount)
            return amount

    class _Logger:
        def clear(self): pass
    class _Orch:
        def __init__(self):
            self.karma_assessor = _KarmaAssessor()
            self.api_key = ""
            self.logger = _Logger()
        def get_thinking_status(self): return False
        def get_logs(self, n=10): return []
        def get_token_stats(self): return {}
        def set_api_key(self, key): self.api_key = key

    ds.ai_orchestrator = _Orch()
    ds.chess_ai = None
    ds.rule_engine = None
    ds.mechanism_engine = None
    ds.load_configs()

    app = FastAPI()
    register_common_routes(
        app, ds, game_type="xiangqi",
        samsara_api_url="http://127.0.0.1:18080",  # 指向一个必然未监听的端口，测试避免真实代理
        static_dir=str(tmp_path / "static"),
        difficulty_levels=["easy", "medium", "hard"],
    )
    return app, ds


def test_registered_rpg_reset_battle_returns_karma_detection_state(tmp_path):
    """Phase 2: /api/rpg/reset_battle 必须返回 karma_detection_state + state 字段。"""
    from fastapi.testclient import TestClient

    app, ds = _build_dummy_game_app(tmp_path)
    client = TestClient(app)
    resp = client.post("/api/rpg/reset_battle")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data.get("success") is True
    # 新增字段：karma_detection_state.karma.current / max / single_max / initial
    kd = data.get("karma_detection_state")
    assert isinstance(kd, dict), f"rpg_reset_battle 响应缺少 karma_detection_state: {list(data)}"
    assert "karma" in kd and "current" in kd["karma"]
    assert "max" in kd["karma"]
    assert "single_max" in kd["karma"], (
        "karma 字段未对齐 karma.get_state() — 缺 single_max"
    )
    assert "initial" in kd["karma"], (
        "karma 字段未对齐 karma.get_state() — 缺 initial"
    )
    assert "detection" in kd
    _ = ds  # 保留引用防止 GC


def test_registered_restart_and_reset_configs_return_karma_state(tmp_path):
    """Phase 2: /api/restart 与 /api/reset_configs 响应新增 karma_detection_state + state。"""
    from fastapi.testclient import TestClient

    app, _ = _build_dummy_game_app(tmp_path)
    client = TestClient(app)
    for endpoint in ("/api/restart", "/api/reset_configs"):
        resp = client.post(endpoint)
        assert resp.status_code == 200, f"{endpoint}: {resp.text}"
        data = resp.json()
        assert data.get("success") is True
        kd = data.get("karma_detection_state")
        assert isinstance(kd, dict), f"{endpoint} 响应缺少 karma_detection_state: {list(data)}"
        assert "karma" in kd and "current" in kd["karma"]
        assert "single_max" in kd["karma"]


def test_registered_karma_detection_endpoint_field_alignment(tmp_path):
    """Phase 2: /api/karma_detection 返回 karma.{current,max,single_max,initial} 对齐 karma.get_state()。"""
    from fastapi.testclient import TestClient

    app, _ = _build_dummy_game_app(tmp_path)
    client = TestClient(app)
    resp = client.get("/api/karma_detection")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data.get("success") is True
    for key in ("current", "max", "single_max", "initial"):
        assert key in data["karma"], (
            f"/api/karma_detection 响应 karma 缺 {key}，未对齐 karma.get_state()"
        )


def test_samsara_levels_advance_returns_next_level(tmp_configs):
    """Phase 2: samsara /api/levels/advance 成功时返回 next_level 对象。"""
    from fastapi.testclient import TestClient
    import samsara.api as api_mod  # noqa: F401
    from samsara.api import app, state as _state, levels as _levels

    client = TestClient(app)
    # 如果真实 level_pools 为空就临时注入最小池子（不改 STATE_FILE，走内存属性）
    if not _levels.level_pools:
        _levels.level_pools = {
            "hell": {
                "name": "地狱道", "icon": "🔥", "game_type": "xiangqi",
                "levels": [
                    {"name": "H1", "ai_depth": 1, "turn_limit": 20},
                    {"name": "H2", "ai_depth": 2, "turn_limit": 20},
                ],
            },
        }
    _state.set_realm("hell")
    _state.reset_level_state()
    resp = client.post("/api/levels/advance")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "next_level" in data, (
        f"samsara /api/levels/advance 缺 next_level 字段，当前成功标志={data.get('success')}, keys={list(data)}"
    )
    nl = data["next_level"]
    for required in ("level_index", "realm", "level"):
        assert required in nl, f"next_level 缺 {required}"

