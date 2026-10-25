// Petal Keys: app start-up, tabs, input wiring.

import { h, clear, isTypingTarget } from './core/util.js';
import { Store } from './core/store.js';
import { AudioEngine } from './core/audio.js';
import { InputBus, MidiInput, attachComputerKeys } from './core/input.js';
import { PianoKeyboard } from './core/keyboard.js';
import { icon } from './ui/icons.js';
import { initOverlays, toast, sheet } from './ui/overlay.js';
import { Session } from './ui/session.js';
import { renderLearn } from './ui/learn.js';
import { renderPractice } from './ui/practice.js';
import { renderMe, exportSave } from './ui/me.js';

const TABS = [
  { id: 'learn', label: 'Learn', ico: 'learn', render: renderLearn },
  { id: 'practice', label: 'Practice', ico: 'practice', render: renderPractice },
  { id: 'me', label: 'Me', ico: 'me', render: renderMe },
];

const store = new Store().load();
const audio = new AudioEngine();
const bus = new InputBus();
const midi = new MidiInput(bus, { ignoreDrumChannel: () => store.settings.ignoreDrumChannel });

const app = {
  store,
  audio,
  bus,
  midi,
  kb: null,
  ex: null,
  session: null,
  tab: 'learn',
  installPrompt: null,
};
window.__petalKeys = app; // handy for poking around in devtools

app.framed = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

// ---------- theme ----------

app.applyTheme = () => {
  const t = store.getLocal('theme') || 'system';
  const root = document.documentElement;
  if (t === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', t);
  const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', dark ? '#18162a' : '#f3f9f6'));
};

app.setInstrument = (id, preview = true) => {
  store.set('instrument', id);
  audio.instrument = id;
  if (preview) {
    audio.ensure();
    const t = audio.now + 0.05;
    [60, 64, 67, 72].forEach((m, i) => audio.playNote(m, { when: t + i * 0.13, dur: 0.5, vel: 0.7 }));
  }
};

app.isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: minimal-ui)').matches || navigator.standalone === true;

// ---------- shell ----------

function buildShell() {
  const root = document.getElementById('app') || document.body.appendChild(h('div', { id: 'app' }));
  clear(root);

  const tabs = h('nav', { class: 'tabs', 'aria-label': 'Sections' },
    TABS.map((t) => h('a', { class: 'tab', href: '#' + t.id, dataset: { tab: t.id }, onclick: (e) => { e.preventDefault(); go(t.id); } },
      icon(t.ico), h('span', { class: 'tab-label' }, t.label))));

  const midiChip = h('button', { class: 'chip chip-midi', type: 'button', onclick: () => midiSheet() }, icon('plug'), h('span', { class: 'dot' }), h('span', { class: 'chip-text' }, 'Keys'));
  const streakChip = h('span', { class: 'chip chip-streak', title: 'Streak' }, icon('flower'), h('span', { class: 'chip-text' }, '0'));
  const xpChip = h('span', { class: 'chip chip-xp', title: "Today's XP" }, h('span', { class: 'mini-ring' }), h('span', { class: 'chip-text' }, '0'));
  const soundChip = h('button', { class: 'chip chip-sound', type: 'button', hidden: true, onclick: () => wakeSound() }, icon('sound'), h('span', { class: 'chip-text' }, 'Tap for sound'));

  const top = h('header', { class: 'topbar' },
    h('a', { class: 'brand', href: '#learn', onclick: (e) => { e.preventDefault(); go('learn'); } },
      h('span', { class: 'brand-mark', 'aria-hidden': 'true', html: LOGO }), h('span', { class: 'brand-name' }, 'Petal Keys')),
    tabs,
    h('div', { class: 'status' }, soundChip, midiChip, streakChip, xpChip));

  const screen = h('main', { class: 'screen', id: 'screen', tabindex: '-1' });

  // exercise overlay
  const bar = h('div', { class: 'ex-bar' });
  const close = h('button', { class: 'icon-btn ex-close', type: 'button', 'aria-label': 'Close' }, icon('close'));
  const title = h('h2', { class: 'ex-title' });
  const exTop = h('header', { class: 'ex-top' }, close, h('div', { class: 'ex-progress', 'aria-hidden': 'true' }, bar));
  const body = h('div', { class: 'ex-body' });
  const feedback = h('p', { class: 'ex-feedback', 'aria-live': 'polite' });
  const actions = h('div', { class: 'ex-actions' });
  const kbWrap = h('div', { class: 'ex-kb' });
  const exRoot = h('section', { class: 'exercise', hidden: true, 'aria-label': 'Exercise' },
    exTop, h('div', { class: 'ex-main' }, title, body, feedback), actions, kbWrap);

  app.kb = new PianoKeyboard({
    labels: store.settings.keyLabels,
    onNoteOn: (m, t) => bus.noteOn(m, 0.72, t, 'touch'),
    onNoteOff: (m, t) => bus.noteOff(m, t, 'touch'),
  });
  kbWrap.append(app.kb.el);

  app.ex = { root: exRoot, top: exTop, bar, close, title, body, feedback, actions, kbWrap };
  app.ui = { screen, tabs, midiChip, streakChip, xpChip, soundChip };

  root.append(h('div', { class: 'app' }, top, screen), exRoot);
  initOverlays(document.body);
}

