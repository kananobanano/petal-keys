// The Practice tab: every drill, using only material from lessons reached.
// Nothing new is taught here, so it suits tired evenings.

import { h } from '../core/util.js';
import { icon } from './icons.js';
import { sheet, toast, confirmSheet } from './overlay.js';
import { listSongs, addSong, removeSong, storedProgress } from '../core/songs.js';
import { holdRepeat, TEMPO_MAX } from '../modes/common.js';
import { readSongFile } from '../core/musicxml.js';
import { noteLabel, midiOf, chordSymbol } from '../core/music.js';
import { RHYTHM_LEVELS } from '../core/rushlogic.js';
import { readingPool, rhythmLevel, chordPool, namePool, findLevel, keyPool, FIND_LEVELS } from '../lessons.js';
import { keyLetter } from '../core/keys.js';

const shuffled = (list) => [...list].sort(() => Math.random() - 0.5);

const MAX_RUSH_BARS = 16;

function poolText(pool) {
  const sorted = [...pool].sort((a, b) => midiOf(a) - midiOf(b));
  return `${sorted.length} notes, ${noteLabel(sorted[0])} to ${noteLabel(sorted[sorted.length - 1])}`;
}

function hlStartGap(store) {
  const best = store.best('hl:level');
  if (!best) return 12;
  return Math.max(3, Math.min(12, 25 - best + 4));
}

/** A row of choices behaving like radio buttons. */
function seg(label, options, value, onChange) {
  const id = 'seg-' + label.toLowerCase().replace(/\W+/g, '-');
  const group = h('div', { class: 'seg', role: 'radiogroup', 'aria-labelledby': id });
  const btns = options.map((o) => {
    const b = h('button', { class: 'seg-btn', type: 'button', role: 'radio', 'aria-checked': String(o.v === value) }, o.label);
    b.onclick = () => {
      btns.forEach((x) => x.setAttribute('aria-checked', 'false'));
      b.setAttribute('aria-checked', 'true');
      onChange(o.v);
    };
    return b;
  });
  group.append(...btns);
  return h('div', { class: 'field' }, h('span', { class: 'field-label', id }, label), group);
}

/** A number you can type or nudge with − and +. */
function numField(label, value, min, max, unit, onChange) {
  const id = 'num-' + label.toLowerCase().replace(/\W+/g, '-');
  let v = value;
  const input = h('input', { class: 'num-in', id, type: 'number', inputmode: 'numeric', min: String(min), max: String(max), step: '1', value: String(v) });
  const unitEl = h('span', { class: 'num-unit' });
  const minus = h('button', { class: 'btn btn-round', type: 'button', 'aria-label': `Fewer ${unit}s`, onclick: () => set(v - 1) }, '−');
  const plus = h('button', { class: 'btn btn-round', type: 'button', 'aria-label': `More ${unit}s`, onclick: () => set(v + 1) }, '+');
  function set(n, fromTyping = false) {
    if (!Number.isFinite(n)) n = v;
    v = Math.max(min, Math.min(max, Math.round(n)));
    if (!fromTyping || String(v) !== input.value.trim()) input.value = String(v);
    unitEl.textContent = v === 1 ? unit : `${unit}s`;
    minus.disabled = v <= min;
    plus.disabled = v >= max;
    onChange(v);
  }
  input.addEventListener('input', () => { if (input.value !== '') set(Number(input.value), true); });
  input.addEventListener('change', () => set(Number(input.value)));
  input.addEventListener('focus', () => input.select());
  set(v);
  return h('div', { class: 'field' }, h('label', { class: 'field-label', for: id }, label),
    h('div', { class: 'stepper' }, minus, h('span', { class: 'num-wrap' }, input, unitEl), plus));
}

