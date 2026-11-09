// Song library (kept on this device) and helpers that turn a song into
// something to draw, to step through (Wait Mode) or to play along with.

import { uid } from './util.js';
import { pc } from './music.js';

const KEY = 'petalkeys.songs';
const EPS = 1e-6;

// ---------- storage ----------

export function listSongs() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveList(list) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function getSong(id) {
  return listSongs().find((s) => s.id === id) || null;
}

/** Add a song; a song with the same title and notes replaces the old copy. */
export function addSong(song) {
  const list = listSongs();
  const same = list.find((s) => s.song.title === song.title && s.song.notes.length === song.notes.length);
  const entry = { id: same ? same.id : uid(8), added: Date.now(), song };
  const next = list.filter((s) => s !== same);
  next.unshift(entry);
  try {
    saveList(next);
  } catch {
    throw new Error('There is no room left to store this song on this device. Remove a song first.');
  }
  return entry;
}

export function removeSong(id) {
  saveList(listSongs().filter((s) => s.id !== id));
}

// ---------- shape helpers ----------

export const nominalBeats = (song) => song.time[0] * (4 / song.time[1]);

/** Bars grouped into practice sections of about four bars (pickup goes with the first). */
export function sections(song) {
  const ms = song.measures;
  const out = [{ label: 'Whole song', from: 0, to: ms.length - 1 }];
  if (ms.length <= 5) return out;
  let i = 0;
  const nominal = nominalBeats(song);
  const firstFull = ms[0].beats < nominal - EPS ? 1 : 0;
  while (i < ms.length) {
    const startFull = i === 0 ? firstFull : i;
    const to = Math.min(ms.length - 1, startFull + 3);
    out.push({ label: `Bars ${ms[startFull].label}–${ms[to].label}`, from: i, to });
    i = to + 1;
  }
  return out;
}

const RENDERABLE = [4, 3, 2, 1.5, 1, 0.75, 0.5, 0.25];

function restsFor(gap) {
  const out = [];
  let left = gap;
  for (const d of RENDERABLE) {
    while (left >= d - EPS) {
      out.push(d);
      left -= d;
    }
  }
  return out;
}

/**
 * Build what a view needs.
 *   staffIdx: which song staves to show, e.g. [0] or [0, 1]
 *   from, to: measure indices (inclusive)
 * Returns { score, steps, offset, length, range: [lo, hi] }
 *   steps: [{ beat, ev, notes: [{ midi, key, soundDur }] }]   (beats from the view start)
 */
export function buildView(song, { staffIdx = [0], from = 0, to = song.measures.length - 1 } = {}) {
  const ms = song.measures.slice(from, to + 1);
  const offset = ms[0].start;
  const end = ms[ms.length - 1].start + ms[ms.length - 1].beats;
  const shown = new Map(staffIdx.map((si, k) => [si, k]));
  const notes = song.notes.filter((n) => shown.has(n.si) && n.beat >= offset - EPS && n.beat < end - EPS);

  // how long each note really sounds, following ties
  const soundDur = (n) => {
    let d = n.dur;
    let cur = n;
    for (let guard = 0; cur.tieStart && guard < 16; guard++) {
      const next = song.notes.find((m) => m.si === cur.si && m.midi === cur.midi && m.tieStop && Math.abs(m.beat - (cur.beat + cur.dur)) < 0.01);
      if (!next) break;
      d += next.dur;
      cur = next;
    }
    return d;
  };

  const measures = [];
  const stepMap = new Map();
  let lo = 127;
  let hi = 0;
  ms.forEach((m, mi) => {
    const inBar = notes.filter((n) => n.beat >= m.start - EPS && n.beat < m.start + m.beats - EPS);
    const byBeat = new Map();
    for (const n of inBar) {
      const b = Math.round((n.beat - m.start) * 1000) / 1000;
      if (!byBeat.has(b)) byBeat.set(b, []);
      byBeat.get(b).push(n);
    }
    const events = [...byBeat.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([b, list]) => {
        const id = `m${from + mi}b${String(b).replace('.', '_')}`;
        const evNotes = list.map((n) => ({
          letter: n.letter, acc: n.acc, octave: n.octave, dur: n.dur, si: shown.get(n.si),
          tieStart: n.tieStart, tieStop: n.tieStop,
        }));
        const playable = list.filter((n) => !n.tieStop);
        if (playable.length) {
          const beat = m.start - offset + b;
          stepMap.set(id, { beat, ev: id, notes: playable.map((n, k) => ({ midi: n.midi, key: `${id}#${k}`, soundDur: soundDur(n) })) });
          for (const n of playable) {
            lo = Math.min(lo, n.midi);
            hi = Math.max(hi, n.midi);
          }
        }
        return { id, beat: b, dur: Math.min(...list.map((n) => n.dur)), notes: evNotes };
      });
    // rests (single staff only) so the bar reads correctly
    if (staffIdx.length === 1) {
      const filled = [];
      let cursor = 0;
      let r = 0;
      for (const ev of events) {
        if (ev.beat > cursor + EPS) {
          let at = cursor;
          for (const d of restsFor(ev.beat - cursor)) {
            filled.push({ id: `m${from + mi}r${r++}`, beat: at, dur: d, notes: [], rest: true });
            at += d;
          }
        }
        filled.push(ev);
        cursor = Math.max(cursor, ev.beat + Math.max(...ev.notes.map((n) => n.dur)));
      }
      if (m.beats > cursor + EPS) {
        if (!events.length) filled.push({ id: `m${from + mi}r${r++}`, beat: 0, dur: m.beats, notes: [], rest: true });
        else {
          let at = cursor;
          for (const d of restsFor(m.beats - cursor)) {
            filled.push({ id: `m${from + mi}r${r++}`, beat: at, dur: d, notes: [], rest: true });
            at += d;
          }
        }
      }
      measures.push({ events: filled, beats: m.beats, label: m.label });
    } else {
      measures.push({ events, beats: m.beats, label: m.label });
    }
  });

  const steps = [...stepMap.values()].sort((a, b) => a.beat - b.beat);
  return {
    score: { staves: staffIdx.map((si) => song.staves[si] || 'treble'), key: song.key, time: song.time, measures },
    steps,
    offset,
    length: end - offset,
    range: steps.length ? [lo, hi] : [60, 72],
  };
}

