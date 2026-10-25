// Timing calibration, like in rhythm games: tap along with the clicks and
// the app learns how late (or early) your setup feels, then adjusts scoring.
// Bluetooth earbuds usually need this.

import { h } from '../core/util.js';
import { button } from './common.js';

const CLICKS = 16;
const SKIP = 4;
const BPM = 100;

export function createCalibrate(ctx) {
  const { store, audio } = ctx;
  let phase = 'intro'; // intro | running | result
  let clickTimes = [];
  let taps = [];
  let raf = 0;
  let result = null;

  const big = h('button', { class: 'tap-pad', type: 'button', 'aria-label': 'Tap here on each click' }, h('span', {}, 'Tap'));
  const status = h('p', { class: 'prompt-sub' });
  const dotRow = h('div', { class: 'calib-dots', 'aria-hidden': 'true' }, Array.from({ length: CLICKS }, () => h('i')));
  big.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    tap(e.timeStamp || performance.now());
  });

  function intro() {
    phase = 'intro';
    const cur = store.getLocal('calibrationMs') || 0;
    status.textContent = `You will hear ${CLICKS} clicks. From the 5th one, tap along on any piano key or the pad. Current setting: ${cur} ms.`;
    ctx.feedback('Use the same headphones or speakers you practise with.', 'info');
    ctx.setActions(
      cur ? button('Reset to 0', { kind: 'ghost', onclick: () => { store.setLocal('calibrationMs', 0); intro(); } }) : null,
      button('Start', { kind: 'primary', ico: 'play', onclick: () => run() }),
    );
  }

  function run() {
    audio.ensure();
    phase = 'running';
    taps = [];
    const beat = 60 / BPM;
    const t0 = audio.now + 0.4;
    clickTimes = [];
    for (let i = 0; i < CLICKS; i++) {
      audio.click(t0 + i * beat, i % 4 === 0);
      clickTimes.push(audio.perfTimeOf(t0 + i * beat));
    }
    dotRow.querySelectorAll('i').forEach((d) => d.classList.remove('lit', 'hit'));
    status.textContent = 'Listen… start tapping on the 5th click.';
    ctx.feedback('');
    ctx.setActions(button('Stop', { kind: 'ghost', onclick: () => { cancelAnimationFrame(raf); audio.releaseAll(); intro(); } }));
    const loop = () => {
      if (!ctx.isOpen() || phase !== 'running') return;
      const now = performance.now();
      const idx = clickTimes.findIndex((t) => t > now) - 1;
      const n = idx < 0 ? (now > clickTimes[CLICKS - 1] ? CLICKS - 1 : -1) : idx;
      dotRow.querySelectorAll('i').forEach((d, i) => d.classList.toggle('lit', i <= n));
      if (n >= SKIP - 1 && n < SKIP) status.textContent = 'Tap along now!';
      if (now > clickTimes[CLICKS - 1] + 450) {
        done();
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }

  function tap(t) {
    if (phase !== 'running') return;
    taps.push(t);
    big.classList.remove('bump');
    void big.offsetWidth;
    big.classList.add('bump');
  }

  function done() {
    phase = 'result';
    const offsets = [];
    for (let i = SKIP; i < CLICKS; i++) {
      const c = clickTimes[i];
      let best = null;
      for (const t of taps) if (Math.abs(t - c) < 300 && (best === null || Math.abs(t - c) < Math.abs(best - c))) best = t;
      if (best !== null) offsets.push(best - c);
    }
    if (offsets.length < 6) {
      status.textContent = `Only ${offsets.length} taps landed near the clicks. Let's try again.`;
      ctx.setActions(button('Try again', { kind: 'primary', onclick: () => run() }));
      return;
    }
    offsets.sort((a, b) => a - b);
    const mid = offsets[Math.floor(offsets.length / 2)];
    const spread = offsets[Math.floor(offsets.length * 0.8)] - offsets[Math.floor(offsets.length * 0.2)];
    result = Math.round(mid);
    const feel = Math.abs(result) < 20 ? 'right on the beat' : result > 0 ? `${result} ms late` : `${-result} ms early`;
    status.textContent = `Your taps landed ${feel}${spread > 120 ? ' (they were a bit scattered, so maybe try once more)' : ''}.`;
    ctx.feedback(Math.abs(result) < 20 ? 'Your setup is nicely in sync.' : 'Save this and Note Rush will adjust its timing for you.', 'good');
    ctx.setActions(
      button('Try again', { kind: 'ghost', onclick: () => run() }),
      button('Save', { kind: 'primary', ico: 'check', onclick: () => { store.setLocal('calibrationMs', result); ctx.done(); } }),
    );
  }

  return {
    mount() {
      ctx.setTitle('Timing check');
      ctx.showKeyboard(true);
      ctx.body.append(h('div', { class: 'prompt-block calib' }, dotRow, big, status));
      intro();
    },
    onNoteOn(e) {
      tap(e.time);
    },
    onKey(e) {
      if (e.key === ' ') {
        tap(e.timeStamp || performance.now());
        return true;
      }
      return false;
    },
    destroy() {
      cancelAnimationFrame(raf);
    },
  };
}