export function buildMix(store) {
  const steps = [];
  const hasBass = store.lesson('L11').unlocked;
  const clef = hasBass && Math.random() < 0.4 ? 'bass' : 'treble';
  if (!store.lesson('L04').unlocked) steps.push({ type: 'name', pool: namePool(store), count: 6 });
  else {
    // once keys are learned, reading sometimes happens in one of them
    const learnedKeys = keyPool(store).filter((k) => k !== 0);
    const withKey = learnedKeys.length && clef === 'treble' && Math.random() < 0.4;
    steps.push({ type: 'flash', clef, pool: readingPool(store, clef), count: 6, ...(withKey ? { keys: learnedKeys } : {}) });
  }
  if (store.lesson('L09').unlocked) {
    steps.push({ type: 'rush', clef: 'treble', pool: readingPool(store, 'treble'), level: rhythmLevel(store), bars: 1, tempo: store.settings.rushTempo || 60, count: 1 });
  }
  if (store.lesson('L15').unlocked) steps.push({ type: 'chord', chords: chordPool(store).map((c) => c.id), count: 3 });
  if (store.lesson('L20').unlocked) steps.push({ type: 'find', level: findLevel(store), count: 3 });
  else if (store.lesson('L19').unlocked) steps.push({ type: 'hl', count: 5, startGap: hlStartGap(store) });
  if (steps.length === 1 && store.lesson('L04').unlocked) steps.push({ type: 'name', pool: namePool(store), count: 4 });
  return steps;
}

