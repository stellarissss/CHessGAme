"""
Task 8 综合验证：
  1. 全项目 AST 解析通过
  2. 已有 4 套 suite 全部通过：test_task1_small_fixes / test_task23_game_base / test_task45_main_refactor / test_task67_pos_index
  3. 每棋类 main.py 能构建 FastAPI app 实例（用子进程隔离，避免同模块名冲突：各棋类 chess_ai 同名）
  4. 每棋类路由契约：总路由>25；必须含 /api/command,/api/move,/api/ai_move,/api/undo,/api/valid_moves,/samsara/{path:path}
运行：python tests/test_task8_integration.py
"""
import sys, ast, json, subprocess, tempfile, pathlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

FAIL = []

def check(cond, msg):
    if not cond:
        FAIL.append(msg)
        print(f"❌ FAIL {msg}")
    else:
        print(f"✅ PASS {msg}")

# ── 1. 全项目 AST ──
ast_count = 0
for py in ROOT.rglob("*.py"):
    if any(part in {"sandbox", ".venv", "__pycache__", "node_modules"} for part in py.parts):
        continue
    try:
        ast.parse(py.read_text(encoding="utf-8"))
        ast_count += 1
    except SyntaxError as e:
        check(False, f"SYNTAX: {py}: {e}")
check(ast_count >= 50, f"全项目 AST 通过（{ast_count} 个模块）")

# ── 2. suites ──
sys.path.insert(0, str(ROOT))
for suite in ["test_task1_small_fixes.py", "test_task23_game_base.py",
              "test_task45_main_refactor.py", "test_task67_pos_index.py"]:
    result = subprocess.run(
        [sys.executable, str(ROOT / "tests" / suite)],
        cwd=str(ROOT), capture_output=True, text=True, timeout=420,
    )
    ok = result.returncode == 0
    check(ok, f"suite {suite}: rc={result.returncode}")
    if not ok:
        print(" --- stdout tail ---")
        print(result.stdout[-2500:])
        print(" --- stderr tail ---")
        print(result.stderr[-1500:])

# ── 3/4. 每棋类 FastAPI 路由契约（子进程隔离导入） ──
INSPECTOR = '''
import sys, json
sys.path.insert(0, "{game_path}")
sys.path.insert(0, "{root}")
# 为避免缓存模块复用，先删同名字典
for mod_name in list(sys.modules.keys()):
    if mod_name in ("chess_ai","ai_orchestrator","rule_engine","mechanism_engine",
                    "schema_validator","karma_engine","game_base","achievement_engine",
                    "skill_engine","custom_rule_engine","personality_engine","utils",
                    "karma_assessor"):
        del sys.modules[mod_name]
import importlib.util
spec = importlib.util.spec_from_file_location("app_main","{main_path}")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
app = mod.app
routes = sorted(set(getattr(r,"path","") for r in getattr(app,"routes",[])))
print(json.dumps(routes, ensure_ascii=False))
'''

GAMES = ["xiangqi", "wuziqi", "weiqi", "dongwuqi", "tiaoqi", "heibaiqi"]
GAME_SPECIFIC = {"/api/command", "/api/move", "/api/ai_move", "/api/undo", "/api/valid_moves"}
COMMON_HINTS = [
    # 依据 register_common_routes 注册的真实路径（来自 4 个 xiangqi 路由清单的交集）
    "/samsara",               # /samsara/{path:path} 代理
    "/api/config/",           # /api/config/all + /api/config/{name}
    "/api/difficulty",        # GET/POST difficulty + levels 子路由
    "/api/karma",             # karma GET + karma/recover POST（统一前缀命中）
    "/api/apikey",            # apikey POST + status
    "/api/mechanisms",        # 机制清单 GET
    "/api/rpg/apply",         # rpg apply_patch / apply_rules 共用前缀
    "/api/token_stats",       # AI token 统计
    "/api/reset_configs",     # 重置
    "/api/undo_config",       # 撤销
    "/api/thinking_status",   # AI 思考状态
    "/api/logs",              # 日志
]

for g in GAMES:
    game_path = str(ROOT / g)
    main_path = str(ROOT / g / "main.py")
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False, encoding="utf-8") as f:
        f.write(INSPECTOR.format(game_path=game_path.replace("\\", "\\\\"),
                                 root=str(ROOT).replace("\\", "\\\\"),
                                 main_path=main_path.replace("\\", "\\\\")))
        script = f.name
    try:
        result = subprocess.run([sys.executable, script], capture_output=True, text=True, timeout=120)
        if result.returncode != 0:
            check(False, f"{g} FastAPI app 构建失败: {result.stderr[-600:].strip() or result.stdout[-400:]}")
            continue
        try:
            routes = json.loads(result.stdout.strip().splitlines()[-1])
        except Exception as e:
            check(False, f"{g} 路由 JSON 解析失败: {e}; stdout={result.stdout[-400:]}")
            continue
        route_set = set(routes)
        check(len(route_set) > 25, f"{g}: 路由数>25（实际 {len(route_set)}）")
        missing = GAME_SPECIFIC - route_set
        check(not missing, f"{g} 专有路由完整（缺 {sorted(missing)}）")
        # 公共路由：命中多少个 COMMON_HINTS 前缀
        hits = sum(1 for hint in COMMON_HINTS if any(r.startswith(hint) for r in route_set))
        check(hits >= 9, f"{g}: 公共路由覆盖率（≥9 类）实际 {hits}")
        check(any(r.startswith("/samsara") for r in route_set), f"{g}: 存在 /samsara 代理路由")
    finally:
        try:
            Path(script).unlink()
        except Exception:
            pass

# ── summary ──
print()
TOTAL = 1 + 4 + 6 * 4  # AST + 4 suites + 6 games × 4 checks (routes count / specific / common hints / samsara)
passed = TOTAL - len(FAIL)
print(f"Total: {passed}/{TOTAL} PASS")
if FAIL:
    print("FAILS:")
    for f in FAIL:
        print(" -", f)
    raise SystemExit(1)
