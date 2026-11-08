// The Learn path: units of short lessons. Each lesson has a few teaching
// cards and one drill. Practice draws its material from lessons reached so far.

import { whiteRange, notes, parseNote, parseChord } from './core/music.js';

const W = (a, b) => whiteRange(a, b).map((n) => `${n.letter}${n.octave}`);

export const UNITS = [
  { id: 'A', title: 'Find your way', blurb: 'The keyboard map: black-key families and the musical alphabet.' },
  { id: 'B', title: 'Treble clef', blurb: 'Reading the higher notes, usually your right hand.' },
  { id: 'C', title: 'Note Rush', blurb: 'Reading short lines in time, rhythm-game style.' },
  { id: 'D', title: 'Bass clef', blurb: 'Reading the lower notes, usually your left hand.' },
  { id: 'E', title: 'First chords', blurb: 'Three notes at once: major and minor triads.' },
  { id: 'F', title: 'Ear garden', blurb: 'Hearing higher and lower, then finding notes by ear.' },
  { id: 'G', title: 'Sharps & flats', blurb: 'The black keys, on the keyboard and on the staff.' },
  { id: 'H', title: 'Seventh chords', blurb: 'Four-note chords with a dreamy, J-pop sound.' },
  { id: 'I', title: 'Keys & key signatures', blurb: 'Why some songs start with sharps or flats, and how to read them.' },
];

