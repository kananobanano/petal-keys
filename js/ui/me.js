// The Me tab: progress, backups between devices, and settings.

import { h, s as svg, dayKey, addDays, shortDate, parseDayKey } from '../core/util.js';
import { icon } from './icons.js';
import { sheet, toast, confirmSheet } from './overlay.js';
import { INSTRUMENTS } from '../core/audio.js';
import { isBlack, midiLabel, chordSymbol, parseNote, midiOf } from '../core/music.js';
import { LESSONS, lessonsDone, chordPool, findLevel } from '../lessons.js';

const DAY_LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// ---------- small controls ----------

function toggle(id, label, checked, onChange, hint = '') {
  const input = h('input', { type: 'checkbox', id, checked, onchange: (e) => onChange(e.target.checked) });
  return h('label', { class: 'set-row', for: id },
    h('span', { class: 'set-text' }, h('span', { class: 'set-label' }, label), hint ? h('span', { class: 'set-hint' }, hint) : null),
    input, h('span', { class: 'switch', 'aria-hidden': 'true' }));
}

function choice(id, label, options, value, onChange, hint = '') {
  const sel = h('select', { id, class: 'select', onchange: (e) => onChange(e.target.value) },
    options.map((o) => h('option', { value: String(o.v), selected: String(o.v) === String(value) }, o.label)));
  return h('div', { class: 'set-row' },
    h('label', { class: 'set-text', for: id }, h('span', { class: 'set-label' }, label), hint ? h('span', { class: 'set-hint' }, hint) : null),
    sel);
}

// ---------- charts ----------

function xpChart(store) {
  const today = dayKey();
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));
  const vals = days.map((d) => store.xpOn(d));
  const goal = store.settings.dailyGoal;
  const max = Math.max(goal * 1.25, ...vals, 10);
  const W = 336;
  const H = 128;
  const top = 14;
  const base = H - 22;
  const bw = W / days.length;
  const y = (v) => base - (v / max) * (base - top);
  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'xp-chart', role: 'img', 'aria-label': `XP for the last 14 days. Today ${vals[13]} XP.` });
  root.append(svg('line', { x1: 0, x2: W, y1: y(goal), y2: y(goal), class: 'goal-line' }));
  root.append(svg('text', { x: W - 2, y: y(goal) - 4, class: 'chart-note', 'text-anchor': 'end' }, `goal ${goal}`));
  days.forEach((d, i) => {
    const v = vals[i];
    const x = i * bw + bw * 0.18;
    const w = bw * 0.64;
    const hgt = Math.max(v > 0 ? 3 : 0, base - y(v));
    const isToday = i === 13;
    if (v > 0) root.append(svg('rect', { x, y: base - hgt, width: w, height: hgt, rx: Math.min(4, w / 2), class: `bar${v >= goal ? ' met' : ''}${isToday ? ' today' : ''}` }));
    else root.append(svg('rect', { x, y: base - 2, width: w, height: 2, rx: 1, class: 'bar empty' }));
    root.append(svg('text', { x: x + w / 2, y: H - 6, class: `chart-day${isToday ? ' today' : ''}`, 'text-anchor': 'middle' }, DAY_LETTER[parseDayKey(d).getDay()]));
  });
  return root;
}

function heatKeys(store, clef, from, to) {
  const lo = midiOf(parseNote(from));
  const hi = midiOf(parseNote(to));
  const whites = [];
  for (let m = lo; m <= hi; m++) if (!isBlack(m)) whites.push(m);
  const keys = h('div', { class: 'kb-keys mini heat', style: `--n:${whites.length}` });
  const OFF = { 1: -0.1, 3: 0.1, 6: -0.12, 8: 0, 10: 0.12 };
  const ck = clef === 'bass' ? 'b' : 't';
  const cls = (m) => {
    const st = store.readingStat(ck, m);
    if (!st.tries) return 'heat-none';
    const e = st.ema ?? st.ok / st.tries;
    return e >= 0.85 ? 'heat-good' : e >= 0.6 ? 'heat-ok' : 'heat-low';
  };
  whites.forEach((m, i) => {
    keys.append(h('div', { class: `key white ${cls(m)}`, title: midiLabel(m) }, m % 12 === 0 ? h('span', { class: 'lbl' }, midiLabel(m)) : null));
    const b = m + 1;
    if (b < hi && isBlack(b)) {
      const left = ((i + 1 + (OFF[b % 12] || 0)) / whites.length) * 100;
      keys.append(h('div', { class: `key black ${cls(b)}`, title: midiLabel(b), style: `left:calc(${left}% - var(--bw) / 2)` }));
    }
  });
  let msSum = 0;
  let msN = 0;
  for (let m = lo; m <= hi; m++) {
    const [, , s = 0, n = 0] = store.total(`r:${clef === 'bass' ? 'b' : 't'}:${m}`);
    msSum += s;
    msN += n;
  }
  return { el: h('div', { class: 'kb kb-static' }, keys), avg: msN ? msSum / msN : null, count: msN };
}