const LOGO = `<svg viewBox="0 0 32 32" width="28" height="28"><defs><linearGradient id="lg-mk" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8fe0c8"/><stop offset=".55" stop-color="#a9d4f5"/><stop offset="1" stop-color="#c3b3f3"/></linearGradient></defs><rect x="1" y="1" width="30" height="30" rx="9" fill="url(#lg-mk)"/><rect x="7" y="9" width="18" height="15" rx="3" fill="#fffdf8"/><path d="M13 9v15M19 9v15" stroke="#d8d1e8" stroke-width="1"/><rect x="11.3" y="9" width="3.2" height="8.5" rx="1" fill="#3a3452"/><rect x="17.3" y="9" width="3.2" height="8.5" rx="1" fill="#3a3452"/><path d="M22.5 7.5c2.6-2.8 5.5-2.2 6.3-1.7-.4 2.6-3.1 4.6-6.3 1.7z" fill="#ee9ab9"/></svg>`;

// ---------- status chips ----------

function paintStatus() {
  const { streakChip, xpChip, midiChip } = app.ui;
  const st = store.streak();
  streakChip.querySelector('.chip-text').textContent = String(st.count);
  streakChip.classList.toggle('lit', st.todayDone);
  streakChip.title = `${st.count}-day streak`;
  const goal = store.settings.dailyGoal;
  const today = store.xpToday();
  xpChip.querySelector('.chip-text').textContent = String(today);
  xpChip.style.setProperty('--p', Math.min(1, today / goal));
  xpChip.title = `${today} of ${goal} XP today`;
  midiChip.classList.toggle('on', midi.status === 'connected');
  midiChip.title = midi.status === 'connected' ? `Connected: ${midi.devices.join(', ')}` : 'Connect a MIDI keyboard';
  midiChip.querySelector('.chip-text').textContent = midi.status === 'connected' ? 'Keys on' : 'Keys';
}

// ---------- routing ----------

