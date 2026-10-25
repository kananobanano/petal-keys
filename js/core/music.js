// Music theory helpers: note spelling, names, chords.
//
// A "spelled note" is { letter: 'F', acc: 1, octave: 4 } (F#4).
// acc: -1 flat, 0 natural, +1 sharp. MIDI 60 is C4 (middle C).

export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
export const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

export const MIDDLE_C = 60;
export const isBlack = (midi) => [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12);
export const pc = (midi) => ((midi % 12) + 12) % 12;

/** "F#4", "Bb3", "C4" -> spelled note. Also accepts "F♯4". */
export function parseNote(str) {
  const m = /^([A-Ga-g])([#♯b♭]?)(-?\d)$/.exec(String(str).trim());
  if (!m) throw new Error(`Bad note name: ${str}`);
  const letter = m[1].toUpperCase();
  const acc = m[2] === '#' || m[2] === '♯' ? 1 : m[2] === 'b' || m[2] === '♭' ? -1 : 0;
  return { letter, acc, octave: Number(m[3]) };
}

export function midiOf(n) {
  return (n.octave + 1) * 12 + LETTER_PC[n.letter] + n.acc;
}

/** MIDI -> spelled note, preferring sharps or flats for black keys. */
export function spell(midi, prefer = 'sharp') {
  const name = (prefer === 'flat' ? FLAT_NAMES : SHARP_NAMES)[pc(midi)];
  const octave = Math.floor(midi / 12) - 1;
  return { letter: name[0], acc: name.length > 1 ? (name[1] === '#' ? 1 : -1) : 0, octave };
}

const ACC_TEXT = { '-1': '♭', 0: '', 1: '♯' };
const ACC_ASCII = { '-1': 'b', 0: '', 1: '#' };

/** Display name, e.g. "F♯4" (or "F♯" with octave:false). */
export function noteLabel(n, { octave = true } = {}) {
  return n.letter + ACC_TEXT[n.acc] + (octave ? n.octave : '');
}

/** Stable id such as "F#4" (ASCII, used as data keys). */
export function noteId(n) {
  return n.letter + ACC_ASCII[n.acc] + n.octave;
}

/** Letter + accidental without octave, ASCII ("F#"). */
export function pitchName(n) {
  return n.letter + ACC_ASCII[n.acc];
}

export function midiLabel(midi, prefer = 'sharp') {
  return noteLabel(spell(midi, prefer));
}

/** Steps on the staff: C0 = 0, D0 = 1 ... used to place noteheads. */
export function diatonicIndex(n) {
  return n.octave * 7 + LETTERS.indexOf(n.letter);
}

export function sameNote(a, b) {
  return a.letter === b.letter && a.acc === b.acc && a.octave === b.octave;
}

/** Build a list of spelled notes from "C4".."G5" (white keys only). */
export function whiteRange(from, to) {
  const lo = midiOf(parseNote(from));
  const hi = midiOf(parseNote(to));
  const out = [];
  for (let m = lo; m <= hi; m++) if (!isBlack(m)) out.push(spell(m));
  return out;
}

export function notes(...names) {
  return names.flat().map(parseNote);
}

// ---------- chords ----------

// Each step: [letter steps above root, semitones above root].
export const CHORD_TYPES = {
  maj: { suffix: '', name: 'major', steps: [[0, 0], [2, 4], [4, 7]] },
  min: { suffix: 'm', name: 'minor', steps: [[0, 0], [2, 3], [4, 7]] },
  dim: { suffix: 'dim', name: 'diminished', steps: [[0, 0], [2, 3], [4, 6]] },
  aug: { suffix: '+', name: 'augmented', steps: [[0, 0], [2, 4], [4, 8]] },
  sus2: { suffix: 'sus2', name: 'sus 2', steps: [[0, 0], [1, 2], [4, 7]] },
  sus4: { suffix: 'sus4', name: 'sus 4', steps: [[0, 0], [3, 5], [4, 7]] },
  dom7: { suffix: '7', name: 'seventh', steps: [[0, 0], [2, 4], [4, 7], [6, 10]] },
  maj7: { suffix: 'maj7', name: 'major seventh', steps: [[0, 0], [2, 4], [4, 7], [6, 11]] },
  min7: { suffix: 'm7', name: 'minor seventh', steps: [[0, 0], [2, 3], [4, 7], [6, 10]] },
};

/** "Am7" -> { root: {letter:'A',acc:0}, type: 'min7' } */
export function parseChord(symbol) {
  const m = /^([A-G])([#b]?)(.*)$/.exec(symbol);
  if (!m) throw new Error(`Bad chord: ${symbol}`);
  const suffix = m[3];
  const type = Object.keys(CHORD_TYPES).find((k) => CHORD_TYPES[k].suffix === suffix);
  if (!type) throw new Error(`Unknown chord type in ${symbol}`);
  return { root: { letter: m[1], acc: m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0 }, type, id: symbol };
}

/** Correctly spelled chord tones, ascending from the root in `octave`. */
export function chordNotes(chord, octave = 4) {
  const { root, type } = chord;
  const rootMidi = (octave + 1) * 12 + LETTER_PC[root.letter] + root.acc;
  const li = LETTERS.indexOf(root.letter);
  return CHORD_TYPES[type].steps.map(([ls, semis]) => {
    const letterIdx = li + ls;
    const letter = LETTERS[letterIdx % 7];
    const oct = octave + Math.floor(letterIdx / 7);
    const target = rootMidi + semis;
    const natural = (oct + 1) * 12 + LETTER_PC[letter];
    return { letter, acc: target - natural, octave: oct };
  });
}

export function chordPcs(chord) {
  return [...new Set(chordNotes(chord).map((n) => pc(midiOf(n))))];
}

export function chordSymbol(chord) {
  return chord.root.letter + ACC_TEXT[chord.root.acc] + CHORD_TYPES[chord.type].suffix;
}

export function chordName(chord) {
  return `${chord.root.letter}${ACC_TEXT[chord.root.acc]} ${CHORD_TYPES[chord.type].name}`;
}

/**
 * Compare held keys against a chord (any octave, any inversion).
 * Returns { ok, missing: [pc], extra: [pc] }.
 */
export function compareChord(heldMidis, chord) {
  const want = new Set(chordPcs(chord));
  const have = new Set(heldMidis.map(pc));
  const missing = [...want].filter((p) => !have.has(p));
  const extra = [...have].filter((p) => !want.has(p));
  return { ok: missing.length === 0 && extra.length === 0, missing, extra };
}

/** Name the chord being held (for free play). Returns null if none fits. */
export function detectChord(heldMidis) {
  if (heldMidis.length < 3) return null;
  const sorted = [...heldMidis].sort((a, b) => a - b);
  const have = [...new Set(sorted.map(pc))].sort((a, b) => a - b);
  const bass = pc(sorted[0]);
  const candidates = [];
  for (const rootPc of have) {
    for (const type of Object.keys(CHORD_TYPES)) {
      const pcs = CHORD_TYPES[type].steps.map(([, st]) => (rootPc + st) % 12).sort((a, b) => a - b);
      if (pcs.length === have.length && pcs.every((p, i) => p === have[i])) {
        candidates.push({ rootPc, type });
      }
    }
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => (a.rootPc === bass ? -1 : 0) - (b.rootPc === bass ? -1 : 0));
  const best = candidates[0];
  // Common spellings for black-key roots: Bb, Eb, Ab, Db major but C#m, F#m, G#m.
  const minorish = ['min', 'min7', 'dim'].includes(best.type);
  const flatRoots = minorish ? [3, 10] : [1, 3, 8, 10];
  const r = spell(60 + best.rootPc, flatRoots.includes(best.rootPc) ? 'flat' : 'sharp');
  const chord = { root: { letter: r.letter, acc: r.acc }, type: best.type };
  let symbol = chordSymbol(chord);
  if (best.rootPc !== bass) symbol += '/' + noteLabel(spell(sorted[0]), { octave: false });
  return { symbol, name: chordName(chord) };
}

/** Friendly distance text: "2 keys higher", "1 key lower". */
export function keysApart(fromMidi, toMidi) {
  const d = toMidi - fromMidi;
  if (d === 0) return 'the same key';
  const n = Math.abs(d);
  return `${n} key${n === 1 ? '' : 's'} ${d > 0 ? 'higher' : 'lower'}`;
}
