// Run with: node tools/test-core.mjs
// Tests for the pure logic (music theory, saves, streaks, Note Rush scoring).

import assert from 'node:assert/strict';
import * as M from '../js/core/music.js';
import { mergeSaves, computeStreak, newSave, encodeSave, decodeSave, migrate } from '../js/core/store.js';
import { generatePassage, scoreAttempt, matchWindow, RHYTHM_LEVELS } from '../js/core/rushlogic.js';
import { seededRng, addDays } from '../js/core/util.js';

let passed = 0;
const test = async (name, fn) => {
  try {
    await fn();
    passed++;
  } catch (e) {
    console.error('FAIL', name);
    throw e;
  }
};

await test('note parsing and midi', () => {
  assert.equal(M.midiOf(M.parseNote('C4')), 60);
  assert.equal(M.midiOf(M.parseNote('A4')), 69);
  assert.equal(M.midiOf(M.parseNote('F#4')), 66);
  assert.equal(M.midiOf(M.parseNote('Bb3')), 58);
  assert.equal(M.midiOf(M.parseNote('Cb4')), 59);
  assert.equal(M.noteLabel(M.spell(61, 'flat')), 'D♭4');
  assert.equal(M.noteLabel(M.spell(61)), 'C♯4');
  assert.equal(M.noteId(M.parseNote('F#4')), 'F#4');
  assert.equal(M.diatonicIndex(M.parseNote('E4')) - M.diatonicIndex(M.parseNote('C4')), 2);
  assert.deepEqual(M.whiteRange('C4', 'G4').map((n) => M.noteId(n)), ['C4', 'D4', 'E4', 'F4', 'G4']);
});

await test('chord spelling', () => {
  const sp = (s) => M.chordNotes(M.parseChord(s)).map((n) => M.noteId(n)).join(' ');
  assert.equal(sp('C'), 'C4 E4 G4');
  assert.equal(sp('D'), 'D4 F#4 A4');
  assert.equal(sp('Bb'), 'Bb4 D5 F5');
  assert.equal(sp('Am'), 'A4 C5 E5');
  assert.equal(sp('G7'), 'G4 B4 D5 F5');
  assert.equal(sp('Cmaj7'), 'C4 E4 G4 B4');
  assert.equal(sp('F#m'), 'F#4 A4 C#5');
  assert.equal(sp('Eb'), 'Eb4 G4 Bb4');
  assert.equal(M.chordSymbol(M.parseChord('F#m')), 'F♯m');
});

await test('chord comparison (inversions, any octave)', () => {
  const C = M.parseChord('C');
  assert.equal(M.compareChord([60, 64, 67], C).ok, true);
  assert.equal(M.compareChord([64, 67, 72], C).ok, true); // first inversion
  assert.equal(M.compareChord([48, 64, 79], C).ok, true); // spread
  assert.equal(M.compareChord([60, 64], C).ok, false);
  const r = M.compareChord([60, 63, 67], C);
  assert.deepEqual(r.missing, [4]);
  assert.deepEqual(r.extra, [3]);
});

await test('chord detection', () => {
  assert.equal(M.detectChord([60, 64, 67]).symbol, 'C');
  assert.equal(M.detectChord([64, 67, 72]).symbol, 'C/E');
  assert.equal(M.detectChord([57, 60, 64]).symbol, 'Am');
  assert.equal(M.detectChord([55, 59, 62, 65]).symbol, 'G7');
  assert.equal(M.detectChord([58, 62, 65]).symbol, 'B♭');
  assert.equal(M.detectChord([61, 64, 68]).symbol, 'C♯m');
  assert.equal(M.detectChord([60, 61, 62]), null);
});

await test('merge is idempotent and adds devices', () => {
  const a = newSave('aaa');
  a.c.aaa = { 'd:2026-10-25': [10], 'r:t:60': [5, 4, 3000, 4] };
  a.l = { t1: [2, 100] };
  const b = newSave('bbb');
  b.c.bbb = { 'd:2026-10-25': [7] };
  b.c.aaa = { 'd:2026-10-25': [6] }; // older export of device aaa
  b.l = { t1: [3, 200], t2: [1, 50] };
  b.s = { ...b.s, dailyGoal: 50, _ts: 999 };
  const m = mergeSaves(a, b);
  assert.equal(m.id, 'aaa');
  assert.deepEqual(m.c.aaa['d:2026-10-25'], [10]);
  assert.deepEqual(m.c.bbb['d:2026-10-25'], [7]);
  assert.deepEqual(m.l.t1, [3, 200]);
  assert.deepEqual(m.l.t2, [1, 50]);
  assert.equal(m.s.dailyGoal, 50);
  const m2 = mergeSaves(m, b);
  assert.deepEqual(m2, m);
  // original untouched
  assert.equal(a.c.bbb, undefined);
});