function render() {
  const { screen, tabs } = app.ui;
  clear(screen);
  const tab = TABS.find((t) => t.id === app.tab) || TABS[0];
  tabs.querySelectorAll('.tab').forEach((a) => {
    const on = a.dataset.tab === tab.id;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  try {
    tab.render(app, screen);
  } catch (e) {
    console.error(e);
    screen.append(h('p', { class: 'warn' }, 'Something went wrong showing this page. Try reloading the app.'));
  }
  paintStatus();
}

app.refresh = () => {
  if (!app.session) render();
  else paintStatus();
};

function go(tabId) {
  app.tab = TABS.some((t) => t.id === tabId) ? tabId : 'learn';
  try {
    history.replaceState(history.state, '', '#' + app.tab);
  } catch {
    /* framed pages may refuse; fine */
  }
  render();
  window.scrollTo({ top: 0 });
}

// ---------- sessions ----------

let pushedHistory = false;

app.startSession = (opts) => {
  if (app.session) app.session.close();
  wakeSound();
  const s = new Session(app, opts);
  app.session = s;
  pushedHistory = false;
  try {
    history.pushState({ mk: 'ex' }, '', '#' + app.tab);
    pushedHistory = true;
  } catch {
    pushedHistory = false;
  }
  s.open();
};

app.startLesson = (L) => {
  app.startSession({
    title: L.title,
    lessonId: L.id,
    kind: 'lesson',
    steps: [{ type: 'cards', cards: L.cards }, { type: L.drill.mode, ...L.drill }],
  });
};

app.sessionClosed = (s) => {
  if (app.session === s) app.session = null;
  if (pushedHistory && history.state && history.state.mk === 'ex') {
    pushedHistory = false;
    try {
      history.back();
    } catch {
      /* ignore */
    }
  }
  render();
  maybeNudgeBackup();
};

window.addEventListener('popstate', () => {
  if (app.session && !(history.state && history.state.mk === 'ex')) {
    pushedHistory = false;
    app.session.close();
  }
});

// ---------- sound ----------

let soundWarned = false;

function wakeSound() {
  const ctx = audio.ensure();
  if (!ctx) return;
  audio.loadPiano('assets/piano/');
  setTimeout(paintSound, 300);
}

function paintSound() {
  if (!app.ui) return;
  app.ui.soundChip.hidden = audio.running;
}

audio.onstate = () => paintSound();

// ---------- MIDI ----------

app.connectMidi = async (fromUser = false) => {
  const status = await midi.connect();
  if (fromUser) {
    if (status === 'connected') toast(`Keyboard connected: ${midi.devices.join(', ')}`, { kind: 'good' });
    else if (status === 'no-device') toast('MIDI is allowed, but no keyboard was found. Plug it in and it will connect by itself.', { ms: 4200 });
    else if (status === 'denied' && app.framed) toast('This preview page is not allowed to use MIDI. Open your own copy of Petal Keys to use the keyboard.', { kind: 'bad', ms: 5200 });
    else if (status === 'denied') toast('MIDI permission was declined. You can allow it in the browser’s site settings.', { kind: 'bad', ms: 4200 });
    else if (status === 'unsupported') toast('This browser has no MIDI support. On a phone, use Chrome.', { kind: 'bad', ms: 4200 });
  }
  app.refresh();
};

let lastMidiStatus = midi.status;
midi.onChange(() => {
  if (midi.status === 'connected' || midi.status === 'no-device') store.setLocal('midiOk', true);
  if (midi.status === 'connected' && lastMidiStatus !== 'connected') toast(`Keyboard connected: ${midi.devices.join(', ')}`, { kind: 'good' });
  if (lastMidiStatus === 'connected' && midi.status === 'no-device') toast('Keyboard unplugged.');
  lastMidiStatus = midi.status;
  paintStatus();
});

function midiSheet() {
  const st = midi.status;
  const text = {
    unsupported: 'This browser cannot talk to MIDI keyboards. On Android use Chrome; on a computer use Chrome or Firefox. The on-screen keys still work everywhere.',
    idle: 'Plug your keyboard in with USB (on a phone, through a USB-C adapter), then tap Connect.',
    asking: 'Waiting for the browser to ask for permission…',
    denied: app.framed
      ? 'This preview page is not allowed to use MIDI devices. Open your own hosted copy of Petal Keys to play with the keyboard. The on-screen keys work here.'
      : 'Permission was declined. Open the site settings in your browser, allow MIDI devices, then tap Connect again.',
    'no-device': 'MIDI is allowed, but nothing is plugged in yet. Plug in the keyboard and it will connect by itself.',
    connected: `Connected: ${midi.devices.join(', ')}. Play a key and you should hear it.`,
  }[st];
  const close = sheet(h('div', { class: 'sheet-body' },
    h('p', {}, text),
    navigator.userAgent.includes('Firefox') && st !== 'connected' && st !== 'unsupported'
      ? h('p', { class: 'muted small' }, 'Firefox asks you to add a small “site permission” add-on the first time. That is expected.')
      : null,
    h('p', { class: 'muted small' }, 'No keyboard nearby? On a computer, the letters A W S E D F T G Y H U J K play notes too (Z and X change octave).'),
    h('div', { class: 'row-actions' },
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => close() }, 'Close'),
      st !== 'connected' && st !== 'unsupported'
        ? h('button', { class: 'btn btn-primary', type: 'button', 'data-autofocus': '', onclick: () => { close(); app.connectMidi(true); } }, icon('plug'), h('span', {}, 'Connect'))
        : null)), { title: 'Your keyboard' });
}

// ---------- input wiring ----------

function wireInput() {
  bus.on('noteon', (e) => {
    audio.noteOn(e.midi, e.velocity);
    app.kb.press(e.midi);
    if (app.session) app.session.onNoteOn(e);
    if (!audio.running && e.source === 'midi' && !soundWarned) {
      soundWarned = true;
      app.ui.soundChip.hidden = false;
      toast('Tap the screen once to turn the sound on.', { ms: 4000 });
    }
  });
  bus.on('noteoff', (e) => {
    audio.noteOff(e.midi);
    app.kb.release(e.midi);
    if (app.session) app.session.onNoteOff(e);
  });
  bus.on('pedal', (e) => {
    audio.setSustain(e.down);
    if (app.session) app.session.onPedal(e);
  });

  attachComputerKeys(bus, {
    isEnabled: () => !document.querySelector('.sheet-wrap'),
    onOctave: (base) => toast(`Computer keys now start at C${base / 12 - 1}`, { ms: 1200 }),
  });

  window.addEventListener('keydown', (e) => {
    if (isTypingTarget(e.target) || e.repeat) return;
    if (app.session) {
      if (e.key === 'Escape' && !document.querySelector('.sheet-wrap')) {
        app.session.close();
        e.preventDefault();
        return;
      }
      const tag = e.target && e.target.tagName;
      if ((e.key === ' ' || e.key === 'Enter') && (tag === 'BUTTON' || tag === 'A')) return;
      if (app.session.onKey(e)) e.preventDefault();
    }
  });

  // First tap anywhere wakes the audio (browsers require a gesture).
  const unlock = () => wakeSound();
  window.addEventListener('pointerdown', unlock, { capture: true });
  window.addEventListener('keydown', unlock, { capture: true });

  store.onChange(() => {
    if (app.ui) paintStatus();
  });
}

