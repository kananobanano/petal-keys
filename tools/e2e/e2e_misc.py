import asyncio, sys, os
from playwright.async_api import async_playwright
BASE = 'http://localhost:8765/'
OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
def check(c, m): print(('PASS ' if c else 'FAIL ') + m)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True)
        pg = await ctx.new_page()
        logs = []
        pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
        pg.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
        await pg.goto(BASE)
        await pg.wait_for_selector('body[data-ready]')
        await pg.wait_for_timeout(700)
        await pg.click('text=Let\'s begin')
        await pg.evaluate("""() => { const a = window.__petalKeys; for (let k = 1; k <= 21; k++) a.store.completeLesson('L' + String(k).padStart(2, '0'), 2); a.refresh(); }""")

        # Mix for me: run through all steps by answering correctly where possible
        await pg.click('.tab[data-tab=practice]')
        await pg.wait_for_timeout(300)
        await pg.click('.mix-card')
        await pg.wait_for_timeout(600)
        steps = await pg.evaluate("() => window.__petalKeys.session.steps.map(s => s.type)")
        print('mix steps:', steps)
        check(len(steps) >= 3, 'mix has several steps')
        # skip each step by forcing done through the mode context: emulate by clicking close only at end
        for i in range(len(steps)):
            await pg.evaluate("() => window.__petalKeys.session.next()")
            await pg.wait_for_timeout(400)
        res = await pg.evaluate("() => !!document.querySelector('.results')")
        check(res, 'mix reaches results screen')
        await pg.click('.ex-actions .btn-primary')

        # Rush: Listen and Again
        await pg.evaluate("""() => window.__petalKeys.startSession({ title: 'Note Rush', steps: [{ type: 'rush', clef: 'treble', pool: ['C4','D4','E4','F4','G4'], level: 1, bars: 1, tempo: 120, count: 1 }] })""")
        await pg.wait_for_timeout(500)
        await pg.click('.ex-actions .btn-primary')  # Go
        await pg.wait_for_timeout(4800)  # 4 count-in + 4 beats at 120 = 4s
        txt = await pg.text_content('.ex-actions')
        check('Listen' in txt and 'Again' in txt, f'rush result actions: {txt.strip()}')
        await pg.click('text=Listen')
        await pg.wait_for_timeout(800)
        vis = await pg.evaluate("() => [...document.querySelectorAll('.playhead')].some(p => p.getAttribute('visibility') === 'visible')")
        check(vis, 'playhead moves while listening')
        await pg.wait_for_timeout(2000)
        await pg.click('text=Again')
        await pg.wait_for_timeout(300)
        ph = await pg.text_content('.ex-feedback')
        check('click' in ph.lower(), f'again restarts count-in: "{ph}"')
        await pg.wait_for_timeout(4600)
        await pg.click('text=Finish')
        await pg.wait_for_timeout(500)
        res = await pg.evaluate("() => !!document.querySelector('.results')")
        check(res, 'rush session finishes')
        await pg.click('.ex-actions .btn-primary')

        # calibration with simulated taps 40ms late
        await pg.evaluate("""() => window.__petalKeys.startSession({ title: 'Timing check', steps: [{ type: 'calib', count: 0 }], kind: 'calib' })""")
        await pg.wait_for_timeout(400)
        await pg.click('text=Start')
        await pg.wait_for_timeout(100)
        await pg.evaluate("""() => {
          const a = window.__petalKeys; const beat = 600; const start = performance.now();
          // approximate: find first click time by polling audio clock mapping
        }""")
        # read the click times from the mode via a tiny hook: tap via bus at heard-time + 40ms
        await pg.evaluate("""() => {
          const a = window.__petalKeys;
          const t0 = a.audio.perfTimeOf(a.audio.now);
        }""")
        # simpler: tap on the pad at 600ms intervals after the 5th click based on dot lighting
        for i in range(30):
            lit = await pg.evaluate("() => document.querySelectorAll('.calib-dots i.lit').length")
            if lit >= 4: break
            await pg.wait_for_timeout(50)
        # we are near click 5; tap 12 times every 600ms
        await pg.evaluate("""() => new Promise(res => { const a = window.__petalKeys; let n = 0; const id = setInterval(() => { a.bus.noteOn(60, .7, performance.now(), 'midi'); a.bus.noteOff(60, performance.now(), 'midi'); if (++n >= 12) { clearInterval(id); res(); } }, 600); })""")
        await pg.wait_for_timeout(1200)
        st = await pg.text_content('.prompt-sub')
        print('calibration says:', st)
        check('landed' in st or 'Only' in st, 'calibration produces a result')
        await pg.screenshot(path=f'{OUT}/calib-result.png')
        await pg.click('.ex-close')

        print('\n'.join(logs) if logs else 'no console errors')
        await b.close()
asyncio.run(main())
