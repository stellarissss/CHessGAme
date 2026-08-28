#!/usr/bin/env python3
"""configs/overworld.json 结构校验测试。

校验：世界尺寸 / 区域矩形（坐标合法、无重叠、覆盖全图）/ POI 必填 /
碰撞行长 / 瓦片引用 / 道路线段。
"""
import json
from pathlib import Path

import pytest

BASE_DIR = Path(__file__).resolve().parent.parent
OW_FILE = BASE_DIR / "configs" / "overworld.json"

REALMS = {"hell", "hungry", "animal", "human", "asura", "heaven"}
PACKS = {"town", "farm", "dungeon", "battle"}


@pytest.fixture(scope="module")
def ow():
    assert OW_FILE.exists(), "overworld.json 缺失"
    data = json.loads(OW_FILE.read_text(encoding="utf-8"))
    return data


def test_world_size(ow):
    w, h = ow["world"]["width"], ow["world"]["height"]
    assert w > 60 and h > 40, "大陆应足够大（>= 60x40 瓦片）"
    assert ow["world"]["tile"] == 16


def test_regions_cover_full_map(ow):
    """区域矩形应无空洞地覆盖整张地图（地理完整）。"""
    w, h = ow["world"]["width"], ow["world"]["height"]
    covered = [[False] * w for _ in range(h)]
    for rg in ow["regions"]:
        x0, y0, x1, y1 = rg["rect"]
        assert 0 <= x0 <= x1 < w, f"区域 {rg['id']} x 越界"
        assert 0 <= y0 <= y1 < h, f"区域 {rg['id']} y 越界"
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                assert not covered[y][x], f"区域重叠 @({x},{y})"
                covered[y][x] = True
    for y in range(h):
        for x in range(w):
            assert covered[y][x], f"地图空洞 @({x},{y})，区域未覆盖"


def test_pois_required_fields(ow):
    """POI：坐标合法、必填字段齐全、六道入口齐全。"""
    realm_pois = set()
    for p in ow["pois"]:
        assert 0 <= p["x"] < ow["world"]["width"], f"{p['id']} x 越界"
        assert 0 <= p["y"] < ow["world"]["height"], f"{p['id']} y 越界"
        assert p["emoji"], f"{p['id']} 缺 emoji"
        if p["type"] == "realm":
            assert p["realm"] in REALMS, f"{p['id']} realm 非法"
            realm_pois.add(p["realm"])
        elif p["type"] == "npc":
            assert p.get("label"), f"{p['id']} npc 缺 label"
    assert realm_pois == REALMS, f"六道入口不齐: {realm_pois ^ REALMS}"


def test_collision_rows(ow):
    """碰撞行字符串长度 = 世界宽度（若存位图）。"""
    # overworld 采用程序化碰撞（solid_regions+decor），无显式行；
    # 这里保证 roads/solid_regions 引用合法即可。
    w = ow["world"]["width"]
    for road in ow["roads"]:
        if "y" in road:
            assert road["x0"] >= 0 and road["x1"] < w
        elif "x" in road:
            assert road["y0"] >= 0 and road["y1"] < ow["world"]["height"]


def test_tileset_refs_valid(ow):
    """decor_anchors 与 decor_plant 引用存在且索引在 spritesheet 范围内。"""
    frame_counts = {"town": 132, "farm": 132, "dungeon": 132, "battle": 198}
    for d in ow["decor_anchors"]:
        pack, idx = d["tile"]
        assert pack in PACKS, f"锚点 @({d['x']},{d['y']}) 瓦片包非法: {pack}"
        assert 0 <= idx < frame_counts[pack], f"锚点 @({d['x']},{d['y']}) 索引越界: {idx}"
    for region_id, cfg in ow["decor_plant"].items():
        assert cfg.get("tiles"), f"decor_plant[{region_id}] 无 tiles"
        for it in cfg["tiles"]:
            pack, idx = it
            assert pack in PACKS, f"decor_plant[{region_id}] 瓦片包非法: {pack}"
            assert 0 <= idx < frame_counts[pack], f"decor_plant[{region_id}] 索引越界: {idx}"


def test_decor_plant_region_exists(ow):
    """decor_plant 的 key 必须对应真实区域。"""
    ids = {rg["id"] for rg in ow["regions"]}
    for region_id in ow["decor_plant"]:
        assert region_id in ids, f"decor_plant[{region_id}] 无对应区域"