// ---------- backup nudge, install, offline ----------

function maybeNudgeBackup() {
  const now = Date.now();
  const last = store.getLocal('lastExport') || 0;
  const after = store.getLocal('nudgeAfter') || 0;
  if (!store.hasProgress() || now - last < 7 * 86400000 || now < after) return;
  if (store.totalXp() < 30) return;
  store.setLocal('nudgeAfter', now + 2 * 86400000);
  toast(last ? 'It has been a week since your last backup.' : 'Keep your progress safe with a backup.', {
    ms: 7000,
    action: { label: 'Send backup', fn: () => exportSave(app) },
  });
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  app.installPrompt = e;
  if (app.tab === 'me' && !app.session) render();
});

window.addEventListener('appinstalled', () => {
  app.installPrompt = null;
  toast('Installed! Petal Keys now has its own icon.', { kind: 'good' });
});

app.install = async () => {
  const p = app.installPrompt;
  if (!p) return;
  p.prompt();
  try {
    await p.userChoice;
  } catch {
    /* ignore */
  }
  app.installPrompt = null;
  app.refresh();
};

function registerServiceWorker() {
  if (app.framed || !('serviceWorker' in navigator)) return;
  const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (location.protocol !== 'https:' && !local) return;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w && w.addEventListener('statechange', () => {
        if (w.state === 'activated' && hadController) {
          toast('Petal Keys was updated.', { action: { label: 'Reload', fn: () => location.reload() }, ms: 8000 });
        }
      });
    });
  }).catch(() => {
    /* offline support is optional */
  });
}

// ---------- boot ----------

async function boot() {
  app.applyTheme();
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => app.applyTheme());
  audio.volume = store.getLocal('volume') ?? 0.85;
  audio.sfxOn = store.settings.sfx;
  audio.instrument = store.settings.instrument || 'piano';
  buildShell();
  wireInput();

  const hash = (location.hash || '').replace('#', '');
  app.tab = TABS.some((t) => t.id === hash) ? hash : 'learn';
  render();
  paintSound();
  app.ui.soundChip.hidden = true;

  try {
    await document.fonts.load('20px "MK Bravura"');
  } catch {
    /* ignore */
  }

  // Reconnect the keyboard silently if MIDI was allowed before.
  try {
    if (midi.status !== 'unsupported' && store.getLocal('midiAuto') !== false && !app.framed) {
      if (store.getLocal('midiOk') || (await midi.previouslyGranted())) app.connectMidi(false);
    }
  } catch {
    /* MIDI is optional */
  }

  try {
    if (navigator.storage && navigator.storage.persist && store.hasProgress()) navigator.storage.persist().catch(() => {});
  } catch {
    /* optional */
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      store.flush();
      bus.releaseAll();
      audio.releaseAll();
    }
  });
  window.addEventListener('pagehide', () => store.flush());

  try {
    registerServiceWorker();
  } catch {
    /* offline support is optional */
  }
  setTimeout(maybeNudgeBackup, 2500);

  if (!store.getLocal('welcomed')) {
    store.setLocal('welcomed', true);
    setTimeout(welcome, 400);
  }
  document.body.dataset.ready = '1';
}

function welcome() {
  const close = sheet(h('div', { class: 'sheet-body welcome' },
    h('p', {}, 'Little lessons for reading music, building chords and training your ears, one note at a time.'),
    h('ul', { class: 'welcome-list' },
      h('li', {}, icon('keys'), h('span', {}, 'Plug in your MIDI keyboard, or use the keys on screen.')),
      h('li', {}, icon('learn'), h('span', {}, 'Learn teaches something new. Practice only reviews.')),
      h('li', {}, icon('share'), h('span', {}, 'Progress saves by itself. Send a backup to move it to another device.'))),
    h('div', { class: 'row-actions' },
      h('button', { class: 'btn btn-primary btn-wide', type: 'button', 'data-autofocus': '', onclick: () => { close(); wakeSound(); } }, "Let's begin"))),
  { title: 'Welcome to Petal Keys' });
}

boot();