export function renderPractice(app, root) {
  const { store } = app;
  const opts = { ...(store.getLocal('popts') || {}) };
  const save = () => store.setLocal('popts', opts);
  const g = (k, d) => (opts[k] !== undefined ? opts[k] : d);

  const trebleP = readingPool(store, 'treble');
  const bassP = readingPool(store, 'bass');
  const chords = chordPool(store);
  const fl = findLevel(store);
  const rl = rhythmLevel(store);
  const bestHl = store.best('hl:level');

  const start = (title, steps, kind = 'practice') => app.startSession({ title, steps, kind });
  // "My songs" only makes sense while there are songs on this device
  const rushSource = () => {
    const s = g('rushSource', 'melody');
    return s === 'songs' && !listSongs().length ? 'melody' : s;
  };
  const keys = keyPool(store);
  // a saved key choice only counts if that key has been learned here
  const rushKey = () => {
    const k = g('rushKey', 0);
    return k === 'mix' || keys.includes(k) ? k : 0;
  };
  const readerKey = () => {
    const k = g('readerKey', 'mix');
    return k !== 0 && keys.includes(k) ? k : 'mix';
  };

  const drills = [
    {
      id: 'flash', ico: 'flash', title: 'Read notes', text: `Treble: ${poolText(trebleP)}`,
      options: (body) => {
        body.append(
          seg('Staff', [{ v: 'treble', label: 'Treble' }, { v: 'bass', label: 'Bass' }], g('flashClef', 'treble'), (v) => { opts.flashClef = v; }),
          seg('Answer with', [{ v: 'keys', label: 'Keys' }, { v: 'names', label: 'Note names' }], g('flashAnswer', 'keys'), (v) => { opts.flashAnswer = v; }),
          seg('Length', [{ v: 6, label: 'Short' }, { v: 10, label: 'Normal' }, { v: 16, label: 'Long' }], g('flashCount', 10), (v) => { opts.flashCount = v; }),
          h('p', { class: 'muted small' }, '“Note names” works without a keyboard, nice for the train.'),
        );
      },
      go: () => {
        const clef = g('flashClef', 'treble');
        start(clef === 'bass' ? 'Read bass notes' : 'Read notes', [{ type: 'flash', clef, pool: clef === 'bass' ? bassP : trebleP, count: g('flashCount', 10), answer: g('flashAnswer', 'keys') }]);
      },
    },
    {
      id: 'rush', ico: 'rush', title: 'Note Rush', text: `${RHYTHM_LEVELS[rl].name}${store.best('rush:treble') != null ? ` · best ${store.best('rush:treble')}` : ''}`,
      options: (body) => {
        const tempoOut = h('output', { class: 'stepper-val', id: 'rush-tempo-out' }, String(store.settings.rushTempo || 60));
        const setT = (d) => {
          const v = Math.max(40, Math.min(TEMPO_MAX, (store.settings.rushTempo || 60) + d));
          store.set('rushTempo', v);
          tempoOut.textContent = String(v);
        };
        body.append(
          seg('Staff', [{ v: 'treble', label: 'Treble' }, { v: 'bass', label: 'Bass' }], g('rushClef', 'treble'), (v) => { opts.rushClef = v; }),
          seg('Rhythms', Object.entries(RHYTHM_LEVELS).filter(([k]) => Number(k) <= Math.max(rl, 1)).map(([k, v]) => ({ v: Number(k), label: v.name })), Math.min(g('rushLevel', rl), rl), (v) => { opts.rushLevel = v; }),
          numField('Line length', g('rushBars', 1), 1, MAX_RUSH_BARS, 'bar', (v) => { opts.rushBars = v; }),
          seg('Lines from', [
            { v: 'melody', label: 'Melody' },
            { v: 'new', label: 'Random' },
            ...(listSongs().length ? [{ v: 'songs', label: 'My songs' }] : []),
          ], rushSource(), (v) => { opts.rushSource = v; }),
          h('p', { class: 'muted small' }, '“Melody” lines follow chords like real songs and end on the home note.'),
          keys.length > 1
            ? seg('Melody key', [...keys.map((k) => ({ v: k, label: keyLetter(k) })), { v: 'mix', label: 'Mix' }], rushKey(), (v) => { opts.rushKey = v; })
            : null,
          h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Tempo'),
            h('div', { class: 'stepper' },
              holdRepeat(h('button', { class: 'btn btn-round', type: 'button', 'aria-label': 'Slower' }, '−'), (fast) => setT(fast ? -10 : -5)),
              h('span', {}, '♩ = ', tempoOut),
              holdRepeat(h('button', { class: 'btn btn-round', type: 'button', 'aria-label': 'Faster' }, '+'), (fast) => setT(fast ? 10 : 5)))),
        );
      },
      go: () => {
        const clef = g('rushClef', 'treble');
        const bars = Math.max(1, Math.min(MAX_RUSH_BARS, Number(g('rushBars', 1)) || 1));
        const k = rushKey();
        start('Note Rush', [{ type: 'rush', clef, pool: clef === 'bass' ? bassP : trebleP, level: Math.min(g('rushLevel', rl), rl), bars, tempo: store.settings.rushTempo || 60, count: 4, source: rushSource(), keys: k === 'mix' ? keys : [k] }]);
      },
    },
    keys.length > 1 ? {
      id: 'keys', ico: 'flash', title: 'Key reader', text: `Keys: ${keys.map(keyLetter).join(' · ')}`,
      options: (body) => {
        body.append(
          seg('Practise', [{ v: 'read', label: 'Read notes' }, { v: 'scale', label: 'Scales' }, { v: 'name', label: 'Name the key' }], g('keyDrill', 'read'), (v) => { opts.keyDrill = v; }),
          seg('Key', [{ v: 'mix', label: 'Mix' }, ...keys.filter((k) => k !== 0).map((k) => ({ v: k, label: keyLetter(k) }))], readerKey(), (v) => { opts.readerKey = v; }),
          seg('Staff (for reading)', [{ v: 'treble', label: 'Treble' }, { v: 'bass', label: 'Bass' }], g('keyClef', 'treble'), (v) => { opts.keyClef = v; }),
          seg('Length', [{ v: 6, label: 'Short' }, { v: 10, label: 'Normal' }, { v: 16, label: 'Long' }], g('keyCount', 10), (v) => { opts.keyCount = v; }),
          h('p', { class: 'muted small' }, '“Name the key” needs no keyboard, nice for the train.'),
        );
      },
      go: () => {
        const k = readerKey();
        const ks = k === 'mix' ? keys.filter((x) => x !== 0) : [k];
        const count = g('keyCount', 10);
        const drill = g('keyDrill', 'read');
        if (drill === 'scale') {
          // about one scale per three notes of "Length": 2, 3 or 5 scales
          const n = Math.max(2, Math.round(count / 3));
          const mixed = shuffled(ks);
          const list = Array.from({ length: n }, (_, i) => mixed[i % mixed.length]);
          start('Scales', [{ type: 'scale', keys: list, rounds: 1, count: n }]);
        }
        else if (drill === 'name') start('Name that key', [{ type: 'keyname', keys: k === 'mix' ? keys : [...new Set([0, k, -k])], count }]);
        else {
          const clef = g('keyClef', 'treble');
          start('Key reader', [{ type: 'flash', clef, pool: clef === 'bass' ? bassP : trebleP, keys: ks, count }]);
        }
      },
    } : null,
    {
      id: 'chord', ico: 'chord', title: 'Chord Builder',
      text: chords.slice(0, 6).map(chordSymbol).join(' · ') + (chords.length > 6 ? ' …' : ''),
      options: (body) => {
        body.append(seg('Length', [{ v: 5, label: 'Short' }, { v: 8, label: 'Normal' }, { v: 14, label: 'Long' }], g('chordCount', 8), (v) => { opts.chordCount = v; }));
      },
      go: () => start('Chord Builder', [{ type: 'chord', chords: chords.map((c) => c.id), count: g('chordCount', 8) }]),
    },
    {
      id: 'find', ico: 'ear', title: 'Find the note', text: `Level ${fl}: ${FIND_LEVELS[fl].label}`,
      options: (body) => {
        body.append(
          seg('Level', Object.entries(FIND_LEVELS).filter(([k]) => Number(k) <= fl).map(([k]) => ({ v: Number(k), label: `Level ${k}` })), Math.min(g('findLevel', fl), fl), (v) => { opts.findLevel = v; }),
          seg('Length', [{ v: 5, label: 'Short' }, { v: 8, label: 'Normal' }, { v: 12, label: 'Long' }], g('findCount', 8), (v) => { opts.findCount = v; }),
          h('p', { class: 'muted small' }, 'Get 80% right at your top level to unlock the next one.'),
        );
      },
      go: () => start('Find the note', [{ type: 'find', level: Math.min(g('findLevel', fl), fl), count: g('findCount', 8) }]),
    },
    {
      id: 'hl', ico: 'up', title: 'Higher or lower', text: bestHl ? `Smallest gap so far: ${25 - bestHl} keys` : 'Train your ear with two notes',
      options: (body) => {
        body.append(seg('Length', [{ v: 8, label: 'Short' }, { v: 12, label: 'Normal' }, { v: 20, label: 'Long' }], g('hlCount', 12), (v) => { opts.hlCount = v; }));
      },
      go: () => start('Higher or lower', [{ type: 'hl', count: g('hlCount', 12), startGap: hlStartGap(store) }]),
    },
    {
      id: 'name', ico: 'keys', title: 'Find the key', text: 'Keyboard map: ' + namePool(store).map((n) => n.replace('#', '♯').replace(/^([A-G])b$/, '$1♭')).join(' '),
      options: null,
      go: () => start('Find the key', [{ type: 'name', pool: namePool(store), count: 10 }]),
    },
    {
      id: 'free', ico: 'free', title: 'Free play', text: 'Play anything and watch it on the staff',
      options: null,
      go: () => start('Free play', [{ type: 'free', count: 0 }], 'free'),
    },
  ];

  const mixSteps = buildMix(store);
  const mix = h('button', { class: 'mix-card', type: 'button', onclick: () => start('Mix for me', buildMix(store)) },
    h('span', { class: 'mix-ico' }, icon('mix')),
    h('span', { class: 'mix-text' },
      h('span', { class: 'mix-title' }, 'Mix for me'),
      h('span', { class: 'mix-sub' }, `About ${Math.max(2, mixSteps.length + 1)} minutes, a little of everything you know`)),
    icon('play', 'mix-play'));

  const grid = h('div', { class: 'drill-grid' }, drills.filter(Boolean).map((d) =>
    h('button', {
      class: `drill-card d-${d.id}`,
      type: 'button',
      onclick: () => {
        if (!d.options) {
          d.go();
          return;
        }
        const body = h('div', { class: 'sheet-body' });
        d.options(body);
        const close = sheet(h('div', {}, body, h('div', { class: 'row-actions' },
          h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => close() }, 'Cancel'),
          h('button', { class: 'btn btn-primary', type: 'button', 'data-autofocus': '', onclick: () => { save(); close(); d.go(); } }, icon('play'), h('span', {}, 'Start')))), { title: d.title });
      },
    },
    h('span', { class: 'drill-ico' }, icon(d.ico)),
    h('span', { class: 'drill-title' }, d.title),
    h('span', { class: 'drill-text' }, d.text))));

  root.append(
    h('header', { class: 'page-head' },
      h('h1', { class: 'page-title' }, 'Practice'),
      h('p', { class: 'page-sub' }, 'Only things you have already learned. Nothing new, no pressure.')),
    mix,
    songsSection(app),
    h('h2', { class: 'section-title drills-title' }, 'Drills'),
    grid,
  );
}

