// Find the Note: hear C, then a mystery note. Press keys freely to search
// (every key plays), then submit the one that sounds right.
// Submit with the button, Enter, or a tap on the sustain pedal.

import { h } from '../core/util.js';
import { parseNote, midiOf, midiLabel, keysApart, pc } from '../core/music.js';
import { FIND_LEVELS } from '../lessons.js';
import { button, wait, rangeOf } from './common.js';

export function createFindNote(ctx, cfg) {
  const { store, kb, audio } = ctx;
  const level = Math.max(1, Math.min(5, cfg.level || 1));
  const L = FIND_LEVELS[level];
  const pool = L.pool.map((n) => midiOf(parseNote(n)));
  const ref = midiOf(parseNote(L.ref));
  const total = cfg.count || 8;

  let done = 0;
  let target = null;
  let last = null;
  let guess = null;
  let phase = 'listen'; // listen | search | reveal
  let right = 0;
  let pendingAuto = false;

  const guessEl = h('p', { class: 'guess' }, 'Your guess: –');
  const submitBtn = button('Submit', { kind: 'primary', ico: 'check', onclick: () => submit(), disabled: true });
  const againBtn = button('Hear it again', { kind: 'ghost', ico: 'replay', onclick: () => playTarget() });
  const refBtn = button(`Hear ${midiLabel(ref).replace(/\d/, '')}`, { kind: 'ghost', ico: 'listen', onclick: () => playRef() });
  const nextBtn = button('Next', { kind: 'primary', onclick: () => advance() });

  function playRef(when) {
    audio.ensure();
    audio.playNote(ref, { when: when || audio.now + 0.05, dur: 0.75, vel: 0.7 });
    kb.mark(ref, 'ref');
  }

  function playTarget(when) {
    audio.ensure();
    audio.playNote(target, { when: when || audio.now + 0.05, dur: 0.95, vel: 0.75 });
  }

  function nextItem() {
    const choices = pool.filter((m) => m !== last && (pool.length < 3 || m !== ref || Math.random() < 0.35));
    target = choices[Math.floor(Math.random() * choices.length)];
    last = target;
    guess = null;
    phase = 'listen';
    submitBtn.disabled = true;
    guessEl.textContent = 'Your guess: –';
    kb.clearMarks();
    kb.mark(ref, 'ref');
    ctx.setActions(refBtn, againBtn, submitBtn);
    const withRef = L.refEvery || done === 0;
    audio.ensure();
    const t = audio.now + 0.15;
    if (withRef) {
      ctx.feedback(`Here is ${midiLabel(ref).replace(/\d/, '')}… then the mystery note.`, 'info');
      playRef(t);
      playTarget(t + 1.05);
    } else {
      ctx.feedback('Here is the mystery note.', 'info');
      playTarget(t);
    }
    setTimeout(() => {
      if (!ctx.isOpen() || phase !== 'listen') return;
      phase = 'search';
      ctx.feedback('Search on the keys, then tap Submit.', 'info');
    }, withRef ? 1300 : 400);
  }

  async function submit() {
    if (guess == null || phase === 'reveal') return;
    phase = 'reveal';
    const ok = guess === target || (store.settings.anyOctave && pc(guess) === pc(target));
    store.add(`f:${target}`, 1, ok ? 1 : 0);
    store.add('f:err', 1, Math.abs(guess - target));
    kb.clearMarks('chosen');
    if (ok) {
      right++;
      kb.mark(guess, 'good');
      audio.sfx('good');
      ctx.feedback(`Yes! It was ${midiLabel(target).replace(/\d/, '')}.`, 'good');
      ctx.record({ correct: true, xp: 3 });
      ctx.progress(1);
      done++;
      submitBtn.disabled = true;
      pendingAuto = true;
      const still = await wait(ctx, 1200);
      pendingAuto = false;
      if (!still) return;
      advanceAfterProgress();
    } else {
      kb.mark(guess, 'bad');
      kb.mark(target, 'answer');
      audio.sfx('soft-wrong');
      const close = Math.abs(guess - target) <= 2;
      ctx.feedback(
        `You chose ${midiLabel(guess).replace(/\d/, '')}. The note was ${midiLabel(target).replace(/\d/, '')}, ${keysApart(guess, target)}.${close ? ' So close!' : ''}`,
        'hint',
      );
      ctx.record({ correct: false, xp: close ? 1 : 0 });
      ctx.progress(1);
      done++;
      // play theirs, then the answer, so the difference can be heard
      const t = audio.now + 0.3;
      audio.playNote(guess, { when: t, dur: 0.7 });
      audio.playNote(target, { when: t + 0.85, dur: 0.9 });
      ctx.setActions(againBtn, nextBtn);
      setTimeout(() => nextBtn.focus({ preventScroll: true }), 30);
    }
  }

  function advance() {
    if (pendingAuto || phase !== 'reveal') return;
    advanceAfterProgress();
  }

  function advanceAfterProgress() {
    if (done >= total) {
      const acc = right / total;
      const cur = Math.max(level, store.best('find:level') || 0);
      if (acc >= 0.8 && level >= cur && level < 5) {
        store.setBest('find:level', level + 1);
        ctx.note(`Level up! Find the Note now uses: ${FIND_LEVELS[level + 1].label}.`);
      }
      ctx.done();
    } else nextItem();
  }

  return {
    mount() {
      ctx.setTitle('Find the note');
      ctx.body.append(h('div', { class: 'prompt-block find' },
        h('div', { class: 'ear-art', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
        h('p', { class: 'prompt-sub' }, L.label),
        guessEl));
      const [lo, hi] = rangeOf(L.pool.map(parseNote));
      kb.focus(Math.min(lo, ref), Math.max(hi, ref));
      nextItem();
    },
    onNoteOn(e) {
      if (phase === 'reveal') return;
      if (phase === 'listen') phase = 'search';
      if (guess != null) kb.unmark(guess, 'chosen');
      guess = e.midi;
      kb.mark(guess, 'chosen');
      guessEl.textContent = `Your guess: ${midiLabel(guess)}`;
      submitBtn.disabled = false;
    },
    onPedal(e) {
      if (e.down && phase === 'search' && guess != null) submit();
    },
    onKey(e) {
      if (e.key === 'Enter') {
        if (phase === 'reveal') advance();
        else submit();
        return true;
      }
      return false;
    },
    destroy() {
      kb.clearMarks();
    },
  };
}
