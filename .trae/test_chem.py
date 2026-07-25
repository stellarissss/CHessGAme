from playwright.sync_api import sync_playwright

errors = []
warnings = []

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width':1400,'height':900})

    page.on('console', lambda msg: (
        errors.append(msg.text) if msg.type == 'error'
        else warnings.append(msg.text) if msg.type == 'warning'
        else None
    ))
    page.on('pageerror', lambda exc: errors.append(f"PAGEERROR: {exc}"))

    page.goto('http://localhost:8765/chemistry_simulator.html')
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(1500)

    shelf_count = page.locator('.reagent-card').count()
    tray_count = page.locator('.tray-item').count()
    preset_opts = page.locator('#presetSel option').count()

    page.screenshot(path='/workspace/.trae/chem_initial.png')

    for pid in ['p8','p1','p4','p16','p6','p9']:
        page.select_option('#presetSel', pid)
        page.wait_for_timeout(2000)
        page.screenshot(path=f'/workspace/.trae/chem_{pid}.png')

    canvas = page.locator('#stage')
    bbox = canvas.bounding_box()
    print(f"SHELF_CARDS={shelf_count}")
    print(f"TRAY_ITEMS={tray_count}")
    print(f"PRESET_OPTS={preset_opts}")
    print(f"CANVAS_BBOX={bbox}")
    print(f"ERRORS={len(errors)}")
    for e in errors[:15]: print(f"  ERR: {e}")
    print(f"WARNINGS={len(warnings)}")
    for w in warnings[:5]: print(f"  WARN: {w}")

    browser.close()

print("DONE")
