import asyncio, sys, os
from playwright.async_api import async_playwright
BASE = 'http://localhost:8765/'
OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)

def check(cond, msg):
    print(('PASS ' if cond else 'FAIL ') + msg)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, has_touch=True, is_mobile=True, accept_downloads=True)
        pg = await ctx.new_page()
        logs = []
        pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
        pg.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
        await pg.goto(BASE)
        await pg.wait_for_selector('body[data-ready]')
        await pg.wait_for_timeout(500)
        await pg.click('text=Let\'s begin')
        await pg.wait_for_timeout(1500)

        # audio samples
        st = await pg.evaluate("() => ({ state: window.__petalKeys.audio.loadState, n: window.__petalKeys.audio.samples.length, ctx: window.__petalKeys.audio.ctx && window.__petalKeys.audio.ctx.state })")
        check(st['state'] == 'ready' and st['n'] == 22, f'piano samples loaded {st}')

        # service worker + offline
        await pg.wait_for_timeout(1500)
        sw = await pg.evaluate("async () => { const r = await navigator.serviceWorker.getRegistration(); const keys = await caches.keys(); let n = 0; for (const k of keys) n += (await (await caches.open(k)).keys()).length; return { active: !!(r && r.active), keys, n }; }")
        check(sw['active'] and sw['n'] >= 58, f'service worker cached files {sw}')
        await pg.reload()
        await pg.wait_for_selector('body[data-ready]')
        ctrl = await pg.evaluate("() => !!navigator.serviceWorker.controller")
        check(ctrl, 'page controlled by service worker after reload')
        await ctx.set_offline(True)
        await pg.reload()
        await pg.wait_for_selector('body[data-ready]', timeout=8000)
        title = await pg.text_content('.page-title')
        check(bool(title), f'app loads offline: "{title}"')
        await pg.evaluate("() => window.__petalKeys.audio.ensure()")
        await pg.mouse.click(10, 300)
        await pg.wait_for_timeout(1500)
        st2 = await pg.evaluate("() => window.__petalKeys.audio.loadState")
        check(st2 == 'ready', f'samples load offline: {st2}')
        await ctx.set_offline(False)

        # touch keyboard in lesson 1 drill
        await pg.click('.up-next .btn-primary')
        await pg.wait_for_timeout(300)
        await pg.click('.ex-actions .btn-primary')
        await pg.wait_for_timeout(300)
        await pg.click('.ex-actions .btn-primary')
        await pg.wait_for_timeout(500)
        keys = await pg.evaluate("() => [...document.querySelectorAll('.ex-kb .key')].map(k => ({ m: +k.dataset.midi, r: k.getBoundingClientRect().toJSON() }))")
        cs = [k for k in keys if k['m'] % 12 == 0]
        check(len(cs) >= 1, f'on-screen keys rendered ({len(keys)} keys, Cs: {[k["m"] for k in cs]})')
        k = cs[0]['r']
        prog0 = await pg.evaluate("() => document.querySelector('.ex-bar').style.width")
        await pg.touchscreen.tap(k['x'] + k['width'] / 2, k['y'] + k['height'] - 20)
        await pg.wait_for_timeout(900)
        prog1 = await pg.evaluate("() => document.querySelector('.ex-bar').style.width")
        check(prog0 != prog1, f'tapping C on screen counts ({prog0} -> {prog1})')
        # glissando: drag across keys
        whites = [kk for kk in keys if kk['m'] % 12 in (0, 2, 4, 5, 7, 9, 11)]
        await pg.evaluate("""() => { window.__on = []; window.__petalKeys.bus.on('noteon', e => window.__on.push(e.midi)); }""")
        r0 = whites[0]['r']; r3 = whites[3]['r']
        await pg.mouse.move(r0['x'] + r0['width'] / 2, r0['y'] + r0['height'] - 15)
        await pg.mouse.down()
        for i in range(1, 8):
            x = r0['x'] + r0['width'] / 2 + (r3['x'] - r0['x']) * i / 7
            await pg.mouse.move(x, r0['y'] + r0['height'] - 15)
            await pg.wait_for_timeout(30)
        await pg.mouse.up()
        seq = await pg.evaluate("() => window.__on")
        held = await pg.evaluate("() => window.__petalKeys.bus.held()")
        check(len(seq) >= 4 and held == [], f'glissando plays notes {seq} and releases them (held {held})')

        # back button closes the exercise
        await pg.go_back()
        await pg.wait_for_timeout(400)
        hidden = await pg.evaluate("() => document.querySelector('.exercise').hidden")
        check(hidden, 'browser back closes the exercise')

        # chord latch mode via touch
        await pg.evaluate("() => window.__petalKeys.startSession({ title: 'Chords', steps: [{ type: 'chord', chords: ['C'], count: 1 }] })")
        await pg.wait_for_timeout(500)
        keys = await pg.evaluate("() => [...document.querySelectorAll('.ex-kb .key')].map(k => ({ m: +k.dataset.midi, r: k.getBoundingClientRect().toJSON() }))")
        latch = await pg.evaluate("() => window.__petalKeys.kb.latch")
        check(latch, 'latch mode on for touch in Chord Builder')
        for want in (60, 64, 67):
            kk = next(x for x in keys if x['m'] == want)['r']
            await pg.touchscreen.tap(kk['x'] + kk['width'] / 2, kk['y'] + kk['height'] - 20)
            await pg.wait_for_timeout(120)
        await pg.wait_for_timeout(400)
        fb = await pg.text_content('.ex-feedback')
        check('lovely' in fb.lower() or "that's" in fb.lower(), f'latched C major accepted: "{fb}"')
        await pg.wait_for_timeout(1500)
        res = await pg.evaluate("() => !!document.querySelector('.results')")
        check(res, 'chord session reaches results')
        await pg.click('.ex-actions .btn-primary')
        await pg.wait_for_timeout(300)

        # export (download fallback) and import from file
        await pg.click('.tab[data-tab=me]')
        await pg.wait_for_timeout(300)
        async with pg.expect_download() as dl_info:
            await pg.click('text=Send backup')
        dl = await dl_info.value
        path = os.path.join(OUT, dl.suggested_filename)
        await dl.save_as(path)
        content = open(path).read()
        check(content.startswith('PETALKEYS1:') and len(content) < 4000, f'backup file {dl.suggested_filename} ({len(content)} chars)')
        # import into a fresh browser context
        ctx2 = await b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True)
        pg2 = await ctx2.new_page()
        await pg2.goto(BASE + '#me')
        await pg2.wait_for_selector('body[data-ready]')
        await pg2.wait_for_timeout(700)
        await pg2.click('text=Let\'s begin')
        await pg2.wait_for_timeout(400)
        xp_before = await pg2.evaluate("() => window.__petalKeys.store.totalXp()")
        await pg2.click('text=Import')
        await pg2.wait_for_timeout(300)
        await pg2.set_input_files('#import-file', path)
        await pg2.wait_for_timeout(800)
        xp_after = await pg2.evaluate("() => window.__petalKeys.store.totalXp()")
        xp_src = await pg.evaluate("() => window.__petalKeys.store.totalXp()")
        check(xp_after == xp_src and xp_before == 0, f'import merged XP {xp_before} -> {xp_after} (source {xp_src})')
        # importing again does not double count
        await pg2.click('text=Import')
        await pg2.wait_for_timeout(300)
        await pg2.set_input_files('#import-file', path)
        await pg2.wait_for_timeout(800)
        xp_again = await pg2.evaluate("() => window.__petalKeys.store.totalXp()")
        check(xp_again == xp_after, f'second import does not double count ({xp_again})')
        # earn XP on device 2 then merge back into device 1 via code paste
        await pg2.evaluate("() => window.__petalKeys.store.addXp(7)")
        code = await pg2.evaluate("() => window.__petalKeys.store.exportText()")
        await pg.click('text=Import')
        await pg.wait_for_timeout(300)
        await pg.fill('#import-code', code)
        await pg.click('text=Import code')
        await pg.wait_for_timeout(600)
        xp_merged = await pg.evaluate("() => window.__petalKeys.store.totalXp()")
        check(xp_merged == xp_src + 7, f'merging back adds only the new XP ({xp_src} -> {xp_merged})')
        # persistence across reload
        await pg.reload()
        await pg.wait_for_selector('body[data-ready]')
        xp_reload = await pg.evaluate("() => window.__petalKeys.store.totalXp()")
        check(xp_reload == xp_merged, f'progress persists after reload ({xp_reload})')
        await pg.screenshot(path=f'{OUT}/after-import.png')

        print('\n'.join(logs) if logs else 'no console errors')
        await b.close()
asyncio.run(main())