export const LESSONS = [
  // ---------- A: keyboard map ----------
  {
    id: 'L01', unit: 'A', title: 'Black-key families', short: 'Families',
    cards: [
      { title: 'The keyboard has a pattern', text: 'Black keys come in little families of two and three. The pattern repeats all the way along.', visual: { keys: { from: 'C3', to: 'B4', families: true } } },
      { title: 'Meet C', text: 'C is the white key just to the left of every two-black-key family. Find it once and you can find it anywhere.', visual: { keys: { from: 'C3', to: 'B4', marks: { hint: ['C3', 'C4'] } } } },
    ],
    drill: { mode: 'name', pool: ['C'], count: 6, prompt: 'Press any C' },
  },
  {
    id: 'L02', unit: 'A', title: 'D and E', short: 'D · E',
    cards: [
      { title: 'D is in the middle', text: 'D sits between the two black keys. E is just to the right of them.', visual: { keys: { from: 'C4', to: 'B4', marks: { hint: ['C4', 'D4', 'E4'] }, labels: ['C4', 'D4', 'E4'] } } },
    ],
    drill: { mode: 'name', pool: ['C', 'D', 'E'], count: 8 },
  },
  {
    id: 'L03', unit: 'A', title: 'F, G, A, B', short: 'F–B',
    cards: [
      { title: 'Around the three', text: 'F is just to the left of the three-black-key family. G, A and B climb up to the next C.', visual: { keys: { from: 'C4', to: 'C5', marks: { hint: ['F4', 'G4', 'A4', 'B4'] }, labels: ['F4', 'G4', 'A4', 'B4'] } } },
      { title: 'Only seven letters', text: 'Music uses the letters A to G, then starts again. After G comes A.', visual: { keys: { from: 'C4', to: 'B4', labels: 'all' } } },
    ],
    drill: { mode: 'name', pool: ['C', 'D', 'E', 'F', 'G', 'A', 'B'], count: 10 },
  },

  // ---------- B: treble clef ----------
  {
    id: 'L04', unit: 'B', title: 'Middle C on the staff', short: 'C D E',
    cards: [
      { title: 'Five lines', text: 'Music lives on five lines called a staff. Notes sit on the lines or in the spaces. Higher on the staff means higher in sound.', visual: { staff: { clef: 'treble', notes: W('C4', 'C5'), names: false } } },
      { title: 'The treble clef', text: 'This curly sign is the treble clef. It shows the higher notes, usually played by your right hand.', visual: { staff: { clef: 'treble', notes: [] } } },
      { title: 'Middle C, D and E', text: 'Middle C sits on its own little line below the staff. D hangs just under the bottom line, and E sits on it.', visual: { staff: { clef: 'treble', notes: ['C4', 'D4', 'E4'], names: true }, keys: { from: 'C4', to: 'B4', marks: { hint: ['C4', 'D4', 'E4'] } } } },
    ],
    drill: { mode: 'flash', clef: 'treble', pool: ['C4', 'D4', 'E4'], count: 8 },
  },
  {
    id: 'L05', unit: 'B', title: 'F and G', short: 'F · G',
    cards: [
      { title: 'F and G', text: 'F sits in the first space. G is on the second line, the one the treble clef curls around.', visual: { staff: { clef: 'treble', notes: ['C4', 'D4', 'E4', 'F4', 'G4'], names: true } } },
    ],
    drill: { mode: 'flash', clef: 'treble', pool: W('C4', 'G4'), count: 10 },
  },
  {
    id: 'L06', unit: 'B', title: 'A, B and C', short: 'A B C',
    cards: [
      { title: 'Up the middle', text: 'A is in the second space, B on the middle line, and C in the third space.', visual: { staff: { clef: 'treble', notes: ['A4', 'B4', 'C5'], names: true } } },
    ],
    drill: { mode: 'flash', clef: 'treble', pool: W('C4', 'C5'), count: 10 },
  },
  {
    id: 'L07', unit: 'B', title: 'Up to G', short: 'D–G',
    cards: [
      { title: 'The top of the staff', text: 'D, E, F and G finish the climb. F is on the top line and G sits just above it.', visual: { staff: { clef: 'treble', notes: ['D5', 'E5', 'F5', 'G5'], names: true } } },
    ],
    drill: { mode: 'flash', clef: 'treble', pool: W('C4', 'G5'), count: 12 },
  },
  {
    id: 'L08', unit: 'B', title: 'Lines and spaces', short: 'E G B D F',
    cards: [
      { title: 'The five lines', text: 'From the bottom, the lines are E, G, B, D, F. Many people remember: Every Good Bird Does Fly.', visual: { staff: { clef: 'treble', notes: ['E4', 'G4', 'B4', 'D5', 'F5'], names: true } } },
      { title: 'The four spaces', text: 'The spaces spell FACE, from the bottom up.', visual: { staff: { clef: 'treble', notes: ['F4', 'A4', 'C5', 'E5'], names: true } } },
    ],
    drill: { mode: 'flash', clef: 'treble', pool: W('E4', 'F5'), count: 12 },
  },

  // ---------- C: Note Rush ----------
  {
    id: 'L09', unit: 'C', title: 'Your first Note Rush', short: 'Rush',
    cards: [
      { title: 'How Note Rush works', text: 'Look at the music for as long as you like. Tap Go when you are ready, listen to four clicks, then play along as the line moves.', visual: { staff: { clef: 'treble', notes: ['C4', 'E4', 'D4', 'G4'], quarters: true } } },
      { title: 'Two scores', text: 'You get one score for the right notes and one for the timing. Both grow slowly, and that is perfectly fine.', visual: null },
    ],
    drill: { mode: 'rush', clef: 'treble', pool: W('C4', 'G4'), level: 1, bars: 1, tempo: 60, count: 3 },
  },
  {
    id: 'L10', unit: 'C', title: 'Half and whole notes', short: 'Longer notes',
    cards: [
      { title: 'Notes that last', text: 'A half note (hollow, with a stem) lasts two beats. A whole note (hollow, no stem) lasts four. Keep the key down for the whole length.', visual: { rhythm: true } },
    ],
    drill: { mode: 'rush', clef: 'treble', pool: W('C4', 'C5'), level: 2, bars: 2, tempo: 60, count: 3 },
  },

  // ---------- D: bass clef ----------
  {
    id: 'L11', unit: 'D', title: 'The bass clef', short: 'Bass clef',
    cards: [
      { title: 'Lower notes', text: 'The bass clef shows lower notes. Its two dots sit either side of the F line.', visual: { staff: { clef: 'bass', notes: ['F3'], names: true } } },
      { title: 'Middle C again', text: 'In the bass clef, middle C sits on a little line above the staff. B and A are just below it.', visual: { staff: { clef: 'bass', notes: ['C4', 'B3', 'A3'], names: true } } },
    ],
    drill: { mode: 'flash', clef: 'bass', pool: ['A3', 'B3', 'C4'], count: 8 },
  },
  {
    id: 'L12', unit: 'D', title: 'Down to C', short: 'G–C',
    cards: [
      { title: 'Stepping down', text: 'G, F, E, D and C step down the staff, one line or space at a time.', visual: { staff: { clef: 'bass', notes: ['G3', 'F3', 'E3', 'D3', 'C3'], names: true } } },
    ],
    drill: { mode: 'flash', clef: 'bass', pool: W('C3', 'C4'), count: 12 },
  },
  {
    id: 'L13', unit: 'D', title: 'Bass lines and spaces', short: 'G B D F A',
    cards: [
      { title: 'Bass lines', text: 'From the bottom, the bass lines are G, B, D, F, A. Good Birds Do Fly Away.', visual: { staff: { clef: 'bass', notes: ['G2', 'B2', 'D3', 'F3', 'A3'], names: true } } },
      { title: 'Bass spaces', text: 'The spaces are A, C, E, G. All Cows Eat Grass.', visual: { staff: { clef: 'bass', notes: ['A2', 'C3', 'E3', 'G3'], names: true } } },
    ],
    drill: { mode: 'flash', clef: 'bass', pool: W('G2', 'C4'), count: 12 },
  },
  {
    id: 'L14', unit: 'D', title: 'Bass Note Rush', short: 'Bass rush',
    cards: [
      { title: 'Same game, lower notes', text: 'Take your time before you tap Go. Your left hand can join in here.', visual: null },
    ],
    drill: { mode: 'rush', clef: 'bass', pool: W('C3', 'C4'), level: 1, bars: 1, tempo: 60, count: 3 },
  },

  // ---------- E: chords ----------
  {
    id: 'L15', unit: 'E', title: "What's a chord?", short: 'C major',
    cards: [
      { title: 'Notes together', text: 'A chord is notes played at the same time. The simplest is a triad: play one, skip one, play one, skip one, play one.', visual: { keys: { from: 'C4', to: 'B4', marks: { hint: ['C4', 'E4', 'G4'] }, labels: ['C4', 'E4', 'G4'] } } },
      { title: 'C major', text: 'C, E and G make C major. It sounds bright and happy. Any octave or order counts.', visual: { chord: 'C' } },
    ],
    drill: { mode: 'chord', chords: ['C'], count: 4 },
  },
  {
    id: 'L16', unit: 'E', title: 'F and G major', short: 'F · G',
    cards: [
      { title: 'Same shape, moved', text: 'F major is F, A, C. G major is G, B, D. The play-skip-play shape stays the same.', visual: { chord: 'F', chord2: 'G' } },
    ],
    drill: { mode: 'chord', chords: ['C', 'F', 'G'], count: 8 },
  },
  {
    id: 'L17', unit: 'E', title: 'Minor chords', short: 'Minor',
    cards: [
      { title: 'A softer colour', text: 'Minor chords sound softer and a little sad. A minor is A, C, E. Lower the middle note of a major chord by one key and it turns minor.', visual: { chord: 'Am' } },
    ],
    drill: { mode: 'chord', chords: ['Am', 'Dm', 'Em'], count: 8 },
  },
  {
    id: 'L18', unit: 'E', title: 'Mix it up', short: 'Mix',
    cards: [
      { title: 'Major or minor', text: 'Same rule every time: the letter names the bottom note, then play, skip, play, skip, play.', visual: null },
    ],
    drill: { mode: 'chord', chords: ['C', 'F', 'G', 'Am', 'Dm', 'Em'], count: 10 },
  },

  // ---------- F: ear training ----------
  {
    id: 'L19', unit: 'F', title: 'Higher or lower?', short: 'High / low',
    cards: [
      { title: 'Two notes', text: 'You will hear two notes. Is the second one higher or lower? We start with big jumps and make them smaller as you go.', visual: null },
    ],
    drill: { mode: 'hl', count: 12, startGap: 12 },
  },
  {
    id: 'L20', unit: 'F', title: 'Find the note near C', short: 'Find C–G',
    cards: [
      { title: 'Listen, then hunt', text: 'First you hear C, then a mystery note. Press keys as much as you like to search. When one sounds right, tap Submit.', visual: { keys: { from: 'C4', to: 'B4', marks: { ref: ['C4'] } } } },
      { title: 'Compare with C', text: 'Ask yourself: is it higher than C? A small step or a bigger one? Then try a key and listen.', visual: null },
    ],
    drill: { mode: 'find', level: 1, count: 6 },
  },
  {
    id: 'L21', unit: 'F', title: 'Find the note in the octave', short: 'Find C–C',
    cards: [
      { title: 'The whole octave', text: 'Same game, now from C up to the next C.', visual: null },
    ],
    drill: { mode: 'find', level: 2, count: 8 },
  },

  // ---------- G: sharps & flats ----------
  {
    id: 'L22', unit: 'G', title: 'Black keys have two names', short: '♯ and ♭',
    cards: [
      { title: 'Sharp and flat', text: 'A sharp (♯) means one key higher. A flat (♭) means one key lower.', visual: { keys: { from: 'C4', to: 'B4', marks: { hint: ['F4', 'F#4', 'G4'] }, labels: ['F4', 'F#4', 'G4'] } } },
      { title: 'Two names, one key', text: 'So the black key between F and G is both F♯ and G♭. Every black key has two names.', visual: { keys: { from: 'C4', to: 'B4', labels: 'black' } } },
    ],
    drill: { mode: 'name', pool: ['C#', 'Db', 'D#', 'Eb', 'F#', 'Gb', 'G#', 'Ab', 'A#', 'Bb'], count: 10 },
  },
  {
    id: 'L23', unit: 'G', title: 'Sharps on the staff', short: 'Sharps',
    cards: [
      { title: 'The sharp sign', text: 'A sharp sign before a note raises it by one key. It lasts until the end of the bar.', visual: { staff: { clef: 'treble', notes: ['F#4', 'C#5', 'G#4'], names: true } } },
    ],
    drill: { mode: 'flash', clef: 'treble', pool: [...W('C4', 'C5'), 'F#4', 'C#4', 'G#4', 'C#5'], count: 12 },
  },
  {
    id: 'L24', unit: 'G', title: 'Flats on the staff', short: 'Flats',
    cards: [
      { title: 'The flat sign', text: 'A flat sign lowers a note by one key. B♭ is the black key just below B.', visual: { staff: { clef: 'treble', notes: ['Bb4', 'Eb4', 'Ab4'], names: true } } },
    ],
    drill: { mode: 'flash', clef: 'treble', pool: [...W('C4', 'C5'), 'Bb4', 'Eb4', 'Ab4', 'Db5'], count: 12 },
  },
  {
    id: 'L25', unit: 'G', title: 'Chords with black keys', short: 'D · A · E',
    cards: [
      { title: 'Major chords with a sharp', text: 'D major is D, F♯, A. A major is A, C♯, E. E major is E, G♯, B.', visual: { chord: 'D', chord2: 'A' } },
    ],
    drill: { mode: 'chord', chords: ['D', 'A', 'E'], count: 8 },
  },
  {
    id: 'L26', unit: 'G', title: 'Eighth notes', short: 'Eighths',
    cards: [
      { title: 'Half a beat', text: 'An eighth note lasts half a beat. Two eighth notes share one beat and are joined by a beam.', visual: { eighths: true } },
    ],
    drill: { mode: 'rush', clef: 'treble', pool: W('C4', 'C5'), level: 3, bars: 2, tempo: 66, count: 3 },
  },

  // ---------- H: seventh chords ----------
  {
    id: 'L27', unit: 'H', title: 'Seventh chords', short: 'G7',
    cards: [
      { title: 'One more note', text: 'Add another skip on top of a major chord, lowered by one key, and you get a seventh. G7 is G, B, D, F. It wants to go home to C.', visual: { chord: 'G7' } },
    ],
    drill: { mode: 'chord', chords: ['G7', 'C7', 'D7'], count: 6 },
  },
  {
    id: 'L28', unit: 'H', title: 'Dreamy sevenths', short: 'maj7 · m7',
    cards: [
      { title: 'J-pop colours', text: 'Cmaj7 is C, E, G, B and Am7 is A, C, E, G. These soft, floaty chords are everywhere in J-pop.', visual: { chord: 'Cmaj7', chord2: 'Am7' } },
    ],
    drill: { mode: 'chord', chords: ['Cmaj7', 'Fmaj7', 'Am7', 'Dm7'], count: 8 },
  },

  // ---------- I: keys & key signatures ----------
  {
    id: 'L29', unit: 'I', title: 'Home sweet C', short: 'C scale',
    cards: [
      { title: 'What is a key?', text: 'A key is the family of notes a song likes to use, plus one note that feels like home. C major uses only the white keys, and C is home.', visual: { keys: { from: 'C4', to: 'C5', marks: { hint: ['C4', 'C5'] }, labels: 'all' } } },
      { title: 'The C major scale', text: 'Play the family in order, home to home: C D E F G A B C. Listen to how the last C feels like arriving.', visual: { staff: { clef: 'treble', notes: W('C4', 'C5'), names: true } } },
    ],
    drill: { mode: 'scale', keys: [0], rounds: 2, count: 2 },
  },
  {
    id: 'L30', unit: 'I', title: "G major's one sharp", short: 'One ♯',
    cards: [
      { title: 'Climb from G', text: 'Now climb from G to G. On white keys only, the step up to F sounds a little off. F wants to be one key higher: F♯, the black key just right of F.', visual: { keys: { from: 'G4', to: 'G5', marks: { hint: ['G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F#5', 'G5'] }, labels: ['G4', 'F#5', 'G5'] } } },
      { title: 'The key signature', text: 'Instead of a ♯ before every F, the music puts one ♯ on the F line, right after the clef. It is a standing instruction: every F is F♯.', visual: { staff: { clef: 'treble', key: 1, notes: ['F#4', 'F#5'], names: true } } },
    ],
    drill: { mode: 'scale', keys: [1], rounds: 2, count: 2 },
  },
  {
    id: 'L31', unit: 'I', title: 'Remember the sharp', short: 'Read in G',
    cards: [
      { title: 'Check the key first', text: 'The notes look plain, but the ♯ at the start still counts. Glance at the key signature before you play, like checking the weather.', visual: { staff: { clef: 'treble', key: 1, notes: ['G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F#5', 'G5'], names: true } } },
    ],
    drill: { mode: 'flash', clef: 'treble', pool: W('C4', 'C5'), key: 1, count: 12 },
  },
  {
    id: 'L32', unit: 'I', title: "F major's one flat", short: 'One ♭',
    cards: [
      { title: 'Climb from F', text: 'Climb from F to F and the fourth note, B, sounds too high. It wants to be B♭, the black key just left of B.', visual: { keys: { from: 'F4', to: 'F5', marks: { hint: ['F4', 'G4', 'A4', 'Bb4', 'C5', 'D5', 'E5', 'F5'] }, labels: ['F4', 'Bb4', 'F5'] } } },
      { title: 'One flat', text: 'F major has one ♭ on the B line: every B is B♭.', visual: { staff: { clef: 'treble', key: -1, notes: ['Bb4'], names: true } } },
    ],
    drill: { mode: 'scale', keys: [-1], rounds: 2, count: 2 },
  },
  {
    id: 'L33', unit: 'I', title: 'Name that key', short: 'Name it',
    cards: [
      { title: 'Sharps come in order', text: 'Sharps always appear in the same order: F C G D A E B. Two sharps means F♯ and C♯.', visual: { staff: { clef: 'treble', key: 2, notes: [] } } },
      { title: 'The sharp trick', text: 'Find the last sharp and go one key up. Last sharp C♯, one key up is D, so it is D major.', visual: { keys: { from: 'C4', to: 'E4', marks: { hint: ['C#4', 'D4'] }, labels: ['C#4', 'D4'] } } },
      { title: 'Flats come in order too', text: 'Flats go B E A D G C F, the sharps backwards. Two flats means B♭ and E♭.', visual: { staff: { clef: 'treble', key: -2, notes: [] } } },
      { title: 'The flat trick', text: 'The second-to-last flat names the key. B♭ E♭ means B♭ major. One flat is the odd one out: just remember F major. No sharps or flats at all is C major.', visual: null },
    ],
    drill: { mode: 'keyname', keys: [0, 1, -1, 2, -2], count: 8 },
  },
  {
    id: 'L34', unit: 'I', title: 'Two and three sharps', short: 'D · A',
    cards: [
      { title: 'D major', text: 'D major has two sharps, F♯ and C♯. Start on D and climb to the next D.', visual: { staff: { clef: 'treble', key: 2, notes: ['D4', 'E4', 'F#4', 'G4', 'A4', 'B4', 'C#5', 'D5'], names: true } } },
      { title: 'A major', text: 'A major adds G♯: F♯, C♯ and G♯. Three black keys in the climb.', visual: { staff: { clef: 'treble', key: 3, notes: [] }, keys: { from: 'A3', to: 'A4', marks: { hint: ['A3', 'B3', 'C#4', 'D4', 'E4', 'F#4', 'G#4', 'A4'] }, labels: ['C#4', 'F#4', 'G#4'] } } },
    ],
    drill: { mode: 'scale', keys: [2, 3], rounds: 2, count: 4 },
  },
  {
    id: 'L35', unit: 'I', title: 'Two and three flats', short: 'B♭ · E♭',
    cards: [
      { title: 'B♭ major', text: 'B♭ major has two flats, B♭ and E♭. Home is B♭, the black key just left of B.', visual: { staff: { clef: 'treble', key: -2, notes: ['Bb3', 'C4', 'D4', 'Eb4', 'F4', 'G4', 'A4', 'Bb4'], names: true } } },
      { title: 'E♭ major', text: 'E♭ major adds A♭: B♭, E♭ and A♭.', visual: { staff: { clef: 'treble', key: -3, notes: [] }, keys: { from: 'D4', to: 'F5', marks: { hint: ['Eb4', 'F4', 'G4', 'Ab4', 'Bb4', 'C5', 'D5', 'Eb5'] }, labels: ['Eb4', 'Ab4', 'Bb4'] } } },
    ],
    drill: { mode: 'scale', keys: [-2, -3], rounds: 2, count: 4 },
  },
  {
    id: 'L36', unit: 'I', title: 'Four and five sharps', short: 'E · B',
    cards: [
      { title: 'E major', text: 'E major has four sharps: F♯, C♯, G♯ and D♯.', visual: { staff: { clef: 'treble', key: 4, notes: [] } } },
      { title: 'B major', text: 'B major has five: it adds A♯. With this many, think of the keys that stay white instead. In B major, only E and B are white.', visual: { staff: { clef: 'treble', key: 5, notes: [] }, keys: { from: 'B3', to: 'B4', marks: { hint: ['B3', 'C#4', 'D#4', 'E4', 'F#4', 'G#4', 'A#4', 'B4'] }, labels: ['E4', 'B4'] } } },
    ],
    drill: { mode: 'scale', keys: [4, 5], rounds: 2, count: 4 },
  },
  {
    id: 'L37', unit: 'I', title: 'Four and five flats', short: 'A♭ · D♭',
    cards: [
      { title: 'A♭ major', text: 'A♭ major has four flats: B♭, E♭, A♭ and D♭.', visual: { staff: { clef: 'treble', key: -4, notes: [] } } },
      { title: 'D♭ major', text: 'D♭ major has five: it adds G♭. Only C and F stay white. Your song in D♭ lives here!', visual: { staff: { clef: 'treble', key: -5, notes: [] }, keys: { from: 'C4', to: 'C5', marks: { hint: ['Db4', 'Eb4', 'F4', 'Gb4', 'Ab4', 'Bb4', 'C5'] }, labels: ['C5', 'F4'] } } },
    ],
    drill: { mode: 'scale', keys: [-4, -5], rounds: 2, count: 4 },
  },
  {
    id: 'L38', unit: 'I', title: 'One signature, two keys', short: 'Minor twins',
    cards: [
      { title: 'Major and minor twins', text: 'Every key signature belongs to a major key and a minor key. Start on the 6th note of the major scale and you get its minor twin, which sounds softer.', visual: { keys: { from: 'C4', to: 'A5', marks: { hint: ['A4', 'B4', 'C5', 'D5', 'E5', 'F5', 'G5', 'A5'], ref: ['C4'] }, labels: ['C4', 'A4'] } } },
      { title: 'C major or A minor?', text: 'Both use only white keys. C major feels bright and settled, A minor softer and a little sad. Petal Keys names the major key, so a song marked “key of G” might really be E minor.', visual: null },
    ],
    drill: { mode: 'keyname', keys: [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5], minor: true, count: 10 },
  },
];

