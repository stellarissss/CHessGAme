"""六道小世界大地图：端到端地图结算回归测试。

覆盖闭环：
  load_map 懒初始化（start cleared，后继 available）
  map_start 进入节点 → 对局胜负 → progression/resolve 结算该节点
  胜利：节点 cleared + 相邻解锁；失败：保持 available 可重试
  Boss 节点胜利：道 completed + 解锁沙盒
  地图模式不再线性推进 current_level / 重复计数 levels_passed
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


@pytest.fixture
def tmp_configs(monkeypatch, tmp_path):
    """重定向 samsara configs 目录到 tmp_path，避免污染项目。"""
    import samsara.state as st_mod
    new_cfg_dir = tmp_path / "configs"
    new_cfg_dir.mkdir(parents=True, exist_ok=True)
    new_state_file = new_cfg_dir / "samsara_state.json"
    monkeypatch.setattr(st_mod, "CONFIGS_DIR", new_cfg_dir)
    monkeypatch.setattr(st_mod, "STATE_FILE", new_state_file)
    yield new_cfg_dir, new_state_file


@pytest.fixture
def client(tmp_configs):
    # tmp_configs 已重定向 samsara STATE_FILE 到临时目录，再导入 api 生成干净单例
    import samsara.api as api_mod
    tc = TestClient(api_mod.app)
    # 每个用例 hard 重置：清掉共享单例的上一用例进度（含地图节点状态）
    tc.post("/api/reset", json={"mode": "hard"})
    return tc, api_mod


def test_map_init_lazy_ok(client):
    tc, _ = client
    r = tc.get("/api/map/hell")
    assert r.status_code == 200
    body = r.json()
    assert body["success"] is True
    nodes = {n["id"]: n["status"] for n in body["map"]["nodes"]}
    assert nodes["n0"] == "cleared"   # start 已通
    assert nodes["n1"] == "available"  # start 后继可挑战
    assert nodes["n2"] == "available"
    assert nodes["n3"] == "available"
    assert nodes["n4"] == "locked"    # 深层节点保持锁定


def test_map_win_settles_node_and_unlocks_neighbor(client):
    tc, _ = client
    # 进入 n1（地狱道第1关）
    r = tc.post("/api/map/start", json={"realm": "hell", "node_id": "n1"})
    assert r.status_code == 200
    start = r.json()
    assert start["success"] is True
    assert start["level"] is not None

    # 对局胜利 → /api/progression/resolve 应结算地图节点
    r = tc.post("/api/progression/resolve", json={"won": True, "no_cheat": True, "boss_defeated": False})
    body = r.json()
    assert body.get("rewards", {}).get("map_node", {}).get("won") is True
    assert body["rewards"]["map_node"]["node_status"] == "cleared"
    assert body["rewards"]["map_node"]["unlocked"] == ["n4"]  # n1 -> n4 解锁

    # 再查地图：n1 已 cleared，n4 已 available
    r = tc.get("/api/map/hell")
    nodes = {n["id"]: n["status"] for n in r.json()["map"]["nodes"]}
    assert nodes["n1"] == "cleared"
    assert nodes["n4"] == "available"
    # 地图模式不应线性推进 current_level
    assert tc.get("/api/state").json()["current_level"] == 0


def test_map_loss_keeps_node_available(client):
    tc, _ = client
    tc.post("/api/map/start", json={"realm": "hell", "node_id": "n1"})
    r = tc.post("/api/progression/resolve", json={"won": False, "no_cheat": False, "boss_defeated": False})
    body = r.json()
    assert body["rewards"]["map_node"]["won"] is False
    assert body["rewards"]["map_node"]["node_status"] == "available"
    nodes = {n["id"]: n["status"] for n in tc.get("/api/map/hell").json()["map"]["nodes"]}
    assert nodes["n1"] == "available"


def test_map_boss_win_completes_realm_and_unlocks_sandbox(client):
    tc, _ = client
    # 直接可进入的节点已 available，把 n1->n4 与 n3->n6 依次通关后进入 boss n7
    # 更简单：直接结算 boss 需先解锁。走真实路径：n3 胜利解锁 n6，n6 胜利解锁 n7。
    tc.post("/api/map/start", json={"realm": "hell", "node_id": "n3"})
    assert tc.post("/api/progression/resolve", json={"won": True, "no_cheat": True}).json()["rewards"]["map_node"]["unlocked"] == ["n6"]
    tc.post("/api/map/start", json={"realm": "hell", "node_id": "n6"})
    assert tc.post("/api/progression/resolve", json={"won": True, "no_cheat": True}).json()["rewards"]["map_node"]["unlocked"] == ["n7"]
    # 进入并击败 Boss
    tc.post("/api/map/start", json={"realm": "hell", "node_id": "n7"})
    r = tc.post("/api/progression/resolve", json={"won": True, "no_cheat": True, "boss_defeated": True}).json()
    mr = r["rewards"]["map_node"]
    assert mr["node_status"] == "cleared"
    assert mr["realm_completed"] is True
    assert "hell" in tc.get("/api/map/progress").json()["sandbox_unlocked"]


def test_advance_level_noop_in_map_mode(client):
    tc, _ = client
    tc.post("/api/map/start", json={"realm": "hell", "node_id": "n3"})
    # 地图模式下线性推进被拦截
    r = tc.post("/api/levels/advance").json()
    assert r["success"] is False