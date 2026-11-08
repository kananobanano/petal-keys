// Play the scale: a major scale with its key signature, played one note at a
// time, home note to home note. The cursor waits for you (no timer). Key hints
// show on the first time through each key, and after a slip later on.

import { h } from '../core/util.js';
import { midiOf, spell, noteLabel, pc } from '../core/music.js';
import { renderStaff, rowScore } from '../core/staff.js';
import { matchesNote, rangeOf, wait } from './common.js';
import { keyName, scaleNotes, signatureNotes, listText, blackKeyHint, keyAcc, tonic } from '../core/keys.js';

export function createScale(ctx, cfg) {
  const { store, kb, audio } = ctx;
  const keys = cfg.keys || [0];
  const rounds = cfg.rounds || 1;
  const order = [];
  for (const k of keys) for (let r = 0; r < rounds; r++) order.push({ key: k, round: r });

  let item = 0;
  let notes = [];
  let step = 0;
  let slips = 0;
  let hints = true;
  let locked = false;

  const staffEl = h('div', { class: 'staff-card scale-card' });
  const sub = h('p', { class: 'prompt-sub' });

  function draw() {
    const states = {};
    notes.forEach((_, i) => {
      if (i < step) states['n' + i] = 'good';
      else if (i === step && !locked) states['n' + i] = 'active';
    });
    const w = staffEl.clientWidth - 24 || 320;
    renderStaff(staffEl, { ...rowScore(notes.map((n) => [n]), 'treble', 1), key: order[item].key }, {
      width: w, free: true, center: true, maxSpace: 12, freeAdvance: 3.4, noteNames: hints, states,
      extent: { treble: [-3, 12] },
      label: `${keyName(order[item].key)} scale`,
    });
  }

  function paintHint() {
    kb.clearMarks('hint');
    if (hints && !locked && notes[step]) kb.mark(midiOf(notes[step]), 'hint');
  }

  function startItem() {
    const { key, round } = order[item];
    const t = tonic(key);
    notes = scaleNotes(key, t.letter === 'A' || t.letter === 'B' ? 3 : 4);
    step = 0;
    slips = 0;
    locked = false;
    hints = round === 0 || !!cfg.alwaysHints;
    const sig = signatureNotes(key);
    sub.textContent = sig.length
      ? `${keyName(key)}: the key signature says ${listText(sig)}. Start on ${noteLabel(notes[0], { octave: false })}, the home note.`
      : `${keyName(key)}: all white keys. Start on C, the home note.`;
    const [lo, hi] = rangeOf(notes);
    kb.focus(lo, hi);
    draw();
    paintHint();
    ctx.feedback(round > 0 ? 'Again, this time with fewer hints. You know the way!' : '', 'info');
  }

  async function finishItem() {
    locked = true;
    kb.clearMarks('hint');
    draw();
    const clean = slips === 0;
    ctx.record({ correct: clean, xp: clean ? 3 : 2 });
    ctx.progress(1);
    audio.sfx('good');
    ctx.feedback(clean ? 'Lovely, all the way home!' : 'You made it home. Each time gets smoother.', 'good');
    // play it back so the ear learns the shape
    const t0 = audio.now + 0.25;
    notes.forEach((n, i) => audio.playNote(midiOf(n), { when: t0 + i * 0.28, dur: i === notes.length - 1 ? 0.9 : 0.3, vel: 0.6 }));
    if (!(await wait(ctx, 2900))) return;
    item++;
    if (item >= order.length) ctx.done();
    else startItem();
  }

  function onNote(midi) {
    if (locked || !notes[step]) return;
    const target = notes[step];
    if (matchesNote(midi, target, store.settings.anyOctave)) {
      kb.mark(midi, 'good', 400);
      step++;
      ctx.feedback('');
      if (step >= notes.length) {
        finishItem();
        return;
      }
      draw();
      paintHint();
      return;
    }
    slips++;
    kb.mark(midi, 'bad', 500);
    const key = order[item].key;
    const forgotKey = target.acc !== 0 && keyAcc(target.letter, key) === target.acc && pc(midi) === pc(midiOf(target) - target.acc);
    if (forgotKey) {
      ctx.feedback(`Almost! In ${keyName(key)} every ${target.letter} is ${noteLabel(target, { octave: false })}. ${blackKeyHint(target)}.`, 'hint');
    } else {
      const played = spell(midi, target.acc < 0 ? 'flat' : 'sharp');
      const up = midiOf(target) > midi && !store.settings.anyOctave ? ' The next note is higher.' : '';
      ctx.feedback(`That's ${noteLabel(played, { octave: false })}. Look for ${noteLabel(target, { octave: false })}.${up}`, 'hint');
    }
    if (!hints) {
      hints = true;
      draw();
    }
    paintHint();
  }

  let ro = null;
  return {
    mount() {
      ctx.setTitle('Play the scale');
      ctx.body.append(h('div', { class: 'prompt-block' }, staffEl, sub));
      requestAnimationFrame(() => startItem());
      if (typeof ResizeObserver === 'function') {
        let last = 0;
        ro = new ResizeObserver(() => {
          if (notes.length && Math.abs(staffEl.clientWidth - last) > 8) {
            last = staffEl.clientWidth;
            draw();
          }
        });
        ro.observe(staffEl);
      }
    },
    onNoteOn(e) {
      onNote(e.midi);
    },
    destroy() {
      ro && ro.disconnect();
      kb.clearMarks();
    },
  };
}
