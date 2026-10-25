// Progress storage.
//
// Everything you earn lives in one small object that is auto-saved to
// localStorage after every change, and can be exported as a tiny text file
// (gzip + base64) to move between devices.
//
// Merging is conflict-free:
//  - Counters (tries, correct answers, XP per day) are kept per device and
//    only ever grow on that device. Merging takes the larger value per device,
//    so importing the same file twice never double-counts, and phone + laptop
//    progress simply add up.
//  - "Weakness" scores keep whichever copy is newer.
//  - Lesson stars and high scores keep the best value.
//  - Synced settings keep whichever copy was changed last.

import { uid, dayKey, addDays, daysBetween, debounce } from './util.js';

export const SAVE_VERSION = 1;
const SAVE_KEY = 'petalkeys.save';
const LOCAL_KEY = 'petalkeys.local';
const BACKUP_KEY = 'petalkeys.save.prev';
const PREFIX = 'PETALKEYS1:';
const LEGACY_PREFIX = 'MINTYKEYS1:';
const APP_IDS = ['petal-keys', 'minty-keys'];

/** Settings that travel with the save file. */
export const DEFAULT_SETTINGS = {
  name: '',
  instrument: 'piano',
  dailyGoal: 30,
  rushTempo: 60,
  anyOctave: true, // count the right note in any octave (kind to 25-key keyboards)
  keyLabels: 'c', // on-screen key labels: 'none' | 'c' | 'all'
  sfx: true,
  metronome: true,
  freeNames: true,
  ignoreDrumChannel: true, // ignore MIDI channel 10 (drum pads)
};

/** Settings that belong to this device only (not exported). */
export const DEFAULT_LOCAL = {
  volume: 0.85,
  calibrationMs: 0,
  midiAuto: true,
  latchChords: true,
  theme: 'system',
  kbHidden: false,
  lastExport: 0,
  nudgeAfter: 0,
  prevDay: '',
  welcomed: false,
};

export function newSave(id = uid()) {
  return {
    v: SAVE_VERSION,
    app: 'petal-keys',
    id,
    created: Date.now(),
    c: { [id]: {} },
    w: {},
    l: {},
    b: {},
    s: { ...DEFAULT_SETTINGS, _ts: 0 },
  };
}

function normalize(d) {
  const out = { ...newSave(d.id || uid()), ...d };
  out.c = d.c && typeof d.c === 'object' ? d.c : {};
  if (!out.c[out.id]) out.c[out.id] = {};
  out.w = d.w || {};
  out.l = d.l || {};
  out.b = d.b || {};
  out.s = { ...DEFAULT_SETTINGS, _ts: 0, ...(d.s || {}) };
  return out;
}

/** Upgrade older save formats. Only version 1 exists so far. */
export function migrate(d) {
  if (!d || typeof d !== 'object' || !APP_IDS.includes(d.app)) {
    throw new Error("That doesn't look like a Petal Keys save file.");
  }
  d.app = 'petal-keys';
  if ((d.v || 1) > SAVE_VERSION) {
    throw new Error('This save comes from a newer version of the app. Update the app on this device first.');
  }
  return d;
}

const clone = (o) => JSON.parse(JSON.stringify(o));

/** Merge `incoming` into `local` (keeps local's device id). Pure function. */
export function mergeSaves(local, incoming) {
  const out = clone(local);
  for (const [dev, counters] of Object.entries(incoming.c || {})) {
    const mine = out.c[dev] || (out.c[dev] = {});
    for (const [k, arr] of Object.entries(counters || {})) {
      if (!Array.isArray(arr)) continue;
      const cur = mine[k];
      if (!cur) {
        mine[k] = arr.slice();
        continue;
      }
      const len = Math.max(cur.length, arr.length);
      for (let i = 0; i < len; i++) cur[i] = Math.max(cur[i] || 0, arr[i] || 0);
    }
  }
  for (const [k, v] of Object.entries(incoming.w || {})) {
    if (!out.w[k] || (v[1] || 0) > (out.w[k][1] || 0)) out.w[k] = v.slice();
  }
  for (const [k, v] of Object.entries(incoming.l || {})) {
    if (!out.l[k] || v[0] > out.l[k][0]) out.l[k] = v.slice();
  }
  for (const [k, v] of Object.entries(incoming.b || {})) {
    if (!out.b[k] || v[0] > out.b[k][0]) out.b[k] = v.slice();
  }
  if ((incoming.s?._ts || 0) > (out.s?._ts || 0)) out.s = { ...DEFAULT_SETTINGS, ...incoming.s };
  out.created = Math.min(local.created || Date.now(), incoming.created || Date.now());
  return out;
}

