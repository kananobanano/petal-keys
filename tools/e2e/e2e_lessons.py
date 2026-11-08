import asyncio, sys, os, json
from playwright.async_api import async_playwright
BASE = 'http://localhost:8765/'
OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=1.5, has_touch=True, is_mobile=True)
        pg = await ctx.new_page()
        logs = []
        pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
        pg.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
        await pg.goto(BASE)
        await pg.wait_for_selector('body[data-ready]')
        await pg.wait_for_timeout(700)
        await pg.click('text=Let\'s begin')
        await pg.wait_for_timeout(300)
        n = await pg.evaluate("() => document.querySelectorAll('.path-item').length")
        print('lessons on path:', n)
        # unlock everything
        await pg.evaluate("""() => { const a = window.__petalKeys; document.querySelectorAll('.path-item'); }""")
        for i in range(n):
            # open lesson i via the path button
            await pg.evaluate("(i) => { const a = window.__petalKeys; const ids = [...Array(28)].map((_, k) => 'L' + String(k + 1).padStart(2, '0')); a.store.unlockLesson(ids[i]); a.refresh(); }", i)
            btns = await pg.query_selector_all('.path-item .node')
            await btns[i].click()
            await pg.wait_for_timeout(250)
            await pg.click('.sheet .btn-primary')
            await pg.wait_for_timeout(350)
            card = 0
            while True:
                is_card = await pg.evaluate("() => !!document.querySelector('.teach-card')")
                if not is_card:
                    break
                await pg.wait_for_timeout(150)
                await pg.screenshot(path=f'{OUT}/L{i+1:02d}-card{card}.png')
                card += 1
                btn = await pg.query_selector('.ex-actions .btn-primary')
                await btn.click()
                await pg.wait_for_timeout(250)
            await pg.wait_for_timeout(900)
            await pg.screenshot(path=f'{OUT}/L{i+1:02d}-drill.png')
            await pg.click('.ex-close')
            await pg.wait_for_timeout(250)
        print('\n'.join(logs) if logs else 'no console errors')
        await b.close()
asyncio.run(main())
