// The Practice tab: every drill, using only material from lessons reached.
// Nothing new is taught here, so it suits tired evenings.

import { h } from '../core/util.js';
import { icon } from './icons.js';
import { sheet } from './overlay.js';
import { noteLabel, midiOf, chordSymbol } from '../core/music.js';
import { RHYTHM_LEVELS } from '../core/rushlogic.js';
import { readingPool, rhythmLevel, chordPool, namePool, findLevel, FIND_LEVELS } from '../lessons.js';

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

export function buildMix(store) {
  const steps = [];
  const hasBass = store.lesson('L11').unlocked;
  const clef = hasBass && Math.random() < 0.4 ? 'bass' : 'treble';
  if (!store.lesson('L04').unlocked) steps.push({ type: 'name', pool: namePool(store), count: 6 });
  else steps.push({ type: 'flash', clef, pool: readingPool(store, clef), count: 6 });
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
          const v = Math.max(40, Math.min(132, (store.settings.rushTempo || 60) + d));
          store.set('rushTempo', v);
          tempoOut.textContent = String(v);
        };
        body.append(
          seg('Staff', [{ v: 'treble', label: 'Treble' }, { v: 'bass', label: 'Bass' }], g('rushClef', 'treble'), (v) => { opts.rushClef = v; }),
          seg('Rhythms', Object.entries(RHYTHM_LEVELS).filter(([k]) => Number(k) <= Math.max(rl, 1)).map(([k, v]) => ({ v: Number(k), label: v.name })), Math.min(g('rushLevel', rl), rl), (v) => { opts.rushLevel = v; }),
          seg('Line length', [{ v: 1, label: '1 bar' }, { v: 2, label: '2 bars' }], g('rushBars', 1), (v) => { opts.rushBars = v; }),
          h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Tempo'),
            h('div', { class: 'stepper' },
              h('button', { class: 'btn btn-round', type: 'button', 'aria-label': 'Slower', onclick: () => setT(-5) }, '−'),
              h('span', {}, '♩ = ', tempoOut),
              h('button', { class: 'btn btn-round', type: 'button', 'aria-label': 'Faster', onclick: () => setT(5) }, '+'))),
        );
      },
      go: () => {
        const clef = g('rushClef', 'treble');
        start('Note Rush', [{ type: 'rush', clef, pool: clef === 'bass' ? bassP : trebleP, level: Math.min(g('rushLevel', rl), rl), bars: g('rushBars', 1), tempo: store.settings.rushTempo || 60, count: 4 }]);
      },
    },
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

  const grid = h('div', { class: 'drill-grid' }, drills.map((d) =>
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
    grid,
  );
}
