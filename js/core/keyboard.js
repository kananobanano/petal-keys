// The on-screen piano. Multi-touch, slide-to-play (glissando), octave shift
// buttons like a small controller, optional "latch" mode where a tap holds a
// key down (great for building chords one-handed on a phone).

import { h, clamp, isCoarsePointer } from './util.js';
import { isBlack, midiLabel } from './music.js';

const LOWEST = 21; // A0
const HIGHEST = 108; // C8
const BLACK_OFFSET = { 1: -0.1, 3: 0.1, 6: -0.12, 8: 0, 10: 0.12 };

const whiteUp = (m) => {
  while (isBlack(m)) m++;
  return m;
};
const whiteDown = (m) => {
  while (isBlack(m)) m--;
  return m;
};
function whitesBetween(lo, hi) {
  let n = 0;
  for (let m = lo; m <= hi; m++) if (!isBlack(m)) n++;
  return n;
}
function addWhites(m, count) {
  let c = 0;
  let x = m;
  const step = count >= 0 ? 1 : -1;
  while (c < Math.abs(count)) {
    x += step;
    if (!isBlack(x)) c++;
  }
  return x;
}

export class PianoKeyboard {
  constructor({ onNoteOn, onNoteOff, labels = 'c' } = {}) {
    this.onNoteOn = onNoteOn;
    this.onNoteOff = onNoteOff;
    this.labels = labels;
    this.from = 60;
    this.to = 84;
    this.latch = false;
    this.latched = new Set();
    this.pointers = new Map(); // pointerId -> midi
    this.keyEls = new Map();
    this.marks = new Map(); // midi -> Set(class)
    this.downSet = new Set();
    this.wanted = [60, 72];

    this.keysEl = h('div', { class: 'kb-keys', role: 'group', 'aria-label': 'Piano keys' });
    this.leftBtn = h('button', { class: 'kb-shift', type: 'button', 'aria-label': 'Show lower keys', onclick: () => this.shift(-1) }, '‹');
    this.rightBtn = h('button', { class: 'kb-shift', type: 'button', 'aria-label': 'Show higher keys', onclick: () => this.shift(1) }, '›');
    this.rangeLbl = h('span', { class: 'kb-range' });
    this.el = h('div', { class: 'kb' }, this.leftBtn, this.keysEl, this.rightBtn, this.rangeLbl);

    this.keysEl.addEventListener('pointerdown', (e) => this._down(e));
    this.keysEl.addEventListener('pointermove', (e) => this._move(e));
    this.keysEl.addEventListener('pointerup', (e) => this._up(e));
    this.keysEl.addEventListener('pointercancel', (e) => this._up(e));
    this.keysEl.addEventListener('lostpointercapture', (e) => this._up(e));
    this.keysEl.addEventListener('contextmenu', (e) => e.preventDefault());

    this._ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => this._fit()) : null;
    this._ro && this._ro.observe(this.el);
    this._render();
  }

  destroy() {
    this._ro && this._ro.disconnect();
  }

  setLabels(mode) {
    this.labels = mode;
    this._render();
  }

  setLatch(on) {
    if (!on) this.clearLatched();
    this.latch = on;
    this.el.classList.toggle('latching', on);
  }

  clearLatched() {
    for (const m of [...this.latched]) {
      this.latched.delete(m);
      this._setDown(m, false);
      this.onNoteOff && this.onNoteOff(m, performance.now());
    }
  }

  /** Make sure keys lo..hi are visible (centred if they fit). */
  focus(lo, hi = lo) {
    this.wanted = [Math.min(lo, hi), Math.max(lo, hi)];
    this._fit(true);
  }

  _visibleWhites() {
    const w = this.keysEl.clientWidth || this.el.clientWidth || 360;
    const minW = isCoarsePointer() ? 29 : 27;
    return clamp(Math.floor(w / minW), 7, 22);
  }

  _fit(force = false) {
    const V = this._visibleWhites();
    if (!force && V === this._lastV) return;
    this._lastV = V;
    const lo = whiteDown(clamp(this.wanted[0], LOWEST, HIGHEST));
    const hi = whiteUp(clamp(this.wanted[1], LOWEST, HIGHEST));
    const need = whitesBetween(lo, hi);
    let from;
    if (need <= V) {
      const spare = V - need;
      from = addWhites(lo, -Math.floor(spare / 2));
    } else {
      from = lo;
    }
    from = clamp(from, LOWEST, HIGHEST);
    let to = addWhites(from, V - 1);
    if (to > HIGHEST) {
      to = HIGHEST;
      from = Math.max(LOWEST, addWhites(to, -(V - 1)));
    }
    this.from = whiteUp(from);
    this.to = whiteDown(to);
    this._render();
  }

  shift(dir) {
    const V = this._visibleWhites();
    const step = Math.min(7, V - 1);
    let from = addWhites(this.from, dir * step);
    from = clamp(from, LOWEST, HIGHEST);
    let to = addWhites(from, V - 1);
    if (to > HIGHEST) {
      to = HIGHEST;
      from = Math.max(LOWEST, addWhites(to, -(V - 1)));
    }
    this.from = whiteUp(from);
    this.to = whiteDown(to);
    this._render();
  }

  _render() {
    const keys = this.keysEl;
    keys.textContent = '';
    this.keyEls.clear();
    const whites = [];
    for (let m = this.from; m <= this.to; m++) if (!isBlack(m)) whites.push(m);
    const N = whites.length || 1;
    keys.style.setProperty('--n', N);
    whites.forEach((m, i) => {
      const name = midiLabel(m);
      let label = '';
      if (this.labels === 'all') label = m % 12 === 0 ? name : name[0];
      else if (this.labels === 'c' && m % 12 === 0) label = name;
      const el = h('div', { class: 'key white', dataset: { midi: m }, 'aria-label': name }, label ? h('span', { class: 'lbl' }, label) : null);
      keys.append(el);
      this.keyEls.set(m, el);
      const b = m + 1;
      if (b < this.to && isBlack(b)) {
        const off = BLACK_OFFSET[b % 12] || 0;
        const left = ((i + 1 + off) / N) * 100;
        const bl = h('div', {
          class: 'key black',
          dataset: { midi: b },
          'aria-label': midiLabel(b),
          style: `left:calc(${left}% - var(--bw) / 2)`,
        }, this.labels === 'all' ? h('span', { class: 'lbl' }, midiLabel(b).slice(0, 2)) : null);
        keys.append(bl);
        this.keyEls.set(b, bl);
      }
    });
    for (const m of this.downSet) this._paint(m);
    for (const m of this.marks.keys()) this._paint(m);
    this.leftBtn.disabled = this.from <= LOWEST;
    this.rightBtn.disabled = this.to >= HIGHEST - 1;
    this.rangeLbl.textContent = `${midiLabel(this.from)}–${midiLabel(this.to)}`;
  }

  _paint(m) {
    const el = this.keyEls.get(m);
    if (!el) return;
    el.classList.toggle('down', this.downSet.has(m));
    for (const c of ['hint', 'good', 'bad', 'ref', 'answer', 'chosen', 'extra', 'missing']) {
      el.classList.toggle(c, !!this.marks.get(m)?.has(c));
    }
  }

  _setDown(m, on) {
    if (on) this.downSet.add(m);
    else this.downSet.delete(m);
    this._paint(m);
  }

  /** Show a key as pressed (used for MIDI/computer input too). */
  press(m) {
    this._setDown(m, true);
  }

  release(m) {
    if (this.latched.has(m)) return;
    this._setDown(m, false);
  }

  /** Add a colour mark. With ms, it fades after that many milliseconds. */
  mark(m, cls, ms = 0) {
    if (!this.marks.has(m)) this.marks.set(m, new Set());
    this.marks.get(m).add(cls);
    this._paint(m);
    if (ms) {
      setTimeout(() => {
        this.marks.get(m)?.delete(cls);
        this._paint(m);
      }, ms);
    }
  }

  unmark(m, cls) {
    this.marks.get(m)?.delete(cls);
    this._paint(m);
  }

  clearMarks(cls) {
    for (const [m, set] of this.marks) {
      if (cls) set.delete(cls);
      else set.clear();
      this._paint(m);
    }
  }

  // ----- pointer handling -----

  _keyAt(x, y) {
    const el = document.elementFromPoint(x, y);
    const key = el && el.closest ? el.closest('.key') : null;
    if (!key || !this.keysEl.contains(key)) return null;
    return Number(key.dataset.midi);
  }

  _down(e) {
    if (e.button !== undefined && e.button > 0) return;
    const m = this._keyAt(e.clientX, e.clientY);
    if (m == null) return;
    e.preventDefault();
    try {
      this.keysEl.setPointerCapture(e.pointerId);
    } catch {
      /* not essential */
    }
    const t = e.timeStamp || performance.now();
    if (this.latch) {
      if (this.latched.has(m)) {
        this.latched.delete(m);
        this._setDown(m, false);
        this.onNoteOff && this.onNoteOff(m, t);
      } else {
        this.latched.add(m);
        this._setDown(m, true);
        this.onNoteOn && this.onNoteOn(m, t);
      }
      return;
    }
    this.pointers.set(e.pointerId, m);
    this._setDown(m, true);
    this.onNoteOn && this.onNoteOn(m, t);
  }

  _move(e) {
    if (this.latch || !this.pointers.has(e.pointerId)) return;
    const cur = this.pointers.get(e.pointerId);
    const m = this._keyAt(e.clientX, e.clientY);
    if (m == null || m === cur) return;
    const t = e.timeStamp || performance.now();
    this.pointers.set(e.pointerId, m);
    if (![...this.pointers.values()].includes(cur)) {
      this._setDown(cur, false);
      this.onNoteOff && this.onNoteOff(cur, t);
    }
    this._setDown(m, true);
    this.onNoteOn && this.onNoteOn(m, t);
  }

  _up(e) {
    if (!this.pointers.has(e.pointerId)) return;
    const m = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if ([...this.pointers.values()].includes(m)) return;
    this._setDown(m, false);
    this.onNoteOff && this.onNoteOff(m, e.timeStamp || performance.now());
  }
}
