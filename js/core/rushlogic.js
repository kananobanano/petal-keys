// Note Rush logic without any DOM: making passages and scoring attempts.

import { midiOf, pc } from './music.js';
import { weightedChoice } from './util.js';
import { keyAcc, tonicIndex } from './keys.js';

// Rhythm tokens (in beats): w whole, dh dotted half, h half, dq dotted
// quarter, q quarter, e eighth, r quarter rest, hr half rest.
const TOKENS = { w: 4, dh: 3, h: 2, dq: 1.5, q: 1, e: 0.5, r: 1, hr: 2 };
const RESTS = new Set(['r', 'hr']);

export const RHYTHM_LEVELS = {
  1: { name: 'Quarter notes', patterns: ['q q q q'] },
  2: {
    name: 'Halves and wholes',
    patterns: ['q q q q', 'h q q', 'q q h', 'h h', 'q h q', 'w', 'q q q r', 'h q r'],
  },
  3: {
    name: 'Eighth notes',
    patterns: ['q q q q', 'h q q', 'q q h', 'h h', 'e e q q q', 'q e e q q', 'q q e e q', 'e e e e h', 'q q q e e', 'q r e e q'],
  },
  4: {
    name: 'Dotted notes',
    patterns: ['q q h', 'h h', 'e e q q q', 'q e e q q', 'dq e q q', 'q dq e q', 'dh q', 'dq e h', 'h dq e'],
  },
};

const LONG_END = /(?:^|\s)(h|w|dh)$/;

function parsePattern(str) {
  return str.split(' ').map((t) => ({ dur: TOKENS[t], rest: RESTS.has(t) }));
}

const INTERVAL_WEIGHT = [0.35, 1, 0.75, 0.35, 0.2];

/**
 * Make a short passage in 4/4.
 *   pool: spelled notes to use; weightOf(note) -> number favours weak notes.
 * Returns { measures, notes, beats }.
 */
export function generatePassage({ pool, bars = 1, level = 1, weightOf = () => 1, rng = Math.random }) {
  const sorted = pool
    .map((n) => ({ n, midi: midiOf(n) }))
    .sort((a, b) => a.midi - b.midi || a.n.letter.localeCompare(b.n.letter));
  const lv = RHYTHM_LEVELS[Math.max(1, Math.min(4, level))];
  const measures = [];
  const notes = [];
  let idx = null;
  let lastTwo = [];
  let evCount = 0;

  for (let b = 0; b < bars; b++) {
    let pats = lv.patterns;
    const isLast = b === bars - 1;
    if (isLast && level >= 2 && rng() < 0.6) {
      const longs = pats.filter((p) => LONG_END.test(p));
      if (longs.length) pats = longs;
    }
    if (b === 0) {
      // Don't open with a rest.
      const noRestStart = pats.filter((p) => !/^(r|hr)\b/.test(p));
      if (noRestStart.length) pats = noRestStart;
    }
    const pattern = parsePattern(pats[Math.floor(rng() * pats.length)]);
    const events = [];
    let beat = 0;
    for (const tok of pattern) {
      const id = `e${evCount++}`;
      if (tok.rest) {
        events.push({ id, beat, dur: tok.dur, notes: [], rest: true });
      } else {
        let j;
        if (idx === null) {
          // Start somewhere in the middle of the pool, favouring weak notes.
          const mid = (sorted.length - 1) / 2;
          const ws = sorted.map((x, i) => weightOf(x.n) / (1 + Math.abs(i - mid) * 0.35));
          j = weightedChoice(sorted.map((_, i) => i), ws, rng);
        } else {
          const cands = [];
          const ws = [];
          for (let k = Math.max(0, idx - 4); k <= Math.min(sorted.length - 1, idx + 4); k++) {
            const dist = Math.abs(k - idx);
            let w = INTERVAL_WEIGHT[dist] * weightOf(sorted[k].n);
            if (dist === 0 && lastTwo.length === 2 && lastTwo[0] === k && lastTwo[1] === k) w = 0;
            cands.push(k);
            ws.push(w);
          }
          j = weightedChoice(cands, ws, rng);
        }
        idx = j;
        lastTwo = [lastTwo[lastTwo.length - 1], j].filter((x) => x !== undefined).slice(-2);
        const { n, midi } = sorted[j];
        events.push({ id, beat, dur: tok.dur, notes: [n], rest: false });
        notes.push({ id, absBeat: b * 4 + beat, dur: tok.dur, note: n, midi });
      }
      beat += tok.dur;
    }
    measures.push({ events });
  }
  return { measures, notes, beats: bars * 4 };
}

