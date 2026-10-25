// Higher or lower? Two notes play; say whether the second is higher.
// The gap starts wide and shrinks after two right answers in a row.

import { h, randInt } from '../core/util.js';
import { spell, noteLabel } from '../core/music.js';
import { renderStaff, rowScore, clefFor } from '../core/staff.js';
import { button, wait } from './common.js';

export function createHigherLower(ctx, cfg) {
  const { store, audio } = ctx;
  const total = cfg.count || 12;
  let gap = cfg.startGap || 12;
  const minGap = 1;
  let done = 0;
  let streak = 0;
  let a = 60;
  let b = 67;
  let answered = false;
  let ready = false;
  let smallestRight = 99;

  const gapEl = h('p', { class: 'prompt-sub' });
  const staffEl = h('div', { class: 'staff-mini hl-staff' });
  const upBtn = button('Higher', { kind: 'choice', ico: 'up', onclick: () => answer('up') });
  const downBtn = button('Lower', { kind: 'choice', ico: 'down', onclick: () => answer('down') });
  const choices = h('div', { class: 'choice-row' }, upBtn, downBtn);
  const replay = button('Hear again', { kind: 'ghost', ico: 'replay', onclick: () => play() });

  function setGapText() {
    gapEl.textContent = `Gap: ${gap} key${gap === 1 ? '' : 's'}`;
  }

  function play() {
    audio.ensure();
    const t = audio.now + 0.08;
    audio.playNote(a, { when: t, dur: 0.6, vel: 0.72 });
    audio.playNote(b, { when: t + 0.75, dur: 0.75, vel: 0.72 });
    ready = false;
    setTimeout(() => {
      ready = true;
    }, 780);
  }

  function nextItem() {
    answered = false;
    const lo = 48;
    const hi = 84;
    const dir = Math.random() < 0.5 ? 1 : -1;
    a = dir > 0 ? randInt(lo, hi - gap) : randInt(lo + gap, hi);
    b = a + dir * gap;
    setGapText();
    staffEl.textContent = '';
    staffEl.classList.remove('shown');
    upBtn.classList.remove('right', 'wrong');
    downBtn.classList.remove('right', 'wrong');
    upBtn.disabled = false;
    downBtn.disabled = false;
    ctx.feedback('Listen…', 'info');
    setTimeout(() => {
      if (!ctx.isOpen()) return;
      play();
      ctx.feedback('Was the second note higher or lower?', 'info');
    }, 250);
  }

  function reveal() {
    const na = spell(a);
    const nb = spell(b);
    staffEl.classList.add('shown');
    requestAnimationFrame(() => renderStaff(staffEl, rowScore([[na], [nb]], clefFor([na, nb])), {
      width: Math.min(260, staffEl.clientWidth || 260), free: true, center: true, maxSpace: 9, freeAdvance: 5,
      label: `First ${noteLabel(na)}, then ${noteLabel(nb)}`,
    }));
  }

  async function answer(dir) {
    if (answered) return;
    if (!ready) {
      // let them answer as soon as the second note has started
      await new Promise((r) => setTimeout(r, 120));
    }
    answered = true;
    upBtn.disabled = true;
    downBtn.disabled = true;
    const right = (b > a ? 'up' : 'down') === dir;
    const btn = dir === 'up' ? upBtn : downBtn;
    btn.classList.add(right ? 'right' : 'wrong');
    store.add(`h:${gap}`, 1, right ? 1 : 0);
    ctx.record({ correct: right, xp: right ? (gap <= 3 ? 2 : 1) : 0 });
    reveal();
    if (right) {
      audio.sfx('good');
      streak++;
      smallestRight = Math.min(smallestRight, gap);
      store.setBest('hl:level', 25 - gap);
      ctx.feedback(`Yes, it went ${dir === 'up' ? 'up' : 'down'}!`, 'good');
      if (streak >= 2 && gap > minGap) {
        gap = Math.max(minGap, Math.round(gap * 0.7));
        streak = 0;
      }
    } else {
      audio.sfx('soft-wrong');
      streak = 0;
      ctx.feedback(`It went ${b > a ? 'up' : 'down'}. Listen once more.`, 'hint');
      gap = Math.min(24, gap + 2);
      setTimeout(() => ctx.isOpen() && play(), 500);
    }
    ctx.progress(1);
    done++;
    if (!(await wait(ctx, right ? 1300 : 2600))) return;
    if (done >= total) {
      if (smallestRight < 99) ctx.note(`Smallest gap you heard: ${smallestRight} key${smallestRight === 1 ? '' : 's'}.`);
      ctx.done();
    } else nextItem();
  }

  return {
    mount() {
      ctx.setTitle('Higher or lower?');
      ctx.showKeyboard(false);
      ctx.body.append(h('div', { class: 'prompt-block hl' }, h('div', { class: 'ear-art', 'aria-hidden': 'true' }, h('i'), h('i')), gapEl, choices, staffEl));
      ctx.setActions(replay);
      nextItem();
    },
    onKey(e) {
      if (e.key === 'ArrowUp') {
        answer('up');
        return true;
      }
      if (e.key === 'ArrowDown') {
        answer('down');
        return true;
      }
      if (e.key === ' ') {
        play();
        return true;
      }
      return false;
    },
  };
}