export const HANDS = ['right', 'left', 'both'];

/** Which song staves a hand plays (one-staff songs: always the only staff). */
export const handStaves = (song, hand) => (song.staves.length < 2 ? [0] : hand === 'left' ? [1] : hand === 'both' ? [0, 1] : [0]);

/** Measure indices that have something to play for these staves. */
export function barsWithNotes(song, staffIdx) {
  const set = new Set(staffIdx);
  return song.measures.map((m) => song.notes.some((n) => set.has(n.si) && !n.tieStop && n.beat >= m.start - EPS && n.beat < m.start + m.beats - EPS));
}

/**
 * How much of a song is learned, from Play along runs.
 *   partBest(i, hand): best score for ready-made part i of sections(song) (0 = whole song)
 *   custom: { 'from-to:hand:mode': score } bests for chosen bars (this device)
 * Every bar keeps the best run that covered it; a hand's progress is the
 * average over the bars that have notes for that hand (unplayed bars count 0).
 * Returns { learned: 0..100 for the best hand, full: best whole-song run or null }.
 */
export function songProgress(song, { partBest = () => undefined, custom = {} } = {}) {
  const secs = sections(song);
  const last = song.measures.length - 1;
  let learned = 0;
  let full = null;
  for (const hand of HANDS) {
    const bars = new Array(song.measures.length).fill(0);
    const cover = (from, to, score) => {
      if (!(score > 0)) return;
      for (let i = Math.max(0, from); i <= Math.min(last, to); i++) bars[i] = Math.max(bars[i], score);
      if (from <= 0 && to >= last) full = Math.max(full ?? 0, score);
    };
    secs.forEach((sc, i) => cover(sc.from, sc.to, partBest(i, hand)));
    for (const [k, score] of Object.entries(custom || {})) {
      const m = /^(\d+)-(\d+):(\w+):play$/.exec(k);
      if (m && m[3] === hand) cover(Number(m[1]), Number(m[2]), score);
    }
    const has = barsWithNotes(song, handStaves(song, hand));
    const playable = bars.filter((_, i) => has[i]);
    if (playable.length) learned = Math.max(learned, Math.round(playable.reduce((a, b) => a + b, 0) / playable.length));
  }
  return { learned, full };
}

/**
 * songProgress from what the store remembers. `learned` also travels in the
 * backup as one number per song (song:<id>:learned), so other devices see it.
 */
export function storedProgress(store, id, song) {
  const pref = store.getLocal(`song:${id}`) || {};
  const p = songProgress(song, { partBest: (i, hand) => store.best(`song:${id}:${i}:${hand}:play`), custom: pref.cbest });
  return { learned: Math.max(p.learned, store.best(`song:${id}:learned`) || 0), full: p.full };
}

/** Does a played key satisfy a wanted note? */
export const matches = (played, wanted, anyOctave) => played === wanted || (anyOctave && pc(played) === pc(wanted));

/**
 * A short Note Rush line cut from one of the songs: `bars` whole bars on the
 * staff that uses `clef`. Returns a passage like rushlogic.generatePassage,
 * or null when no song has a fitting stretch.
 */
export function songPassage({ clef = 'treble', bars = 1, rng = Math.random } = {}) {
  const options = [];
  for (const { song } of listSongs()) {
    const si = song.staves.indexOf(clef);
    if (si < 0) continue;
    const nominal = nominalBeats(song);
    for (let i = 0; i + bars - 1 < song.measures.length; i++) {
      const window = song.measures.slice(i, i + bars);
      if (window.some((m) => Math.abs(m.beats - nominal) > EPS)) continue;
      const view = buildView(song, { staffIdx: [si], from: i, to: i + bars - 1 });
      if (view.steps.length < 3) continue;
      const firstBar = view.score.measures[0].events;
      if (firstBar.some((ev) => ev.beat === 0 && ev.notes.some((n) => n.tieStop))) continue;
      if (view.range[1] - view.range[0] > 24) continue;
      options.push({ song, view });
    }
  }
  if (!options.length) return null;
  const { song, view } = options[Math.floor(rng() * options.length)];
  // a tie that starts inside the line but ends outside it is just a long note
  const notes = [];
  for (const st of view.steps) {
    for (const n of st.notes) notes.push({ id: n.key, ev: st.ev, absBeat: st.beat, midi: n.midi, dur: n.soundDur });
  }
  return {
    measures: view.score.measures,
    notes,
    beats: view.length,
    time: song.time,
    key: song.key,
    from: song.title,
    range: view.range,
  };
}