// ---------- Melody lines ----------
// Lines that sound like tunes: one chord per bar from a common progression,
// chord notes on the strong beats, steps in between, bar 3 of each phrase
// echoing bar 1, and the last note landing on the home note.

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
export { keyAcc };

/** Chord progressions as scale steps from home (0 = I, 4 = V, 5 = vi…). */
export const PROGRESSIONS = [
  { name: 'I–V–vi–IV', degs: [0, 4, 5, 3] },
  { name: 'Royal road', degs: [3, 4, 2, 5] },
  { name: 'vi–IV–V–I', degs: [5, 3, 4, 0] },
  { name: 'I–vi–IV–V', degs: [0, 5, 3, 4] },
  { name: 'I–IV–V–I', degs: [0, 3, 4, 0] },
];

/** One chord (scale step) per bar, ending V–I or IV–I so the line sounds done. */
export function melodyChords(bars, rng = Math.random) {
  if (bars <= 1) return [0];
  const prog = PROGRESSIONS[Math.floor(rng() * PROGRESSIONS.length)].degs;
  const out = Array.from({ length: bars }, (_, b) => prog[b % 4]);
  out[bars - 1] = 0;
  if (out[bars - 2] !== 3 && out[bars - 2] !== 4) out[bars - 2] = 4;
  return out;
}

// How much each size of move (in scale steps) is liked: weak beats mostly step,
// strong beats may leap to a chord note.
const MEL_WEAK = [0.25, 1, 0.45, 0.12, 0.06, 0.02];
const MEL_STRONG = [0.35, 1, 0.9, 0.55, 0.35, 0.12];

/**
 * Make a tune-like passage in 4/4 from the letters in `pool`, spelled in `key`
 * (fifths; 0 = C major). Same shape as generatePassage, plus { key, chords }.
 */
