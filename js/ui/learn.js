// The Learn tab: a path of lessons drawn as noteheads climbing a melody,
// grouped under rehearsal marks (A, B, C…) like sections of a score.

import { h } from '../core/util.js';
import { icon } from './icons.js';
import { sheet, confirmSheet } from './overlay.js';
import { UNITS, LESSONS, isOpen, currentIndex, lessonIndex } from '../lessons.js';

const CONTOUR = [0, 0.55, 0.85, 0.55, 0, -0.55, -0.85, -0.55];

function drillText(d) {
  switch (d.mode) {
    case 'name': return 'Find keys by their names';
    case 'flash': return `Read ${d.count} notes on the ${d.clef} staff`;
    case 'rush': return `Note Rush: ${d.count} short lines at ♩ = ${d.tempo}`;
    case 'chord': return `Build chords: ${d.chords.join(', ')}`;
    case 'hl': return `Higher or lower: ${d.count} rounds`;
    case 'find': return `Find the note by ear: ${d.count} rounds`;
    default: return '';
  }
}

function greeting(name) {
  const hr = new Date().getHours();
  const part = hr < 5 ? 'Hello' : hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
  return name ? `${part}, ${name}` : part;
}

export function renderLearn(app, root) {
  const { store } = app;
  const cur = currentIndex(store);
  const streak = store.streak();
  const goal = store.settings.dailyGoal;
  const today = store.xpToday();

  let sub;
  if (!store.hasProgress()) sub = 'Start with lesson one. It takes about two minutes.';
  else if (today >= goal) sub = "Today's goal is done. Anything more is a bonus!";
  else if (streak.todayDone) sub = `${goal - today} XP to go for today's goal.`;
  else if (streak.count > 0) sub = 'One short lesson or practice keeps your streak growing.';
  else sub = 'Pick up where you left off whenever you like.';

  const head = h('header', { class: 'page-head' },
    h('h1', { class: 'page-title' }, greeting(store.settings.name)),
    h('p', { class: 'page-sub' }, sub));

  let upNext = null;
  if (cur >= 0) {
    const L = LESSONS[cur];
    const unit = UNITS.find((u) => u.id === L.unit);
    upNext = h('section', { class: 'up-next', 'aria-label': 'Next lesson' },
      h('div', { class: 'rehearsal big', 'aria-hidden': 'true' }, unit.id),
      h('div', { class: 'up-next-text' },
        h('p', { class: 'eyebrow' }, `Up next · ${unit.title}`),
        h('h2', {}, L.title),
        h('p', { class: 'muted' }, drillText(L.drill))),
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => app.startLesson(L) }, icon('play'), h('span', {}, 'Start')));
  } else {
    upNext = h('section', { class: 'up-next done' },
      icon('sparkle', 'up-next-ico'),
      h('div', { class: 'up-next-text' },
        h('h2', {}, 'Every lesson finished!'),
        h('p', { class: 'muted' }, 'Practice keeps it all fresh. Redo any lesson for more stars.')));
  }

  const path = h('div', { class: 'path' });
  for (const unit of UNITS) {
    const lessons = LESSONS.filter((l) => l.unit === unit.id);
    const doneCount = lessons.filter((l) => store.lesson(l.id).done).length;
    const list = h('ol', { class: 'path-list' });
    for (const L of lessons) {
      const i = lessonIndex(L.id);
      const st = store.lesson(L.id);
      const open = isOpen(store, i);
      const state = st.done ? 'done' : open ? (i === cur ? 'current' : 'open') : 'locked';
      const x = CONTOUR[i % CONTOUR.length];
      const node = h('button', {
        class: `node node-${state}`,
        type: 'button',
        'aria-label': `${L.title}${st.done ? `, ${st.stars} of 3 stars` : state === 'locked' ? ', locked' : ''}`,
        onclick: () => openLesson(app, L, i, state),
      }, h('span', { class: 'node-head' }, icon(state === 'done' ? 'check' : state === 'locked' ? 'lock' : 'play')), h('span', { class: 'node-stem', 'aria-hidden': 'true' }));
      const stars = st.done ? h('span', { class: 'node-stars', 'aria-hidden': 'true' }, [1, 2, 3].map((k) => icon('star', k <= st.stars ? 'on' : ''))) : null;
      list.append(h('li', { class: `path-item ${state}`, style: `--x:${x}` },
        node,
        h('span', { class: 'node-label' }, h('span', { class: 'node-num' }, String(i + 1)), L.short),
        stars,
        state === 'current' ? h('span', { class: 'node-tag' }, 'Start here') : null));
    }
    path.append(h('section', { class: 'unit' },
      h('header', { class: 'unit-head' },
        h('div', { class: 'rehearsal', 'aria-hidden': 'true' }, unit.id),
        h('div', { class: 'unit-text' },
          h('h2', { class: 'unit-title' }, unit.title),
          h('p', { class: 'unit-blurb' }, unit.blurb)),
        h('span', { class: 'unit-count' }, `${doneCount}/${lessons.length}`)),
      list));
  }

  root.append(head, upNext, path);
}

function openLesson(app, L, i, state) {
  const { store } = app;
  const st = store.lesson(L.id);
  if (state === 'locked') {
    const close = sheet(h('div', { class: 'sheet-body' },
      h('p', {}, 'Finish the lesson before this one to open it.'),
      h('p', { class: 'muted' }, 'Already know this part? You can jump ahead. Earlier lessons stay open to come back to.'),
      h('div', { class: 'row-actions' },
        h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => close() }, 'Not now'),
        h('button', { class: 'btn btn-primary', type: 'button', onclick: async () => {
          close();
          const ok = await confirmSheet({ title: `Jump to “${L.title}”?`, body: 'Lessons before it will be marked as open (without stars).', ok: 'Jump here' });
          if (!ok) return;
          for (let k = 0; k <= i; k++) store.unlockLesson(LESSONS[k].id);
          app.refresh();
        } }, 'Jump here'))), { title: L.title });
    return;
  }
  const close = sheet(h('div', { class: 'sheet-body' },
    h('p', { class: 'muted' }, `${L.cards.length} short card${L.cards.length === 1 ? '' : 's'}, then: ${drillText(L.drill)}.`),
    st.done ? h('p', { class: 'stars-inline', 'aria-label': `${st.stars} of 3 stars` }, [1, 2, 3].map((k) => icon('star', k <= st.stars ? 'on' : ''))) : null,
    h('div', { class: 'row-actions' },
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => close() }, 'Close'),
      h('button', { class: 'btn btn-primary', type: 'button', 'data-autofocus': '', onclick: () => { close(); app.startLesson(L); } },
        icon('play'), h('span', {}, st.done ? 'Redo lesson' : 'Start')))), { title: L.title });
}
