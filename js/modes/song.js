// Song Mode: learn an imported song a few bars at a time.
//   Wait mode  - the cursor waits on each note until you play it.
//   Play along - count-in, the line moves at your tempo, scored like Note Rush.

import { h, clear } from '../core/util.js';
import { spell, noteLabel } from '../core/music.js';
import { renderStaff } from '../core/staff.js';
import { getSong, buildView, sections, matches } from '../core/songs.js';
import { scoreAttempt, matchWindow } from '../core/rushlogic.js';
import { button } from './common.js';

export function createSong(ctx, cfg) {
  const { store, kb, audio } = ctx;
  const entry = getSong(cfg.songId);
  if (!entry) {
    return {
      mount() {
        ctx.feedback('This song is no longer on this device.', 'bad');
        ctx.setActions(button('Close', { kind: 'primary', onclick: () => ctx.done() }));
      },
    };
  }
  const song = entry.song;
  const secs = sections(song);
  const two = song.staves.length > 1;
  const prefKey = `song:${entry.id}`;
  const pref = { sec: secs.length > 1 ? 1 : 0, hand: 'right', mode: 'wait', hints: true, tempo: null, ...(store.getLocal(prefKey) || {}) };
  if (pref.sec >= secs.length) pref.sec = 0;
  const savePref = () => store.setLocal(prefKey, pref);
  const defaultTempo = Math.max(40, Math.min(120, Math.round(((song.tempo || 100) * 0.6) / 5) * 5));
  if (!pref.tempo) pref.tempo = defaultTempo;

  let view = null;
  let layout = null;
  let stepIdx = 0;
  let hit = new Set();
  let stepWrong = 0;
  let firstTry = 0;
  let phase = 'idle'; // idle | wait | done | countin | play | result | listen
  let raf = 0;
  let played = [];
  let expected = [];
  let startPerf = 0;
  let msPerBeat = 1000;
  let calib = 0;
  let win = 300;
  let live = new Set();
  let runs = 0;
  let lastStates = {};
  let lastExtra = {};

  // ----- DOM -----
  const staffEl = h('div', { class: 'staff-inner' });
  const card = h('div', { class: 'staff-card song-card' }, staffEl);
  const summary = h('div', { class: 'score-box', hidden: true });
  const secSel = h('select', { class: 'select', id: 'song-sec', 'aria-label': 'Part of the song', onchange: (e) => { pref.sec = Number(e.target.value); savePref(); reset(); } },
    secs.map((sc, i) => h('option', { value: String(i), selected: i === pref.sec }, sc.label)));
  const handSel = two
    ? h('select', { class: 'select', id: 'song-hand', 'aria-label': 'Hand', onchange: (e) => { pref.hand = e.target.value; savePref(); reset(); } },
      [['right', 'Right hand'], ['left', 'Left hand'], ['both', 'Both hands']].map(([v, l]) => h('option', { value: v, selected: v === pref.hand }, l)))
    : null;
  const modeSeg = h('div', { class: 'seg seg-small', role: 'radiogroup', 'aria-label': 'Mode' });
  const modeBtns = [['wait', 'Wait'], ['play', 'Play along']].map(([v, l]) => {
    const b = h('button', { class: 'seg-btn', type: 'button', role: 'radio', 'aria-checked': String(pref.mode === v) }, l);
    b.onclick = () => {
      pref.mode = v;
      savePref();
      modeBtns.forEach((x) => x.setAttribute('aria-checked', String(x === b)));
      reset();
    };
    modeSeg.append(b);
    return b;
  });
  const toolbar = h('div', { class: 'song-tools' }, secSel, handSel, modeSeg);
  const tempoVal = h('span', { class: 'tempo-val' });
  const tempoCtl = h('div', { class: 'tempo', role: 'group', 'aria-label': 'Tempo' },
    h('button', { class: 'btn btn-round', type: 'button', 'aria-label': 'Slower', onclick: () => setTempo(pref.tempo - 5) }, '−'),
    h('span', { class: 'tempo-lbl' }, h('span', { class: 'q' }, '♩'), ' = ', tempoVal),
    h('button', { class: 'btn btn-round', type: 'button', 'aria-label': 'Faster', onclick: () => setTempo(pref.tempo + 5) }, '+'));
  const hintsBox = h('label', { class: 'switch-row' },
    h('input', { type: 'checkbox', id: 'song-hints', checked: pref.hints, onchange: (e) => { pref.hints = e.target.checked; savePref(); paintHints(); } }),
    h('span', { class: 'switch', 'aria-hidden': 'true' }), h('span', {}, 'Key hints'));

  function setTempo(v) {
    pref.tempo = Math.max(30, Math.min(200, v));
    tempoVal.textContent = String(pref.tempo);
    savePref();
  }
  setTempo(pref.tempo);

  const staffIdx = () => (!two ? [0] : pref.hand === 'left' ? [1] : pref.hand === 'both' ? [0, 1] : [0]);

  function draw(states = lastStates, extra = lastExtra) {
    lastStates = states;
    lastExtra = extra;
    const w = Math.max(260, staffEl.clientWidth || card.clientWidth - 24 || 320);
    layout = renderStaff(staffEl, view.score, {
      width: w, maxSpace: 12, minSpace: 9.5, wrapSpace: 10, barNumbers: true, states, label: song.title, ...extra,
    });
  }

  function scrollToBeat(beat) {
    if (!layout) return;
    const { system } = layout.beatToX(beat);
    const top = layout.systemTop(system);
    const visibleTop = card.scrollTop;
    const visibleBottom = visibleTop + card.clientHeight;
    if (top < visibleTop || top + layout.systemHeight > visibleBottom) {
      card.scrollTo({ top: Math.max(0, top - 6), behavior: 'smooth' });
    }
  }

  // ----- wait mode -----

  function waitStates() {
    const st = {};
    view.steps.forEach((s, i) => {
      if (i < stepIdx) st[s.ev] = 'good';
      else if (i === stepIdx) st[s.ev] = 'active';
    });
    return st;
  }

  function paintHints() {
    kb.clearMarks('hint');
    if (phase !== 'wait' || !pref.hints) return;
    const step = view.steps[stepIdx];
    if (!step) return;
    for (const n of step.notes) if (!hit.has(n.key)) kb.mark(n.midi, 'hint');
  }

  function showStep() {
    const step = view.steps[stepIdx];
    hit = new Set();
    stepWrong = 0;
    draw(waitStates(), {});
    layout.setPlayhead(step.beat);
    scrollToBeat(step.beat);
    const lo = Math.min(...step.notes.map((n) => n.midi));
    const hi = Math.max(...step.notes.map((n) => n.midi));
    if (lo < kb.from || hi > kb.to) kb.focus(Math.min(lo, view.range[0]), Math.max(hi, view.range[1]));
    paintHints();
    const names = step.notes.map((n) => noteLabel(spell(n.midi), { octave: false }));
    if (!pref.hints) ctx.feedback(`Note ${stepIdx + 1} of ${view.steps.length}`, 'info');
    else ctx.feedback(step.notes.length > 1 ? `Hold together: ${names.join(' · ')}` : `Next: ${names[0]}`, 'info');
  }

  function startWait() {
    phase = 'wait';
    stepIdx = 0;
    firstTry = 0;
    summary.hidden = true;
    ctx.setActions(hintsBox, button('Listen', { kind: 'ghost', ico: 'listen', onclick: () => listen() }), button('Restart', { kind: 'ghost', ico: 'replay', onclick: () => startWait() }));
    if (!view.steps.length) {
      ctx.feedback('No notes for this hand in this part. Try another part or hand.', 'hint');
      draw({}, {});
      return;
    }
    showStep();
  }

  function waitNote(midi) {
    const step = view.steps[stepIdx];
    if (!step) return;
    const anyOctave = store.settings.anyOctave;
    const want = step.notes.find((n) => !hit.has(n.key) && matches(midi, n.midi, anyOctave));
    if (want) {
      hit.add(want.key);
      kb.unmark(want.midi, 'hint');
      kb.mark(midi, 'good', 350);
      if (hit.size >= step.notes.length) {
        if (stepWrong === 0) firstTry++;
        stepIdx++;
        if (stepIdx >= view.steps.length) finishRun(Math.round((100 * firstTry) / view.steps.length));
        else showStep();
      }
      return;
    }
    if (step.notes.some((n) => matches(midi, n.midi, anyOctave))) return; // repeated a note already played
    stepWrong++;
    kb.mark(midi, 'bad', 500);
    const names = step.notes.filter((n) => !hit.has(n.key)).map((n) => noteLabel(spell(n.midi)));
    ctx.feedback(`That was ${noteLabel(spell(midi))}. Looking for ${names.join(' · ')}.`, 'hint');
    if (stepWrong >= 2 && !pref.hints) for (const n of step.notes) if (!hit.has(n.key)) kb.mark(n.midi, 'hint');
  }

  // ----- play along -----

  function startPlayIdle() {
    phase = 'idle';
    summary.hidden = true;
    draw({}, {});
    layout.setPlayhead(null);
    card.scrollTo({ top: 0 });
    ctx.feedback(view.steps.length ? 'Read it through, then tap Go. You get a count-in first.' : 'No notes for this hand in this part.', 'info');
    const go = button('Go', { kind: 'primary', ico: 'play', onclick: () => go_(), disabled: !view.steps.length });
    ctx.setActions(tempoCtl, go);
    kb.focus(view.range[0], view.range[1]);
  }

  function go_() {
    audio.ensure();
    phase = 'countin';
    played = [];
    live = new Set();
    calib = store.getLocal('calibrationMs') || 0;
    msPerBeat = 60000 / pref.tempo;
    const beatSec = 60 / pref.tempo;
    const countBeats = Math.max(2, Math.min(4, song.time[0] * (4 / song.time[1])));
    const t0 = audio.now + 0.35;
    for (let i = 0; i < countBeats; i++) audio.click(t0 + i * beatSec, i === 0);
    const tStart = t0 + countBeats * beatSec;
    if (store.settings.metronome) for (let i = 0; i < Math.ceil(view.length); i++) audio.click(tStart + i * beatSec, false);
    startPerf = audio.perfTimeOf(tStart);
    expected = [];
    const flat = [];
    for (const st of view.steps) {
      for (const n of st.notes) {
        expected.push({ id: n.key, ev: st.ev, midi: n.midi, t: startPerf + st.beat * msPerBeat + calib });
        flat.push({ absBeat: st.beat });
      }
    }
    win = matchWindow(flat, msPerBeat);
    draw({}, {});
    card.scrollTo({ top: 0 });
    ctx.feedback('Listen to the count-in…', 'info');
    ctx.setActions(button('Stop', { kind: 'ghost', onclick: () => { cancelAnimationFrame(raf); audio.releaseAll(); startPlayIdle(); } }));
    cancelAnimationFrame(raf);
    let lastSys = -1;
    const tick = () => {
      if (!ctx.isOpen() || (phase !== 'countin' && phase !== 'play')) return;
      const beat = (performance.now() - startPerf) / msPerBeat;
      if (beat >= 0) {
        if (phase === 'countin') {
          phase = 'play';
          ctx.feedback('Play!', 'info');
        }
        layout.setPlayhead(Math.min(beat, view.length));
        const sys = layout.beatToX(beat).system;
        if (sys !== lastSys) {
          lastSys = sys;
          scrollToBeat(beat);
        }
      }
      if (beat >= view.length + win / msPerBeat + 0.2) {
        finishPlay();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  function finishPlay() {
    phase = 'result';
    layout.setPlayhead(null);
    const res = scoreAttempt(expected, played, { windowMs: win, anyOctave: store.settings.anyOctave });
    const states = {};
    const judgements = {};
    res.results.forEach((r, i) => {
      const ev = expected[i].ev;
      if (!r.hit) states[ev] = 'miss';
      else if (states[ev] !== 'miss') states[ev] = 'good';
      if (r.hit && !judgements[ev]) judgements[ev] = { label: r.label, cls: r.cls };
    });
    draw(states, { judgements });
    card.scrollTo({ top: 0, behavior: 'smooth' });
    finishRun(res.combined, res);
  }

  // ----- results -----

  function finishRun(score, res = null) {
    phase = pref.mode === 'wait' ? 'done' : 'result';
    kb.clearMarks('hint');
    runs++;
    if (pref.mode === 'wait') {
      draw(Object.fromEntries(view.steps.map((s) => [s.ev, 'good'])), {});
      layout.setPlayhead(null);
    }
    const key = `song:${entry.id}:${pref.sec}:${pref.hand}:${pref.mode}`;
    const isBest = store.setBest(key, score);
    const xp = Math.max(2, Math.round(view.steps.length / 4));
    if (runs === 1) {
      ctx.record({ correct: score >= 80, xp });
      ctx.progress(1);
    } else ctx.addXp(Math.max(1, Math.round(xp / 2)));
    audio.sfx(score >= 80 ? 'done' : 'good');

    clear(summary);
    summary.hidden = false;
    const chip = (label, value, cls) => h('div', { class: `score-chip ${cls}` }, h('span', { class: 'sc-val' }, value), h('span', { class: 'sc-lbl' }, label));
    if (res) {
      summary.append(h('div', { class: 'score-chips' },
        chip('Notes', `${res.hits}/${res.total}`, 'notes'),
        chip('Timing', res.hits ? `${res.timingScore}%` : '–', 'timing'),
        chip(isBest ? 'New best' : 'Score', String(score), 'total' + (isBest ? ' best' : ''))));
    } else {
      summary.append(h('div', { class: 'score-chips' },
        chip('First try', `${firstTry}/${view.steps.length}`, 'notes'),
        chip(isBest ? 'New best' : 'Score', `${score}%`, 'total' + (isBest ? ' best' : ''))));
    }
    const msg = score >= 90 ? 'Beautiful! Ready to try it faster, or the next part?' : score >= 70 ? 'Lovely! One more time makes it stick.' : 'Nice effort. Go again slowly, it gets easier each time.';
    ctx.feedback(msg, score >= 70 ? 'good' : 'hint');
    const nextSec = pref.sec > 0 && pref.sec < secs.length - 1;
    const acts = [button('Again', { kind: 'ghost', ico: 'replay', onclick: () => reset() })];
    if (nextSec) acts.push(button('Next part', { kind: 'ghost', onclick: () => { pref.sec++; secSel.value = String(pref.sec); savePref(); reset(); } }));
    if (pref.mode === 'wait' && score >= 70) acts.push(button('Play along', { kind: 'ghost', onclick: () => { pref.mode = 'play'; modeBtns.forEach((b, i) => b.setAttribute('aria-checked', String(i === 1))); savePref(); reset(); } }));
    acts.push(button('Done', { kind: 'primary', onclick: () => ctx.done() }));
    ctx.setActions(acts);
  }

  // ----- listening -----

  function listen() {
    audio.ensure();
    const prev = phase;
    phase = 'listen';
    kb.clearMarks('hint');
    const beatSec = 60 / pref.tempo;
    const t0 = audio.now + 0.15;
    for (const st of view.steps) for (const n of st.notes) audio.playNote(n.midi, { when: t0 + st.beat * beatSec, dur: Math.max(0.2, n.soundDur * beatSec * 0.95), vel: 0.7 });
    const startP = audio.perfTimeOf(t0);
    const mpb = beatSec * 1000;
    draw({}, {});
    let lastSys = -1;
    const step = () => {
      if (!ctx.isOpen() || phase !== 'listen') return;
      const beat = (performance.now() - startP) / mpb;
      if (beat >= 0) {
        layout.setPlayhead(Math.min(beat, view.length));
        const sys = layout.beatToX(beat).system;
        if (sys !== lastSys) {
          lastSys = sys;
          scrollToBeat(beat);
        }
      }
      if (beat > view.length) {
        phase = prev;
        if (prev === 'wait') showStep();
        else layout.setPlayhead(null);
        return;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  // ----- setup -----

  function reset() {
    cancelAnimationFrame(raf);
    audio.releaseAll();
    kb.clearMarks();
    const sc = secs[pref.sec];
    view = buildView(song, { staffIdx: staffIdx(), from: sc.from, to: sc.to });
    lastStates = {};
    lastExtra = {};
    kb.focus(view.range[0], view.range[1]);
    if (pref.mode === 'wait') startWait();
    else startPlayIdle();
  }

  let ro = null;
  return {
    mount() {
      ctx.setTitle(song.title);
      ctx.body.append(h('div', { class: 'prompt-block song' }, toolbar, card, summary));
      requestAnimationFrame(() => reset());
      if (typeof ResizeObserver === 'function') {
        let last = 0;
        ro = new ResizeObserver(() => {
          if (view && Math.abs(staffEl.clientWidth - last) > 8) {
            last = staffEl.clientWidth;
            draw();
            if (phase === 'wait' && view.steps[stepIdx]) layout.setPlayhead(view.steps[stepIdx].beat);
          }
        });
        ro.observe(staffEl);
      }
    },
    onNoteOn(e) {
      if (phase === 'wait') waitNote(e.midi);
      else if (phase === 'countin' || phase === 'play') {
        played.push({ midi: e.midi, t: e.time });
        let best = null;
        for (const ex of expected) {
          if (live.has(ex.id) || !matches(e.midi, ex.midi, store.settings.anyOctave)) continue;
          const dt = e.time - ex.t;
          if (Math.abs(dt) <= win && (!best || Math.abs(dt) < Math.abs(best.dt))) best = { ex, dt };
        }
        if (best) {
          live.add(best.ex.id);
          const st = {};
          for (const id of live) st[expected.find((x) => x.id === id).ev] = 'good';
          draw(st, {});
        } else kb.mark(e.midi, 'bad', 250);
      }
    },
    onPedal(e) {
      if (e.down && phase === 'idle' && pref.mode === 'play') go_();
    },
    onKey(e) {
      if ((e.key === 'Enter' || e.key === ' ') && phase === 'idle' && pref.mode === 'play') {
        go_();
        return true;
      }
      return false;
    },
    destroy() {
      cancelAnimationFrame(raf);
      ro && ro.disconnect();
      kb.clearMarks();
    },
  };
}
