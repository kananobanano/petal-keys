// Sheet music renderer (SVG). Draws treble, bass or grand staves with
// noteheads, stems, beams, flags, ledger lines, accidentals, rests and dots,
// using SMuFL glyphs from the Bravura font. Kept small and hand-made so notes
// can be coloured, labelled and followed by a playhead.
//
// Positions are worked out in staff spaces ("sp", the gap between two staff
// lines) and multiplied by the staff-space size in pixels at the end.

import { s as svg } from './util.js';
import { diatonicIndex, midiOf } from './music.js';

const G = {
  gClef: '', fClef: '', brace: '',
  whole: '', half: '', black: '',
  flat: '', natural: '', sharp: '',
  restW: '', restH: '', restQ: '', rest8: '', rest16: '',
  flag8Up: '', flag8Down: '', flag16Up: '', flag16Down: '', dot: '',
};
const tsGlyph = (d) => String(d).split('').map((c) => String.fromCharCode(0xe080 + Number(c))).join('');

// Glyph widths in staff spaces (measured from Bravura).
const W = {
  head: 1.18, whole: 1.688, sharp: 0.996, flat: 0.904, natural: 0.672,
  gClef: 2.684, fClef: 2.736, ts: 1.88, restQ: 1.08, restW: 1.13, restH: 1.13, rest8: 1.0, rest16: 1.28,
  flag: 1.06, stem: 0.12, staffLine: 0.13, ledger: 0.16, ledgerExt: 0.4, beam: 0.5,
};

export const CLEFS = {
  treble: { bottom: diatonicIndex({ letter: 'E', octave: 4 }), glyph: G.gClef, glyphP: 2, width: W.gClef },
  bass: { bottom: diatonicIndex({ letter: 'G', octave: 2 }), glyph: G.fClef, glyphP: 6, width: W.fClef },
};

/** Staff position: 0 = bottom line, 8 = top line, 4 = middle line. */
export const staffPos = (note, clef) => diatonicIndex(note) - CLEFS[clef].bottom;

/** Pick treble or bass for a set of notes. */
export function clefFor(notes) {
  if (!notes.length) return 'treble';
  const avg = notes.reduce((s, n) => s + midiOf(n), 0) / notes.length;
  return avg >= 59 ? 'treble' : 'bass';
}

const ADV = (dur) => 1.75 + 2.45 * Math.sqrt(dur);
const isDotted = (dur) => [3, 1.5, 0.75, 0.375].some((d) => Math.abs(dur - d) < 1e-6);
const baseDur = (dur) => (isDotted(dur) ? dur / 1.5 : dur);
const headGlyph = (dur) => (dur >= 4 ? G.whole : dur >= 2 ? G.half : G.black);
const headWidth = (dur) => (dur >= 4 ? W.whole : W.head);

function restGlyph(dur) {
  const b = baseDur(dur);
  if (b >= 4) return [G.restW, W.restW];
  if (b >= 2) return [G.restH, W.restH];
  if (b >= 1) return [G.restQ, W.restQ];
  if (b >= 0.5) return [G.rest8, W.rest8];
  return [G.rest16, W.rest16];
}

// Key signatures: staff positions on the treble staff (bass is 2 lower).
const SHARP_POS = [8, 5, 9, 6, 3, 7, 4];
const FLAT_POS = [4, 7, 3, 6, 2, 5, 1];
const SHARP_ORDER = 'FCGDAEB';
const FLAT_ORDER = 'BEADGCF';

/** Accidental of each letter in a key, e.g. fifths 1 -> { F: 1 }. */
export function keyAccidentals(fifths = 0) {
  const out = {};
  if (fifths > 0) for (let i = 0; i < Math.min(7, fifths); i++) out[SHARP_ORDER[i]] = 1;
  if (fifths < 0) for (let i = 0; i < Math.min(7, -fifths); i++) out[FLAT_ORDER[i]] = -1;
  return out;
}

function defaultStemDir(part) {
  const hi = part[part.length - 1].p;
  const lo = part[0].p;
  const up = hi - 4;
  const down = 4 - lo;
  if (up === down) return hi >= 4 ? 'down' : 'up';
  return up > down ? 'down' : 'up';
}

/**
 * Render a score into `target` (which is emptied).
 *
 * score = {
 *   clef: 'treble' | 'bass' | 'grand',
 *   time: [4, 4] | null,
 *   measures: [{ events: [{ id, beat, dur, notes: [spelled], rest }] }],
 * }
 * opts = {
 *   width, maxSpace, minSpace, wrapSpace,
 *   free: true   -> evenly spaced events, no bars (flash cards, free play)
 *   states: { [eventId]: 'good' | 'bad' | 'active' | ... },
 *   noteStates: { 'eventId:noteIndex': cls },
 *   ghosts: [{ absBeat, note, cls }],     // extra notes someone played
 *   judgements: { [eventId]: { label, cls } },
 *   noteNames: bool, extent: { treble: [minP, maxP], bass: [...] },
 *   label: accessible description
 * }
 * Returns a layout with beatToX(), setPlayhead(beat|null) and the svg.
 */
