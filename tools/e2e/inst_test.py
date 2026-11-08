import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True, device_scale_factor=2)
        pg = await ctx.new_page()
        logs = []
        pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}') if m.type in ('error','warning') else None)
        pg.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
        await pg.goto('http://localhost:8765/')
        await pg.wait_for_selector('body[data-ready]')
        await pg.wait_for_timeout(700)
        await pg.click("text=Let's begin")
        print('title:', await pg.text_content('.page-title'), '| brand:', await pg.text_content('.brand-name'))
        await pg.evaluate("() => window.__petalKeys.startSession({ title: 'Free play', steps: [{ type: 'free', count: 0 }], kind: 'free' })")
        await pg.wait_for_timeout(500)
        for inst in ['epiano','musicbox','marimba','organ','synth','pad','piano']:
            await pg.select_option('#free-inst', inst)
            await pg.evaluate("""async () => { const b = window.__petalKeys.bus; for (const m of [60,64,67]) { b.noteOn(m, .8, performance.now(), 'midi'); await new Promise(r => setTimeout(r, 120)); } await new Promise(r => setTimeout(r, 300)); [60,64,67].forEach(m => b.noteOff(m, performance.now(), 'midi')); }""")
            st = await pg.evaluate("() => ({ inst: window.__petalKeys.audio.instrument, saved: window.__petalKeys.store.settings.instrument, voices: window.__petalKeys.audio.voices.length })")
            print(inst, st)
        # render a short offline check of each synth's output level
        lv = await pg.evaluate("""async () => {
          const out = {};
          const A = window.__petalKeys.audio;
          for (const k of ['epiano','musicbox','marimba','organ','synth','pad','soft']) {
            const oc = new OfflineAudioContext(1, 44100, 44100);
            const fake = Object.create(A); fake.ctx = oc; fake.voices = []; fake.instrument = k === 'soft' ? 'piano' : k; fake.loadState = 'idle'; fake.pianoBus = oc.destination;
            const v = fake._voice(60, 0.8, 0.01, oc.destination);
            fake._release(v, 0.6);
            const buf = await oc.startRendering(); const d = buf.getChannelData(0);
            let peak = 0; for (const x of d) peak = Math.max(peak, Math.abs(x));
            out[k] = Math.round(peak * 100) / 100;
          }
          return out;
        }""")
        print('peak levels:', lv)
        await pg.screenshot(path='/tmp/claude-0/inst.png')
        print('\n'.join(logs) if logs else 'no console errors')
        await b.close()
asyncio.run(main())
