// Static pictures used on lesson cards: mini keyboards, staves, chords.

import { h } from '../core/util.js';
import { isBlack, midiLabel, midiOf, parseNote, parseChord, chordNotes, chordSymbol, chordName, noteLabel } from '../core/music.js';
import { renderStaff, rowScore, singleScore } from '../core/staff.js';

/** A small non-interactive keyboard. */
export function miniKeys({ from = 'C4', to = 'B4', marks = {}, labels = null, families = false } = {}) {
  const lo = midiOf(parseNote(from));
  const hi = midiOf(parseNote(to));
  const markOf = new Map();
  for (const [cls, list] of Object.entries(marks)) for (const n of list) markOf.set(midiOf(parseNote(n)), cls);
  const labelSet = Array.isArray(labels) ? new Set(labels.map((n) => midiOf(parseNote(n)))) : null;
  const whites = [];
  for (let m = lo; m <= hi; m++) if (!isBlack(m)) whites.push(m);
  const keys = h('div', { class: 'kb-keys mini', style: `--n:${whites.length}` });
  const OFF = { 1: -0.1, 3: 0.1, 6: -0.12, 8: 0, 10: 0.12 };
  const lbl = (m) => {
    if (labels === 'all') return isBlack(m) ? '' : midiLabel(m).replace(/\d/, '');
    if (labels === 'black') return isBlack(m) ? `${midiLabel(m).slice(0, 2)}\n${midiLabel(m, 'flat').slice(0, 2)}` : '';
    if (labelSet && labelSet.has(m)) return midiLabel(m).replace(/-?\d/, '');
    return '';
  };
  whites.forEach((m, i) => {
    const t = lbl(m);
    keys.append(h('div', { class: `key white${markOf.has(m) ? ' ' + markOf.get(m) : ''}` }, t ? h('span', { class: 'lbl' }, t) : null));
    const b = m + 1;
    if (b < hi && isBlack(b)) {
      let fam = '';
      if (families) fam = [1, 3].includes(b % 12) ? ' fam2' : ' fam3';
      const left = ((i + 1 + (OFF[b % 12] || 0)) / whites.length) * 100;
      const tb = lbl(b);
      keys.append(h('div', { class: `key black${fam}${markOf.has(b) ? ' ' + markOf.get(b) : ''}`, style: `left:calc(${left}% - var(--bw) / 2)` },
        tb ? h('span', { class: 'lbl' }, tb) : null));
    }
  });
  return h('div', { class: 'kb kb-static', 'aria-hidden': 'true' }, keys);
}

/** A staff drawn once its box has a width. */
export function staffBox(score, opts = {}, cls = '') {
  const box = h('div', { class: `staff-box ${cls}` });
  const draw = () => {
    const w = box.clientWidth;
    if (!w) return;
    renderStaff(box, score, { width: w, ...opts });
  };
  requestAnimationFrame(draw);
  if (typeof ResizeObserver === 'function') {
    let last = 0;
    new ResizeObserver(() => {
      if (Math.abs(box.clientWidth - last) > 4) {
        last = box.clientWidth;
        draw();
      }
    }).observe(box);
  }
  return box;
}

function chordFigure(sym) {
  const chord = parseChord(sym);
  const ns = chordNotes(chord, 4);
  const lo = midiOf(ns[0]);
  const hi = midiOf(ns[ns.length - 1]);
  const from = midiLabel(lo - (lo % 12)).replace('♯', '#');
  const toM = Math.max(hi, lo - (lo % 12) + 11);
  const top = isBlack(toM) ? toM + 1 : toM;
  return h(
    'figure',
    { class: 'chord-fig' },
    h('div', { class: 'chord-sym' }, chordSymbol(chord)),
    staffBox(singleScore(ns, 'treble'), { free: true, center: true, maxSpace: 11 }, 'small'),
    miniKeys({ from, to: midiLabel(top).replace('♯', '#'), marks: { hint: ns.map((n) => `${n.letter}${n.acc > 0 ? '#' : n.acc < 0 ? 'b' : ''}${n.octave}`) } }),
    h('figcaption', {}, `${chordName(chord)}: ${ns.map((n) => noteLabel(n, { octave: false })).join(' · ')}`),
  );
}

/** Build the picture for a lesson card. */
export function cardVisual(v) {
  if (!v) return null;
  const parts = [];
  if (v.staff) {
    const ns = v.staff.notes.map(parseNote);
    if (v.staff.quarters) {
      const score = {
        clef: v.staff.clef,
        time: [4, 4],
        measures: [{ events: ns.map((n, i) => ({ id: 'q' + i, beat: i, dur: 1, notes: [n] })) }],
      };
      parts.push(staffBox(score, { maxSpace: 11 }));
    } else {
      const score = ns.length ? rowScore(ns.map((n) => [n]), v.staff.clef) : { clef: v.staff.clef, time: null, measures: [{ events: [] }] };
      parts.push(staffBox(score, { free: true, center: true, noteNames: !!v.staff.names, maxSpace: 13, extent: { [v.staff.clef]: [-3, 11] } }));
    }
  }
  if (v.keys) parts.push(miniKeys(v.keys));
  if (v.chord) {
    const row = h('div', { class: 'chord-row' }, chordFigure(v.chord), v.chord2 ? chordFigure(v.chord2) : null);
    parts.push(row);
  }
  if (v.rhythm) {
    const row = h('div', { class: 'rhythm-row' });
    for (const [dur, cap] of [[1, '1 beat'], [2, '2 beats'], [4, '4 beats']]) {
      row.append(h('figure', { class: 'rhythm-fig' },
        staffBox(singleScore([parseNote('B4')], 'treble', dur), { free: true, center: true, maxSpace: 9 }, 'small'),
        h('figcaption', {}, cap)));
    }
    parts.push(row);
  }
  if (v.eighths) {
    const n = (s) => parseNote(s);
    const score = {
      clef: 'treble',
      time: [4, 4],
      measures: [{ events: [
        { id: 'a', beat: 0, dur: 0.5, notes: [n('C5')] }, { id: 'b', beat: 0.5, dur: 0.5, notes: [n('D5')] },
        { id: 'c', beat: 1, dur: 1, notes: [n('E5')] },
        { id: 'd', beat: 2, dur: 0.5, notes: [n('G4')] }, { id: 'e', beat: 2.5, dur: 0.5, notes: [n('A4')] },
        { id: 'f', beat: 3, dur: 1, notes: [n('B4')] },
      ] }],
    };
    parts.push(staffBox(score, { maxSpace: 11 }));
    parts.push(h('p', { class: 'caption' }, 'Count them "1 and 2 and": each eighth gets one word.'));
  }
  return h('div', { class: 'card-visual' }, parts);
}
