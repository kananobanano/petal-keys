// Small helpers shared by the whole app: DOM building, randomness, dates.

export const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Create an HTML element.
 *   h('button', { class: 'btn', onclick: fn, 'aria-label': 'Go' }, 'Go')
 * Props starting with "on" become event listeners, `class` sets className,
 * `style` may be a string or an object, `dataset` an object. `null`/`false`
 * children are skipped and arrays are flattened.
 */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  applyProps(el, props);
  append(el, children);
  return el;
}

/** Create an SVG element (same prop rules as h, attributes set verbatim). */
export function s(tag, props, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  applyProps(el, props, true);
  append(el, children);
  return el;
}

function applyProps(el, props, isSvg = false) {
  if (!props) return;
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') {
      if (isSvg) el.setAttribute('class', v);
      else el.className = v;
    } else if (k === 'style') {
      if (typeof v === 'string') el.setAttribute('style', v);
      else Object.assign(el.style, v);
    } else if (k === 'dataset') {
      Object.assign(el.dataset, v);
    } else if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === 'html') {
      el.innerHTML = v;
    } else if (!isSvg && (k === 'value' || k === 'checked' || k === 'disabled' || k === 'hidden')) {
      el[k] = v;
    } else {
      el.setAttribute(k, v === true ? '' : String(v));
    }
  }
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

// ---------- numbers & randomness ----------

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const lerp = (a, b, t) => a + (b - a) * t;

export function randInt(lo, hi, rng = Math.random) {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

export function choice(arr, rng = Math.random) {
  return arr[Math.floor(rng() * arr.length)];
}

/** Pick one item; weights must be >= 0. Falls back to uniform if all zero. */
export function weightedChoice(items, weights, rng = Math.random) {
  let total = 0;
  for (const w of weights) total += Math.max(0, w);
  if (total <= 0) return choice(items, rng);
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= Math.max(0, weights[i]);
    if (r < 0) return items[i];
  }
  return items[items.length - 1];
}

export function shuffle(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Deterministic random generator, handy for tests. */
export function seededRng(seed = 1) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function uid(n = 10) {
  const abc = 'abcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  const bytes = (globalThis.crypto && crypto.getRandomValues)
    ? crypto.getRandomValues(new Uint8Array(n))
    : Array.from({ length: n }, () => Math.floor(Math.random() * 256));
  for (let i = 0; i < n; i++) out += abc[bytes[i] % abc.length];
  return out;
}

// ---------- dates (local calendar days, "YYYY-MM-DD") ----------

const pad2 = (n) => String(n).padStart(2, '0');

export function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function parseDayKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12); // noon avoids DST edge cases
}

export function addDays(key, delta) {
  const d = parseDayKey(key);
  d.setDate(d.getDate() + delta);
  return dayKey(d);
}

export function daysBetween(a, b) {
  return Math.round((parseDayKey(b) - parseDayKey(a)) / 86400000);
}

export function shortDate(ts) {
  if (!ts) return 'never';
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

// ---------- misc ----------

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function debounce(fn, ms) {
  let t = null;
  const wrapped = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  wrapped.flush = (...args) => {
    clearTimeout(t);
    fn(...args);
  };
  return wrapped;
}

export const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export const isCoarsePointer = () =>
  typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

/** True when the user is typing into a form field (so we ignore shortcuts). */
export function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}
