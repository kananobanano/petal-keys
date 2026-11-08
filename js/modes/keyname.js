// Name that key: look at a key signature and pick the major key it means.
// A wrong pick gets the trick as a hint; with `minor: true` the answer also
// mentions the minor key that shares the signature.

import { h } from '../core/util.js';
import { renderStaff } from '../core/staff.js';
import { midiOf } from '../core/music.js';
import { pickWeighted, wait } from './common.js';
import { keyName, keyLetter, keyTip, minorTwin, signatureNotes, listText, tonic } from '../core/keys.js';

export function createKeyName(ctx, cfg) {
  const { store, audio } = ctx;
  const keys = cfg.keys || [0, 1, -1];
  const total = cfg.count || 8;
  const keyOf = (k) => `k:${k}`;

  let done = 0;
  let target = 0;
  let wrong = 0;
  let locked = false;
  let lastKey = null;

  const staffEl = h('div', { class: 'staff-card keysig-card' });
  const sub = h('p', { class: 'prompt-sub' }, 'Which major key has this key signature?');
  const grid = h('div', { class: 'choice-grid' });

  function draw() {
    const w = staffEl.clientWidth - 24 || 300;
    renderStaff(staffEl, { clef: 'treble', key: target, time: null, measures: [{ events: [] }] }, {
      width: Math.min(w, 300), free: true, center: true, maxSpace: 15, extent: { treble: [-1, 11] },
      label: target ? `Key signature with ${listText(signatureNotes(target))}` : 'Key signature with no sharps or flats',
    });
  }

  /** The right key plus up to three near neighbours, shuffled. */
  function options() {
    const near = [...new Set([...keys, target - 1, target + 1, target - 2, target + 2, -target].filter((k) => k !== target && k >= -6 && k <= 6))];
    near.sort(() => Math.random() - 0.5);
    const learned = near.filter((k) => keys.includes(k));
    const others = near.filter((k) => !keys.includes(k));
    const picks = [...learned, ...others].slice(0, 3);
    return [target, ...picks].sort(() => Math.random() - 0.5);
  }

  function nextItem() {
    target = pickWeighted(keys, keyOf, store, lastKey);
    lastKey = keyOf(target);
    ctx.app.debug = { keyname: { target } }; // handy for testing
    wrong = 0;
    locked = false;
    draw();
    grid.textContent = '';
    for (const k of options()) {
      const b = h('button', { class: 'btn btn-choice', type: 'button', onclick: () => pick(k, b) }, keyLetter(k), h('span', { class: 'choice-sub' }, 'major'));
      b.dataset.key = String(k);
      grid.append(b);
    }
    ctx.feedback('');
  }

  async function pick(k, btn) {
    if (locked) return;
    if (k !== target) {
      wrong++;
      btn.classList.add('wrong');
      btn.disabled = true;
      audio.sfx('soft-wrong');
      ctx.feedback(`Not quite. ${keyTip(target)}`, 'hint');
      return;
    }
    locked = true;
    btn.classList.add('right');
    grid.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    const first = wrong === 0;
    store.add(keyOf(target), 1, first ? 1 : 0);
    store.pushResult(keyOf(target), first);
    ctx.record({ correct: first, xp: first ? 2 : 1 });
    ctx.progress(1);
    audio.sfx('good');
    const t = tonic(target);
    audio.playNote(midiOf({ ...t, octave: 4 }), { dur: 0.8, vel: 0.6 });
    let msg = `Yes, ${keyName(target)}!`;
    if (cfg.minor) msg += ` It is also the signature of ${minorTwin(target)}.`;
    else if (first && target) msg += ` ${keyTip(target)}`;
    ctx.feedback(msg, 'good');
    done++;
    if (!(await wait(ctx, cfg.minor || (first && target) ? 2600 : 1300))) return;
    if (done >= total) ctx.done();
    else nextItem();
  }

  let ro = null;
  return {
    mount() {
      ctx.setTitle('Name that key');
      ctx.body.append(h('div', { class: 'prompt-block' }, staffEl, sub, grid));
      ctx.showKeyboard(false);
      requestAnimationFrame(() => nextItem());
      if (typeof ResizeObserver === 'function') {
        let last = 0;
        ro = new ResizeObserver(() => {
          if (Math.abs(staffEl.clientWidth - last) > 8) {
            last = staffEl.clientWidth;
            draw();
          }
        });
        ro.observe(staffEl);
      }
    },
    destroy() {
      ro && ro.disconnect();
    },
  };
}
