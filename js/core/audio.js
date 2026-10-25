// Sound: the keyboard has no speakers, so the app is its voice.
//
// A small sampler built straight on Web Audio: recorded grand piano notes
// (Salamander Grand Piano, CC-BY 3.0, Alexander Holm) are pitch-shifted to
// the nearest key. Until the samples have loaded, a soft built-in synth plays
// instead, so there is never silence. Also handles the sustain pedal, the
// metronome and little sound effects.

const SAMPLE_FILES = [
  'A1', 'C2', 'Ds2', 'Fs2', 'A2', 'C3', 'Ds3', 'Fs3', 'A3', 'C4', 'Ds4',
  'Fs4', 'A4', 'C5', 'Ds5', 'Fs5', 'A5', 'C6', 'Ds6', 'Fs6', 'A6', 'C7',
];
const BASE_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function fileMidi(name) {
  const m = /^([A-G])(s?)(\d)$/.exec(name);
  return (Number(m[3]) + 1) * 12 + BASE_PC[m[1]] + (m[2] ? 1 : 0);
}

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export const INSTRUMENTS = [
  { id: 'piano', label: 'Grand piano' },
  { id: 'epiano', label: 'Electric piano' },
  { id: 'musicbox', label: 'Music box' },
  { id: 'marimba', label: 'Marimba' },
  { id: 'organ', label: 'Organ' },
  { id: 'synth', label: 'Soft synth' },
  { id: 'pad', label: 'Dreamy pad' },
];
const MAX_VOICES = 40;

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.samples = []; // [{ midi, buffer, offset }]
    this.live = new Map(); // midi -> voice currently held by a key
    this.voices = []; // every sounding voice (for stealing)
    this.sustain = false;
    this.volume = 0.85;
    this.sfxOn = true;
    this.instrument = 'piano';
    this.loadState = 'idle'; // idle | loading | ready | failed
    this.onstate = null;
  }

  get running() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** Create/resume the AudioContext. Must first run inside a tap or click. */
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try {
        this.ctx = new AC({ latencyHint: 'interactive' });
      } catch {
        this.ctx = new AC();
      }
      const ctx = this.ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.volume;
      this.comp = ctx.createDynamicsCompressor();
      this.comp.threshold.value = -14;
      this.comp.knee.value = 12;
      this.comp.ratio.value = 4;
      this.comp.attack.value = 0.003;
      this.comp.release.value = 0.2;
      this.pianoBus = ctx.createGain();
      this.sfxBus = ctx.createGain();
      this.sfxBus.gain.value = 0.55;
      this.pianoBus.connect(this.master);
      this.sfxBus.connect(this.master);
      this.master.connect(this.comp);
      this.comp.connect(ctx.destination);
      ctx.addEventListener?.('statechange', () => this.onstate && this.onstate(ctx.state));
    }
    if (this.ctx.state === 'suspended' || this.ctx.state === 'interrupted') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  /** Fetch and decode the piano samples (relative to the page). */
  loadPiano(base = 'assets/piano/') {
    if (this.loadState === 'loading' || this.loadState === 'ready') return this._loading;
    if (!this.ctx) return Promise.resolve(false);
    this.loadState = 'loading';
    const ctx = this.ctx;
    this._loading = Promise.all(
      SAMPLE_FILES.map(async (name) => {
        try {
          const res = await fetch(base + name + '.mp3');
          if (!res.ok) throw new Error(res.status);
          const buf = await res.arrayBuffer();
          const audio = await new Promise((ok, fail) => {
            const p = ctx.decodeAudioData(buf, ok, fail);
            if (p && p.then) p.then(ok, fail);
          });
          return { midi: fileMidi(name), buffer: audio, offset: leadingSilence(audio) };
        } catch {
          return null;
        }
      }),
    ).then((list) => {
      this.samples = list.filter(Boolean).sort((a, b) => a.midi - b.midi);
      this.loadState = this.samples.length >= 8 ? 'ready' : 'failed';
      return this.loadState === 'ready';
    });
    return this._loading;
  }

  _nearest(midi) {
    let best = null;
    let bestD = Infinity;
    for (const s of this.samples) {
      const d = Math.abs(s.midi - midi);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
  }

  /**
   * Build one voice: source -> tone filter -> envelope -> release gate -> bus.
   * The release gate is separate so a note can be let go at any moment
   * without fighting the envelope.
   */
  _voice(midi, vel, when, bus = this.pianoBus) {
    const ctx = this.ctx;
    const t = Math.max(when || 0, ctx.currentTime);
    const env = ctx.createGain();
    const gate = ctx.createGain();
    env.connect(gate);
    gate.connect(bus);
    const v = Math.max(0.05, Math.min(1, vel));
    const amp = 0.16 + 0.84 * Math.pow(v, 1.5);
    const sample = this.instrument === 'piano' && this.loadState === 'ready' ? this._nearest(midi) : null;
    let stops = [];
    let tc = 0.11;

    if (sample) {
      const src = ctx.createBufferSource();
      src.buffer = sample.buffer;
      src.playbackRate.value = Math.pow(2, (midi - sample.midi) / 12);
      const tone = ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = 1100 + 12000 * Math.pow(v, 1.4);
      tone.Q.value = 0.4;
      src.connect(tone);
      tone.connect(env);
      env.gain.setValueAtTime(amp, t);
      src.start(t, sample.offset);
      stops.push(src);
    } else {
      const kind = this.instrument === 'piano' ? 'soft' : this.instrument;
      ({ stops, tc } = this._synth(kind, midi, amp, t, env));
    }

    const voice = { midi, gate, stops, start: t, released: false, pedal: false, tc };
    stops[0].onended = () => {
      try {
        gate.disconnect();
      } catch {
        /* already gone */
      }
      const i = this.voices.indexOf(voice);
      if (i >= 0) this.voices.splice(i, 1);
    };
    this.voices.push(voice);
    if (this.voices.length > MAX_VOICES) this._release(this.voices[0], ctx.currentTime, 0.03);
    return voice;
  }

  /**
   * Built-in instruments, made from oscillators. Each returns the sources to
   * stop and a release time constant (how long the note rings after letting go).
   */
  _synth(kind, midi, amp, t, env) {
    const ctx = this.ctx;
    const f = mtof(midi);
    const stops = [];
    const osc = (type, freq, gain, dest = env, detune = 0) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      o.detune.value = detune;
      const g = ctx.createGain();
      g.gain.value = gain;
      o.connect(g);
      g.connect(dest);
      o.start(t);
      stops.push(o);
      return { o, g };
    };
    const decay = (peak, mid, midAt, end) => {
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(peak, t + 0.005);
      if (mid) env.gain.exponentialRampToValueAtTime(mid, t + midAt);
      env.gain.exponentialRampToValueAtTime(0.0006, t + end);
      for (const o of stops) o.stop(t + end + 0.05);
    };
    const hold = (peak, sustain, attack = 0.01) => {
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(peak, t + attack);
      env.gain.setTargetAtTime(sustain, t + attack, 0.25);
    };

    switch (kind) {
      case 'epiano': {
        // FM "tine" electric piano: a bright attack that mellows.
        const car = osc('sine', f, 1);
        const mod = ctx.createOscillator();
        mod.frequency.value = f;
        const idx = ctx.createGain();
        idx.gain.setValueAtTime(f * 2.6, t);
        idx.gain.exponentialRampToValueAtTime(f * 0.35, t + 0.7);
        mod.connect(idx);
        idx.connect(car.o.frequency);
        mod.start(t);
        stops.push(mod);
        osc('sine', f * 2, 0.12);
        decay(amp * 0.5, amp * 0.2, 1.1, 4);
        return { stops, tc: 0.14 };
      }
      case 'musicbox': {
        osc('sine', f * 2, 0.7);
        osc('sine', f * 6, 0.18);
        osc('sine', f * 9.2, 0.05);
        decay(amp * 0.6, null, 0, 1.8);
        return { stops, tc: 0.3 };
      }
      case 'marimba': {
        osc('sine', f, 1);
        const hit = osc('sine', f * 4, 0.35);
        hit.g.gain.setValueAtTime(0.35, t);
        hit.g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        decay(amp * 0.42, null, 0, Math.max(0.5, 1.4 - (midi - 48) * 0.012));
        return { stops, tc: 0.12 };
      }
      case 'organ': {
        osc('sine', f, 0.5);
        osc('sine', f * 2, 0.3);
        osc('sine', f * 3, 0.15);
        osc('sine', f * 4, 0.08);
        hold(amp * 0.34, amp * 0.3, 0.012);
        return { stops, tc: 0.035 };
      }
      case 'synth': {
        const filt = ctx.createBiquadFilter();
        filt.type = 'lowpass';
        filt.Q.value = 2;
        filt.frequency.setValueAtTime(Math.min(16000, f * 9), t);
        filt.frequency.exponentialRampToValueAtTime(Math.min(12000, f * 3), t + 0.45);
        filt.connect(env);
        osc('sawtooth', f, 0.5, filt, -7);
        osc('sawtooth', f, 0.5, filt, 7);
        hold(amp * 0.26, amp * 0.17, 0.01);
        return { stops, tc: 0.18 };
      }
      case 'pad': {
        const filt = ctx.createBiquadFilter();
        filt.type = 'lowpass';
        filt.frequency.value = Math.min(9000, 900 + f * 2);
        filt.Q.value = 0.7;
        filt.connect(env);
        osc('sawtooth', f, 0.4, filt, -11);
        osc('sawtooth', f, 0.4, filt, 11);
        osc('triangle', f / 2, 0.5, filt);
        hold(amp * 0.24, amp * 0.2, 0.28);
        return { stops, tc: 0.55 };
      }
      default: {
        // soft electric-piano-ish sound used while the piano samples load
        osc('triangle', f, 1);
        osc('sine', f * 2, 0.25);
        decay(amp * 0.5, amp * 0.175, 0.5, 3.5);
        return { stops, tc: 0.11 };
      }
    }
  }

  _release(voice, at, tc = voice ? voice.tc || 0.11 : 0.11) {
    if (!voice || voice.released) return;
    voice.released = true;
    const t = Math.max(at, this.ctx.currentTime);
    voice.gate.gain.setTargetAtTime(0, t, tc);
    for (const s of voice.stops) {
      try {
        s.stop(t + tc * 8);
      } catch {
        /* may already be stopped */
      }
    }
  }

  // ----- live playing -----

  noteOn(midi, velocity = 0.75) {
    if (!this.ensure()) return;
    const prev = this.live.get(midi);
    if (prev) this._release(prev, this.ctx.currentTime, 0.025);
    const v = this._voice(midi, velocity, 0);
    this.live.set(midi, v);
  }

  noteOff(midi) {
    const v = this.live.get(midi);
    if (!v || !this.ctx) return;
    this.live.delete(midi);
    if (this.sustain) v.pedal = true;
    else this._release(v, this.ctx.currentTime);
  }

  setSustain(down) {
    this.sustain = down;
    if (!down && this.ctx) {
      for (const v of this.voices) {
        if (v.pedal && !v.released) this._release(v, this.ctx.currentTime);
      }
    }
  }

  releaseAll() {
    if (!this.ctx) return;
    for (const v of this.voices) this._release(v, this.ctx.currentTime, 0.05);
    this.live.clear();
    this.sustain = false;
  }

  // ----- scheduled playback (listening, ear training) -----

  get now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  /** Play a note at an exact AudioContext time. */
  playNote(midi, { when = 0, dur = 0.9, vel = 0.7 } = {}) {
    if (!this.ensure()) return;
    const t = when || this.ctx.currentTime + 0.02;
    const v = this._voice(midi, vel, t);
    this._release(v, t + dur);
  }

  click(when, accent = false) {
    if (!this.ensure()) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = accent ? 1568 : 1175;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(accent ? 0.55 : 0.32, when + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.07);
    o.connect(g);
    g.connect(this.sfxBus);
    o.start(when);
    o.stop(when + 0.09);
  }

  /** Little feedback sounds: 'good', 'soft-wrong', 'done', 'tick'. */
  sfx(name) {
    if (!this.sfxOn || !this.ensure()) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.01;
    const blip = (freq, at, dur, type = 'sine', gain = 0.22) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(gain, at + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(g);
      g.connect(this.sfxBus);
      o.start(at);
      o.stop(at + dur + 0.02);
    };
    if (name === 'good') {
      blip(1318.5, t, 0.16);
      blip(1760, t + 0.07, 0.22);
    } else if (name === 'soft-wrong') {
      blip(392, t, 0.18, 'triangle', 0.12);
      blip(311, t + 0.09, 0.24, 'triangle', 0.1);
    } else if (name === 'done') {
      [1046.5, 1318.5, 1568, 2093].forEach((f, i) => blip(f, t + i * 0.08, 0.35, 'sine', 0.18));
    } else if (name === 'tick') {
      blip(2400, t, 0.04, 'sine', 0.08);
    }
  }

  // ----- clocks -----

  /**
   * performance.now() time at which audio scheduled for `ctxTime` will be
   * heard, so key presses can be compared with what you hear.
   */
  perfTimeOf(ctxTime) {
    const ctx = this.ctx;
    if (!ctx) return performance.now();
    if (ctx.getOutputTimestamp) {
      const ts = ctx.getOutputTimestamp();
      if (ts && ts.performanceTime > 0 && ts.contextTime > 0) {
        return ts.performanceTime + (ctxTime - ts.contextTime) * 1000;
      }
    }
    const lat = (ctx.outputLatency || 0) + (ctx.baseLatency || 0);
    return performance.now() + (ctxTime - ctx.currentTime + lat) * 1000;
  }
}

/** Skip any quiet lead-in at the start of a decoded sample (keeps it snappy). */
function leadingSilence(buffer) {
  const data = buffer.getChannelData(0);
  const limit = Math.min(data.length, Math.floor(buffer.sampleRate * 0.08));
  for (let i = 0; i < limit; i++) {
    if (Math.abs(data[i]) > 0.004) return Math.max(0, (i - 16) / buffer.sampleRate);
  }
  return 0;
}
