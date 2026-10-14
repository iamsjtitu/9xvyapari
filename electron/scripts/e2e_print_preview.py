import asyncio, os, sys, time
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
        main_page = await wait_page(browser, lambda u: u.startswith("http://127.0.0.1:") and "chooser" not in u)
        await main_page.wait_for_selector('[data-testid="input-username"]', timeout=40000)
        await main_page.fill('[data-testid="input-username"]', "admin")
        await main_page.fill('[data-testid="input-password"]', "admin123")
        await main_page.click('[data-testid="btn-submit"]')
        await main_page.wait_for_selector('[data-testid="app-shell"]', timeout=20000)
        await main_page.click('[data-testid="nav-rokad"]') if await main_page.locator('[data-testid="nav-rokad"]').count() else await main_page.goto(main_page.url.split("/#")[0].rsplit("/", 1)[0] + "/rokad")
        await main_page.wait_for_selector('[data-testid="page-rokad"]', timeout=20000)
        await asyncio.sleep(1)
        print("all-accounts summary visible:", await main_page.locator('[data-testid="all-accounts-summary"]').count() > 0)
        await main_page.screenshot(path=f"{OUT}/rokad_all.png")
        before = len(pages(browser))
        await main_page.click('[data-testid="btn-print"]')
        preview = await wait_page(browser, lambda u: u.startswith("file://") and u.split("#")[0].endswith(".pdf"), timeout=30)
        await asyncio.sleep(2)
        print("preview url:", preview.url)
        print("pages before/after:", before, len(pages(browser)))
        await preview.screenshot(path=f"{OUT}/print_preview.png")
        print("DONE")


asyncio.run(main())
