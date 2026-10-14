import asyncio, sys, os, json, time
from playwright.async_api import async_playwright

CDP = "http://127.0.0.1:9444"
OUT = "/tmp/etest"
os.makedirs(OUT, exist_ok=True)


async def wait_page(browser, pred, timeout=40):
    t0 = time.time()
    while time.time() - t0 < timeout:
        for ctx in browser.contexts:
            for p in ctx.pages:
                try:
                    if pred(p.url):
                        return p
                except Exception:
                    pass
        await asyncio.sleep(0.5)
    raise RuntimeError("page not found")


async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.connect_over_cdp(CDP)
        chooser = await wait_page(browser, lambda u: u.endswith("chooser.html"))
        await chooser.wait_for_selector("#path")
        await asyncio.sleep(0.5)
        print("chooser path:", await chooser.text_content("#path"), "| mode:", await chooser.text_content("#mode"))
        await chooser.screenshot(path=f"{OUT}/1_chooser.png")
        await chooser.click("#start")
        print("clicked start")
        main_page = await wait_page(browser, lambda u: u.startswith("http://127.0.0.1:") and "chooser" not in u and "splash" not in u, timeout=60)
        await main_page.wait_for_selector('[data-testid="input-email"]', timeout=30000)
        await asyncio.sleep(1)
        await main_page.screenshot(path=f"{OUT}/2_login.png")
        print("login page url:", main_page.url)
        await main_page.fill('[data-testid="input-email"]', "admin@galla.com")
        await main_page.fill('[data-testid="input-password"]', "admin123")
        await main_page.click('[data-testid="btn-submit"]')
        await main_page.wait_for_selector('[data-testid="app-shell"]', timeout=20000)
        await asyncio.sleep(1)
        badge = await main_page.text_content('[data-testid="app-version-badge"]')
        print("version badge:", badge)
        info = await main_page.evaluate("JSON.stringify(window.vyapari)")
        print("window.vyapari:", info)
        await main_page.screenshot(path=f"{OUT}/3_dashboard.png")
        await main_page.click('[data-testid="btn-logout"]')
        await main_page.wait_for_selector('[data-testid="input-email"]', timeout=20000)
        await asyncio.sleep(0.5)
        await main_page.screenshot(path=f"{OUT}/4_after_logout.png")
        print("logged out")
        print("DONE")


asyncio.run(main())
