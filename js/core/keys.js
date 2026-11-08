// Major keys and key signatures. A key is a number of "fifths":
// 1 = one sharp (G major), -1 = one flat (F major), 0 = C major.

import { noteLabel } from './music.js';

const LETTERS = 'CDEFGAB';
export const SHARP_ORDER = 'FCGDAEB';
export const FLAT_ORDER = 'BEADGCF';

/** The sharp (1), flat (-1) or nothing (0) a key signature gives a letter. */
export function keyAcc(letter, fifths = 0) {
  if (fifths > 0) return SHARP_ORDER.slice(0, fifths).includes(letter) ? 1 : 0;
  if (fifths < 0) return FLAT_ORDER.slice(0, -fifths).includes(letter) ? -1 : 0;
  return 0;
}

/** Index in C D E F G A B of a major key's home note (0 = C, 4 = G…). */
export const tonicIndex = (fifths) => (((fifths * 4) % 7) + 7) % 7;

/** The home note of a major key, e.g. -5 -> { letter: 'D', acc: -1 }. */
export function tonic(fifths) {
  const letter = LETTERS[tonicIndex(fifths)];
  return { letter, acc: keyAcc(letter, fifths) };
}

const accText = (acc) => (acc > 0 ? '♯' : acc < 0 ? '♭' : '');
const MINOR_LETTER_SHIFT = 5; // the minor twin starts on the 6th note of the major scale

/** "G", "D♭", "F♯"… */
export function keyLetter(fifths) {
  const t = tonic(fifths);
  return t.letter + accText(t.acc);
}

/** "G major" */
export const keyName = (fifths) => `${keyLetter(fifths)} major`;

/** The minor key that shares this signature, e.g. 0 -> "A minor". */
export function minorTwin(fifths) {
  const letter = LETTERS[(tonicIndex(fifths) + MINOR_LETTER_SHIFT) % 7];
  return `${letter}${accText(keyAcc(letter, fifths))} minor`;
}

/** The sharps or flats in a signature, in order: ['F♯', 'C♯'] */
export function signatureNotes(fifths) {
  if (fifths > 0) return [...SHARP_ORDER.slice(0, fifths)].map((l) => l + '♯');
  if (fifths < 0) return [...FLAT_ORDER.slice(0, -fifths)].map((l) => l + '♭');
  return [];
}

/** Respell a note so it follows the key signature (keeps letter and octave). */
export const spellInKey = (n, fifths) => ({ letter: n.letter, acc: keyAcc(n.letter, fifths), octave: n.octave });

/** The major scale, home note to home note: 8 spelled notes going up. */
export function scaleNotes(fifths, octave = 4) {
  const t0 = tonicIndex(fifths);
  const out = [];
  for (let i = 0; i <= 7; i++) {
    const li = t0 + i;
    const letter = LETTERS[li % 7];
    out.push({ letter, acc: keyAcc(letter, fifths), octave: octave + Math.floor(li / 7) });
  }
  return out;
}

/** The trick for naming a key from its signature, in plain words. */
export function keyTip(fifths) {
  const sig = signatureNotes(fifths);
  if (!fifths) return 'No sharps or flats means C major.';
  if (fifths === -1) return 'One flat (B♭) is F major. That one you just remember.';
  if (fifths > 0) return `The last sharp is ${sig[sig.length - 1]}. Go one key up from it and you land on ${keyLetter(fifths)}.`;
  return `The second-to-last flat is ${sig[sig.length - 2]}, and that is the key: ${keyName(fifths)}.`;
}

/** Plain list for messages: "F♯" / "F♯ and C♯" / "F♯, C♯ and G♯". */
export function listText(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** Where a sharp/flat key sits on the keyboard, for kind reminders. */
export function blackKeyHint(n) {
  const name = noteLabel(n, { octave: false });
  if (n.acc > 0) return `${name} is the key just right of ${n.letter}`;
  if (n.acc < 0) return `${name} is the key just left of ${n.letter}`;
  return name;
}
