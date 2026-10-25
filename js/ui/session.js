// Runs one exercise session full-screen: teaching cards, then a drill (or a
// mix of drills), then a gentle results screen.

import { h, clear } from '../core/util.js';
import { icon } from './icons.js';
import { cardVisual } from './visuals.js';
import { MODES } from '../modes/index.js';

const CHEERS_GOOD = [
  'Lovely work!', 'You made that look easy.', 'Sparkly work today!', 'Your fingers know the way now.',
  'That was really nice.', 'Onwards and upwards!',
];
const CHEERS_OK = [
  'Every try teaches your hands something.', 'Nice and steady. That is how it sticks.',
  'Good effort! It gets easier each time.', 'Little by little, note by note.',
];

export class Session {
  /**
   * opts: { title, steps: [{ type: 'cards', cards } | { type: mode, ...cfg }],
   *         lessonId, kind: 'lesson' | 'practice' | 'free' | 'calib', onFinish }
   */
  constructor(app, opts) {
    this.app = app;
    this.opts = opts;
    this.kind = opts.kind || 'practice';
    this.steps = opts.steps;
    this.stepIndex = -1;
    this.mode = null;
    this.units = this.steps.reduce((s, st) => s + (st.type === 'cards' ? st.cards.length : st.count || 0), 0);
    this.unitsDone = 0;
    this.result = { items: 0, firstTry: 0, xp: 0, notes: [] };
    this.closed = false;
  }

  // ----- lifecycle -----

  open() {
    const app = this.app;
    const ex = app.ex;
    ex.root.hidden = false;
    document.body.classList.add('in-exercise');
    ex.close.onclick = () => this.close();
    ex.top.classList.toggle('no-progress', this.units === 0);
    this._paintProgress();
    app.kb.clearMarks();
    app.kb.setLatch(false);
    app.kb.clearLatched();
    this.next();
  }

  close(finished = false) {
    if (this.closed) return;
    this.closed = true;
    this._destroyMode();
    const app = this.app;
    app.kb.clearMarks();
    app.kb.setLatch(false);
    app.bus.releaseSource('touch');
    app.audio.releaseAll();
    app.ex.root.hidden = true;
    document.body.classList.remove('in-exercise');
    clear(app.ex.body);
    clear(app.ex.actions);
    app.ex.feedback.textContent = '';
    app.store.flush();
    app.sessionClosed(this, finished);
  }

  _destroyMode() {
    if (this.mode && this.mode.destroy) {
      try {
        this.mode.destroy();
      } catch (e) {
        console.error(e);
      }
    }
    this.mode = null;
  }

  next() {
    this._destroyMode();
    this.stepIndex++;
    if (this.stepIndex >= this.steps.length) {
      this.finish();
      return;
    }
    const step = this.steps[this.stepIndex];
    const ex = this.app.ex;
    clear(ex.body);
    clear(ex.actions);
    ex.feedback.textContent = '';
    ex.feedback.className = 'ex-feedback';
    ex.title.textContent = '';
    if (step.type === 'cards') this._runCards(step.cards);
    else this._runMode(step);
  }

  // ----- teaching cards -----

