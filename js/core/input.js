// All the ways to play a note end up on one bus:
//   - a USB MIDI keyboard (Web MIDI)
//   - the on-screen keyboard (touch / mouse)
//   - the computer keyboard (A W S E D F T G Y H U J K ...), handy for testing
//
// Listeners get { midi, velocity, time, source } where `time` is a
// performance.now() timestamp of when the key went down.

import { isTypingTarget } from './util.js';

export class InputBus extends EventTarget {
  constructor() {
    super();
    this.down = new Map(); // "source:midi" -> midi
    this.lastSource = null;
  }

  noteOn(midi, velocity = 0.75, time = performance.now(), source = 'touch') {
    const key = `${source}:${midi}`;
    if (this.down.has(key)) this.noteOff(midi, time, source);
    this.down.set(key, midi);
    this.lastSource = source;
    this.dispatchEvent(new CustomEvent('noteon', { detail: { midi, velocity, time, source } }));
  }

  noteOff(midi, time = performance.now(), source = 'touch') {
    const key = `${source}:${midi}`;
    if (!this.down.has(key)) return;
    this.down.delete(key);
    this.dispatchEvent(new CustomEvent('noteoff', { detail: { midi, time, source } }));
  }

  pedal(down, time = performance.now(), source = 'midi') {
    this.dispatchEvent(new CustomEvent('pedal', { detail: { down, time, source } }));
  }

  /** Release everything from one source (e.g. when a device unplugs). */
  releaseSource(source) {
    for (const [key, midi] of [...this.down]) {
      if (key.startsWith(source + ':')) this.noteOff(midi, performance.now(), source);
    }
  }

  releaseAll() {
    for (const [key, midi] of [...this.down]) this.noteOff(midi, performance.now(), key.split(':')[0]);
  }

  /** Unique MIDI numbers currently held down, ascending. */
  held() {
    return [...new Set(this.down.values())].sort((a, b) => a - b);
  }

  on(type, fn) {
    const wrap = (e) => fn(e.detail);
    this.addEventListener(type, wrap);
    return () => this.removeEventListener(type, wrap);
  }
}

// ---------- Web MIDI ----------

export class MidiInput {
  constructor(bus, { ignoreDrumChannel = () => true } = {}) {
    this.bus = bus;
    this.access = null;
    this.status = typeof navigator !== 'undefined' && navigator.requestMIDIAccess ? 'idle' : 'unsupported';
    this.devices = [];
    this.ignoreDrumChannel = ignoreDrumChannel;
    this.listeners = new Set();
    this._handler = (e) => this._onMessage(e);
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _emit() {
    for (const fn of this.listeners) fn(this);
  }

  /** Was permission granted before? (Lets us reconnect without a prompt.) */
  async previouslyGranted() {
    try {
      const r = await navigator.permissions.query({ name: 'midi' });
      return r.state === 'granted';
    } catch {
      return false;
    }
  }

  async connect() {
    if (this.status === 'unsupported') return this.status;
    if (this.access) {
      this._refresh();
      return this.status;
    }
    this.status = 'asking';
    this._emit();
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false });
    } catch (err) {
      this.status = 'denied';
      this.error = err;
      this._emit();
      return this.status;
    }
    this.access.onstatechange = () => this._refresh();
    this._refresh();
    return this.status;
  }

  _refresh() {
    const inputs = [];
    this.access.inputs.forEach((input) => {
      if (input.state === 'disconnected') return;
      input.onmidimessage = this._handler;
      inputs.push(input);
    });
    const wasConnected = this.devices.length > 0;
    this.devices = inputs.map((i) => i.name || 'MIDI keyboard');
    this.status = inputs.length ? 'connected' : 'no-device';
    if (wasConnected && !inputs.length) this.bus.releaseSource('midi');
    this._emit();
  }

  _onMessage(e) {
    const data = e.data;
    if (!data || data.length < 2) return;
    const status = data[0];
    const cmd = status & 0xf0;
    const channel = status & 0x0f;
    if (channel === 9 && this.ignoreDrumChannel()) return;
    let t = e.timeStamp;
    const now = performance.now();
    if (!(t > 0) || t > now + 50 || t < now - 2000) t = now;
    const d1 = data[1];
    const d2 = data.length > 2 ? data[2] : 0;
    if (cmd === 0x90 && d2 > 0) this.bus.noteOn(d1, d2 / 127, t, 'midi');
    else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) this.bus.noteOff(d1, t, 'midi');
    else if (cmd === 0xb0 && d1 === 64) this.bus.pedal(d2 >= 64, t, 'midi');
    else if (cmd === 0xb0 && (d1 === 123 || d1 === 120)) this.bus.releaseSource('midi');
  }
}

// ---------- computer keyboard ----------

// Two rows like a DAW: A=C, W=C#, S=D ... K=C, O=C#, L=D, P=D#, ;=E
const KEYMAP = {
  KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7,
  KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11, KeyK: 12, KeyO: 13, KeyL: 14,
  KeyP: 15, Semicolon: 16,
};

export function attachComputerKeys(bus, { onOctave, isEnabled = () => true } = {}) {
  let base = 60;
  const held = new Map();
  const down = (e) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target) || !isEnabled()) return;
    if (e.code === 'KeyZ' || e.code === 'KeyX') {
      base = Math.max(24, Math.min(96, base + (e.code === 'KeyZ' ? -12 : 12)));
      onOctave && onOctave(base);
      return;
    }
    const off = KEYMAP[e.code];
    if (off === undefined) return;
    const midi = base + off;
    held.set(e.code, midi);
    bus.noteOn(midi, 0.75, e.timeStamp || performance.now(), 'computer');
  };
  const up = (e) => {
    const midi = held.get(e.code);
    if (midi === undefined) return;
    held.delete(e.code);
    bus.noteOff(midi, e.timeStamp || performance.now(), 'computer');
  };
  const blur = () => {
    for (const midi of held.values()) bus.noteOff(midi, performance.now(), 'computer');
    held.clear();
  };
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', blur);
  return {
    get base() {
      return base;
    },
    detach() {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    },
  };
}
