"""Red-phase tests for Task 2-3 (shared/game_base.py).

Environment note: PYTHONOPTIMIZE=1 strips `assert`. Use explicit RuntimeError.
"""
import sys
import re
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent

def _read(p):
    return (ROOT / p).read_text(encoding="utf-8", errors="replace")

def _check(cond, msg):
    if not cond:
        raise RuntimeError(msg)

# ==== AC-5 structural tests ====

def test_gamebase_file_exists():
    p = ROOT / "shared" / "game_base.py"
    _check(p.exists(), "shared/game_base.py file does not exist yet")
    return True

def test_basegamestate_class_exists_with_required_methods():
    sv = _read("shared/game_base.py")
    _check("class BaseGameState" in sv, "class BaseGameState not found")
    # Required methods
    required_methods = [
        "load_configs", "save_config", "save_all",
        "apply_config_update", "undo_last_config_change",
        "reset_board", "_rebuild_engines",
    ]
    missing = [m for m in required_methods if not re.search(fr"def {m}\b", sv)]
    _check(not missing, f"BaseGameState missing methods: {missing}")
    # Optional hook _after_reset_board (used by dongwuqi for karma reset)
    _check(re.search(r"def _after_reset_board\b", sv),
           "_after_reset_board hook missing (needed by dongwuqi)")
    return True

def test_register_common_routes_function_exists():
    sv = _read("shared/game_base.py")
    _check(re.search(r"def register_common_routes\b", sv),
           "register_common_routes() function not found")
    return True

def test_route_count_and_key_routes_present():
    """register_common_routes must register >= 20 routes including critical ones."""
    sv = _read("shared/game_base.py")
    # Count @app.get/@app.post/@app.api_route etc. decorations *within* the function body.
    # Simplified check: file overall @app. occurrences for the route registration code
    # (also covers nested function body since it's in the file text)
    app_decorators = re.findall(r"@app\.(get|post|put|delete|patch|api_route|websocket)\s*\(", sv)
    _check(len(app_decorators) >= 20,
           f"Only {len(app_decorators)} @app routes found in game_base.py, need >= 20")

    # Check specific critical routes (by their path string)
    critical_paths = [
        r'"/"',  # index
        r'"/api/config/all"',
        r'"/api/config/\{config_name\}"',
        r'"/api/apikey"',
        r'"/api/apikey/status"',
        r'"/api/undo_config"',
        r'"/api/reset_configs"',
        r'"/api/restart"',
        r'"/api/difficulty"',
        r'"/api/logs"',
        r'"/api/clear_logs"',
        r'"/api/karma_detection"',
        r'"/api/karma/recover"',
        r'"/api/thinking_status"',
        r'"/api/rpg/apply_patch"',
        r'"/api/rpg/apply_rules"',
        r'"/api/rpg/reset_battle"',
        r'"/api/level/info"',
        r'"/api/level/apply"',
        r'"/api/level/complete"',
        r'"/api/mechanisms"',
        r'"/api/stop_mechanism"',
        r'"/api/token_stats"',
        r'"/samsara/\{path:path\}"',
    ]
    missing = [p for p in critical_paths if not re.search(p, sv)]
    _check(not missing,
           f"Missing critical route strings in game_base.py: {missing}")
    return True

def test_pydantic_models_exported():
    """shared/game_base.py should also define and export Pydantic models."""
    sv = _read("shared/game_base.py")
    required_classes = ["PlayerCommand", "SetApiKey", "DifficultyRequest"]
    missing = [c for c in required_classes if not re.search(fr"class {c}\s*\(", sv)]
    _check(not missing, f"Missing Pydantic model classes: {missing}")
    return True

def test_ast_valid():
    import ast
    p = str(ROOT / "shared" / "game_base.py")
    src = _read("shared/game_base.py")
    try:
        ast.parse(src)
    except SyntaxError as e:
        raise RuntimeError(f"Syntax error in shared/game_base.py: {e}")
    return True


def main():
    tests = [
        ("file existence", test_gamebase_file_exists),
        ("BaseGameState required methods", test_basegamestate_class_exists_with_required_methods),
        ("register_common_routes exists", test_register_common_routes_function_exists),
        (">=20 routes + critical routes present", test_route_count_and_key_routes_present),
        ("Pydantic models (PlayerCommand/SetApiKey/DifficultyRequest)", test_pydantic_models_exported),
        ("Python AST valid", test_ast_valid),
    ]
    ok = 0
    for name, fn in tests:
        try:
            fn()
            print(f"✅ PASS {name}")
            ok += 1
        except RuntimeError as e:
            print(f"❌ FAIL {name}")
            for ln in str(e).splitlines()[:5]:
                print(f"   {ln}")
        except Exception as e:
            print(f"⚠️  ERROR {name}: {type(e).__name__}: {e}")
    print(f"\nTotal: {ok}/{len(tests)} PASS")
    return 0 if ok == len(tests) else 1

if __name__ == "__main__":
    sys.exit(main())
