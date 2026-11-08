import asyncio, sys, os, json
from playwright.async_api import async_playwright

BASE = 'http://localhost:8765/'
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/claude-0/e2e'
SCHEME = sys.argv[2] if len(sys.argv) > 2 else 'light'
os.makedirs(OUT, exist_ok=True)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, has_touch=True, is_mobile=True, color_scheme=SCHEME)
        pg = await ctx.new_page()
        logs = []
        pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
        pg.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
        await pg.goto(BASE)
        await pg.wait_for_selector('body[data-ready]', timeout=10000)
        await pg.wait_for_timeout(700)
        await pg.screenshot(path=f'{OUT}/01-welcome.png')
        await pg.click('text=Let\'s begin')
        await pg.wait_for_timeout(400)
        await pg.screenshot(path=f'{OUT}/02-learn.png', full_page=True)

        # start first lesson
        await pg.click('.up-next .btn-primary')
        await pg.wait_for_timeout(500)
        await pg.screenshot(path=f'{OUT}/03-card1.png')
        await pg.click('.ex-actions .btn-primary')
        await pg.wait_for_timeout(400)
        await pg.screenshot(path=f'{OUT}/04-card2.png')
        await pg.click('.ex-actions .btn-primary')
        await pg.wait_for_timeout(500)
        await pg.screenshot(path=f'{OUT}/05-drill.png')
        # answer: wrong once (D=62), then press C (60)
        await pg.evaluate("window.__petalKeys.bus.noteOn(62, .7, performance.now(), 'midi'); window.__petalKeys.bus.noteOff(62, performance.now(), 'midi');")
        await pg.wait_for_timeout(300)
        await pg.screenshot(path=f'{OUT}/06-drill-wrong.png')
        for i in range(6):
            await pg.evaluate("window.__petalKeys.bus.noteOn(48, .7, performance.now(), 'midi'); window.__petalKeys.bus.noteOff(48, performance.now(), 'midi');")
            await pg.wait_for_timeout(800)
        await pg.wait_for_timeout(600)
        await pg.screenshot(path=f'{OUT}/07-results.png')
        await pg.click('.ex-actions .btn-primary')
        await pg.wait_for_timeout(500)
        await pg.screenshot(path=f'{OUT}/08-learn-after.png', full_page=True)

        # jump ahead to lesson 9 (rush) via store and run Note Rush
        await pg.evaluate("""() => { const a = window.__petalKeys; ['L01','L02','L03','L04','L05','L06','L07','L08','L09','L10','L11','L12','L13','L14','L15','L16','L17','L19','L20'].forEach(id => a.store.completeLesson(id, 2)); a.refresh(); }""")
        await pg.wait_for_timeout(300)
        await pg.screenshot(path=f'{OUT}/09-learn-progress.png', full_page=True)

        # Practice tab
        await pg.click('.tab[data-tab=practice]')
        await pg.wait_for_timeout(400)
        await pg.screenshot(path=f'{OUT}/10-practice.png', full_page=True)

        # Flash practice
        await pg.click('.drill-card.d-flash')
        await pg.wait_for_timeout(400)
        await pg.screenshot(path=f'{OUT}/11-flash-options.png')
        await pg.click('.sheet .btn-primary')
        await pg.wait_for_timeout(600)
        await pg.screenshot(path=f'{OUT}/12-flash.png')
        # wrong answer then reveal
        await pg.evaluate("window.__petalKeys.bus.noteOn(61, .7, performance.now(), 'midi'); window.__petalKeys.bus.noteOff(61, performance.now(), 'midi');")
        await pg.wait_for_timeout(300)
        await pg.screenshot(path=f'{OUT}/13-flash-wrong.png')
        await pg.click('.ex-close')
        await pg.wait_for_timeout(400)

        # Note Rush
        await pg.evaluate("""() => window.__petalKeys.startSession({ title: 'Note Rush', steps: [{ type: 'rush', clef: 'treble', pool: ['C4','D4','E4','F4','G4','A4','B4','C5'], level: 3, bars: 2, tempo: 90, count: 2 }] })""")
        await pg.wait_for_timeout(600)
        await pg.screenshot(path=f'{OUT}/14-rush-study.png')
        await pg.click('.ex-actions .btn-primary')
        await pg.wait_for_timeout(200)
        # schedule perfect-ish presses with one wrong and one missing
        await pg.evaluate("""() => {
            const a = window.__petalKeys; const r = a.debug.rush; const exp = r.expected;
            exp.forEach((e, i) => {
              if (i === 2) return; // miss one
              const midi = i === 4 ? e.midi + 1 : e.midi; // one wrong
              const jitter = (i % 3) * 40 - 30;
              const delay = e.t + jitter - performance.now();
              setTimeout(() => { a.bus.noteOn(midi, .7, performance.now(), 'midi'); setTimeout(() => a.bus.noteOff(midi, performance.now(), 'midi'), 120); }, Math.max(0, delay));
            });
        }""")
        await pg.wait_for_timeout(3200)
        await pg.screenshot(path=f'{OUT}/15-rush-playing.png')
        await pg.wait_for_timeout(5000)
        await pg.screenshot(path=f'{OUT}/16-rush-result.png')
        await pg.click('.ex-close')
        await pg.wait_for_timeout(300)

        # Chords
        await pg.evaluate("""() => window.__petalKeys.startSession({ title: 'Chord Builder', steps: [{ type: 'chord', chords: ['Am'], count: 2 }] })""")
        await pg.wait_for_timeout(500)
        await pg.screenshot(path=f'{OUT}/17-chord.png')
        await pg.evaluate("""() => { const b = window.__petalKeys.bus; [57,60,63].forEach(m => b.noteOn(m, .7, performance.now(), 'midi')); }""")
        await pg.wait_for_timeout(1000)
        await pg.screenshot(path=f'{OUT}/18-chord-wrong.png')
        await pg.evaluate("""() => { const b = window.__petalKeys.bus; b.noteOff(63, performance.now(), 'midi'); b.noteOn(64, .7, performance.now(), 'midi'); }""")
        await pg.wait_for_timeout(400)
        await pg.screenshot(path=f'{OUT}/19-chord-right.png')
        await pg.evaluate("""() => window.__petalKeys.bus.releaseAll()""")
        await pg.click('.ex-close')
        await pg.wait_for_timeout(300)

        # Higher / lower
        await pg.evaluate("""() => window.__petalKeys.startSession({ title: 'Higher or lower', steps: [{ type: 'hl', count: 3, startGap: 12 }] })""")
        await pg.wait_for_timeout(1500)
        await pg.click('.choice-row .btn:first-child')
        await pg.wait_for_timeout(500)
        await pg.screenshot(path=f'{OUT}/20-hl.png')
        await pg.click('.ex-close')
        await pg.wait_for_timeout(300)

        # Find the note
        await pg.evaluate("""() => window.__petalKeys.startSession({ title: 'Find the note', steps: [{ type: 'find', level: 2, count: 3 }] })""")
        await pg.wait_for_timeout(1800)
        await pg.evaluate("""() => { const b = window.__petalKeys.bus; b.noteOn(64, .7, performance.now(), 'touch'); b.noteOff(64, performance.now(), 'touch'); }""")
        await pg.wait_for_timeout(300)
        await pg.screenshot(path=f'{OUT}/21-find.png')
        await pg.click('.ex-actions .btn-primary')
        await pg.wait_for_timeout(500)
        await pg.screenshot(path=f'{OUT}/22-find-reveal.png')
        await pg.click('.ex-close')
        await pg.wait_for_timeout(300)

        # Free play
        await pg.evaluate("""() => window.__petalKeys.startSession({ title: 'Free play', steps: [{ type: 'free', count: 0 }], kind: 'free' })""")
        await pg.wait_for_timeout(500)
        await pg.evaluate("""async () => { const b = window.__petalKeys.bus; const seq = [[60],[64],[67],[60,64,67],[57,60,64],[72],[48,55]]; for (const g of seq) { g.forEach(m => b.noteOn(m, .7, performance.now(), 'midi')); await new Promise(r => setTimeout(r, 160)); g.forEach(m => b.noteOff(m, performance.now(), 'midi')); } [60,64,67].forEach(m => b.noteOn(m, .7, performance.now(), 'midi')); }""")
        await pg.wait_for_timeout(400)
        await pg.screenshot(path=f'{OUT}/23-free.png')
        await pg.evaluate("""() => window.__petalKeys.bus.releaseAll()""")
        await pg.click('.ex-close')
        await pg.wait_for_timeout(300)

        # Me tab
        await pg.click('.tab[data-tab=me]')
        await pg.wait_for_timeout(500)
        await pg.screenshot(path=f'{OUT}/24-me.png', full_page=True)

        # export code roundtrip via store
        res = await pg.evaluate("""async () => { const s = window.__petalKeys.store; const t = await s.exportText(); const r = await s.importText(t); return { len: t.length, r, xp: s.totalXp() }; }""")
        print('export/import:', res)

        # timing check
        await pg.evaluate("""() => window.__petalKeys.startSession({ title: 'Timing check', steps: [{ type: 'calib', count: 0 }], kind: 'calib' })""")
        await pg.wait_for_timeout(500)
        await pg.screenshot(path=f'{OUT}/25-calib.png')
        await pg.click('.ex-close')

        print('\n'.join(logs) if logs else 'no console errors')
        await b.close()

asyncio.run(main())