export const lessonIndex = (id) => LESSONS.findIndex((l) => l.id === id);

/** A lesson is open if it is the first, the previous one is done, or it was unlocked. */
export function isOpen(store, i) {
  if (i <= 0) return true;
  const me = store.lesson(LESSONS[i].id);
  if (me.unlocked) return true;
  return store.lesson(LESSONS[i - 1].id).done;
}

/** Index of the lesson to do next (first open lesson not yet done). */
export function currentIndex(store) {
  for (let i = 0; i < LESSONS.length; i++) {
    if (!store.lesson(LESSONS[i].id).done && isOpen(store, i)) return i;
  }
  return -1;
}

/** Lessons reached so far (done, or opened with "Jump here"). */
function reached(store) {
  return LESSONS.filter((l) => store.lesson(l.id).unlocked);
}

// ----- material for Practice -----

const DEFAULT_POOLS = { treble: W('C4', 'E4'), bass: ['A3', 'B3', 'C4'] };

export function readingPool(store, clef) {
  const ids = new Set();
  for (const l of reached(store)) {
    const d = l.drill;
    if ((d.mode === 'flash' || d.mode === 'rush') && d.clef === clef) d.pool.forEach((n) => ids.add(n));
  }
  const list = ids.size ? [...ids] : DEFAULT_POOLS[clef];
  return notes(list);
}

