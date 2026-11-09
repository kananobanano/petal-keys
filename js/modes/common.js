// Bits shared by the drills.

import { h, weightedChoice } from '../core/util.js';
import { icon } from '../ui/icons.js';
import { midiOf, pc } from '../core/music.js';

/** Pick an item, favouring weak ones and avoiding an immediate repeat. */
export function pickWeighted(items, keyOf, store, lastKey = null) {
  if (items.length === 1) return items[0];
  const pool = items.filter((it) => keyOf(it) !== lastKey);
  const list = pool.length ? pool : items;
  return weightedChoice(list, list.map((it) => store.weight(keyOf(it))));
}

export function button(label, { kind = 'ghost', ico = null, onclick, disabled = false, wide = false, title = null } = {}) {
  return h(
    'button',
    { class: `btn btn-${kind}${wide ? ' btn-wide' : ''}`, type: 'button', onclick, disabled, title, 'aria-label': title || null },
    ico ? icon(ico) : null,
    label ? h('span', {}, label) : null,
  );
}

export const TEMPO_MAX = 400;

/**
 * Make a button repeat while it is held (it speeds up after a moment), so
 * going from 60 to 400 doesn't take sixty taps. fn(fast) gets true once it
 * has been held a while. Keyboard Enter/Space still works as one step.
 */
export function holdRepeat(btn, fn) {
  let timer = 0;
  let n = 0;
  const stop = () => {
    clearTimeout(timer);
    timer = 0;
  };
  const again = () => {
    n++;
    fn(n > 8);
    if (btn.disabled) return stop();
    timer = setTimeout(again, n < 3 ? 220 : 80);
  };
  btn.addEventListener('pointerdown', (e) => {
    if (e.button || btn.disabled) return;
    e.preventDefault();
    stop();
    n = 0;
    fn(false);
    timer = setTimeout(again, 420);
  });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) btn.addEventListener(ev, stop);
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
  btn.addEventListener('click', (e) => {
    if (e.detail === 0) fn(false); // keyboard press (pointer presses are handled above)
  });
  return btn;
}

/** The "− ♩ = 120 +" control. Hold − or + to move quickly. */
export function tempoControl({ value, min = 40, max = TEMPO_MAX, step = 5, onChange = null }) {
  const val = h('span', { class: 'tempo-val' });
  const slower = h('button', { class: 'btn btn-round', type: 'button', 'aria-label': 'Slower' }, '−');
  const faster = h('button', { class: 'btn btn-round', type: 'button', 'aria-label': 'Faster' }, '+');
  const el = h('div', { class: 'tempo', role: 'group', 'aria-label': 'Tempo' },
    slower, h('span', { class: 'tempo-lbl' }, h('span', { class: 'q' }, '♩'), ' = ', val), faster);
  let cur = value;
  const set = (v, quiet = false) => {
    cur = Math.max(min, Math.min(max, Math.round(v)));
    val.textContent = String(cur);
    slower.disabled = cur <= min;
    faster.disabled = cur >= max;
    if (!quiet && onChange) onChange(cur);
  };
  holdRepeat(slower, (fast) => set(cur - step * (fast ? 2 : 1)));
  holdRepeat(faster, (fast) => set(cur + step * (fast ? 2 : 1)));
  set(value, true);
  return { el, set, get value() { return cur; } };
}

/** Beats of count-in: at least `base`, doubled while that would be over in under ~1.2 s. */
export function countInBeats(base, beatSec) {
  let n = base;
  while (n * beatSec < 1.2 && n < base * 4) n *= 2;
  return n;
}

/** Does a played key count as this note? */
export function matchesNote(midi, target, anyOctave) {
  const t = typeof target === 'number' ? target : midiOf(target);
  return midi === t || (anyOctave && pc(midi) === pc(t));
}

export const clefKey = (clef) => (clef === 'bass' ? 'b' : 't');

/** Range (lowest/highest MIDI) of a list of spelled notes. */
export function rangeOf(notes) {
  const ms = notes.map(midiOf);
  return [Math.min(...ms), Math.max(...ms)];
}

/** Staff extent (positions) wide enough for every note in a pool. */
export function poolExtent(notes, clef, staffPos) {
  const ps = notes.map((n) => staffPos(n, clef));
  return [Math.min(-1, Math.min(...ps) - 1), Math.max(9, Math.max(...ps) + 1)];
}

export function wait(ctx, ms) {
  return new Promise((resolve) => setTimeout(() => resolve(ctx.isOpen()), ms));
}