export function generateMelody({ pool, bars = 1, level = 1, key = 0, weightOf = () => 1, rng = Math.random }) {
  // One note per letter+octave, with the key's sharps/flats applied.
  const seen = new Map();
  for (const p of pool) {
    const id = `${p.letter}${p.octave}`;
    if (!seen.has(id)) seen.set(id, { letter: p.letter, acc: keyAcc(p.letter, key), octave: p.octave });
  }
  const sorted = [...seen.values()].map((n) => ({ n, midi: midiOf(n) })).sort((a, b) => a.midi - b.midi);
  if (sorted.length < 3) return generatePassage({ pool, bars, level, weightOf, rng });

  const t0 = tonicIndex(key);
  const letterAt = (deg) => LETTERS[(t0 + deg) % 7];
  const chordLetters = (deg) => new Set([0, 2, 4].map((d) => letterAt(deg + d)));
  const home = letterAt(0);
  const leading = letterAt(6);
  const chords = melodyChords(bars, rng);
  const lv = RHYTHM_LEVELS[Math.max(1, Math.min(4, level))];
  const mid = (sorted.length - 1) / 2;

  const measures = [];
  const notes = [];
  const barData = [];
  let idx = null;
  let lastMove = 0;
  let lastTwo = [];
  let evCount = 0;

  const nearest = (want, from) => {
    let best = null;
    sorted.forEach((x, k) => {
      if (!want(x.n)) return;
      const d = from == null ? Math.abs(k - mid) : Math.abs(k - from);
      if (!best || d < best.d) best = { k, d };
    });
    return best ? best.k : null;
  };

  const freeChoice = (strong, chord) => {
    if (idx === null) {
      const ws = sorted.map((x, k) => (chord.has(x.n.letter) ? 1 : 0) * weightOf(x.n) / (1 + Math.abs(k - mid) * 0.35));
      return weightedChoice(sorted.map((_, k) => k), ws, rng);
    }
    const cands = [];
    const ws = [];
    for (let k = Math.max(0, idx - 5); k <= Math.min(sorted.length - 1, idx + 5); k++) {
      const move = k - idx;
      const dist = Math.abs(move);
      let w = (strong ? MEL_STRONG : MEL_WEAK)[dist] * weightOf(sorted[k].n);
      const isChord = chord.has(sorted[k].n.letter);
      w *= strong ? (isChord ? 4 : 0.08) : (isChord ? 1.2 : 1);
      if (Math.abs(lastMove) >= 3 && dist > 0) w *= Math.sign(move) === Math.sign(lastMove) ? 0.3 : (dist === 1 ? 1.6 : 1); // fill in after a leap
      else if (dist === 1 && Math.sign(move) === Math.sign(lastMove)) w *= 1.3; // keep flowing
      if (sorted[idx].n.letter === leading && move === 1 && sorted[k].n.letter === home) w *= 2.5; // ti wants to go home
      if (dist === 0 && lastTwo.length === 2 && lastTwo[0] === k && lastTwo[1] === k) w = 0;
      cands.push(k);
      ws.push(w);
    }
    return weightedChoice(cands, ws, rng);
  };

  for (let b = 0; b < bars; b++) {
    const chord = chordLetters(chords[b]);
    const isLast = b === bars - 1;
    const echo = b % 4 === 2 ? barData[b - 2] : null;
    let patStr;
    if (echo) patStr = echo.pattern;
    else {
      let pats = lv.patterns;
      if ((isLast || b % 4 === 3) && level >= 2 && rng() < (isLast ? 0.7 : 0.5)) {
        const longs = pats.filter((p) => LONG_END.test(p));
        if (longs.length) pats = longs;
      }
      if (b === 0) {
        const noRestStart = pats.filter((p) => !/^(r|hr)\b/.test(p));
        if (noRestStart.length) pats = noRestStart;
      }
      patStr = pats[Math.floor(rng() * pats.length)];
    }
    const pattern = parsePattern(patStr);
    const lastNoteTok = pattern.map((t) => !t.rest).lastIndexOf(true);
    const events = [];
    const moves = [];
    let beat = 0;
    let n = 0;
    pattern.forEach((tok, ti) => {
      const id = `e${evCount++}`;
      if (tok.rest) {
        events.push({ id, beat, dur: tok.dur, notes: [], rest: true });
        beat += tok.dur;
        return;
      }
      const strong = beat === 0 || beat === 2 || tok.dur >= 2;
      let j = null;
      if (isLast && ti === lastNoteTok) {
        j = nearest((x) => x.letter === home, idx);
        if (j == null) j = nearest((x) => chord.has(x.letter), idx);
      } else if (echo && n > 0 && echo.moves[n] != null) {
        let k = idx + echo.moves[n];
        // keep the echo's shape, but nudge a strong beat onto the new chord
        if (strong && k >= 0 && k < sorted.length && !chord.has(sorted[k].n.letter)) {
          const up = k + 1 < sorted.length && chord.has(sorted[k + 1].n.letter);
          k = up ? k + 1 : k - 1;
        }
        if (k >= 0 && k < sorted.length && Math.abs(k - idx) <= 5) j = k;
      } else if (echo && n === 0) {
        j = nearest((x) => chord.has(x.letter), idx);
      }
      if (j == null) j = freeChoice(strong, chord);
      moves.push(idx === null || n === 0 ? null : j - idx);
      if (idx !== null) lastMove = j - idx;
      idx = j;
      lastTwo = [lastTwo[lastTwo.length - 1], j].filter((x) => x !== undefined).slice(-2);
      const { n: note, midi } = sorted[j];
      events.push({ id, beat, dur: tok.dur, notes: [note], rest: false });
      notes.push({ id, absBeat: b * 4 + beat, dur: tok.dur, note, midi });
      beat += tok.dur;
      n++;
    });
    barData.push({ pattern: patStr, moves });
    measures.push({ events });
  }
  return { measures, notes, beats: bars * 4, key, chords };
}

