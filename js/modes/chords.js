// Chord Builder: a chord name appears, hold its notes together.
// Any octave and any order (inversion) counts. On a touch screen, keys can
// "latch" so you can tap a chord together one note at a time.

import { h, isCoarsePointer } from '../core/util.js';
import { parseChord, chordNotes, chordSymbol, chordName, compareChord, noteLabel, pc, midiOf } from '../core/music.js';
import { renderStaff, singleScore } from '../core/staff.js';
import { pickWeighted, button, wait } from './common.js';

export function createChords(ctx, cfg) {
  const { store, kb, audio, bus } = ctx;
  const chords = (cfg.chords || ['C']).map((c) => (typeof c === 'string' ? parseChord(c) : c));
  const total = cfg.count || 8;
  const keyOf = (c) => `c:${c.id || chordSymbol(c)}`;

  let done = 0;
  let target = null;
  let lastKey = null;
  let wrong = 0;
  let hinted = false;
  let locked = false;
  let shownAt = 0;
  let evalTimer = 0;
  let wrongTimer = 0;
  let lastWrongSet = '';

  const symEl = h('div', { class: 'chord-big' });
  const nameEl = h('p', { class: 'prompt-sub' });
  const hintBox = h('div', { class: 'chord-hint', hidden: true });
  const latchToggle = h('label', { class: 'switch-row' },
    h('input', { type: 'checkbox', id: 'latch-toggle', onchange: (e) => setLatch(e.target.checked) }),
    h('span', { class: 'switch', 'aria-hidden': 'true' }),
    h('span', {}, 'Tap keys to hold them'));

  function setLatch(on) {
    kb.setLatch(on);
    store.setLocal('latchChords', on);
    latchToggle.querySelector('input').checked = on;
    clearBtn.hidden = !on;
  }

  const clearBtn = button('Clear keys', { kind: 'ghost', onclick: () => kb.clearLatched() });

  function nextItem() {
    target = pickWeighted(chords, keyOf, store, lastKey);
    lastKey = keyOf(target);
    wrong = 0;
    hinted = false;
    locked = false;
    lastWrongSet = '';
    shownAt = performance.now();
    symEl.textContent = chordSymbol(target);
    symEl.classList.remove('pop');
    void symEl.offsetWidth;
    symEl.classList.add('pop');
    nameEl.textContent = `${chordName(target)} · hold the notes together`;
    hintBox.hidden = true;
    kb.clearMarks();
    kb.clearLatched();
    ctx.feedback('');
  }

  function showHint() {
    hinted = true;
    const ns = chordNotes(target, 4);
    hintBox.hidden = false;
    hintBox.textContent = '';
    const st = h('div', { class: 'staff-mini' });
    hintBox.append(st, h('p', { class: 'hint-notes' }, ns.map((n) => noteLabel(n, { octave: false })).join(' · ')));
    requestAnimationFrame(() => renderStaff(st, singleScore(ns, 'treble'), { width: 150, free: true, center: true, maxSpace: 9 }));
    for (const n of ns) {
      const m = midiOf(n);
      for (let k = kb.from; k <= kb.to; k++) if (pc(k) === pc(m)) kb.mark(k, 'hint');
    }
  }

  async function success(held) {
    locked = true;
    clearTimeout(wrongTimer);
    const first = wrong === 0 && !hinted;
    const ms = performance.now() - shownAt;
    for (const m of held) kb.mark(m, 'good', 900);
    audio.sfx('good');
    ctx.feedback(first ? `${chordSymbol(target)}, lovely!` : `That's ${chordSymbol(target)}!`, 'good');
    store.add(keyOf(target), 1, first ? 1 : 0, first ? ms : 0, first ? 1 : 0);
    store.pushResult(keyOf(target), first);
    ctx.record({ correct: first, xp: first ? 3 : 1 });
    ctx.progress(1);
    done++;
    if (!(await wait(ctx, 1000))) return;
    if (done >= total) ctx.done();
    else nextItem();
  }

  function evaluate() {
    if (locked || !target) return;
    const held = bus.held();
    const size = chordNotes(target).length;
    const cmp = compareChord(held, target);
    clearTimeout(wrongTimer);
    if (cmp.ok) {
      success(held);
      return;
    }
    const sig = held.join(',');
    if (held.length >= size && sig !== lastWrongSet) {
      wrongTimer = setTimeout(() => {
        if (locked || bus.held().join(',') !== sig) return;
        lastWrongSet = sig;
        wrong++;
        audio.sfx('soft-wrong');
        for (const m of held) if (cmp.extra.includes(pc(m))) kb.mark(m, 'bad', 900);
        const want = chordNotes(target, 4).map((n) => noteLabel(n, { octave: false })).join(' · ');
        ctx.feedback(`Not quite. ${chordSymbol(target)} is ${want}.`, 'hint');
        if (wrong >= 2 && !hinted) showHint();
      }, 650);
    }
  }

  function schedule() {
    clearTimeout(evalTimer);
    evalTimer = setTimeout(evaluate, 120);
  }

  return {
    mount() {
      ctx.setTitle('Chord Builder');
      ctx.body.append(h('div', { class: 'prompt-block' }, symEl, nameEl, hintBox));
      const coarse = isCoarsePointer();
      const latchPref = store.getLocal('latchChords');
      const hintBtn = button('Show me', { kind: 'ghost', ico: 'sparkle', onclick: () => { if (!hinted) showHint(); } });
      ctx.setActions(hintBtn, coarse ? latchToggle : null, clearBtn);
      setLatch(coarse && latchPref !== false);
      kb.focus(60, 83);
      nextItem();
    },
    onNoteOn() {
      schedule();
    },
    onNoteOff() {
      schedule();
    },
    destroy() {
      clearTimeout(evalTimer);
      clearTimeout(wrongTimer);
      kb.setLatch(false);
      kb.clearMarks();
    },
  };
}
