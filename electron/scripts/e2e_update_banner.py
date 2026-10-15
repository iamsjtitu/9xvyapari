import asyncio, os, time
from playwright.async_api import async_playwright

CDP = "http://127.0.0.1:9444"
OUT = "/tmp/etest"
os.makedirs(OUT, exist_ok=True)


def pages(browser):
    return [p for ctx in browser.contexts for p in ctx.pages]


async def wait_page(browser, pred, timeout=60):
    t0 = time.time()
    while time.time() - t0 < timeout:
        for p in pages(browser):
            try:
                if pred(p.url):
                    return p
            except Exception:
                pass
        await asyncio.sleep(0.5)
    raise RuntimeError("page not found: " + str([p.url for p in pages(browser)]))


async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.connect_over_cdp(CDP)
        page = await wait_page(browser, lambda u: u.startswith("http://127.0.0.1:") and "chooser" not in u)
        await page.wait_for_selector('[data-testid="input-username"]', timeout=40000)
        print("bridge keys:", await page.evaluate("Object.keys(window.vyapari || {})"))
        await page.fill('[data-testid="input-username"]', "admin")
        await page.fill('[data-testid="input-password"]', "admin123")
        await page.click('[data-testid="btn-submit"]')
        await page.wait_for_selector('[data-testid="app-shell"]', timeout=20000)
        # auto run finished before login → banner must be restored via update:get-status (pull path)
        await page.wait_for_selector('[data-testid="update-banner"][data-state="downloaded"]', timeout=20000)
        print("pulled banner:", await page.locator('[data-testid="update-banner-message"]').inner_text())
        await page.screenshot(path=f"{OUT}/update_pulled.png")
        # settings card shows the same status; "Update Check Karein" triggers a fresh manual run over IPC → live push path
        await page.goto(page.url.rsplit("/", 1)[0] + "/settings")
        await page.wait_for_selector('[data-testid="software-update-card"]', timeout=20000)
        print("card version:", await page.locator('[data-testid="software-version"]').inner_text())
        print("card msg:", await page.locator('[data-testid="software-update-message"]').inner_text())
        await page.click('[data-testid="software-update-check-btn"]')
        seen = []
        t0 = time.time()
        while time.time() - t0 < 25:
            n = await page.locator('[data-testid="update-banner"]').count()
            if n:
                st = await page.locator('[data-testid="update-banner"]').get_attribute("data-state")
                msg = await page.locator('[data-testid="update-banner-message"]').inner_text()
                if not seen or seen[-1][0] != st or (st == "downloading" and seen[-1][1] != msg):
                    seen.append((st, msg))
                    print("banner:", st, "|", msg)
                    if st == "downloading" and "50%" in await page.locator('[data-testid="update-banner"] [data-testid="update-progress-percent"]').inner_text():
                        await page.screenshot(path=f"{OUT}/update_progress.png")
                if st == "downloaded" and len(seen) > 1:
                    break
            await asyncio.sleep(0.2)
        states = [s for s, _ in seen]
        print("states:", states)
        assert "checking" in states and "downloading" in states and states[-1] == "downloaded", "flow incomplete"
        print("card progress visible during run; install btn:", await page.locator('[data-testid="software-update-install-btn"]').inner_text())
        await page.screenshot(path=f"{OUT}/update_settings.png")
        print("DONE")


asyncio.run(main())