  _runCards(cards) {
    const ex = this.app.ex;
    let i = 0;
    this.showKeyboard(false);
    const show = () => {
      const c = cards[i];
      clear(ex.body);
      clear(ex.actions);
      ex.title.textContent = this.opts.title;
      const card = h('article', { class: 'teach-card' },
        h('p', { class: 'teach-step' }, `${i + 1} of ${cards.length}`),
        h('h2', { class: 'teach-title' }, c.title),
        h('p', { class: 'teach-text' }, c.text),
        cardVisual(c.visual));
      ex.body.append(card);
      const nextBtn = h('button', { class: 'btn btn-primary btn-wide', type: 'button', 'data-autofocus': '' },
        i < cards.length - 1 ? 'Next' : "Let's try it");
      nextBtn.onclick = () => {
        this.progress(1);
        i++;
        if (i < cards.length) show();
        else this.next();
      };
      if (i > 0) {
        ex.actions.append(h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { i--; this.progress(-1); show(); } }, 'Back'));
      }
      ex.actions.append(nextBtn);
      setTimeout(() => nextBtn.focus({ preventScroll: true }), 30);
    };
    show();
  }

  // ----- drills -----

  _runMode(step) {
    const factory = MODES[step.type];
    if (!factory) {
      console.error('Unknown mode', step.type);
      this.next();
      return;
    }
    const app = this.app;
    const ex = app.ex;
    const ctx = {
      app,
      store: app.store,
      audio: app.audio,
      kb: app.kb,
      bus: app.bus,
      body: ex.body,
      actions: ex.actions,
      settings: app.store.settings,
      isLesson: this.kind === 'lesson',
      setTitle: (t) => {
        ex.title.textContent = t;
      },
      feedback: (msg, kind = 'info') => {
        ex.feedback.className = `ex-feedback fb-${kind}`;
        ex.feedback.textContent = '';
        if (msg instanceof Node) ex.feedback.append(msg);
        else ex.feedback.textContent = msg || '';
      },
      setActions: (...btns) => {
        clear(ex.actions);
        for (const b of btns.flat()) if (b) ex.actions.append(b);
      },
      progress: (n = 1) => this.progress(n),
      record: ({ correct, xp = 0 }) => {
        this.result.items++;
        if (correct) this.result.firstTry++;
        this.addXp(xp);
      },
      addXp: (n) => this.addXp(n),
      note: (text) => this.result.notes.push(text),
      showKeyboard: (on) => this.showKeyboard(on),
      done: () => this.next(),
      isOpen: () => !this.closed && this.mode === modeRef,
    };
    this.showKeyboard(true);
    app.kb.clearMarks();
    let modeRef = null;
    modeRef = factory(ctx, step);
    this.mode = modeRef;
    try {
      modeRef.mount && modeRef.mount();
    } catch (e) {
      console.error(e);
      ctx.feedback('Something went wrong loading this exercise. Skipping it.', 'bad');
      setTimeout(() => this.next(), 1500);
    }
  }

  showKeyboard(on) {
    const hiddenPref = this.app.store.getLocal('kbHidden') && this.app.midi.status === 'connected';
    this.app.ex.kbWrap.hidden = !on || hiddenPref;
    this.app.ex.root.classList.toggle('kb-off', !on || hiddenPref);
  }

  addXp(n) {
    if (!n) return;
    this.result.xp += n;
    this.app.store.addXp(n);
  }

  progress(n = 1) {
    this.unitsDone = Math.max(0, Math.min(this.units, this.unitsDone + n));
    this._paintProgress();
  }

  _paintProgress() {
    const pct = this.units ? (this.unitsDone / this.units) * 100 : 0;
    this.app.ex.bar.style.width = `${pct}%`;
  }

  // ----- input forwarding -----

  onNoteOn(e) {
    this.mode && this.mode.onNoteOn && this.mode.onNoteOn(e);
  }

  onNoteOff(e) {
    this.mode && this.mode.onNoteOff && this.mode.onNoteOff(e);
  }

  onPedal(e) {
    this.mode && this.mode.onPedal && this.mode.onPedal(e);
  }

  onKey(e) {
    if (this.mode && this.mode.onKey && this.mode.onKey(e)) return true;
    return false;
  }

  // ----- results -----

  finish() {
    const app = this.app;
    const store = app.store;
    const ex = app.ex;
    if (this.kind === 'free' || this.kind === 'calib') {
      this.close(true);
      return;
    }
    this.showKeyboard(false);
    const r = this.result;
    const acc = r.items ? r.firstTry / r.items : 1;
    let stars = 0;
    let leveled = false;
    if (this.kind === 'lesson' && this.opts.lessonId) {
      stars = acc >= 0.9 ? 3 : acc >= 0.7 ? 2 : 1;
      const before = store.lesson(this.opts.lessonId).stars;
      this.addXp(5);
      store.completeLesson(this.opts.lessonId, stars);
      leveled = stars > before && before > 0;
    }
    app.audio.sfx('done');
    const streak = store.streak();
    const goal = store.settings.dailyGoal;
    const today = store.xpToday();
    clear(ex.body);
    clear(ex.actions);
    ex.feedback.textContent = '';
    ex.title.textContent = '';
    this.unitsDone = this.units;
    this._paintProgress();

    const cheers = acc >= 0.8 ? CHEERS_GOOD : CHEERS_OK;
    const cheer = cheers[Math.floor(Math.random() * cheers.length)];
    const starRow = this.kind === 'lesson'
      ? h('div', { class: 'stars-row', 'aria-label': `${stars} of 3 stars` },
        [1, 2, 3].map((i) => icon('star', `big-star${i <= stars ? ' on' : ''}`)))
      : null;
    const stats = h('dl', { class: 'result-stats' },
      r.items ? [h('dt', {}, 'Right first try'), h('dd', {}, `${r.firstTry} of ${r.items}`)] : null,
      [h('dt', {}, 'Earned'), h('dd', {}, `+${r.xp} XP`)],
      [h('dt', {}, 'Today'), h('dd', {}, today >= goal ? `${today} XP · goal reached` : `${today} of ${goal} XP`)],
      [h('dt', {}, 'Streak'), h('dd', {}, `${streak.count} day${streak.count === 1 ? '' : 's'}`)],
    );
    const panel = h('section', { class: 'results' },
      h('div', { class: 'sparkles', 'aria-hidden': 'true' }, Array.from({ length: 10 }, (_, i) => h('i', { style: `--i:${i}` }))),
      h('p', { class: 'eyebrow' }, this.kind === 'lesson' ? 'Lesson complete' : 'Practice done'),
      h('h2', { class: 'results-title' }, this.opts.title),
      starRow,
      h('p', { class: 'results-cheer' }, leveled ? 'New best for this lesson!' : cheer),
      stats,
      r.notes.length ? h('ul', { class: 'result-notes' }, r.notes.map((t) => h('li', {}, t))) : null,
    );
    ex.body.append(panel);
    const cont = h('button', { class: 'btn btn-primary btn-wide', type: 'button', 'data-autofocus': '', onclick: () => this.close(true) }, 'Continue');
    const again = h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { this.close(true); app.startSession(this.opts); } },
      this.kind === 'lesson' ? 'Redo lesson' : 'Again');
    ex.actions.append(again, cont);
    setTimeout(() => cont.focus({ preventScroll: true }), 50);
  }
}

