// Note Rush logic without any DOM: making passages and scoring attempts.

import { midiOf, pc } from './music.js';
import { weightedChoice } from './util.js';

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

export function judgeTiming(errMs) {
  const a = Math.abs(errMs);
  if (a <= 50) return { label: 'Perfect', points: 100, cls: 'perfect' };
  if (a <= 100) return { label: 'Great', points: 85, cls: 'great' };
  if (a <= 170) return { label: 'Good', points: 60, cls: 'good' };
  return errMs < 0
    ? { label: 'Early', points: 30, cls: 'early' }
    : { label: 'Late', points: 30, cls: 'late' };
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
  expected.forEach((e, ei) => {
    played.forEach((p, pi) => {
      const exact = e.midi === p.midi;
      const same = exact || (anyOctave && pc(e.midi) === pc(p.midi));
      const dt = p.t - e.t;
      if (same && Math.abs(dt) <= windowMs) pairs.push({ ei, pi, dt, cost: Math.abs(dt) + (exact ? 0 : 40) });
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
  const first = Math.min(...expected.map((e) => e.t)) - windowMs;
  const last = Math.max(...expected.map((e) => e.t)) + windowMs;
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
