// Note Rush: study a short line with no time pressure, tap Go, hear four
// clicks, then play along while the playhead moves. Afterwards you get a
// score for the right notes and a score for timing.

import { h } from '../core/util.js';
import { parseNote, spell, noteLabel, midiOf } from '../core/music.js';
import { renderStaff, staffPos } from '../core/staff.js';
import { generatePassage, scoreAttempt, matchWindow, judgeTiming } from '../core/rushlogic.js';
import { button, clefKey, rangeOf, poolExtent, matchesNote } from './common.js';
import { songPassage } from '../core/songs.js';
import { toast } from '../ui/overlay.js';

export function createRush(ctx, cfg) {
  const { store, kb, audio } = ctx;
  const clef = cfg.clef || 'treble';
  const pool = (cfg.pool || ['C4', 'D4', 'E4', 'F4', 'G4']).map((n) => (typeof n === 'string' ? parseNote(n) : n));
  const total = cfg.count || 3;
  const bars = cfg.bars || 1;
  const level = cfg.level || 1;
  let tempo = cfg.tempo || 60;
  const ck = clefKey(clef);
  const keyOf = (midi) => `r:${ck}:${midi}`;
  const extent = poolExtent(pool, clef, staffPos);

  let passage = null;
  let phase = 'study'; // study | countin | play | result | listen
  let attempt = 0;
  let done = 0;
  let played = [];
  let expected = [];
  let win = 300;
  let startPerf = 0;
  let msPerBeat = 1000;
  let calib = 0;
  let endBeat = 4;
  let raf = 0;
  let layout = null;
  let live = new Map();
  let lastDraw = {};
  let listenTimer = 0;
  let warnedNoSong = false;

  // ----- DOM -----
  const staffEl = h('div', { class: 'staff-inner' });
  const popLayer = h('div', { class: 'pop-layer', 'aria-hidden': 'true' });
  const staffCard = h('div', { class: 'staff-card rush-card' }, staffEl, popLayer);
  const dots = [0, 1, 2, 3].map(() => h('i'));
  const beatDots = h('div', { class: 'beat-dots', 'aria-hidden': 'true' }, dots);
  const tempoVal = h('span', { class: 'tempo-val' });
  const slower = h('button', { class: 'btn btn-round', type: 'button', 'aria-label': 'Slower', onclick: () => setTempo(tempo - 5) }, '−');
  const faster = h('button', { class: 'btn btn-round', type: 'button', 'aria-label': 'Faster', onclick: () => setTempo(tempo + 5) }, '+');
  const tempoCtl = h('div', { class: 'tempo', role: 'group', 'aria-label': 'Tempo' }, slower, h('span', { class: 'tempo-lbl' }, h('span', { class: 'q' }, '♩'), ' = ', tempoVal), faster);
  const scoreBox = h('div', { class: 'score-box', 'aria-live': 'polite' });

  function setTempo(v) {
    tempo = Math.max(40, Math.min(132, v));
    tempoVal.textContent = String(tempo);
    slower.disabled = tempo <= 40;
    faster.disabled = tempo >= 132;
  }
  setTempo(tempo);

  function draw(extra = {}) {
    lastDraw = extra;
    const w = Math.max(240, staffEl.clientWidth || staffCard.clientWidth - 24 || 320);
    layout = renderStaff(staffEl, { clef, time: passage.time || [4, 4], key: passage.key || 0, measures: passage.measures }, {
      width: w,
      maxSpace: 14,
      minSpace: 11,
      wrapSpace: 11,
      extent: { [clef]: extent },
      label: `Note Rush: ${passage.notes.map((n) => noteLabel(n.note || spell(n.midi))).join(', ')}`,
      judgements: extra.judgements || {},
      ...extra,
    });
  }

  function newPassage() {
    passage = null;
    if (cfg.source === 'songs') {
      passage = songPassage({ clef, bars });
      if (!passage && !warnedNoSong) {
        warnedNoSong = true;
        toast('No song has a fitting line on this staff yet, so here is a new one.');
      }
    }
    if (!passage) passage = generatePassage({ pool, bars, level, weightOf: (n) => store.weight(keyOf(midiOf(n))) });
    for (const n of passage.notes) n.ev = n.ev || n.id;
    if (passage.range) kb.focus(passage.range[0], passage.range[1]);
    attempt = 0;
    toStudy();
    if (passage.from) ctx.feedback(`From “${passage.from}”. Take your time, then tap Go.`, 'info');
  }

  function toStudy() {
    phase = 'study';
    scoreBox.textContent = '';
    scoreBox.hidden = true;
    beatDots.classList.remove('on');
    dots.forEach((d) => d.classList.remove('lit'));
    draw();
    ctx.feedback('Take your time reading. Tap Go when you are ready.', 'info');
    const go = button('Go', { kind: 'primary', ico: 'play', onclick: () => start(), wide: true });
    ctx.setActions(tempoCtl, go);
    tempoCtl.hidden = false;
    setTimeout(() => go.focus({ preventScroll: true }), 30);
  }

  function start() {
    if (phase !== 'study' && phase !== 'result') return;
    audio.ensure();
    phase = 'countin';
    played = [];
    live = new Map();
    calib = store.getLocal('calibrationMs') || 0;
    msPerBeat = 60000 / tempo;
    const beatSec = 60 / tempo;
    const t0 = audio.now + 0.35;
    for (let i = 0; i < 4; i++) audio.click(t0 + i * beatSec, i === 0);
    const tStart = t0 + 4 * beatSec;
    if (store.settings.metronome) {
      for (let i = 0; i < passage.beats; i++) audio.click(tStart + i * beatSec, false);
    }
    startPerf = audio.perfTimeOf(tStart);
    expected = passage.notes.map((n) => ({ id: n.id, ev: n.ev, midi: n.midi, t: startPerf + n.absBeat * msPerBeat + calib }));
    ctx.app.debug = { rush: { passage, startPerf, msPerBeat, calib, expected } }; // handy for testing
    win = matchWindow(passage.notes, msPerBeat);
    const lastNote = passage.notes[passage.notes.length - 1];
    endBeat = Math.max(passage.beats, lastNote.absBeat + win / msPerBeat) + 0.15;
    scoreBox.hidden = true;
    draw();
    beatDots.classList.add('on');
    ctx.feedback('Listen to the four clicks…', 'info');
    ctx.setActions(button('Stop', { kind: 'ghost', onclick: () => stop() }));
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
  }

  function stop() {
    cancelAnimationFrame(raf);
    audio.releaseAll();
    layout && layout.setPlayhead(null);
    toStudy();
  }

  function tick() {
    if (!ctx.isOpen() || (phase !== 'countin' && phase !== 'play')) return;
    const beat = (performance.now() - startPerf) / msPerBeat;
    if (beat < 0) {
      const n = Math.floor(beat + 4);
      dots.forEach((d, i) => d.classList.toggle('lit', i <= n));
      layout.setPlayhead(null);
    } else {
      if (phase === 'countin') {
        phase = 'play';
        beatDots.classList.remove('on');
        ctx.feedback('Play!', 'info');
      }
      layout.setPlayhead(Math.min(beat, passage.beats));
    }
    if (beat >= endBeat) {
      finish();
      return;
    }
    raf = requestAnimationFrame(tick);
  }

  function popJudge(j, id) {
    if (!layout || layout.eventX[id] == null) return;
    const el = h('span', { class: `pop j-${j.cls}`, style: `left:${layout.eventX[id] + staffEl.offsetLeft}px` }, j.label);
    popLayer.append(el);
    setTimeout(() => el.remove(), 900);
  }

  function finish() {
    phase = 'result';
    cancelAnimationFrame(raf);
    layout.setPlayhead(null);
    const anyOctave = store.settings.anyOctave;
    const res = scoreAttempt(expected, played, { windowMs: win, anyOctave });
    attempt++;
    res.results.forEach((r, i) => {
      const n = passage.notes[i];
      store.add(keyOf(n.midi), 1, r.hit ? 1 : 0);
      store.pushResult(keyOf(n.midi), r.hit);
    });
    const ghosts = res.extra.map((pi) => {
      const p = played[pi];
      return { absBeat: Math.max(0, (p.t - startPerf - calib) / msPerBeat), note: spell(p.midi), cls: 'extra', dx: 1.3 };
    });
    const states = {};
    const judgements = {};
    res.results.forEach((r, i) => {
      const ev = expected[i].ev;
      if (!r.hit) states[ev] = 'miss';
      else if (states[ev] !== 'miss') states[ev] = 'good';
      if (r.hit && !judgements[ev]) judgements[ev] = { label: r.label, cls: r.cls };
    });
    draw({ states, judgements, ghosts });

    if (attempt === 1) ctx.record({ correct: res.combined >= 70, xp: Math.round(res.combined / 10) });
    else ctx.addXp(res.combined >= 70 ? 2 : 1);
    const isBest = store.setBest(`rush:${clef}`, res.combined);
    audio.sfx(res.combined >= 70 ? 'good' : 'tick');

    // summary
    scoreBox.hidden = false;
    scoreBox.textContent = '';
    const chip = (label, value, cls) => h('div', { class: `score-chip ${cls}` }, h('span', { class: 'sc-val' }, value), h('span', { class: 'sc-lbl' }, label));
    const hitsTxt = `${res.hits}/${res.total}`;
    scoreBox.append(
      h('div', { class: 'score-chips' },
        chip('Notes', hitsTxt, 'notes'),
        chip('Timing', res.hits ? `${res.timingScore}%` : '–', 'timing'),
        chip(isBest ? 'New best' : 'Score', String(res.combined), 'total' + (isBest ? ' best' : ''))),
    );
    const counts = {};
    res.results.filter((r) => r.hit).forEach((r) => {
      counts[r.label] = (counts[r.label] || 0) + 1;
    });
    const order = ['Perfect', 'Great', 'Good', 'Early', 'Late'];
    const summary = order.filter((k) => counts[k]).map((k) => `${k} ${counts[k]}`).join(' · ');
    if (summary) scoreBox.append(h('p', { class: 'judge-summary' }, summary));

    let msg;
    const hits = res.results.filter((r) => r.hit);
    const meanErr = hits.length ? hits.reduce((s, r) => s + r.err, 0) / hits.length : 0;
    if (res.hits === res.total && res.timingScore >= 85) msg = 'Beautiful! Every note, right on time.';
    else if (res.hits === res.total) msg = 'Every note right!';
    else if (res.hits >= res.total * 0.7) msg = `${res.total - res.hits} note${res.total - res.hits === 1 ? '' : 's'} to tidy up. The pink ones are the ones you missed.`;
    else msg = 'Try it slower: tap − to lower the tempo, or study it a little longer.';
    if (hits.length >= 3 && Math.abs(meanErr) > 70 && res.hits >= res.total * 0.6) {
      msg += meanErr > 0 ? ' You were a little late on average.' : ' You were a little early on average.';
    }
    ctx.feedback(msg, res.combined >= 70 ? 'good' : 'hint');

    const isLast = done + 1 >= total;
    const nextBtn = button(isLast ? 'Finish' : 'Next', { kind: 'primary', onclick: () => next() });
    ctx.setActions(
      button('Listen', { kind: 'ghost', ico: 'listen', onclick: () => listen() }),
      button('Again', { kind: 'ghost', ico: 'replay', onclick: () => start() }),
      nextBtn,
    );
    setTimeout(() => nextBtn.focus({ preventScroll: true }), 30);
  }

  function next() {
    done++;
    ctx.progress(1);
    if (done >= total) ctx.done();
    else newPassage();
  }

  function listen() {
    if (phase === 'listen') return;
    audio.ensure();
    const prevPhase = phase;
    phase = 'listen';
    const beatSec = 60 / tempo;
    const t0 = audio.now + 0.15;
    for (const n of passage.notes) audio.playNote(n.midi, { when: t0 + n.absBeat * beatSec, dur: n.dur * beatSec * 0.92, vel: 0.7 });
    const startP = audio.perfTimeOf(t0);
    const mpb = beatSec * 1000;
    const step = () => {
      if (!ctx.isOpen() || phase !== 'listen') return;
      const beat = (performance.now() - startP) / mpb;
      if (beat >= 0) layout.setPlayhead(Math.min(beat, passage.beats));
      if (beat > passage.beats) {
        layout.setPlayhead(null);
        phase = prevPhase;
        return;
      }
      listenTimer = requestAnimationFrame(step);
    };
    listenTimer = requestAnimationFrame(step);
  }

  let ro = null;
  return {
    mount() {
      ctx.setTitle(clef === 'bass' ? 'Note Rush · bass' : 'Note Rush');
      ctx.body.append(h('div', { class: 'prompt-block rush' }, beatDots, staffCard, scoreBox));
      const [lo, hi] = rangeOf(pool);
      kb.focus(lo, hi);
      requestAnimationFrame(() => newPassage());
      if (typeof ResizeObserver === 'function') {
        let last = 0;
        ro = new ResizeObserver(() => {
          if (passage && Math.abs(staffEl.clientWidth - last) > 8) {
            last = staffEl.clientWidth;
            draw(lastDraw);
          }
        });
        ro.observe(staffEl);
      }
    },
    onNoteOn(e) {
      if (phase !== 'countin' && phase !== 'play') return;
      played.push({ midi: e.midi, t: e.time });
      const anyOctave = store.settings.anyOctave;
      let best = null;
      for (const ex of expected) {
        if (live.has(ex.id) || !matchesNote(e.midi, ex.midi, anyOctave)) continue;
        const dt = e.time - ex.t;
        if (Math.abs(dt) <= win && (!best || Math.abs(dt) < Math.abs(best.dt))) best = { ex, dt };
      }
      if (best) {
        const j = judgeTiming(best.dt);
        live.set(best.ex.id, j);
        const states = {};
        for (const id of live.keys()) states[expected.find((x) => x.id === id).ev] = 'good';
        draw({ states });
        popJudge(j, best.ex.ev);
      } else {
        kb.mark(e.midi, 'bad', 250);
      }
    },
    onPedal(e) {
      if (e.down && phase === 'study') start();
    },
    onKey(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        if (phase === 'study') {
          start();
          return true;
        }
      }
      return false;
    },
    destroy() {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(listenTimer);
      ro && ro.disconnect();
      kb.clearMarks();
    },
  };
}
