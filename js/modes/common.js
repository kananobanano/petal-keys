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
