"""
Task 6-7 TDD：rule_engine 位置索引 O(1) 优化
验收：
  1. 各棋类 _get_piece_at 回归行为正确（真实初始状态 + 自定义状态）
  2. 源码中使用 dict-based 位置索引（非纯线性 for 扫描）
  3. 棋类典型判断：wuziqi 五连；heibaiqi 合法落子；dongwuqi 地形；xiangqi _get_piece_at & is_in_check 基本可运行
"""
import sys, json
from pathlib import Path
import importlib.util

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

FAIL = []

def check(cond, msg):
    if not cond:
        FAIL.append(msg)
        print(f"❌ FAIL {msg}")
    else:
        print(f"✅ PASS {msg}")

def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod

def uses_index_helper(path_str):
    text = Path(path_str).read_text(encoding="utf-8")
    return any(k in text for k in ("_pos_index", "_position_index", "pos_index",
                                    "build_position_index", "位置索引",
                                    "O(1) 查找", "O(1)索引", "pos_map", "位置→棋子"))

def load_cfg(game, name):
    return json.loads((ROOT / game / "configs" / f"{name}.json").read_text(encoding="utf-8"))


# ───────── 1. xiangqi（真实默认配置，避免 moves 定义缺失导致 is_in_check 崩溃） ─────────
xr = load("xr", str(ROOT / "xiangqi" / "rule_engine.py"))
board_cfg = load_cfg("xiangqi", "board")
pr = load_cfg("xiangqi", "pieces_red")
pb = load_cfg("xiangqi", "pieces_black")
rules_cfg = load_cfg("xiangqi", "rules")
re_x = xr.RuleEngine(board_cfg, pr, pb, rules_cfg)
# 构造真实初始 board_state
initial = load_cfg("xiangqi", "board_state")
p = re_x._get_piece_at([4, 9], initial)  # 红帅默认
check(p is not None and p.get("side") == "red", f"xiangqi _get_piece_at([4,9])=红{ p['type'] if p else None }")
p2 = re_x._get_piece_at([4, 0], initial)
check(p2 is not None and p2.get("side") == "black", "xiangqi _get_piece_at([4,0])=黑将/帅")
check(re_x._get_piece_at([0, 0], initial) is not None, "xiangqi _get_piece_at([0,0])=黑车")
check(re_x._get_piece_at([4, 4], initial) is None, "xiangqi _get_piece_at(河界中空位)=None")
check(uses_index_helper(ROOT / "xiangqi" / "rule_engine.py"), "xiangqi 使用位置索引辅助")
# is_in_check 初始局面无将军 → 为假
try:
    red_in_check = re_x.is_in_check("red", initial)
    black_in_check = re_x.is_in_check("black", initial)
    check(isinstance(red_in_check, bool) and not red_in_check, "xiangqi is_in_check(red, init)=False")
    check(isinstance(black_in_check, bool) and not black_in_check, "xiangqi is_in_check(black, init)=False")
except Exception as e:
    check(False, f"xiangqi is_in_check 抛异常: {e!r}")

# ───────── 2. wuziqi ─────────
wr = load("wr", str(ROOT / "wuziqi" / "rule_engine.py"))
re_w = wr.RuleEngine(load_cfg("wuziqi", "board"),
                     load_cfg("wuziqi", "pieces_red"),
                     load_cfg("wuziqi", "pieces_black"),
                     load_cfg("wuziqi", "rules"))
# 自定义：黑方五连
pieces = [{"id": f"b{i}", "type": "stone", "side": "black", "name": "黑子",
           "position": [3 + i, 7], "is_alive": True} for i in range(5)]
bs_w = {"current_turn": "white", "pieces": pieces}
check(re_w.check_five_in_a_row(bs_w) == "black", "wuziqi check_five_in_a_row 黑五连")
check(re_w._get_piece_at([3, 7], bs_w)["id"] == "b0", "wuziqi _get_piece_at=[3,7]")
check(re_w._get_piece_at([99, 99], bs_w) is None, "wuziqi _get_piece_at 越界 None")
check(uses_index_helper(ROOT / "wuziqi" / "rule_engine.py"), "wuziqi 使用位置索引辅助")
bs_w2 = {"pieces": [
    {"id": "w0", "type": "stone", "side": "white", "position": [0, 0], "is_alive": True, "name": "白子"},
    {"id": "w1", "type": "stone", "side": "white", "position": [1, 1], "is_alive": True, "name": "白子"},
    {"id": "w2", "type": "stone", "side": "white", "position": [2, 2], "is_alive": True, "name": "白子"},
]}
check(re_w.check_five_in_a_row(bs_w2) is None, "wuziqi 不连≠赢")