// ---------- backup ----------

function framed() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

async function exportSave(app) {
  const text = await app.store.exportText();
  const name = `petal-keys-save-${dayKey()}.txt`;
  let file = null;
  try {
    file = new File([text], name, { type: 'text/plain' });
  } catch {
    file = null;
  }
  if (file && navigator.canShare && navigator.share) {
    let can = false;
    try {
      can = navigator.canShare({ files: [file] });
    } catch {
      can = false;
    }
    if (can) {
      try {
        await navigator.share({ files: [file], title: 'Petal Keys save' });
        toast('Backup sent.', { kind: 'good' });
        app.refresh();
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return;
      }
    }
  }
  if (!framed() && file) {
    const url = URL.createObjectURL(file);
    const a = h('a', { href: url, download: name, style: 'display:none' });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast(`Saved ${name} to your downloads.`, { kind: 'good', ms: 4200 });
    app.refresh();
    return;
  }
  showCode(app, text);
}

function showCode(app, text) {
  const area = h('textarea', { class: 'code-area', readonly: true, rows: 5, id: 'save-code-out' }, text);
  const copyBtn = h('button', { class: 'btn btn-primary', type: 'button', 'data-autofocus': '' }, icon('copy'), h('span', {}, 'Copy'));
  copyBtn.onclick = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast('Save code copied.', { kind: 'good' });
    } catch {
      area.focus();
      area.select();
      toast('Selected. Copy it with your keyboard or long-press.', { ms: 3600 });
    }
  };
  sheet(h('div', { class: 'sheet-body' },
    h('p', { class: 'muted' }, `This code holds all your progress (${text.length} characters). Paste it into Import on your other device.`),
    area,
    h('div', { class: 'row-actions' }, copyBtn)), { title: 'Your save code' });
  app.refresh();
}

function importSheet(app) {
  const fileIn = h('input', { type: 'file', id: 'import-file', accept: '.txt,.json,text/plain,application/json', class: 'visually-hidden' });
  const area = h('textarea', { class: 'code-area', rows: 4, id: 'import-code', placeholder: 'PETALKEYS1:…' });
  const status = h('p', { class: 'muted small', 'aria-live': 'polite' });
  let close = null;
  const run = async (text) => {
    try {
      const r = await app.store.importText(text);
      close && close();
      const bits = [];
      if (r.addedXp > 0) bits.push(`+${r.addedXp} XP`);
      if (r.addedLessons > 0) bits.push(`${r.addedLessons} more lesson${r.addedLessons === 1 ? '' : 's'} done`);
      toast(bits.length ? `Merged! ${bits.join(', ')}.` : 'Merged. Everything was already up to date.', { kind: 'good', ms: 4200 });
      app.refresh();
    } catch (e) {
      status.textContent = e.message || 'That save could not be read.';
      status.classList.add('bad');
    }
  };
  fileIn.onchange = async () => {
    const f = fileIn.files && fileIn.files[0];
    if (!f) return;
    if (f.size > 2_000_000) {
      status.textContent = 'That file is far too big to be a Petal Keys save.';
      return;
    }
    run(await f.text());
  };
  close = sheet(h('div', { class: 'sheet-body' },
    h('p', { class: 'muted' }, 'Progress from the other device is added to this one. Nothing here gets erased.'),
    h('label', { class: 'btn btn-primary btn-wide file-btn', for: 'import-file' }, icon('upload'), h('span', {}, 'Choose save file')),
    fileIn,
    h('p', { class: 'or' }, 'or paste a save code'),
    area,
    status,
    h('div', { class: 'row-actions' },
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => close() }, 'Cancel'),
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => run(area.value) }, 'Import code'))), { title: 'Import progress' });
}

