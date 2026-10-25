// "Find the key": a letter name appears, press that key in any octave.

import { h } from '../core/util.js';
import { LETTER_PC, pc, midiLabel } from '../core/music.js';
import { pickWeighted, wait } from './common.js';

const HINTS = {
  C: 'C is just to the left of the two black keys.',
  D: 'D sits between the two black keys.',
  E: 'E is just to the right of the two black keys.',
  F: 'F is just to the left of the three black keys.',
  G: 'G sits between the first two of the three black keys.',
  A: 'A sits between the last two of the three black keys.',
  B: 'B is just to the right of the three black keys.',
};

const display = (name) => name[0] + (name[1] === '#' ? '♯' : name[1] === 'b' ? '♭' : '');
const pcOfName = (name) => (LETTER_PC[name[0]] + (name[1] === '#' ? 1 : name[1] === 'b' ? -1 : 0) + 12) % 12;

function hintFor(name) {
  if (name.length === 1) return HINTS[name];
  const letter = name[0];
  return name[1] === '#'
    ? `${display(name)} is the black key just to the right of ${letter}.`
    : `${display(name)} is the black key just to the left of ${letter}.`;
}

export function createName(ctx, cfg) {
  const { store, kb, audio } = ctx;
  const total = cfg.count || 8;
  let done = 0;
  let target = null;
  let wrong = 0;
  let locked = false;
  let shownAt = 0;
  let lastKey = null;

  const letterEl = h('div', { class: 'big-letter', 'aria-live': 'polite' });
  const sub = h('p', { class: 'prompt-sub' }, cfg.prompt || 'Find it on the keyboard. Any octave counts.');

  function nextItem() {
    target = pickWeighted(cfg.pool, (n) => `k:${n}`, store, lastKey);
    lastKey = `k:${target}`;
    wrong = 0;
    locked = false;
    shownAt = performance.now();
    letterEl.textContent = display(target);
    letterEl.classList.remove('pop');
    void letterEl.offsetWidth;
    letterEl.classList.add('pop');
    ctx.feedback('');
    kb.clearMarks();
  }

  async function answer(midi) {
    if (locked || !target) return;
    const want = pcOfName(target);
    if (pc(midi) === want) {
      locked = true;
      const first = wrong === 0;
      kb.mark(midi, 'good', 700);
      audio.sfx('good');
      ctx.feedback(first ? 'Yes!' : 'There it is!', 'good');
      store.add(`k:${target}`, 1, first ? 1 : 0, first ? performance.now() - shownAt : 0, first ? 1 : 0);
      store.pushResult(`k:${target}`, first);
      ctx.record({ correct: first, xp: first ? 2 : 1 });
      ctx.progress(1);
      done++;
      if (!(await wait(ctx, 650))) return;
      if (done >= total) ctx.done();
      else nextItem();
    } else {
      wrong++;
      kb.mark(midi, 'bad', 600);
      audio.sfx('soft-wrong');
      const msg = `That's ${midiLabel(midi).replace(/-?\d/, '')}. ${hintFor(target)}`;
      ctx.feedback(msg, 'hint');
      if (wrong >= 2) {
        for (let m = kb.from; m <= kb.to; m++) if (pc(m) === want) kb.mark(m, 'hint');
      }
    }
  }

  return {
    mount() {
      ctx.setTitle('Find the key');
      ctx.body.append(h('div', { class: 'prompt-block' }, letterEl, sub));
      kb.focus(60, 83);
      nextItem();
    },
    onNoteOn(e) {
      answer(e.midi);
    },
    destroy() {
      kb.clearMarks();
    },
  };
}
