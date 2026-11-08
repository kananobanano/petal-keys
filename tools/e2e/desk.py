import asyncio, sys, os
from playwright.async_api import async_playwright
BASE = 'http://localhost:8765/'
OUT = sys.argv[1]
W = int(sys.argv[2]) if len(sys.argv) > 2 else 1280
H = int(sys.argv[3]) if len(sys.argv) > 3 else 800
os.makedirs(OUT, exist_ok=True)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(viewport={'width': W, 'height': H}, device_scale_factor=1)
        pg = await ctx.new_page()
        logs = []
        pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
        pg.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
        await pg.goto(BASE)
        await pg.wait_for_selector('body[data-ready]', timeout=10000)
        await pg.wait_for_timeout(600)
        await pg.keyboard.press('Escape')
        await pg.evaluate("""() => { const a = window.__petalKeys; ['L01','L02','L03','L04','L05','L06'].forEach(id => a.store.completeLesson(id, 3)); a.store.addXp(22); a.refresh(); }""")
        await pg.wait_for_timeout(400)
        await pg.screenshot(path=f'{OUT}/d-learn.png')
        await pg.click('.tab[data-tab=practice]')
        await pg.wait_for_timeout(300)
        await pg.screenshot(path=f'{OUT}/d-practice.png')
        await pg.evaluate("""() => window.__petalKeys.startLesson((window.__petalKeysLessons || null) || { id: 'L10', title: 'Half and whole notes', cards: [{ title: 'Notes that last', text: 'A half note lasts two beats.', visual: { rhythm: true } }], drill: { mode: 'rush', clef: 'treble', pool: ['C4','D4','E4','F4','G4','A4','B4','C5'], level: 2, bars: 2, tempo: 60, count: 2 } })""")
        await pg.wait_for_timeout(600)
        await pg.screenshot(path=f'{OUT}/d-card.png')
        await pg.click('.ex-actions .btn-primary')
        await pg.wait_for_timeout(600)
        await pg.screenshot(path=f'{OUT}/d-rush.png')
        # computer keyboard plays notes
        await pg.keyboard.down('a'); await pg.wait_for_timeout(120); await pg.keyboard.up('a')
        await pg.keyboard.press('Escape')
        await pg.wait_for_timeout(300)
        await pg.click('.tab[data-tab=me]')
        await pg.wait_for_timeout(300)
        await pg.screenshot(path=f'{OUT}/d-me.png', full_page=True)
        print('\n'.join(logs) if logs else 'no console errors')
        await b.close()
asyncio.run(main())
