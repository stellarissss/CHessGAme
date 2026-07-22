"""黑白棋前端冒烟测试 - Playwright"""
from playwright.sync_api import sync_playwright

URL = "http://localhost:8003/"
errors = []
logs = []

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path="/root/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome")
        page = browser.new_page(viewport={"width": 1400, "height": 900})

        page.on("console", lambda msg: logs.append(f"[{msg.type}] {msg.text}"))
        page.on("pageerror", lambda err: errors.append(f"[pageerror] {err}"))

        print("=== 1. 导航到首页 ===")
        page.goto(URL)
        page.wait_for_load_state("networkidle", timeout=15000)
        page.wait_for_timeout(1500)

        board = page.locator("#board-container")
        print("board-container count:", board.count())

        pieces = page.locator("#board-container .piece")
        print("pieces count:", pieces.count())

        indicators = page.locator("#board-container .valid-move-indicator")
        print("valid-move-indicator count:", indicators.count())

        turn = page.locator("#turn-indicator")
        print("turn-indicator text:", turn.inner_text())

        h1 = page.locator(".header h1")
        print("h1 text:", h1.inner_text())

        panels = page.locator(".side-panel .panel-section")
        print("panel-section count:", panels.count())

        lines = page.locator("#board-container svg line")
        print("svg line count:", lines.count())

        page.screenshot(path="/workspace/_hbq_01_initial.png", full_page=False)
        print("截图 1 已保存")

        # 关闭可能自动弹出的设置模态框（checkApiKey 触发）
        try:
            settings_modal = page.locator("#settings-modal")
            is_open0 = settings_modal.evaluate("el => el.classList.contains('show')")
            print("settings-modal auto-open:", is_open0)
            if is_open0:
                page.locator("#close-settings").click()
                page.wait_for_timeout(500)
                print("已关闭自动弹出的设置模态框")
        except Exception as e:
            print("close settings attempt:", e)

        print("\n=== 2. 点击合法落子点 [2,3] ===")
        ind23 = page.locator('.valid-move-indicator[data-pos="2,3"]')
        print("indicator [2,3] count:", ind23.count())
        if ind23.count() > 0:
            ind23.first.click()
            page.wait_for_timeout(2500)
            pieces_after = page.locator("#board-container .piece")
            print("pieces count after move:", pieces_after.count())
            turn_after = page.locator("#turn-indicator")
            print("turn-indicator after move:", turn_after.inner_text())
            page.screenshot(path="/workspace/_hbq_02_after_move.png", full_page=False)
            print("截图 2 已保存")
        else:
            print("!! 未找到 [2,3] 指示器")

        print("\n=== 3. AI 消息检查 ===")
        ai_msgs = page.locator("#ai-messages .message")
        print("ai-messages count:", ai_msgs.count())
        for i in range(min(ai_msgs.count(), 5)):
            print(f"  msg[{i}]:", ai_msgs.nth(i).inner_text()[:80])

        print("\n=== 4. 设置模态框 ===")
        page.locator("#btn-settings").click()
        page.wait_for_timeout(500)
        settings_modal = page.locator("#settings-modal")
        is_open = settings_modal.evaluate("el => getComputedStyle(el).display !== 'none'")
        print("settings-modal visible:", is_open)
        page.screenshot(path="/workspace/_hbq_03_settings.png", full_page=False)
        print("截图 3 已保存")
        page.locator("#close-settings").click()
        page.wait_for_timeout(300)

        print("\n=== 5. 日志模态框 ===")
        page.locator("#btn-logs").click()
        page.wait_for_timeout(500)
        logs_modal = page.locator("#logs-modal")
        is_open2 = logs_modal.evaluate("el => getComputedStyle(el).display !== 'none'")
        print("logs-modal visible:", is_open2)
        page.screenshot(path="/workspace/_hbq_04_logs.png", full_page=False)
        print("截图 4 已保存")
        page.locator("#close-logs").click()
        page.wait_for_timeout(300)

        print("\n=== 6. 悔棋 ===")
        before_undo = page.locator("#board-container .piece").count()
        page.locator("#btn-undo").click()
        page.wait_for_timeout(1500)
        after_undo = page.locator("#board-container .piece").count()
        print(f"pieces before undo: {before_undo}, after undo: {after_undo}")
        page.screenshot(path="/workspace/_hbq_05_after_undo.png", full_page=False)
        print("截图 5 已保存")

        print("\n=== Console 日志汇总 ===")
        for l in logs:
            print(" ", l)
        print("\n=== Page Error 汇总 ===")
        if errors:
            for e in errors:
                print(" ", e)
        else:
            print("  (无 pageerror)")

        browser.close()
        print("\n=== 冒烟测试完成 ===")

if __name__ == "__main__":
    main()