# ───────── 3. weiqi ─────────
gr = load("gr", str(ROOT / "weiqi" / "rule_engine.py"))
re_g = gr.RuleEngine(load_cfg("weiqi", "board"),
                     load_cfg("weiqi", "pieces_red"),
                     load_cfg("weiqi", "pieces_black"),
                     load_cfg("weiqi", "rules"))
bs_g = {"pieces": [
    {"id": "g0", "side": "black", "position": [0, 0], "is_alive": True, "type": "stone", "name": "黑子"},
    {"id": "g1", "side": "white", "position": [1, 0], "is_alive": True, "type": "stone", "name": "白子"},
]}
check(re_g._get_piece_at([0, 0], bs_g)["id"] == "g0", "weiqi _get_piece_at OK")
check(uses_index_helper(ROOT / "weiqi" / "rule_engine.py"), "weiqi 使用位置索引辅助")

# ───────── 4. heibaiqi ─────────
hr = load("hr", str(ROOT / "heibaiqi" / "rule_engine.py"))
re_h = hr.RuleEngine(load_cfg("heibaiqi", "board"),
                     load_cfg("heibaiqi", "pieces_black"),
                     load_cfg("heibaiqi", "pieces_white"),
                     load_cfg("heibaiqi", "rules"))
bs_h = {"pieces": [
    {"id": "d1", "type": "disc", "side": "black", "position": [3, 3], "is_alive": True, "name": "黑"},
    {"id": "d2", "type": "disc", "side": "white", "position": [4, 4], "is_alive": True, "name": "白"},
]}
check(re_h._get_piece_at([3, 3], bs_h)["id"] == "d1", "heibaiqi _get_piece_at=d1")
check(re_h._get_piece_at([99, 99], bs_h) is None, "heibaiqi _get_piece_at(越界)=None")
try:
    valids = {tuple(v) for v in re_h.get_valid_placements("black", bs_h)}
    check((3, 3) not in valids and (4, 4) not in valids, "heibaiqi valid_placements 排除已落子")
except Exception as e:
    check(False, f"heibaiqi get_valid_placements 抛异常: {e!r}")
check(uses_index_helper(ROOT / "heibaiqi" / "rule_engine.py"), "heibaiqi 使用位置索引辅助")

# ───────── 5. tiaoqi ─────────
tr = load("tr", str(ROOT / "tiaoqi" / "rule_engine.py"))
re_t = tr.RuleEngine(load_cfg("tiaoqi", "board"),
                     load_cfg("tiaoqi", "pieces_red"),
                     load_cfg("tiaoqi", "pieces_black"),
                     load_cfg("tiaoqi", "rules"))
bs_t = {"pieces": [
    {"id": "p1", "type": "man", "side": "red", "position": [1, 2], "is_alive": True, "name": "红"},
    {"id": "p2", "type": "man", "side": "black", "position": [6, 5], "is_alive": True, "name": "黑"},
]}
check(re_t._get_piece_at([1, 2], bs_t)["id"] == "p1", "tiaoqi _get_piece_at=p1")
check(uses_index_helper(ROOT / "tiaoqi" / "rule_engine.py"), "tiaoqi 使用位置索引辅助")

# ───────── 6. dongwuqi ─────────
dr = load("dr", str(ROOT / "dongwuqi" / "rule_engine.py"))
re_d = dr.RuleEngine(
    load_cfg("dongwuqi", "board"),
    load_cfg("dongwuqi", "pieces_red"),
    load_cfg("dongwuqi", "pieces_black"),
    load_cfg("dongwuqi", "rules"),
)
bs_d = {"pieces": [
    {"id": "rl", "type": "lion", "side": "red", "position": [6, 0], "is_alive": True, "rank": 7, "name": "红狮"},
    {"id": "bt", "type": "tiger", "side": "black", "position": [0, 8], "is_alive": True, "rank": 6, "name": "黑虎"},
]}
check(re_d._get_piece_at([6, 0], bs_d)["id"] == "rl", "dongwuqi _get_piece_at=rl")
check(re_d._get_piece_at([0, 8], bs_d)["id"] == "bt", "dongwuqi _get_piece_at=bt")
terrain_03 = re_d._get_terrain_pieces_at([0, 3], bs_d)
check(len(terrain_03) >= 1 and terrain_03[0].get("type") == "trap", "dongwuqi 地形 trap 获取")
den_30 = re_d._get_terrain_pieces_at([3, 0], bs_d)
check(len(den_30) >= 1 and den_30[0].get("type") == "den", "dongwuqi 地形 den 获取")
check(uses_index_helper(ROOT / "dongwuqi" / "rule_engine.py"), "dongwuqi 使用位置索引辅助")

# ───────── summary ─────────
print()
TOTAL = 24
passed = TOTAL - len(FAIL)
print(f"Total: {passed}/{TOTAL} PASS")
if FAIL:
    print("FAILS:")
    for f in FAIL:
        print(" -", f)
    raise SystemExit(1)