await test('streak with rest day', () => {
  const T = '2026-10-25';
  const set = (...offs) => new Set(offs.map((o) => addDays(T, -o)));
  assert.equal(computeStreak(set(0, 1, 2), T).count, 3);
  assert.equal(computeStreak(set(1, 2), T).count, 2); // today not done yet
  assert.equal(computeStreak(set(1, 2), T).todayDone, false);
  const s = computeStreak(set(0, 2, 3), T); // missed yesterday -> rest day
  assert.equal(s.count, 3);
  assert.equal(s.shieldUsedOn, addDays(T, -1));
  assert.equal(s.shieldReadyIn, 6);
  assert.equal(computeStreak(set(0, 3, 4), T).count, 1); // two missed days break it
  // two rest days within a week: second one breaks the streak
  assert.equal(computeStreak(set(0, 2, 4, 5), T).count, 2);
  // two rest days 7+ days apart are fine
  assert.equal(computeStreak(set(0, 2, 3, 4, 5, 6, 7, 8, 10), T).count, 9);
  assert.equal(computeStreak(new Set(), T).count, 0);
});

await test('save encode/decode roundtrip', async () => {
  const a = newSave('xyz');
  a.c.xyz['d:2026-10-25'] = [42];
  const text = await encodeSave(a);
  assert.ok(text.startsWith('PETALKEYS1:'));
  const back = migrate(await decodeSave(text));
  assert.deepEqual(back, a);
  assert.deepEqual(migrate(await decodeSave(JSON.stringify(a))), a);
  await assert.rejects(() => decodeSave('PETALKEYS1:abc'));
  assert.throws(() => migrate({ app: 'other' }));
  console.log('  save size for a fresh save:', text.length, 'chars');
});

await test('passages fill their bars', () => {
  const pool = M.whiteRange('C4', 'G5');
  for (let level = 1; level <= 4; level++) {
    for (let seed = 1; seed < 40; seed++) {
      const p = generatePassage({ pool, bars: 2, level, rng: seededRng(seed) });
      assert.equal(p.measures.length, 2);
      for (const m of p.measures) {
        const sum = m.events.reduce((s, e) => s + e.dur, 0);
        assert.equal(sum, 4, `level ${level} bar sums to ${sum}`);
        assert.ok(!m.events[0].rest || p.measures.indexOf(m) > 0);
      }
      assert.ok(p.notes.length > 0);
      for (const n of p.notes) assert.ok(pool.some((x) => M.sameNote(x, n.note)));
    }
  }
  assert.ok(RHYTHM_LEVELS[1].patterns.length > 0);
});

await test('scoring', () => {
  const exp = [
    { id: 'a', midi: 60, t: 1000 },
    { id: 'b', midi: 62, t: 2000 },
    { id: 'c', midi: 64, t: 3000 },
    { id: 'd', midi: 64, t: 4000 },
  ];
  const perfect = scoreAttempt(exp, exp.map((e) => ({ midi: e.midi, t: e.t + 10 })), { windowMs: 400 });
  assert.equal(perfect.notesScore, 100);
  assert.equal(perfect.timingScore, 100);
  assert.equal(perfect.combined, 100);
  const sloppy = scoreAttempt(
    exp,
    [
      { midi: 60, t: 1120 },
      { midi: 63, t: 2000 }, // wrong
      { midi: 64, t: 2930 },
      { midi: 64, t: 3990 },
    ],
    { windowMs: 400 },
  );
  assert.equal(sloppy.hits, 3);
  assert.equal(sloppy.extra.length, 1);
  assert.equal(sloppy.results[1].hit, false);
  assert.equal(sloppy.results[0].label, 'Good');
  assert.equal(sloppy.results[2].label, 'Great');
  const octave = scoreAttempt(exp, exp.map((e) => ({ midi: e.midi + 12, t: e.t })), { windowMs: 400, anyOctave: true });
  assert.equal(octave.hits, 4);
  assert.equal(octave.results[0].otherOctave, true);
  const strict = scoreAttempt(exp, exp.map((e) => ({ midi: e.midi + 12, t: e.t })), { windowMs: 400 });
  assert.equal(strict.hits, 0);
  assert.equal(matchWindow([{ absBeat: 0 }, { absBeat: 0.5 }, { absBeat: 1 }], 1000), 225);
});

console.log(`core tests: ${passed} passed`);