// ---------- page ----------

export function renderMe(app, root) {
  const { store } = app;
  const streak = store.streak();
  const goal = store.settings.dailyGoal;
  const today = store.xpToday();
  const pct = Math.min(1, today / goal);
  const R = 30;
  const C = 2 * Math.PI * R;

  const ring = svg('svg', { viewBox: '0 0 76 76', class: 'goal-ring', 'aria-hidden': 'true' },
    svg('circle', { cx: 38, cy: 38, r: R, class: 'ring-bg' }),
    svg('circle', { cx: 38, cy: 38, r: R, class: 'ring-fg', 'stroke-dasharray': `${(C * pct).toFixed(1)} ${C.toFixed(1)}`, transform: 'rotate(-90 38 38)' }));

  let shieldText = 'One rest day a week is forgiven automatically.';
  if (streak.shieldUsedOn) shieldText = streak.shieldReadyIn > 0 ? `Rest day used. Next one is ready in ${streak.shieldReadyIn} day${streak.shieldReadyIn === 1 ? '' : 's'}.` : 'Rest day ready.';

  const summary = h('section', { class: 'me-summary' },
    h('div', { class: 'streak-card' },
      icon('flower', 'streak-ico'),
      h('div', {},
        h('p', { class: 'big-num' }, String(streak.count), h('span', { class: 'unit' }, streak.count === 1 ? ' day' : ' days')),
        h('p', { class: 'muted small' }, streak.todayDone ? 'Streak · today counted' : 'Streak · practise today to grow it'),
        h('p', { class: 'muted small shield' }, icon('shield'), shieldText))),
    h('div', { class: 'goal-card' },
      h('div', { class: 'ring-wrap' }, ring, h('span', { class: 'ring-num' }, String(today))),
      h('div', {},
        h('p', { class: 'stat-title' }, today >= goal ? 'Goal reached' : "Today's goal"),
        h('p', { class: 'muted small' }, `${today} of ${goal} XP`),
        h('p', { class: 'muted small' }, `${store.totalXp()} XP total · ${lessonsDone(store)}/${LESSONS.length} lessons`))));

  // reading maps
  const t = heatKeys(store, 'treble', 'C4', 'G5');
  const b = heatKeys(store, 'bass', 'G2', 'C4');
  const fmt = (ms) => (ms == null ? 'no data yet' : `${(ms / 1000).toFixed(1)} s`);
  const reading = h('section', { class: 'me-section' },
    h('h2', { class: 'section-title' }, 'Reading map'),
    h('p', { class: 'muted small' }, 'How well you know each note. Practice favours the pink ones.'),
    h('div', { class: 'legend' },
      h('span', { class: 'lg heat-good' }, 'Solid'), h('span', { class: 'lg heat-ok' }, 'Getting there'),
      h('span', { class: 'lg heat-low' }, 'Needs love'), h('span', { class: 'lg heat-none' }, 'Not yet')),
    h('h3', { class: 'map-title' }, 'Treble', h('span', { class: 'muted small' }, ` · average reading time ${fmt(t.avg)}`)),
    t.el,
    h('h3', { class: 'map-title' }, 'Bass', h('span', { class: 'muted small' }, ` · average reading time ${fmt(b.avg)}`)),
    b.el);

  // chords + ear + bests
  const chips = chordPool(store).map((c) => {
    const [tries = 0, ok = 0] = store.total(`c:${c.id}`);
    const e = store.ema(`c:${c.id}`);
    const cls = !tries ? 'heat-none' : e >= 0.85 ? 'heat-good' : e >= 0.6 ? 'heat-ok' : 'heat-low';
    return h('span', { class: `chord-chip ${cls}`, title: tries ? `${ok} of ${tries} right first try` : 'Not tried yet' }, chordSymbol(c));
  });
  const [fTries = 0, fOk = 0] = store.keys('f:').filter((k) => k !== 'f:err').reduce((acc, k) => {
    const [tt = 0, oo = 0] = store.total(k);
    return [acc[0] + tt, acc[1] + oo];
  }, [0, 0]);
  const hl = store.best('hl:level');
  const fl = findLevel(store);
  const skills = h('section', { class: 'me-section' },
    h('h2', { class: 'section-title' }, 'Chords & ears'),
    h('div', { class: 'chip-row' }, chips),
    h('dl', { class: 'kv' },
      h('dt', {}, 'Smallest higher/lower gap'), h('dd', {}, hl ? `${25 - hl} key${25 - hl === 1 ? '' : 's'}` : '–'),
      h('dt', {}, 'Find the note'), h('dd', {}, fTries ? `level ${fl} · ${Math.round((100 * fOk) / fTries)}% right` : `level ${fl}`),
      h('dt', {}, 'Note Rush best (treble)'), h('dd', {}, String(store.best('rush:treble') ?? '–')),
      h('dt', {}, 'Note Rush best (bass)'), h('dd', {}, String(store.best('rush:bass') ?? '–'))));

  const chart = h('section', { class: 'me-section' },
    h('h2', { class: 'section-title' }, 'Last two weeks'),
    xpChart(store));

  // backup
  const last = store.getLocal('lastExport');
  const devices = Object.keys(store.data.c).filter((d) => Object.keys(store.data.c[d]).length).length;
  const backup = h('section', { class: 'me-section backup', id: 'backup' },
    h('h2', { class: 'section-title' }, 'Backup & devices'),
    h('p', { class: 'muted small' },
      `Progress saves on this device automatically. Last backup: ${shortDate(last)}.${devices > 1 ? ` Includes progress from ${devices} devices.` : ''}`),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => exportSave(app) }, icon('share'), h('span', {}, 'Send backup')),
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: async () => showCode(app, await store.exportText()) }, icon('copy'), h('span', {}, 'Save code')),
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => importSheet(app) }, icon('upload'), h('span', {}, 'Import'))),
    h('p', { class: 'muted small' }, 'On your phone, Send backup opens the share menu, so you can pick LocalSend straight away.'),
    !store.storageOk ? h('p', { class: 'warn small' }, 'This browser is blocking storage, so progress only lasts until you close the app. Send a backup before leaving.') : null);

  // settings
  const st = store.settings;
  const midi = app.midi;
  const midiStatus = {
    unsupported: 'This browser has no MIDI support. Use Chrome, or Firefox on a computer.',
    idle: 'Not connected yet.',
    asking: 'Waiting for permission…',
    denied: 'Permission was declined. Allow MIDI for this site in the browser settings, then try again.',
    'no-device': 'Allowed, but no keyboard is plugged in.',
    connected: `Connected: ${midi.devices.join(', ')}`,
  }[midi.status];
  const vol = h('input', { type: 'range', id: 'vol', min: 0, max: 100, value: Math.round((store.getLocal('volume') ?? 0.85) * 100), class: 'slider' });
  vol.oninput = () => {
    const v = Number(vol.value) / 100;
    app.audio.setVolume(v);
    store.setLocal('volume', v);
  };
  const nameIn = h('input', { type: 'text', id: 'name-in', class: 'text-in', value: st.name || '', maxlength: 24, autocomplete: 'off', placeholder: 'For the greeting' });
  nameIn.onchange = () => {
    store.set('name', nameIn.value.trim());
  };
  const install = app.installPrompt
    ? h('button', { class: 'btn btn-primary', type: 'button', onclick: () => app.install() }, icon('install'), h('span', {}, 'Install app'))
    : null;

  const settings = h('section', { class: 'me-section settings' },
    h('h2', { class: 'section-title' }, 'Settings'),
    h('div', { class: 'set-group' },
      h('div', { class: 'set-row' },
        h('span', { class: 'set-text' }, h('span', { class: 'set-label' }, 'Keyboard (MIDI)'), h('span', { class: 'set-hint' }, midiStatus)),
        midi.status !== 'unsupported' && midi.status !== 'connected'
          ? h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => app.connectMidi(true) }, icon('plug'), h('span', {}, 'Connect'))
          : null),
      toggle('set-kbhide', 'Hide on-screen keys', !!store.getLocal('kbHidden'), (v) => store.setLocal('kbHidden', v), 'Only while a keyboard is connected'),
      toggle('set-drums', 'Ignore drum pads', st.ignoreDrumChannel, (v) => store.set('ignoreDrumChannel', v), 'Pads on MIDI channel 10 will not count as notes'),
      toggle('set-octave', 'Any octave counts', st.anyOctave, (v) => store.set('anyOctave', v), 'Kind to small keyboards: the right note in another octave is fine'),
      choice('set-labels', 'Labels on the on-screen keys', [{ v: 'none', label: 'None' }, { v: 'c', label: 'C only' }, { v: 'all', label: 'All white keys' }], st.keyLabels, (v) => { store.set('keyLabels', v); app.kb.setLabels(v); })),
    h('div', { class: 'set-group' },
      choice('set-inst', 'Instrument', INSTRUMENTS.map((i) => ({ v: i.id, label: i.label })), st.instrument || 'piano', (v) => app.setInstrument(v), 'The sound your keys make'),
      h('div', { class: 'set-row' }, h('label', { class: 'set-text', for: 'vol' }, h('span', { class: 'set-label' }, 'Volume')), vol),
      toggle('set-sfx', 'Little sound effects', st.sfx, (v) => { store.set('sfx', v); app.audio.sfxOn = v; }),
      toggle('set-metro', 'Metronome in Note Rush', st.metronome, (v) => store.set('metronome', v), 'Keeps clicking while you play'),
      h('div', { class: 'set-row' },
        h('span', { class: 'set-text' }, h('span', { class: 'set-label' }, 'Timing check'),
          h('span', { class: 'set-hint' }, `Adjusts for headphone delay. Now: ${store.getLocal('calibrationMs') || 0} ms`)),
        h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => app.startSession({ title: 'Timing check', steps: [{ type: 'calib', count: 0 }], kind: 'calib' }) }, icon('metronome'), h('span', {}, 'Check')))),
    h('div', { class: 'set-group' },
      h('div', { class: 'set-row' }, h('label', { class: 'set-text', for: 'name-in' }, h('span', { class: 'set-label' }, 'Your name')), nameIn),
      choice('set-goal', 'Daily goal', [{ v: 20, label: '20 XP · gentle' }, { v: 30, label: '30 XP · steady' }, { v: 50, label: '50 XP · keen' }], st.dailyGoal, (v) => store.set('dailyGoal', Number(v))),
      choice('set-theme', 'Look', [{ v: 'system', label: 'Match device' }, { v: 'light', label: 'Light' }, { v: 'dark', label: 'Dark' }], store.getLocal('theme') || 'system', (v) => { store.setLocal('theme', v); app.applyTheme(); })),
    h('div', { class: 'set-group' },
      h('div', { class: 'set-row' },
        h('span', { class: 'set-text' }, h('span', { class: 'set-label' }, 'App icon'),
          h('span', { class: 'set-hint' }, app.isStandalone() ? 'Installed. Nice!' : 'Phone: Chrome menu → Add to Home screen / Install app. Computer: Firefox or Chrome “add to taskbar”.')),
        install)),
  );

  const about = h('section', { class: 'me-section about' },
    h('h2', { class: 'section-title' }, 'About'),
    h('p', { class: 'muted small' }, 'Petal Keys v1.0. Piano sound: Salamander Grand Piano by Alexander Holm (CC BY 3.0). Music font: Bravura by Steinberg (SIL OFL). Fonts: Kiwi Maru and Zen Maru Gothic (SIL OFL).'),
    h('button', { class: 'btn btn-danger-ghost', type: 'button', onclick: async () => {
      const ok = await confirmSheet({ title: 'Reset all progress?', body: 'This clears lessons, stats and streak on this device. Send a backup first if you might want it back.', ok: 'Reset', danger: true });
      if (ok) {
        store.reset();
        toast('Progress reset. A fresh start!');
        app.refresh();
      }
    } }, 'Reset progress'));

  root.append(
    h('header', { class: 'page-head' }, h('h1', { class: 'page-title' }, 'Me'), h('p', { class: 'page-sub' }, 'Progress, backups and settings.')),
    summary, chart, reading, skills, backup, settings, about);
}

export { exportSave, importSheet };