export function judgeTiming(errMs) {
  const a = Math.abs(errMs);
  if (a <= 50) return { label: 'Perfect', points: 100, cls: 'perfect' };
  if (a <= 100) return { label: 'Great', points: 85, cls: 'great' };
  if (a <= 170) return { label: 'Good', points: 60, cls: 'good' };
  return errMs < 0
    ? { label: 'Early', points: 30, cls: 'early' }
    : { label: 'Late', points: 30, cls: 'late' };
}

export const WINDOW_MIN = 120;
export const WINDOW_MAX = 450;

/**
 * Give every expected note its own window (e.win, in ms): wide by default, and
 * only narrower when the same key comes again soon, so two presses can't be
 * mixed up. A busy bar of eighths no longer makes the long notes strict.
 */
export function assignWindows(expected, { anyOctave = false, max = WINDOW_MAX } = {}) {
  for (const e of expected) {
    let gap = Infinity;
    for (const o of expected) {
      if (o === e || o.t === e.t) continue;
      const same = anyOctave ? pc(o.midi) === pc(e.midi) : o.midi === e.midi;
      if (same) gap = Math.min(gap, Math.abs(o.t - e.t));
    }
    e.win = Math.round(Math.max(WINDOW_MIN, Math.min(max, 0.5 * gap)));
  }
  return expected;
}

/** How far a played note may drift from its spot and still count. */
export function matchWindow(notes, msPerBeat) {
  let minGap = Infinity;
  const beats = [...new Set(notes.map((n) => n.absBeat))].sort((a, b) => a - b);
  for (let i = 1; i < beats.length; i++) minGap = Math.min(minGap, beats[i] - beats[i - 1]);
  if (!isFinite(minGap)) minGap = 1;
  return Math.max(150, Math.min(400, 0.45 * minGap * msPerBeat));
}

/**
 * Score an attempt.
 *   expected: [{ id, midi, t }]   (t = ms when the note should sound)
 *   played:   [{ midi, t }]
 * Returns per-note results plus a notes score, a timing score and a combined
 * score, all 0..100.
 */
export function scoreAttempt(expected, played, { windowMs = 350, anyOctave = false } = {}) {
  const pairs = [];
  const winOf = (e) => (e.win != null ? e.win : windowMs);
  expected.forEach((e, ei) => {
    played.forEach((p, pi) => {
      const exact = e.midi === p.midi;
      const same = exact || (anyOctave && pc(e.midi) === pc(p.midi));
      const dt = p.t - e.t;
      if (same && Math.abs(dt) <= winOf(e)) pairs.push({ ei, pi, dt, cost: Math.abs(dt) + (exact ? 0 : 40) });
    });
  });
  pairs.sort((a, b) => a.cost - b.cost);
  const usedE = new Map();
  const usedP = new Set();
  for (const pr of pairs) {
    if (usedE.has(pr.ei) || usedP.has(pr.pi)) continue;
    usedE.set(pr.ei, pr);
    usedP.add(pr.pi);
  }

  // Played notes inside the passage's time span that matched nothing.
  const first = Math.min(...expected.map((e) => e.t - winOf(e)));
  const last = Math.max(...expected.map((e) => e.t + winOf(e)));
  const extra = [];
  played.forEach((p, pi) => {
    if (!usedP.has(pi) && p.t >= first && p.t <= last) extra.push(pi);
  });

  const results = expected.map((e, ei) => {
    const pr = usedE.get(ei);
    if (!pr) return { id: e.id, hit: false };
    const j = judgeTiming(pr.dt);
    return { id: e.id, hit: true, err: pr.dt, otherOctave: played[pr.pi].midi !== e.midi, ...j };
  });

  const hits = results.filter((r) => r.hit);
  const notesScore = expected.length
    ? Math.round((100 * hits.length) / (expected.length + 0.5 * extra.length))
    : 0;
  const timingScore = hits.length ? Math.round(hits.reduce((s, r) => s + r.points, 0) / hits.length) : 0;
  const combined = Math.round(notesScore * (0.6 + (0.4 * timingScore) / 100));
  return { results, extra, hits: hits.length, total: expected.length, notesScore, timingScore, combined };
}