// ---------- songs ----------

const KEY_NAMES = { '-7': 'C♭', '-6': 'G♭', '-5': 'D♭', '-4': 'A♭', '-3': 'E♭', '-2': 'B♭', '-1': 'F', 0: 'C', 1: 'G', 2: 'D', 3: 'A', 4: 'E', 5: 'B', 6: 'F♯', 7: 'C♯' };

function songsSection(app) {
  const { store } = app;
  const songs = listSongs();
  const fileIn = h('input', { type: 'file', id: 'song-file', class: 'visually-hidden', accept: '.musicxml,.xml,.mxl,application/vnd.recordare.musicxml+xml,application/vnd.recordare.musicxml,text/xml,application/xml' });
  fileIn.onchange = async () => {
    const f = fileIn.files && fileIn.files[0];
    fileIn.value = '';
    if (!f) return;
    if (f.size > 8_000_000) {
      toast('That file is too big for a song score.', { kind: 'bad' });
      return;
    }
    try {
      const song = await readSongFile(f);
      const entry = addSong(song);
      const bars = song.measures.length;
      toast(`Added “${song.title}”: ${bars} bar${bars === 1 ? '' : 's'}.`, { kind: 'good', ms: 3600 });
      app.refresh();
      setTimeout(() => document.querySelector(`[data-song="${entry.id}"]`)?.focus(), 50);
    } catch (e) {
      toast(e.message || "That file couldn't be read.", { kind: 'bad', ms: 5200 });
    }
  };
  const add = h('label', { class: 'btn btn-ghost add-song', for: 'song-file' }, icon('upload'), h('span', {}, 'Add song'));

  const list = h('ul', { class: 'song-list' });
  for (const { id, song } of songs) {
    const bars = song.measures.length;
    const hands = song.staves.length > 1 ? 'both hands' : song.staves[0] === 'bass' ? 'bass clef' : 'one staff';
    const { learned, full } = storedProgress(store, id, song);
    const scoreTxt = (learned ? ` · ${learned}% learned` : '') + (full != null ? ` · full run ${full}` : '');
    const startIt = () => app.startSession({ title: song.title, kind: 'practice', steps: [{ type: 'song', songId: id, count: 1 }] });
    list.append(h('li', { class: 'song-row' },
      h('button', { class: 'song-main', type: 'button', dataset: { song: id }, onclick: startIt },
        h('span', { class: 'song-ico' }, icon('rush')),
        h('span', { class: 'song-text' },
          h('span', { class: 'song-title' }, song.title),
          h('span', { class: 'song-sub' }, `${bars} bar${bars === 1 ? '' : 's'} · key of ${KEY_NAMES[song.key] || 'C'} · ${hands}${scoreTxt}`))),
      h('button', { class: 'icon-btn song-more', type: 'button', 'aria-label': `Remove ${song.title}`, onclick: async () => {
        const ok = await confirmSheet({ title: `Remove “${song.title}”?`, body: 'It is removed from this device. You can add the file again any time.', ok: 'Remove', danger: true });
        if (ok) {
          removeSong(id);
          app.refresh();
        }
      } }, icon('close'))));
  }

  return h('section', { class: 'songs' },
    h('header', { class: 'songs-head' },
      h('h2', { class: 'section-title' }, 'Songs'),
      add, fileIn),
    songs.length
      ? list
      : h('p', { class: 'muted small songs-empty' }, 'Add a MusicXML file (.musicxml or .mxl) to learn a song a few bars at a time. MuseScore can export one.'));
}
