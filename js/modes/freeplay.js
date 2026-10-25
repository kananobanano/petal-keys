// Free Play (Mirror): play anything and watch it appear on the grand staff.
// Notes pressed together show up as one chord. Noodling counts a little
// towards the day's XP (1 XP per 25 notes, up to 10 a day).

import { h, dayKey } from '../core/util.js';
import { icon } from '../ui/icons.js';
import { spell, detectChord, noteLabel } from '../core/music.js';
import { renderStaff, rowScore } from '../core/staff.js';
import { button } from './common.js';
import { INSTRUMENTS } from '../core/audio.js';

const MAX_EVENTS = 12;
const CHORD_MS = 90;

export function createFreePlay(ctx) {
  const { store, kb, bus } = ctx;
  let events = []; // arrays of midi
  let group = null;
  let groupTimer = 0;
  let noteCount = 0;
  let names = store.settings.freeNames;

  const bigEl = h('div', { class: 'free-big', 'aria-live': 'polite' }, '♪');
  const subEl = h('p', { class: 'prompt-sub' }, 'Play anything. Your notes appear on the staff.');
  const staffEl = h('div', { class: 'staff-card free-card' });
  const namesBtn = button(names ? 'Hide names' : 'Show names', { kind: 'ghost', onclick: () => toggleNames() });

  function toggleNames() {
    names = !names;
    store.set('freeNames', names);
    namesBtn.querySelector('span').textContent = names ? 'Hide names' : 'Show names';
    draw();
  }

  function draw() {
    const w = Math.max(260, staffEl.clientWidth - 20 || 320);
    const groups = events.map((g) => g.map((m) => spell(m)));
    renderStaff(staffEl, rowScore(groups, 'grand'), {
      width: w, free: true, alignRight: true, noteNames: names, maxSpace: 11,
      extent: { treble: [-3, 12], bass: [-4, 11] }, freeAdvance: 4.6,
      label: groups.length ? `Grand staff: ${groups.map((g) => g.map((n) => noteLabel(n)).join(' ')).join(', ')}` : 'Empty grand staff',
    });
  }

  function updateLabel() {
    const held = bus.held();
    const chord = detectChord(held);
    if (chord) {
      bigEl.textContent = chord.symbol;
      subEl.textContent = chord.name;
    } else if (held.length) {
      bigEl.textContent = held.map((m) => noteLabel(spell(m), { octave: false })).join(' ');
      subEl.textContent = held.map((m) => noteLabel(spell(m))).join(' · ');
    }
  }

  function closeGroup() {
    if (!group) return;
    events.push(group.sort((a, b) => a - b));
    if (events.length > MAX_EVENTS) events = events.slice(-MAX_EVENTS);
    group = null;
    draw();
  }

  function countNote() {
    noteCount++;
    if (noteCount % 25 === 0) {
      const key = 'fx:' + dayKey();
      if ((store.total(key)[0] || 0) < 10) {
        store.add(key, 1);
        ctx.addXp(1);
      }
    }
  }

  let ro = null;
  return {
    mount() {
      ctx.setTitle('Free play');
      ctx.body.append(h('div', { class: 'prompt-block free' }, bigEl, subEl, staffEl));
      const sel = h('select', { class: 'select inst-select', id: 'free-inst', 'aria-label': 'Instrument', onchange: (e) => ctx.app.setInstrument(e.target.value) },
        INSTRUMENTS.map((i) => h('option', { value: i.id, selected: i.id === (store.settings.instrument || 'piano') }, i.label)));
      ctx.body.querySelector('.prompt-block').prepend(h('label', { class: 'inst-pick' }, icon('sound'), sel));
      ctx.setActions(
        button('Clear', { kind: 'ghost', ico: 'replay', onclick: () => { events = []; draw(); bigEl.textContent = '♪'; } }),
        namesBtn,
        button('Done', { kind: 'primary', onclick: () => ctx.done() }),
      );
      kb.focus(48, 84);
      requestAnimationFrame(draw);
      if (typeof ResizeObserver === 'function') {
        let last = 0;
        ro = new ResizeObserver(() => {
          if (Math.abs(staffEl.clientWidth - last) > 8) {
            last = staffEl.clientWidth;
            draw();
          }
        });
        ro.observe(staffEl);
      }
    },
    onNoteOn(e) {
      countNote();
      if (!group) {
        group = [e.midi];
        clearTimeout(groupTimer);
        groupTimer = setTimeout(closeGroup, CHORD_MS);
      } else if (!group.includes(e.midi)) {
        group.push(e.midi);
      }
      updateLabel();
    },
    onNoteOff() {
      updateLabel();
    },
    destroy() {
      clearTimeout(groupTimer);
      ro && ro.disconnect();
    },
  };
}
