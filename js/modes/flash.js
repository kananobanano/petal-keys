// Note Flash: one note on the staff, play it (or tap its name). No timer
// pressure; reading time is measured quietly so progress can be shown later.

import { h } from '../core/util.js';
import { parseNote, midiOf, spell, noteLabel, pitchName, diatonicIndex, pc } from '../core/music.js';
import { renderStaff, singleScore, staffPos } from '../core/staff.js';
import { pickWeighted, matchesNote, clefKey, rangeOf, poolExtent, wait, button } from './common.js';

export function createFlash(ctx, cfg) {
  const { store, kb, audio } = ctx;
  const clef = cfg.clef || 'treble';
  const pool = (cfg.pool || ['C4', 'D4', 'E4']).map((n) => (typeof n === 'string' ? parseNote(n) : n));
  const total = cfg.count || 10;
  const answerBy = cfg.answer || 'keys';
  const ck = clefKey(clef);
  const keyOf = (n) => `r:${ck}:${midiOf(n)}`;
  const extent = poolExtent(pool, clef, staffPos);

  let done = 0;
  let target = null;
  let wrong = 0;
  let locked = false;
  let shownAt = 0;
  let lastKey = null;
  let ghost = null;

  const staffEl = h('div', { class: 'staff-card flash-card' });
  const sub = h('p', { class: 'prompt-sub' }, answerBy === 'names' ? 'Tap the name of this note.' : 'Play this note.');
  const namesEl = h('div', { class: 'name-pad' });

  function draw(state = null) {
    const w = staffEl.clientWidth - 24 || 300;
    const opts = {
      width: Math.min(w, 420),
      free: true,
      center: true,
      maxSpace: 16,
      extent: { [clef]: extent },
      states: state ? { n0: state } : {},
      label: `${clef === 'bass' ? 'Bass' : 'Treble'} staff with one note`,
    };
    if (ghost) opts.ghosts = [{ absBeat: 0, note: ghost, cls: 'wrong', dx: 1.7 }];
    renderStaff(staffEl, singleScore([target], clef), opts);
  }

  function nextItem() {
    target = pickWeighted(pool, keyOf, store, lastKey);
    lastKey = keyOf(target);
    wrong = 0;
    locked = false;
    ghost = null;
    shownAt = performance.now();
    draw();
    ctx.feedback('');
    kb.clearMarks();
  }

  async function correct(midiPlayed) {
    locked = true;
    const first = wrong === 0;
    const ms = performance.now() - shownAt;
    draw('good');
    if (midiPlayed != null) kb.mark(midiPlayed, 'good', 700);
    audio.sfx('good');
    const other = midiPlayed != null && midiPlayed !== midiOf(target);
    ctx.feedback(`${noteLabel(target)}${other ? ' (another octave, that counts!)' : ''}`, 'good');
    store.add(keyOf(target), 1, first ? 1 : 0, first ? ms : 0, first ? 1 : 0);
    store.pushResult(keyOf(target), first);
    ctx.record({ correct: first, xp: first ? 2 : 1 });
    ctx.progress(1);
    done++;
    if (!(await wait(ctx, 700))) return;
    if (done >= total) ctx.done();
    else nextItem();
  }

  function miss(playedNote, midiPlayed) {
    wrong++;
    audio.sfx('soft-wrong');
    if (midiPlayed != null) kb.mark(midiPlayed, 'bad', 650);
    const tMidi = midiOf(target);
    let dir = '';
    if (playedNote) {
      const d = diatonicIndex(target) - diatonicIndex(playedNote);
      if (d !== 0 && Math.abs(d) <= 7) dir = d > 0 ? ' The note on the staff is higher.' : ' The note on the staff is lower.';
      ghost = playedNote;
      draw();
    }
    const played = playedNote ? noteLabel(playedNote, { octave: answerBy === 'keys' }) : '';
    ctx.feedback(`Not quite${played ? `, that was ${played}` : ''}.${dir}${wrong >= 2 ? ` It's ${noteLabel(target)}.` : ''}`, 'hint');
    if (wrong >= 2 && answerBy === 'keys') kb.mark(tMidi, 'hint');
    if (wrong >= 2 && answerBy === 'names') {
      namesEl.querySelectorAll('button').forEach((b) => b.classList.toggle('hinted', b.dataset.name === pitchName(target)));
    }
  }

  function onNameTap(name) {
    if (locked) return;
    const n = { ...parseNote(name + target.octave) };
    if (pitchName(n) === pitchName(target) || pc(midiOf(n)) === pc(midiOf(target))) {
      namesEl.querySelectorAll('button').forEach((b) => b.classList.remove('hinted'));
      audio.playNote(midiOf(target), { dur: 0.6 });
      correct(null);
    } else {
      miss(n, null);
    }
  }

  function buildNames() {
    namesEl.textContent = '';
    const naturals = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
    const accs = [...new Set(pool.filter((n) => n.acc !== 0).map(pitchName))];
    const row1 = h('div', { class: 'name-row' }, naturals.map((nm) => {
      const b = button(nm, { kind: 'key', onclick: () => onNameTap(nm) });
      b.dataset.name = nm;
      return b;
    }));
    namesEl.append(row1);
    if (accs.length) {
      namesEl.append(h('div', { class: 'name-row' }, accs.map((nm) => {
        const b = button(nm.replace('#', '♯').replace('b', '♭'), { kind: 'key', onclick: () => onNameTap(nm) });
        b.dataset.name = nm;
        return b;
      })));
    }
  }

  let ro = null;
  return {
    mount() {
      ctx.setTitle(clef === 'bass' ? 'Read the bass note' : 'Read the note');
      ctx.body.append(h('div', { class: 'prompt-block' }, staffEl, sub, answerBy === 'names' ? namesEl : null));
      if (answerBy === 'names') {
        buildNames();
        ctx.showKeyboard(false);
      } else {
        const [lo, hi] = rangeOf(pool);
        kb.focus(lo, hi);
      }
      requestAnimationFrame(() => nextItem());
      if (typeof ResizeObserver === 'function') {
        let last = 0;
        ro = new ResizeObserver(() => {
          if (target && Math.abs(staffEl.clientWidth - last) > 8) {
            last = staffEl.clientWidth;
            draw(locked ? 'good' : null);
          }
        });
        ro.observe(staffEl);
      }
    },
    onNoteOn(e) {
      if (locked || !target || answerBy !== 'keys') return;
      if (matchesNote(e.midi, target, store.settings.anyOctave)) correct(e.midi);
      else miss(spell(e.midi, target.acc < 0 ? 'flat' : 'sharp'), e.midi);
    },
    destroy() {
      ro && ro.disconnect();
      kb.clearMarks();
    },
  };
}