export function rhythmLevel(store) {
  let lv = 1;
  for (const l of reached(store)) if (l.drill.mode === 'rush') lv = Math.max(lv, l.drill.level);
  return lv;
}

/** Key signatures (in fifths) played in lessons reached so far, C first. */
export function keyPool(store) {
  const set = new Set([0]);
  for (const l of reached(store)) {
    const d = l.drill;
    if (d.mode === 'scale') d.keys.forEach((k) => set.add(k));
    if (d.mode === 'flash' && d.key != null) set.add(d.key);
  }
  return [...set].sort((a, b) => Math.abs(a) - Math.abs(b) || b - a);
}

export function chordPool(store) {
  const set = new Set();
  for (const l of reached(store)) if (l.drill.mode === 'chord') l.drill.chords.forEach((c) => set.add(c));
  return (set.size ? [...set] : ['C']).map(parseChord);
}

export function namePool(store) {
  const set = new Set();
  for (const l of reached(store)) if (l.drill.mode === 'name') l.drill.pool.forEach((c) => set.add(c));
  return set.size ? [...set] : ['C', 'D', 'E'];
}

/** Ear "find the note" level: from lessons, then earned in practice. */
export function findLevel(store) {
  let lv = 1;
  for (const l of reached(store)) if (l.drill.mode === 'find') lv = Math.max(lv, l.drill.level);
  return Math.max(lv, store.best('find:level') || 0);
}

export const FIND_LEVELS = {
  1: { label: 'C to G, white keys', pool: W('C4', 'G4'), ref: 'C4', refEvery: true },
  2: { label: 'C to C, white keys', pool: W('C4', 'C5'), ref: 'C4', refEvery: true },
  3: { label: 'C to C, all keys', pool: chromatic('C4', 'C5'), ref: 'C4', refEvery: true },
  4: { label: 'Two octaves, all keys', pool: chromatic('C3', 'C5'), ref: 'C4', refEvery: true },
  5: { label: 'Two octaves, C only at the start', pool: chromatic('C3', 'C5'), ref: 'C4', refEvery: false },
};

function chromatic(from, to) {
  const out = [];
  const names = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const lo = parseNote(from);
  const hi = parseNote(to);
  for (let o = lo.octave; o <= hi.octave; o++) {
    for (let i = 0; i < 12; i++) {
      if (o === hi.octave && i > 0) break;
      out.push(`${names[i]}${o}`);
    }
  }
  return out;
}

export function lessonsDone(store) {
  return LESSONS.filter((l) => store.lesson(l.id).done).length;
}