/**
 * Streak with a gentle "rest day": one missed day is forgiven as long as the
 * previous forgiven day was at least 7 days earlier. Today not being done yet
 * never breaks the streak.
 */
export function computeStreak(active, today) {
  let count = 0;
  let cursor = today;
  let lastShield = null;
  let shieldUsedOn = null;
  const todayDone = active.has(today);
  if (!todayDone) cursor = addDays(today, -1);
  for (let guard = 0; guard < 5000; guard++) {
    if (active.has(cursor)) {
      count++;
      cursor = addDays(cursor, -1);
      continue;
    }
    const prev = addDays(cursor, -1);
    if (active.has(prev) && (lastShield === null || daysBetween(cursor, lastShield) >= 7)) {
      if (lastShield === null) shieldUsedOn = cursor;
      lastShield = cursor;
      cursor = prev;
      continue;
    }
    break;
  }
  if (count === 0) shieldUsedOn = null;
  const shieldReadyIn = shieldUsedOn ? Math.max(0, 7 - daysBetween(shieldUsedOn, today)) : 0;
  return { count, todayDone, shieldUsedOn, shieldReadyIn };
}

// ---------- encoding ----------

function toBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function fromBase64(str) {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function encodeSave(obj) {
  const json = JSON.stringify(obj);
  if (typeof CompressionStream === 'function') {
    try {
      const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
      const buf = new Uint8Array(await new Response(stream).arrayBuffer());
      return PREFIX + toBase64(buf);
    } catch {
      /* fall through to plain JSON */
    }
  }
  return json;
}

export async function decodeSave(text) {
  const t = String(text || '').trim();
  if (!t) throw new Error('The save is empty.');
  const prefix = t.startsWith(PREFIX) ? PREFIX : t.startsWith(LEGACY_PREFIX) ? LEGACY_PREFIX : null;
  if (prefix) {
    if (typeof DecompressionStream !== 'function') {
      throw new Error("This browser can't open compressed saves. Try Chrome or Firefox.");
    }
    let bytes;
    try {
      bytes = fromBase64(t.slice(prefix.length).replace(/\s+/g, ''));
    } catch {
      throw new Error('The save code looks cut off or changed. Copy it again in full.');
    }
    try {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      return JSON.parse(await new Response(stream).text());
    } catch {
      throw new Error('The save code looks cut off or changed. Copy it again in full.');
    }
  }
  try {
    return JSON.parse(t);
  } catch {
    throw new Error("That doesn't look like a Petal Keys save file.");
  }
}

// ---------- the store ----------

export class Store {
  constructor() {
    this.data = newSave();
    this.local = { ...DEFAULT_LOCAL };
    this.storageOk = true;
    this.listeners = new Set();
    this._saveSoon = debounce(() => this._persist(), 400);
  }

  load() {
    let raw = null;
    try {
      raw = localStorage.getItem(SAVE_KEY) || localStorage.getItem('mintykeys.save');
    } catch {
      this.storageOk = false;
    }
    let data = null;
    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch {
        try {
          data = JSON.parse(localStorage.getItem(BACKUP_KEY));
        } catch {
          data = null;
        }
      }
    }
    this.data = normalize(data && APP_IDS.includes(data.app) ? { ...data, app: 'petal-keys' } : newSave());
    try {
      const l = localStorage.getItem(LOCAL_KEY) || localStorage.getItem('mintykeys.local');
      if (l) this.local = { ...DEFAULT_LOCAL, ...JSON.parse(l) };
    } catch {
      /* keep defaults */
    }
    return this;
  }

  _persist() {
    try {
      const json = JSON.stringify(this.data);
      localStorage.setItem(SAVE_KEY, json);
      const today = dayKey();
      if (this.local.prevDay !== today) {
        localStorage.setItem(BACKUP_KEY, json);
        this.local.prevDay = today;
        this._persistLocal();
      }
      this.storageOk = true;
    } catch {
      this.storageOk = false;
    }
  }

  _persistLocal() {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(this.local));
    } catch {
      /* ignore */
    }
  }

  flush() {
    this._saveSoon.flush();
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  changed() {
    this._saveSoon();
    for (const fn of this.listeners) {
      try {
        fn();
      } catch (e) {
        console.error(e);
      }
    }
  }

  get id() {
    return this.data.id;
  }

  // ----- counters -----

  _own() {
    return this.data.c[this.data.id] || (this.data.c[this.data.id] = {});
  }

  /** Add to this device's counter: add('r:t:60', 1, 1, 830). */
  add(key, ...deltas) {
    const own = this._own();
    const arr = own[key] || (own[key] = []);
    deltas.forEach((d, i) => {
      arr[i] = Math.round((arr[i] || 0) + (d || 0));
    });
    this.changed();
  }

  /** Sum of a counter across all devices. */
  total(key) {
    const out = [];
    for (const dev of Object.values(this.data.c)) {
      const arr = dev[key];
      if (!arr) continue;
      arr.forEach((v, i) => {
        out[i] = (out[i] || 0) + v;
      });
    }
    return out;
  }

  keys(prefix) {
    const set = new Set();
    for (const dev of Object.values(this.data.c)) {
      for (const k of Object.keys(dev)) if (k.startsWith(prefix)) set.add(k);
    }
    return [...set];
  }

  // ----- weakness (exponential moving average of correctness, 0..1) -----

  ema(key) {
    return this.data.w[key]?.[0];
  }

  pushResult(key, correct, alpha = 0.35) {
    const prev = this.ema(key);
    const target = correct ? 1 : 0;
    const v = prev == null ? (correct ? 0.75 : 0.25) : prev + alpha * (target - prev);
    this.data.w[key] = [Math.round(v * 1000) / 1000, Date.now()];
    this.changed();
  }

  /** Higher weight = practise more often. Unseen items are a little favoured. */
  weight(key) {
    const e = this.ema(key);
    return e == null ? 2.2 : 1 + 3 * (1 - e);
  }

  // ----- reading stats -----

  readingStat(clef, midi) {
    const [tries = 0, ok = 0, msSum = 0, msCount = 0] = this.total(`r:${clef}:${midi}`);
    return { tries, ok, avgMs: msCount ? msSum / msCount : null, ema: this.ema(`r:${clef}:${midi}`) };
  }

  // ----- XP & streak -----

  addXp(n) {
    if (n > 0) this.add('d:' + dayKey(), n);
  }

  xpOn(day) {
    return this.total('d:' + day)[0] || 0;
  }

  xpToday() {
    return this.xpOn(dayKey());
  }

  totalXp() {
    return this.keys('d:').reduce((sum, k) => sum + (this.total(k)[0] || 0), 0);
  }

  activeDays() {
    return new Set(this.keys('d:').filter((k) => (this.total(k)[0] || 0) > 0).map((k) => k.slice(2)));
  }

  streak() {
    return computeStreak(this.activeDays(), dayKey());
  }

  // ----- lessons -----

  lesson(id) {
    const e = this.data.l[id];
    return { stars: e ? e[0] : 0, done: !!e && e[0] > 0, unlocked: !!e };
  }

  completeLesson(id, stars) {
    const cur = this.data.l[id];
    if (!cur || stars > cur[0]) this.data.l[id] = [stars, Date.now()];
    this.changed();
  }

  unlockLesson(id) {
    if (!this.data.l[id]) this.data.l[id] = [0, Date.now()];
    this.changed();
  }

  // ----- best scores (higher is better) -----

  best(key) {
    return this.data.b[key]?.[0];
  }

  setBest(key, value) {
    const cur = this.data.b[key];
    if (!cur || value > cur[0]) {
      this.data.b[key] = [value, Date.now()];
      this.changed();
      return true;
    }
    return false;
  }

  // ----- settings -----

  get settings() {
    return this.data.s;
  }

  set(key, value) {
    this.data.s[key] = value;
    this.data.s._ts = Date.now();
    this.changed();
  }

  getLocal(key) {
    return this.local[key];
  }

  setLocal(key, value) {
    this.local[key] = value;
    this._persistLocal();
    for (const fn of this.listeners) {
      try {
        fn();
      } catch (e) {
        console.error(e);
      }
    }
  }

  // ----- backup -----

  hasProgress() {
    return this.totalXp() > 0 || Object.keys(this.data.l).length > 0;
  }

  async exportText() {
    this.flush();
    const text = await encodeSave(this.data);
    this.setLocal('lastExport', Date.now());
    return text;
  }

  async importText(text) {
    const incoming = migrate(await decodeSave(text));
    const xpBefore = this.totalXp();
    const lessonsBefore = Object.values(this.data.l).filter((v) => v[0] > 0).length;
    this.data = normalize(mergeSaves(this.data, incoming));
    this._persist();
    this.changed();
    return {
      addedXp: this.totalXp() - xpBefore,
      addedLessons: Object.values(this.data.l).filter((v) => v[0] > 0).length - lessonsBefore,
    };
  }

  reset() {
    this.data = newSave();
    this._persist();
    this.changed();
  }
}
