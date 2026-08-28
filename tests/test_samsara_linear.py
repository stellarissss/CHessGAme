#!/usr/bin/env python3
"""剧情模式线性结算回归测试（取消路径制后）。

验证：胜利推进 levels_passed → 五关通关 → 道 completed → 沙盒解锁；
      失败不推进。使用临时状态文件隔离存档。
"""
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import samsara.state as state_mod


@pytest.fixture()
def client(tmp_path, monkeypatch):
    state_file = tmp_path / "state.json"
    monkeypatch.setattr(state_mod, "STATE_FILE", state_file)
    # 每个用例前硬重置，保证状态隔离
    from samsara.api import app
    c = TestClient(app)
    c.post("/api/reset", json={"mode": "hard"})
    return c


def _win(client, no_cheat=False, boss=False):
    return client.post("/api/progression/resolve",
                       json={"won": True, "no_cheat": no_cheat, "boss_defeated": boss}).json()


def test_win_increments_levels_passed(client):
    r = client.post("/api/levels/start", json={"realm": "hell", "level_index": 0}).json()
    assert r["success"]
    d = _win(client)
    assert d["success"]
    assert d["state"]["realm_progress"]["hell"]["levels_passed"] == 1


def test_loss_does_not_advance(client):
    r = client.post("/api/levels/start", json={"realm": "hell", "level_index": 0}).json()
    assert r["success"]
    d = client.post("/api/progression/resolve", json={"won": False}).json()
    assert d["success"]
    assert d["state"]["realm_progress"]["hell"]["levels_passed"] == 0


def test_full_realm_clear_unlocks_sandbox(client):
    """地狱道 5 关全通 → completed=True + 沙盒解锁。"""
    for idx in range(5):
        r = client.post("/api/levels/start", json={"realm": "hell", "level_index": idx}).json()
        assert r["success"]
        _win(client, boss=(idx == 4))
    st = client.get("/api/state").json()
    rp = st["realm_progress"]["hell"]
    assert rp["levels_passed"] == 5
    assert rp["completed"] is True
    assert "hell" in st["sandbox_unlocked"]


def test_realm_levels_endpoint_linear(client):
    """选关接口返回线性关卡列表（completed/current/locked + Boss）。"""
    for i in range(3):
        client.post("/api/levels/start", json={"realm": "hell", "level_index": i}).json()
        _win(client)
    d = client.get("/api/levels/realm/hell").json()
    assert d["success"]
    statuses = [lv["status"] for lv in d["levels"]]
    assert statuses == ["completed", "completed", "completed", "current", "locked"]
    types = [lv["type"] for lv in d["levels"]]
    assert types[-1] == "boss"


def test_no_map_apis(client):
    """节点路径制 API 已彻底删除。"""
    for url in ("/api/map/progress", "/api/map/hell", "/api/map/start", "/api/map/resolve"):
        assert client.get(url).status_code == 404, f"{url} 应已删除"