export function renderStaff(target, score, opts = {}) {
  const width = Math.max(120, opts.width || target.clientWidth || 360);
  const staves = score.staves || (score.clef === 'grand' ? ['treble', 'bass'] : [score.clef || 'treble']);
  const fifths = Math.max(-7, Math.min(7, score.key || 0));
  const keyAcc = keyAccidentals(fifths);
  const free = !!opts.free;
  const time = free ? null : score.time || null;
  const beatsPerBar = time ? time[0] * (4 / time[1]) : 4;
  const maxSpace = opts.maxSpace || 13;
  const minSpace = opts.minSpace || 9;
  const wrapSpace = opts.wrapSpace || 9.5;
  const states = opts.states || {};
  const noteStates = opts.noteStates || {};

  // ---------- prepare events ----------
  let startAcc = 0;
  const measures = (score.measures || []).map((m, mi) => {
    const start = startAcc;
    const len = m.beats || beatsPerBar;
    startAcc += len;
    const events = m.events.map((ev) => {
      const parts = staves.map(() => []);
      (ev.notes || []).forEach((n, i) => {
        let si = 0;
        if (n.si != null) si = Math.min(staves.length - 1, n.si);
        else if (staves.length > 1) si = n.staff ? staves.indexOf(n.staff) : midiOf(n) >= 60 ? 0 : 1;
        parts[si].push({ n, i, p: staffPos(n, staves[si]), acc: null, dx: 0 });
      });
      parts.forEach((pt) => {
        pt.sort((a, b) => a.p - b.p);
        const withDur = pt.find((x) => x.n.dur != null);
        pt.dur = withDur ? withDur.n.dur : ev.dur;
      });
      const rest = !!ev.rest || !(ev.notes || []).length;
      return { ...ev, parts, absBeat: start + (ev.beat || 0), rest, restSi: ev.si || 0 };
    });
    return { index: mi, start, len, events, label: m.label };
  });

  // Accidentals: carry through the bar (key of C), or show all in free mode.
  for (const m of measures) {
    const state = staves.map(() => new Map());
    for (const ev of m.events) {
      ev.parts.forEach((part, si) => {
        if (free) state[si].clear();
        for (const x of part) {
          const key = x.n.letter + x.n.octave;
          const cur = state[si].has(key) ? state[si].get(key) : free ? 0 : keyAcc[x.n.letter] || 0;
          if (x.n.acc !== cur) x.acc = x.n.acc === 1 ? 'sharp' : x.n.acc === -1 ? 'flat' : 'natural';
          state[si].set(key, x.n.acc);
        }
      });
    }
  }

  // Beam groups: consecutive eighths inside the same beat (single staff only).
  const beams = [];
  if (staves.length === 1 && !free) {
    for (const m of measures) {
      let group = [];
      const flush = () => {
        if (group.length >= 2) beams.push(group);
        group = [];
      };
      for (const ev of m.events) {
        const eighth = !ev.rest && baseDur(ev.dur) <= 0.5 && !isDotted(ev.dur) && ev.parts[0].length > 0;
        if (eighth && (!group.length || Math.floor(group[0].beat + 1e-6) === Math.floor(ev.beat + 1e-6))) {
          group.push(ev);
        } else {
          flush();
          if (eighth) group.push(ev);
        }
      }
      flush();
    }
  }
  for (const g of beams) {
    let sum = 0;
    let cnt = 0;
    for (const ev of g) for (const x of ev.parts[0]) {
      sum += x.p - 4;
      cnt++;
    }
    const dir = sum / cnt >= 0 ? 'down' : 'up';
    for (const ev of g) {
      ev.beam = g;
      ev.parts[0].dir = dir;
    }
  }

  // Stem directions, displaced heads (seconds) and accidental columns.
  for (const m of measures) for (const ev of m.events) {
    ev.leftExt = 0;
    ev.rightExt = ev.rest ? restGlyph(ev.dur)[1] : headWidth(ev.dur);
    ev.parts.forEach((part) => {
      if (!part.length) return;
      if (!part.dir) part.dir = defaultStemDir(part);
      const dir = part.dir;
      if (dir === 'up') {
        for (let i = 1; i < part.length; i++) if (part[i].p - part[i - 1].p === 1 && part[i - 1].dx === 0) part[i].dx = 1;
      } else {
        for (let i = part.length - 2; i >= 0; i--) if (part[i + 1].p - part[i].p === 1 && part[i + 1].dx === 0) part[i].dx = -1;
      }
      const hw = headWidth(part.dur);
      const anyLeft = part.some((x) => x.dx < 0);
      const anyRight = part.some((x) => x.dx > 0);
      // accidental columns, top note first
      const withAcc = part.filter((x) => x.acc).sort((a, b) => b.p - a.p);
      const cols = [];
      for (const x of withAcc) {
        let c = 0;
        while (cols[c] && cols[c].some((p) => Math.abs(p - x.p) < 6)) c++;
        (cols[c] = cols[c] || []).push(x.p);
        x.accCol = c;
      }
      let off = 0.2 + (anyLeft ? hw : 0);
      const colX = [];
      cols.forEach((_, c) => {
        const w = Math.max(...withAcc.filter((x) => x.accCol === c).map((x) => W[x.acc]));
        off += w;
        colX[c] = -off;
        off += 0.12;
      });
      withAcc.forEach((x) => {
        x.accX = colX[x.accCol];
      });
      ev.leftExt = Math.max(ev.leftExt, withAcc.length ? off : anyLeft ? hw : 0);
      let right = hw * (anyRight ? 2 : 1);
      if (isDotted(part.dur)) right += 0.9;
      if (!ev.beam && baseDur(part.dur) <= 0.5 && dir === 'up') right += 0.85;
      ev.rightExt = Math.max(ev.rightExt, right);
    });
  }

  // ---------- horizontal layout (natural, in sp) ----------
  if (free) {
    let x = 1.2;
    for (const ev of measures[0]?.events || []) {
      x += ev.leftExt;
      ev.headLeft = x;
      x += Math.max(ev.rightExt + 1.4, opts.freeAdvance || 4.2);
    }
    if (measures[0]) {
      measures[0].xStart = 0;
      measures[0].xEnd = x;
      measures[0].width = x;
    }
  } else {
    let x = 0;
    for (const m of measures) {
      m.xStart = x;
      x += 1.1;
      m.events.forEach((ev, i) => {
        if (i === 0) ev.headLeft = x + ev.leftExt;
        else {
          const prev = m.events[i - 1];
          ev.headLeft = Math.max(prev.headLeft + ADV(prev.dur), prev.headLeft + prev.rightExt + 0.6 + ev.leftExt);
        }
      });
      const last = m.events[m.events.length - 1];
      m.xEnd = last ? Math.max(last.headLeft + ADV(last.dur) * 0.82, last.headLeft + last.rightExt + 1.0) : x + 4;
      m.width = m.xEnd - m.xStart;
      x = m.xEnd;
    }
  }

  const pad = staves.length > 1 ? 1.9 : 0.6;
  const clefW = 0.5 + Math.max(...staves.map((c) => CLEFS[c].width)) + 0.9;
  const tsW = time ? W.ts + 0.9 : 0;
  const keyW = fifths ? Math.abs(fifths) * 1.02 + 0.5 : 0;
  const endPad = 0.5;

  // ---------- systems (lines) ----------
  let systems;
  const totalNat = pad + clefW + keyW + tsW + measures.reduce((s, m) => s + m.width, 0) + endPad;
  if (free || measures.length <= 1 || width / totalNat >= minSpace) {
    systems = [{ measures: measures.slice(), first: true }];
  } else {
    systems = [];
    let cur = [];
    let curW = pad + clefW + keyW + tsW;
    for (const m of measures) {
      if (cur.length && (curW + m.width + endPad) * wrapSpace > width) {
        systems.push({ measures: cur, first: systems.length === 0 });
        cur = [];
        curW = pad + clefW + keyW;
      }
      cur.push(m);
      curW += m.width;
    }
    if (cur.length) systems.push({ measures: cur, first: systems.length === 0 });
  }
  let sp = maxSpace;
  for (const sys of systems) {
    sys.header = pad + clefW + keyW + (sys.first ? tsW : 0);
    sys.natural = sys.header + sys.measures.reduce((s, m) => s + m.width, 0) + endPad;
    sp = Math.min(sp, width / sys.natural);
  }
  sp = Math.max(sp, opts.absMinSpace || 5.5);
  const contentW = width / sp; // in sp

  // Stretch each system to the full width (never squeeze).
  for (const sys of systems) {
    const natContent = sys.measures.reduce((s, m) => s + m.width, 0);
    const avail = contentW - sys.header - endPad;
    let f = free || opts.noStretch ? 1 : Math.max(1, avail / natContent);
    // a short last line keeps its natural spacing instead of stretching thin
    if (!free && systems.length > 1 && sys === systems[systems.length - 1]) f = Math.min(f, 1.35);
    const origin = sys.measures[0] ? sys.measures[0].xStart : 0;
    for (const m of sys.measures) {
      const ms = m.xStart;
      m.sx = sys.header + (ms - origin) * f;
      m.ex = sys.header + (m.xEnd - origin) * f;
      for (const ev of m.events) {
        ev.x = sys.header + (ev.headLeft - origin) * f;
        // A lone whole rest sits in the middle of its bar.
        if (ev.rest && m.events.length === 1 && ev.dur >= m.len - 1e-6) {
          ev.x = (m.sx + m.ex) / 2 - W.restW / 2;
        }
      }
    }
    if (free && opts.center && sys.measures[0]) {
      const m = sys.measures[0];
      const first = m.events[0];
      const startX = first ? first.x - first.leftExt : sys.header;
      const lastEv = m.events[m.events.length - 1];
      const endX = lastEv ? lastEv.x + lastEv.rightExt : startX;
      const shift = (sys.header + (contentW - endPad - sys.header) / 2) - (startX + endX) / 2;
      if (shift > 0) for (const ev of m.events) ev.x += shift;
    }
    if (free && opts.alignRight && sys.measures[0]) {
      const m = sys.measures[0];
      const shift = contentW - endPad - m.ex;
      if (shift > 0) {
        m.sx += shift;
        m.ex += shift;
        for (const ev of m.events) ev.x += shift;
      }
    }
  }

  // ---------- stems & vertical extents ----------
  for (const m of measures) for (const ev of m.events) {
    if (ev.rest) continue;
    ev.parts.forEach((part) => {
      if (!part.length) return;
      const lo = part[0].p;
      const hi = part[part.length - 1].p;
      if (part.dur >= 4) {
        part.tipP = null;
        return;
      }
      const extra = baseDur(part.dur) <= 0.25 ? 1 : 0;
      part.tipP = part.dir === 'up' ? Math.max(hi + 7 + extra, 4) : Math.min(lo - 7 - extra, 4);
    });
  }
  // Beams: straight line between the first and last stem tips, gentle slope.
  for (const g of beams) {
    const dir = g[0].parts[0].dir;
    const hw = W.head;
    const pts = g.map((ev) => {
      const part = ev.parts[0];
      const x = dir === 'up' ? ev.x + hw - W.stem / 2 : ev.x + W.stem / 2;
      const end = dir === 'up' ? part[part.length - 1].p : part[0].p;
      return { ev, x, nat: part.tipP, end };
    });
    const a = pts[0];
    const b = pts[pts.length - 1];
    let slope = (b.nat - a.nat) / Math.max(0.5, b.x - a.x); // in p per sp
    slope = Math.max(-0.5, Math.min(0.5, slope));
    let a0 = a.nat;
    // keep every stem at least 5 positions (2.5 sp) long
    for (const p of pts) {
      const lineP = a0 + slope * (p.x - a.x);
      if (dir === 'up' && lineP < p.end + 5) a0 += p.end + 5 - lineP;
      if (dir === 'down' && lineP > p.end - 5) a0 -= lineP - (p.end - 5);
    }
    for (const p of pts) {
      p.ev.parts[0].tipP = a0 + slope * (p.x - a.x);
      p.ev.stemX = p.x;
    }
    g.line = { x1: a.x, x2: b.x, p1: a0, p2: a0 + slope * (b.x - a.x), dir };
  }

  // Vertical extents per staff (positions), including stems and ghosts.
  const ext = staves.map((c) => {
    const e = opts.extent && opts.extent[c];
    return { min: e ? e[0] : 0, max: e ? e[1] : 8 };
  });
  for (const m of measures) for (const ev of m.events) {
    ev.parts.forEach((part, si) => {
      for (const x of part) {
        ext[si].min = Math.min(ext[si].min, x.p - 1);
        ext[si].max = Math.max(ext[si].max, x.p + 1 + (x.acc === 'flat' ? 2 : x.acc ? 1 : 0));
      }
      if (part.tipP != null) {
        ext[si].min = Math.min(ext[si].min, part.tipP);
        ext[si].max = Math.max(ext[si].max, part.tipP);
      }
    });
  }
  for (const gh of opts.ghosts || []) {
    const si = staves.length > 1 ? (midiOf(gh.note) >= 60 ? 0 : 1) : 0;
    const p = staffPos(gh.note, staves[si]);
    ext[si].min = Math.min(ext[si].min, p - 1);
    ext[si].max = Math.max(ext[si].max, p + 1);
  }

  const judgeRow = opts.judgements ? 1.9 : 0;
  const top = Math.max(2.2, (ext[0].max - 8) / 2 + 1.1) + judgeRow;
  const lastExt = ext[ext.length - 1];
  let maxStack = 1;
  if (opts.noteNames) for (const m of measures) for (const ev of m.events) maxStack = Math.max(maxStack, (ev.notes || []).length);
  const namesRow = opts.noteNames ? 2.6 + (maxStack - 1) * 1.45 : 0;
  const bottom = Math.max(2.2, -lastExt.min / 2 + 1.1) + namesRow;
  let staffGap = 0;
  if (staves.length > 1) staffGap = Math.max(5.5, -ext[0].min / 2 + (ext[1].max - 8) / 2 + 1.2);
  const sysHeight = top + 4 + (staves.length > 1 ? staffGap + 4 : 0) + bottom;
  const sysGap = 1.2;
  const totalH = systems.length * sysHeight + (systems.length - 1) * sysGap;

  // ---------- draw ----------
  const P = (v) => +(v * sp).toFixed(2);
  const root = svg('svg', {
    class: 'staff-svg',
    viewBox: `0 0 ${P(contentW)} ${P(totalH)}`,
    width: P(contentW),
    height: P(totalH),
    role: 'img',
    'aria-label': opts.label || 'Sheet music',
    preserveAspectRatio: 'xMinYMin meet',
  });
  const music = svg('g', { 'font-family': 'MK Bravura', 'font-size': P(4) });
  root.append(music);
  const text = (glyph, x, y, cls) => svg('text', { x: P(x), y: P(y), class: cls || 'mus' }, glyph);
  const line = (x1, y1, x2, y2, w, cls) =>
    svg('line', { x1: P(x1), y1: P(y1), x2: P(x2), y2: P(y2), 'stroke-width': Math.max(1, +(w * sp).toFixed(2)), class: cls });

  const anchors = []; // per system [{beat, x}]
  const sysY = [];
  const heads = new Map(); // "eventId:noteIndex" -> { x, y, sys, k, dir, hw }
  const order = [];
  const playheads = [];
  const eventX = {};

  systems.forEach((sys, si) => {
    const y0 = si * (sysHeight + sysGap);
    const staffTops = staves.map((_, k) => y0 + top + k * (4 + staffGap));
    const Y = (k, p) => staffTops[k] + (8 - p) / 2;
    const left = pad;
    const lastM = sys.measures[sys.measures.length - 1];
    const right = !free && lastM ? Math.min(contentW - endPad, lastM.ex) : contentW - endPad;
    const g = svg('g', { class: 'system' });
    music.append(g);

    // staff lines
    staves.forEach((clef, k) => {
      for (let l = 0; l < 5; l++) g.append(line(left, staffTops[k] + l, right, staffTops[k] + l, W.staffLine, 'sl'));
    });
    if (staves.length > 1) {
      const yTop = staffTops[0];
      const yBot = staffTops[1] + 4;
      g.append(line(left, yTop, left, yBot, W.staffLine * 1.4, 'sl bar'));
      const scale = (yBot - yTop) / 4;
      const brace = text(G.brace, 0, 0, 'mus brace');
      brace.setAttribute('transform', `translate(${P(left - 0.3 - 0.28 * scale)} ${P(yBot)}) scale(${scale.toFixed(3)})`);
      g.append(brace);
    }
    // clefs
    staves.forEach((clef, k) => {
      g.append(text(CLEFS[clef].glyph, left + 0.5, Y(k, CLEFS[clef].glyphP), 'mus clef'));
    });
    // key signature
    if (fifths) {
      staves.forEach((clef, k) => {
        const pos = fifths > 0 ? SHARP_POS : FLAT_POS;
        const shift = clef === 'bass' ? -2 : 0;
        for (let i = 0; i < Math.abs(fifths); i++) {
          g.append(text(fifths > 0 ? G.sharp : G.flat, left + clefW + i * 1.02, Y(k, pos[i] + shift), 'mus acc key'));
        }
      });
    }
    sysY.push({ Y, left, right, header: sys.header });
    // time signature
    if (sys.first && time) {
      const tx = left + clefW + keyW;
      staves.forEach((_, k) => {
        g.append(text(tsGlyph(time[0]), tx, Y(k, 6), 'mus ts'));
        g.append(text(tsGlyph(time[1]), tx, Y(k, 2), 'mus ts'));
      });
    }

    const sysAnchors = [];
    anchors.push(sysAnchors);

    sys.measures.forEach((m, mi) => {
      for (const ev of m.events) {
        const firstPart = ev.parts.find((pt) => pt.length);
        const hw0 = ev.rest || !firstPart ? 0 : headWidth(firstPart.dur);
        const cx = ev.x + (ev.rest ? restGlyph(ev.dur)[1] / 2 : hw0 / 2);
        order.push(ev);
        eventX[ev.id] = cx;
        sysAnchors.push({ beat: ev.absBeat, x: cx });
        const state = states[ev.id];
        const eg = svg('g', { class: `ev${state ? ' st-' + state : ''}`, 'data-id': ev.id });
        g.append(eg);

        if (ev.rest) {
          const [glyph] = restGlyph(ev.dur);
          const k = Math.min(staves.length - 1, ev.restSi || 0);
          const p = baseDur(ev.dur) >= 4 ? 6 : 4;
          eg.append(text(glyph, ev.x, Y(k, p), 'mus rest'));
          if (isDotted(ev.dur)) eg.append(text(G.dot, ev.x + restGlyph(ev.dur)[1] + 0.3, Y(k, 5)));
          continue;
        }

        if (opts.noteNames) {
          // names stacked like the notes: highest on top
          const all = ev.parts.flat().sort((a, b) => midiOf(b.n) - midiOf(a.n));
          const ny = staffTops[staves.length - 1] + 4 + bottom - namesRow + 1.9;
          const t = svg('text', { class: 'note-name', 'text-anchor': 'middle' });
          all.forEach((x, i) => t.append(svg('tspan', { x: P(cx), y: P(ny + i * 1.45) }, noteNameText(x.n))));
          eg.append(t);
        }
        ev.parts.forEach((part, k) => {
          if (!part.length) return;
          const dir = part.dir;
          const hw = headWidth(part.dur);
          // ledger lines
          const hiP = part[part.length - 1].p;
          const loP = part[0].p;
          const ledgerSpan = (fromX, toX, p) => eg.append(line(fromX - W.ledgerExt, Y(k, p), toX + W.ledgerExt, Y(k, p), W.ledger, 'ledger'));
          for (let lp = 10; lp <= hiP; lp += 2) {
            const on = part.filter((x) => x.p >= lp - 1);
            const minDx = Math.min(...on.map((x) => x.dx));
            const maxDx = Math.max(...on.map((x) => x.dx));
            ledgerSpan(ev.x + minDx * hw, ev.x + hw + maxDx * hw, lp);
          }
          for (let lp = -2; lp >= loP; lp -= 2) {
            const on = part.filter((x) => x.p <= lp + 1);
            const minDx = Math.min(...on.map((x) => x.dx));
            const maxDx = Math.max(...on.map((x) => x.dx));
            ledgerSpan(ev.x + minDx * hw, ev.x + hw + maxDx * hw, lp);
          }
          // heads, accidentals, dots, names
          for (const x of part) {
            const ns = noteStates[`${ev.id}:${x.i}`];
            const ng = svg('g', { class: `nt${ns ? ' st-' + ns : ''}` });
            eg.append(ng);
            const hx = ev.x + x.dx * hw;
            const hy = Y(k, x.p);
            if (x.acc) ng.append(text(G[x.acc], ev.x + x.accX, hy, 'mus acc'));
            ng.append(text(headGlyph(part.dur), hx, hy, 'mus head'));
            heads.set(`${ev.id}:${x.i}`, { x: hx, y: hy, sys: si, k, dir, hw, ev, n: x.n });
            if (isDotted(part.dur)) {
              const dp = x.p % 2 === 0 ? x.p + 1 : x.p;
              const dx = ev.x + hw * (part.some((q) => q.dx > 0) ? 2 : 1) + 0.3;
              ng.append(text(G.dot, dx, Y(k, dp), 'mus dot'));
            }
          }
          // stem
          if (part.tipP != null) {
            const stemX = ev.stemX != null ? ev.stemX : dir === 'up' ? ev.x + hw - W.stem / 2 : ev.x + W.stem / 2;
            const startP = dir === 'up' ? loP : hiP;
            const y1 = Y(k, startP) + (dir === 'up' ? -0.168 : 0.168);
            const y2 = Y(k, part.tipP);
            eg.append(line(stemX, y1, stemX, y2, W.stem, 'stem'));
            if (!ev.beam && baseDur(part.dur) <= 0.5) {
              const fx = stemX - W.stem / 2;
              const six = baseDur(part.dur) <= 0.25;
              const glyph = dir === 'up' ? (six ? G.flag16Up : G.flag8Up) : six ? G.flag16Down : G.flag8Down;
              eg.append(text(glyph, fx, y2, 'mus flag'));
            }
          }
        });
      }
      // barline
      const isLastBar = si === systems.length - 1 && mi === sys.measures.length - 1;
      if (!free) {
        staves.forEach((_, k) => {
          const yt = staffTops[k];
          if (isLastBar) {
            g.append(line(m.ex - 0.9, yt, m.ex - 0.9, yt + 4, 0.16, 'bar'));
            g.append(line(m.ex - 0.25, yt, m.ex - 0.25, yt + 4, 0.5, 'bar'));
          } else {
            g.append(line(m.ex, yt, m.ex, yt + 4, 0.16, 'bar'));
          }
        });
        if (staves.length > 1) g.append(line(m.ex, staffTops[0] + 4, m.ex, staffTops[1], 0.16, 'bar'));
      }
      sysAnchors.push({ beat: m.start + m.len, x: isLastBar ? m.ex - 1.2 : m.ex });
      if (opts.barNumbers && m.label != null && mi === 0 && si > 0) {
        g.append(svg('text', { x: P(m.sx + 0.2), y: P(staffTops[0] - 1.6), class: 'bar-num' }, String(m.label)));
      }
    });

    // beams for this system
    for (const bm of beams) {
      if (!sys.measures.includes(measures.find((mm) => mm.events.includes(bm[0])))) continue;
      const L = bm.line;
      const k = 0;
      const y1 = Y(k, L.p1);
      const y2 = Y(k, L.p2);
      const t = L.dir === 'up' ? W.beam : -W.beam;
      const x1 = L.x1 - W.stem / 2;
      const x2 = L.x2 + W.stem / 2;
      const st = states[bm[0].id] && bm.every((e) => states[e.id] === states[bm[0].id]) ? ' st-' + states[bm[0].id] : '';
      g.append(svg('polygon', {
        class: 'beam' + st,
        points: `${P(x1)},${P(y1)} ${P(x2)},${P(y2)} ${P(x2)},${P(y2 + t)} ${P(x1)},${P(y1 + t)}`,
      }));
      // second beam for sixteenths
      const slopeY = (y2 - y1) / Math.max(1e-6, L.x2 - L.x1);
      const yAt = (x) => y1 + (x - L.x1) * slopeY + (L.dir === 'up' ? 0.75 : -0.75);
      const sx = (ev) => ev.stemX;
      const is16 = (ev) => baseDur(ev.dur) <= 0.25;
      bm.forEach((ev, i) => {
        if (!is16(ev)) return;
        const next = bm[i + 1];
        const prev = bm[i - 1];
        let a = null;
        let b = null;
        if (next && is16(next)) {
          a = sx(ev);
          b = sx(next);
        } else if (!(prev && is16(prev))) {
          if (next) {
            a = sx(ev);
            b = sx(ev) + 1.1;
          } else {
            a = sx(ev) - 1.1;
            b = sx(ev);
          }
        }
        if (a == null) return;
        const ya = yAt(a);
        const yb = yAt(b);
        g.append(svg('polygon', {
          class: 'beam' + st,
          points: `${P(a - W.stem / 2)},${P(ya)} ${P(b + W.stem / 2)},${P(yb)} ${P(b + W.stem / 2)},${P(yb + t)} ${P(a - W.stem / 2)},${P(ya + t)}`,
        }));
      });
    }

    // judgement labels
    if (opts.judgements) {
      for (const m of sys.measures) for (const ev of m.events) {
        const j = opts.judgements[ev.id];
        if (!j) continue;
        g.append(svg('text', { x: P(eventX[ev.id]), y: P(y0 + 1.5), class: `judge j-${j.cls}`, 'text-anchor': 'middle' }, j.label));
      }
    }

    // playhead (hidden until used)
    const ph = svg('line', {
      class: 'playhead', x1: 0, x2: 0, y1: P(y0 + top - 1.6), y2: P(staffTops[staves.length - 1] + 5.6),
      'stroke-width': Math.max(2, +(0.3 * sp).toFixed(2)), visibility: 'hidden',
    });
    g.append(ph);
    playheads.push(ph);

    // ghost notes (extra notes that were played)
    for (const gh of opts.ghosts || []) {
      const sysIdx = systemOfBeat(gh.absBeat);
      if (sysIdx !== si) continue;
      const k = staves.length > 1 ? (midiOf(gh.note) >= 60 ? 0 : 1) : 0;
      const p = staffPos(gh.note, staves[k]);
      const gx = beatToXIn(si, gh.absBeat) - W.head / 2 + (gh.dx || 0);
      const gg = svg('g', { class: `ghost ${gh.cls || ''}` });
      for (let lp = 10; lp <= p; lp += 2) gg.append(line(gx - W.ledgerExt, Y(k, lp), gx + W.head + W.ledgerExt, Y(k, lp), W.ledger, 'ledger'));
      for (let lp = -2; lp >= p; lp -= 2) gg.append(line(gx - W.ledgerExt, Y(k, lp), gx + W.head + W.ledgerExt, Y(k, lp), W.ledger, 'ledger'));
      if (gh.note.acc) gg.append(text(gh.note.acc > 0 ? G.sharp : G.flat, gx - 1.25, Y(k, p), 'mus acc'));
      gg.append(text(G.black, gx, Y(k, p), 'mus head'));
      g.append(gg);
    }
  });

  // ties: a curve from each tied note to the same pitch in the next event
  const evIndex = new Map(order.map((ev, i) => [ev, i]));
  for (const h1 of heads.values()) {
    if (!h1.n.tieStart) continue;
    let h2 = null;
    for (let j = evIndex.get(h1.ev) + 1; j < order.length && !h2; j++) {
      const ev2 = order[j];
      if (ev2.absBeat <= h1.ev.absBeat) continue;
      for (const cand of heads.values()) {
        if (cand.ev === ev2 && cand.k === h1.k && midiOf(cand.n) === midiOf(h1.n)) {
          h2 = cand;
          break;
        }
      }
      if (ev2.absBeat > h1.ev.absBeat + 8) break;
    }
    const below = h1.dir === 'up';
    const drawTie = (gEl, xa, xb, y) => {
      const span = Math.max(0.6, xb - xa);
      const hgt = Math.min(1.2, 0.35 + span * 0.08) * (below ? 1 : -1);
      const yy = y + (below ? 0.55 : -0.55);
      const th = 0.16 * (below ? 1 : -1);
      const d = `M${P(xa)} ${P(yy)} C${P(xa + span * 0.3)} ${P(yy + hgt)} ${P(xb - span * 0.3)} ${P(yy + hgt)} ${P(xb)} ${P(yy)} ` +
        `C${P(xb - span * 0.3)} ${P(yy + hgt + th)} ${P(xa + span * 0.3)} ${P(yy + hgt + th)} ${P(xa)} ${P(yy)}Z`;
      const st = states[h1.ev.id];
      gEl.append(svg('path', { d, class: 'tie' + (st ? ' st-' + st : '') }));
    };
    const gSys = music.children;
    if (h2 && h2.sys === h1.sys) {
      drawTie(gSys[h1.sys], h1.x + h1.hw * 0.75, h2.x + h2.hw * 0.25, h1.y);
    } else {
      const s1 = sysY[h1.sys];
      drawTie(gSys[h1.sys], h1.x + h1.hw * 0.75, s1.right - 0.3, h1.y);
      if (h2) drawTie(gSys[h2.sys], sysY[h2.sys].header - 0.6, h2.x + h2.hw * 0.25, h2.y);
    }
  }

  function systemOfBeat(beat) {
    for (let i = 0; i < systems.length; i++) {
      const ms = systems[i].measures;
      if (!ms.length) continue;
      const end = ms[ms.length - 1].start + ms[ms.length - 1].len;
      if (beat < end - 1e-9 || i === systems.length - 1) return i;
    }
    return 0;
  }

  function beatToXIn(si, beat) {
    const a = anchors[si] || [];
    if (!a.length) return 0;
    if (beat <= a[0].beat) return a[0].x;
    for (let i = 1; i < a.length; i++) {
      if (beat <= a[i].beat) {
        const t = (beat - a[i - 1].beat) / Math.max(1e-6, a[i].beat - a[i - 1].beat);
        return a[i - 1].x + t * (a[i].x - a[i - 1].x);
      }
    }
    return a[a.length - 1].x;
  }

  target.textContent = '';
  target.append(root);

  return {
    svg: root,
    sp,
    width: contentW * sp,
    height: totalH * sp,
    systemTop(si) {
      return si * (sysHeight + sysGap) * sp;
    },
    systemHeight: sysHeight * sp,
    eventX: Object.fromEntries(Object.entries(eventX).map(([k, v]) => [k, v * sp])),
    beatToX(beat) {
      const si = systemOfBeat(beat);
      return { x: beatToXIn(si, beat) * sp, system: si };
    },
    setPlayhead(beat) {
      if (beat == null) {
        playheads.forEach((p) => p.setAttribute('visibility', 'hidden'));
        return;
      }
      const si = systemOfBeat(beat);
      const x = beatToXIn(si, beat) * sp;
      playheads.forEach((p, i) => {
        if (i === si) {
          p.setAttribute('visibility', 'visible');
          p.setAttribute('transform', `translate(${x.toFixed(1)} 0)`);
        } else p.setAttribute('visibility', 'hidden');
      });
    },
  };
}

function noteNameText(n) {
  return n.letter + (n.acc === 1 ? '♯' : n.acc === -1 ? '♭' : '');
}

/** Convenience: score for a single chord or note shown as a whole note. */
export function singleScore(notes, clef = clefFor(notes), dur = 4) {
  return { clef, time: null, measures: [{ events: [{ id: 'n0', beat: 0, dur, notes }] }] };
}

/** Convenience: several separate notes/chords in a row (free layout). */
export function rowScore(groups, clef, dur = 4) {
  return {
    clef,
    time: null,
    measures: [{ events: groups.map((notes, i) => ({ id: 'n' + i, beat: i, dur, notes: Array.isArray(notes) ? notes : [notes] })) }],
  };
}
