"""
棋圣 RPG 端到端测试 — 验证全流程可玩
依赖：4 个服务已由 with_server.py 启动（xiangqi:8000 / wuziqi:8001 / go:8002 / rpg:80）
"""
import os
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

SCREENSHOTS_DIR = Path('/workspace/.trae/documents/screenshots')
SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)

RPG_URL = 'http://localhost/'

def log(msg):
    print(f"[E2E] {msg}", flush=True)

def shot(page, name):
    path = SCREENSHOTS_DIR / f"{name}.png"
    page.screenshot(path=str(path), full_page=True)
    log(f"截图: {path}")

def main():
    results = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 800})
        page = context.new_page()

        # 收集 console 日志便于调试
        page.on('console', lambda msg: log(f"[browser {msg.type}] {msg.text}"))
        page.on('pageerror', lambda err: log(f"[browser ERROR] {err}"))

        # ════════════ 用例 1: 标题屏显示 ════════════
        try:
            log("=== 用例 1: 标题屏显示 ===")
            page.goto(RPG_URL)
            page.wait_for_load_state('networkidle', timeout=15000)
            page.wait_for_selector('#rpg-title-screen', timeout=5000)
            title = page.locator('.rpg-title-name')
            expect(title).to_have_text('棋圣')
            start_btn = page.locator('.rpg-title-btn[data-action="start"]')
            expect(start_btn).to_be_visible()
            shot(page, '01_title_screen')
            results.append(('1. 标题屏显示', True, ''))
        except Exception as e:
            results.append(('1. 标题屏显示', False, str(e)))
            shot(page, '01_title_screen_FAIL')

        # ════════════ 用例 2: 开始游戏 → 序章 VN ════════════
        try:
            log("=== 用例 2: 开始游戏 → 序章 VN ===")
            page.locator('.rpg-title-btn[data-action="start"]').click()
            page.wait_for_timeout(1500)  # 等待标题屏淡出 + 序章加载
            # 标题屏应隐藏
            title_screen = page.locator('#rpg-title-screen')
            # 等 hidden 状态
            page.wait_for_function(
                "() => { const el = document.getElementById('rpg-title-screen'); return !el || el.style.display === 'none' || el.classList.contains('hidden'); }",
                timeout=5000
            )
            # VN 舞台应可见
            page.wait_for_selector('#vn-stage', timeout=5000)
            shot(page, '02_prologue_vn')
            results.append(('2. 开始游戏→序章 VN', True, ''))
        except Exception as e:
            results.append(('2. 开始游戏→序章 VN', False, str(e)))
            shot(page, '02_prologue_vn_FAIL')

        # ════════════ 用例 3: 文档模态框 (? 按钮) ════════════
        try:
            log("=== 用例 3: 文档模态框 ===")
            # 顶栏 ? 按钮
            help_btn = page.locator('#rpg-btn-help')
            expect(help_btn).to_be_visible()
            help_btn.click()
            page.wait_for_timeout(500)
            manual_modal = page.locator('#rpg-manual-modal')
            # 等待模态框可见
            page.wait_for_function(
                "() => { const el = document.getElementById('rpg-manual-modal'); return el && el.style.display !== 'none'; }",
                timeout=3000
            )
            # 验证文档内容（游戏理念段）
            expect(page.locator('.rpg-doc-section h4', has_text='游戏理念')).to_be_visible()
            shot(page, '03_manual_modal')
            results.append(('3. 文档模态框打开', True, ''))
        except Exception as e:
            results.append(('3. 文档模态框打开', False, str(e)))
            shot(page, '03_manual_modal_FAIL')

        # ════════════ 用例 4: Esc 关闭文档模态框 ════════════
        try:
            log("=== 用例 4: Esc 关闭文档模态框 ===")
            page.keyboard.press('Escape')
            page.wait_for_timeout(500)
            page.wait_for_function(
                "() => { const el = document.getElementById('rpg-manual-modal'); return !el || el.style.display === 'none'; }",
                timeout=3000
            )
            results.append(('4. Esc 关闭文档', True, ''))
        except Exception as e:
            results.append(('4. Esc 关闭文档', False, str(e)))

        # ════════════ 用例 5: 章节抽屉 7 章节 ════════════
        try:
            log("=== 用例 5: 章节抽屉 ===")
            page.locator('#rpg-btn-menu').click()
            page.wait_for_timeout(500)
            drawer = page.locator('#rpg-chapter-drawer')
            page.wait_for_function(
                "() => { const el = document.getElementById('rpg-chapter-drawer'); return el && el.style.display !== 'none'; }",
                timeout=3000
            )
            chapter_items = page.locator('.rpg-chapter-item')
            count = chapter_items.count()
            log(f"章节列表数量: {count}")
            assert count == 7, f"期望 7 个章节，实际 {count}"
            shot(page, '05_chapter_drawer')
            results.append((f'5. 章节抽屉 7 章节 (实际 {count})', True, ''))
        except Exception as e:
            results.append(('5. 章节抽屉 7 章节', False, str(e)))
            shot(page, '05_chapter_drawer_FAIL')

        # ════════════ 用例 6: 切换到 ch03 → 验证无「围棋局暂缺」════════════
        try:
            log("=== 用例 6: ch03 不再含「围棋局暂缺」 ===")
            # 通过 API 直接加载 ch03 章节 JSON 验证
            resp = page.evaluate("""
                async () => {
                    const r = await fetch('/api/rpg/vn/ch03_go_intro');
                    return await r.json();
                }
            """)
            text_all = str(resp)
            if '围棋局暂缺' in text_all:
                results.append(('6. ch03 无「围棋局暂缺」', False, 'VN JSON 仍含降级文本'))
            else:
                scene_count = len(resp.get('scenes', []))
                node_count = sum(len(s.get('nodes', [])) for s in resp.get('scenes', []))
                bg_types = [bg.get('type') for bg in resp.get('backgrounds', [])]
                results.append((f'6. ch03 无「围棋局暂缺」({scene_count}场景/{node_count}节点, bg={bg_types})', True, ''))
        except Exception as e:
            results.append(('6. ch03 无「围棋局暂缺」', False, str(e)))

        # ════════════ 用例 7: 切换到 ch06 → 验证无「围棋局暂缺」════════════
        try:
            log("=== 用例 7: ch06 不再含「围棋局暂缺」 ===")
            resp = page.evaluate("""
                async () => {
                    const r = await fetch('/api/rpg/vn/ch06_finale_go');
                    return await r.json();
                }
            """)
            text_all = str(resp)
            if '围棋局暂缺' in text_all:
                results.append(('7. ch06 无「围棋局暂缺」', False, 'VN JSON 仍含降级文本'))
            else:
                scene_count = len(resp.get('scenes', []))
                node_count = sum(len(s.get('nodes', [])) for s in resp.get('scenes', []))
                bg_types = [bg.get('type') for bg in resp.get('backgrounds', [])]
                results.append((f'7. ch06 无「围棋局暂缺」({scene_count}场景/{node_count}节点, bg={bg_types})', True, ''))
        except Exception as e:
            results.append(('7. ch06 无「围棋局暂缺」', False, str(e)))

        # ════════════ 用例 8: go 服务健康探活 ════════════
        try:
            log("=== 用例 8: go 服务健康探活 ===")
            resp = page.evaluate("""
                async () => {
                    const r = await fetch('/api/rpg/health/go');
                    return await r.json();
                }
            """)
            log(f"health/go 响应: {resp}")
            if resp.get('up'):
                results.append(('8. go 服务健康探活', True, f"响应: {resp}"))
            else:
                results.append(('8. go 服务健康探活', False, f"响应: {resp}"))
        except Exception as e:
            results.append(('8. go 服务健康探活', False, str(e)))

        # ════════════ 用例 9: go /api/rpg/reset_battle 路由可用 ════════════
        try:
            log("=== 用例 9: go /api/rpg/reset_battle 路由 ===")
            resp = page.evaluate("""
                async () => {
                    const r = await fetch('http://localhost:8002/api/rpg/reset_battle', {method: 'POST'});
                    return await r.json();
                }
            """)
            log(f"reset_battle 响应: {resp}")
            if resp.get('success'):
                results.append(('9. go /api/rpg/reset_battle', True, ''))
            else:
                results.append(('9. go /api/rpg/reset_battle', False, f"响应: {resp}"))
        except Exception as e:
            results.append(('9. go /api/rpg/reset_battle', False, str(e)))

        # ════════════ 用例 10: 像素资产可访问 ════════════
        try:
            log("=== 用例 10: 像素资产可访问 ===")
            assets_to_check = [
                '/shared/rpg/assets/icons/logo.png',
                '/shared/rpg/assets/bgs/ch03_go_intro.png',
                '/shared/rpg/assets/bgs/ch06_finale.png',
            ]
            all_ok = True
            for url in assets_to_check:
                status = page.evaluate(f"""
                    async () => {{
                        const r = await fetch('{url}', {{method: 'HEAD'}});
                        return r.status;
                    }}
                """)
                log(f"  {url} → HTTP {status}")
                if status != 200:
                    all_ok = False
            if all_ok:
                results.append(('10. 像素资产可访问', True, ''))
            else:
                results.append(('10. 像素资产可访问', False, '部分资产 404'))
        except Exception as e:
            results.append(('10. 像素资产可访问', False, str(e)))

        browser.close()

    # ════════════ 汇总 ════════════
    print("\n" + "=" * 70)
    print("E2E 测试结果汇总")
    print("=" * 70)
    passed = sum(1 for _, ok, _ in results if ok)
    failed = sum(1 for _, ok, _ in results if not ok)
    for name, ok, detail in results:
        mark = "✅" if ok else "❌"
        print(f"{mark} {name}" + (f"  | {detail}" if detail else ""))
    print("-" * 70)
    print(f"通过: {passed}  失败: {failed}  总计: {len(results)}")
    sys.exit(0 if failed == 0 else 1)

if __name__ == '__main__':
    main()
