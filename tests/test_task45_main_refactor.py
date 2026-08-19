"""Red-phase tests for Task 4-5 (refactor 6 main.py to use shared base).

Must FAIL before refactoring (because no main.py uses shared imports yet).
"""
import re
import sys
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SERVICES = ["xiangqi", "wuziqi", "weiqi", "dongwuqi", "tiaoqi", "heibaiqi"]


def _read(p):
    return (ROOT / p).read_text(encoding="utf-8", errors="replace")


def _check(cond, msg):
    if not cond:
        raise RuntimeError(msg)


def test_all_use_shared_base_import():
    failures = []
    for svc in SERVICES:
        sv = _read(f"{svc}/main.py")
        has_base_import = (
            "from shared.game_base import" in sv
            or "from game_base import BaseGameState" in sv
            or "import game_base" in sv
        )
        if not has_base_import:
            failures.append(svc)
    _check(not failures, f"Main files missing shared/game_base import: {failures}")
    return True


def test_all_call_register_common_routes():
    failures = []
    for svc in SERVICES:
        sv = _read(f"{svc}/main.py")
        if "register_common_routes(" not in sv:
            failures.append(svc)
    _check(not failures, f"Main files missing register_common_routes(...) call: {failures}")
    return True


def test_each_gamestate_inherits_basegamestate():
    """class GameState(...) must have BaseGameState in its base class list."""
    failures = []
    for svc in SERVICES:
        sv = _read(f"{svc}/main.py")
        m = re.search(r"class\s+GameState\s*\(([^)]+)\)", sv)
        if m is None:
            failures.append((svc, "no 'class GameState(...)' definition found — using class statement?"))
            continue
        bases = m.group(1)
        if "BaseGameState" not in bases:
            failures.append((svc, f"GameState bases='{bases}' — missing BaseGameState parent"))
    _check(not failures, "\n  ".join(f"{s}: {r}" for s, r in failures))
    return True


def test_no_duplicate_index_route_defined_locally():
    """After refactor, @app.get('/') index should NOT be defined locally (comes from register_common_routes)."""
    failures = []
    for svc in SERVICES:
        sv = _read(f"{svc}/main.py")
        # count @app.*('/') or @app.get("/") etc. that return index.html
        if re.search(r"@app\.\w+\([\"']/[\"']\)\s*\n\s*async?\s+def\s+index\b", sv):
            failures.append(svc)
    # Not strictly required but good for assessing LOC reduction: warn, don't fail
    # Actually DO fail for true "no duplicate" guarantee
    _check(not failures,
           f"Files still define local index() route (should come from shared): {failures}")
    return True


def test_game_specific_routes_still_exist():
    """Crucial: refactor must NOT remove game-specific routes."""
    failures = []
    for svc in SERVICES:
        sv = _read(f"{svc}/main.py")
        required_game_specific = [
            (r"/api/move", "/api/move route missing"),
            (r"/api/ai_move", "/api/ai_move route missing"),
            (r"/api/command", "/api/command route missing"),
            (r"/api/undo[^_]", "/api/undo (move undo) route missing — /api/undo_config comes from shared, need /api/undo too"),
            (r"/api/valid_moves", "/api/valid_moves route missing"),
        ]
        # /api/undo distinction: the move-undo "undo_move" or "async def undo_move" or "@app.post('/api/undo')"
        # Actually regex [^_] fails for decorator pattern; check presence of specific undo_move definition
        missing = []
        for pat, desc in required_game_specific:
            if pat == r"/api/undo[^_]":
                # Look for BOTH: decorator with "/api/undo" followed by (") not "_" after undo
                # OR function named undo_move defined as async handler
                if not (re.search(r"@app\.\w+\([\"']/api/undo[\"']", sv)
                        and not re.search(r"@app\.\w+\([\"']/api/undo_config[\"']",
                                          sv[sv.find(r"@app"):sv.find(r"@app")+100])):
                    # Simpler check: count occurrences. /api/undo_config + /api/undo = at least 2 decorators for undo-related
                    # Check undo_move handler function exists (game-specific)
                    if not re.search(r"def\s+undo_move\b|/api/undo\b(?!_config)", sv):
                        # fallback: look for the decorator directly
                        decs = re.findall(r"@app\.\w+\([\"'](/api/undo(?:_config)?)[\"']", sv)
                        if "/api/undo" not in decs:
                            missing.append(desc)
            else:
                if pat not in sv:
                    missing.append(desc)
        if missing:
            failures.append((svc, missing))
    _check(not failures,
           "\n  ".join(f"{s}: {r}" for s, r in failures))
    return True


def test_loc_and_contract():
    """Heuristic: files should shrink compared to baseline (~1000 lines each). Estimate min reduction."""
    baseline = {"xiangqi": 1018, "wuziqi": 991, "weiqi": 1058,
                "dongwuqi": 1039, "tiaoqi": 1018, "heibaiqi": 1042}
    shrunk = []
    for svc in SERVICES:
        lines = _read(f"{svc}/main.py").count("\n") + 1
        base = baseline[svc]
        if lines < base * 0.7:  # reduced by at least 30%
            shrunk.append((svc, f"{base}→{lines} ({100-lines*100//base}% cut)"))
    # Informational only (doesn't fail) — recorded as evidence for AC-10
    print(f"  [INFO] Main files reduced to <70% baseline: {len(shrunk)}/6")
    for svc, info in shrunk:
        print(f"    - {svc}: {info}")
    return True


def main():
    tests = [
        ("imports shared/game_base", test_all_use_shared_base_import),
        ("calls register_common_routes", test_all_call_register_common_routes),
        ("GameState inherits BaseGameState", test_each_gamestate_inherits_basegamestate),
        ("no duplicate local index() route", test_no_duplicate_index_route_defined_locally),
        ("game-specific routes still present", test_game_specific_routes_still_exist),
        ("LOC reduction info (informational only)", test_loc_and_contract),
    ]
    ok = 0
    for name, fn in tests:
        try:
            fn()
            print(f"✅ PASS {name}")
            ok += 1
        except RuntimeError as e:
            print(f"❌ FAIL {name}")
            for ln in str(e).splitlines()[:6]:
                print(f"   {ln}")
        except Exception as e:
            print(f"⚠️  ERROR {name}: {type(e).__name__}: {e}")
    print(f"\nTotal: {ok}/{len(tests)} PASS")
    return 0 if ok == len(tests) else 1


if __name__ == "__main__":
    sys.exit(main())
