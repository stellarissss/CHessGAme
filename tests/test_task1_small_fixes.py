"""Red-phase tests for Task 1 fixes.

CRITICAL: Environment uses PYTHONOPTIMIZE=1, which strips all assert statements.
WE MUST NOT USE the `assert` keyword. Instead, use explicit `if ...: raise ...` or
return tuples (passed, message) and check in caller.

All tests should FAIL before implementation, PASS after.
"""
import os
import re
import sys
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent


def _read(p):
    return (ROOT / p).read_text(encoding="utf-8", errors="replace")


def _check(cond, msg):
    """Raise RuntimeError if cond is falsy. Safe replacement for assert in O-optimized env."""
    if not cond:
        raise RuntimeError(msg)


# ===== AC-2 =====
def test_ac2_pieces_white_in_schema_map():
    sv = _read("shared/schema_validator.py")
    has_key = 'pieces_white' in sv
    _check(has_key, "'pieces_white' key NOT found in CONFIG_SCHEMA_MAP")
    m = re.search(r'"pieces_white"\s*:\s*"([^"]+)"', sv)
    _check(m is not None, "'pieces_white' exists but no filename mapping")
    _check(m.group(1) == "pieces.schema.json",
           f"pieces_white maps to '{m.group(1)}' expected 'pieces.schema.json'")
    return True, ""


# ===== AC-3 =====
def test_ac3_achievement_no_redundant_meta_loop():
    sv = _read("main.py")
    _check("_check_meta_achievements" in sv, "sanity: _check_meta_achievements function missing")
    # Pattern B: for mid in meta_unlocked loop that writes unlocked[mid] = ...
    # Should NOT exist (dead code) after fix
    pattern_b = re.search(
        r"for\s+\w+\s+in\s+meta_unlocked\s*:[\s\S]{0,500}?unlocked\[\s*\w+\s*\]\s*=",
        sv
    )
    if pattern_b is not None:
        ctx = sv[max(0, pattern_b.start()-20):min(len(sv), pattern_b.end()+40)]
        raise RuntimeError(
            "Redundant meta_unlocked loop still exists in achievement route.\n"
            "_check_meta_achievements() already mutates the unlocked dict directly.\n"
            "The dead-code guard 'for mid in meta_unlocked: ... unlocked[mid] = ...' must be deleted.\n"
            f"Match context ({len(ctx)} chars):\n{ctx[:500]}"
        )
    return True, ""


# ===== AC-1 =====
def test_ac1_samsara_route_in_six_services():
    services = ["xiangqi", "wuziqi", "weiqi", "dongwuqi", "tiaoqi", "heibaiqi"]
    failures = []
    # 共享基座 register_common_routes 中是否定义了 /samsara/{path:path} 路由
    shared_sv = _read("shared/game_base.py")
    shared_has_route = bool(re.search(r"/samsara/\{path:path\}", shared_sv))
    shared_uses_httpx = "import httpx" in shared_sv or "from httpx" in shared_sv

    for svc in services:
        p = f"{svc}/main.py"
        try:
            sv = _read(p)
        except FileNotFoundError:
            failures.append((svc, "main.py missing"))
            continue
        # 路由定义：直接定义在 main.py，或由 register_common_routes 统一提供（且 shared 中存在）
        has_local_route = bool(re.search(r"/samsara/\{path:path\}", sv))
        uses_register_common = "register_common_routes(" in sv
        has_route_def = has_local_route or (uses_register_common and shared_has_route)
        has_samsara_url_const = "SAMSARA_API_URL" in sv
        has_proxy_call = bool(
            re.search(r"httpx\.(AsyncClient|Client|\w+)\b|\.request\(.*SAMSARA|url\s*=\s*f?['\"]\s*{?\s*SAMSARA_API_URL", sv)
        ) or bool(re.search(r"SAMSARA_API_URL\s*\+\s*['\"]/", sv))
        has_httpx_import = "import httpx" in sv or "from httpx" in sv
        # 若使用共享基座，则 httpx / proxy 实现在 shared 内也算 OK
        prox_ok = ((has_proxy_call or has_httpx_import)
                   or (uses_register_common and shared_uses_httpx))
        ok = has_route_def and has_samsara_url_const and prox_ok
        if not ok:
            failures.append((
                svc,
                f"route_def={has_route_def} url_const={has_samsara_url_const} "
                f"proxy_call={has_proxy_call or (uses_register_common and shared_uses_httpx)} "
                f"httpx_import={has_httpx_import or (uses_register_common and shared_uses_httpx)}"
            ))
    if failures:
        raise RuntimeError(
            "/samsara proxy incomplete in services:\n  " +
            "\n  ".join(f"{s}: {r}" for s, r in failures)
        )
    return True, ""


# ===== AC-4 =====
def test_ac4_no_wrong_karma_fallback_values():
    services = ["xiangqi", "wuziqi", "weiqi", "dongwuqi", "tiaoqi", "heibaiqi"]
    failures = []
    for svc in services:
        p = f"{svc}/static/app.js"
        try:
            sv = _read(p)
        except FileNotFoundError:
            failures.append((svc, "app.js missing"))
            continue
        bad = []
        for m in re.finditer(r'karma(?:_max)?\s*[:=]\s*(\d+)', sv):
            label = m.group(0)
            val = int(m.group(1))
            if "karma_max" in label:
                if val != 120:
                    s = max(0, m.start() - 10); e = min(len(sv), m.end() + 15)
                    bad.append(f"{label} (val={val}) near ...{sv[s:e].replace(chr(10),' ')}...")
            else:
                if val != 50:
                    s = max(0, m.start() - 10); e = min(len(sv), m.end() + 15)
                    bad.append(f"{label} (val={val}) near ...{sv[s:e].replace(chr(10),' ')}...")
        if bad:
            failures.append((svc, "; ".join(bad[:5])))
    if failures:
        raise RuntimeError(
            "Wrong samsara fallback default values still exist:\n  " +
            "\n  ".join(f"{s}: {r}" for s, r in failures)
        )
    return True, ""


def main():
    tests = [
        ("AC-2 schema pieces_white mapping", test_ac2_pieces_white_in_schema_map),
        ("AC-3 achievement no redundant meta loop", test_ac3_achievement_no_redundant_meta_loop),
        ("AC-1 /samsara proxy in all 6 services", test_ac1_samsara_route_in_six_services),
        ("AC-4 app.js karma fallback values", test_ac4_no_wrong_karma_fallback_values),
    ]
    ok = 0
    for name, fn in tests:
        try:
            fn()
            print(f"✅ PASS {name}")
            ok += 1
        except RuntimeError as e:
            print(f"❌ FAIL {name}")
            for ln in str(e).splitlines():
                print(f"   {ln}")
        except Exception as e:
            print(f"⚠️  ERROR {name}: {type(e).__name__}: {e}")
    print(f"\nTotal: {ok}/{len(tests)} PASS")
    return 0 if ok == len(tests) else 1


if __name__ == "__main__":
    sys.exit(main())
