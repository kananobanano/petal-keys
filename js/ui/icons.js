// Tiny inline icons (24×24, drawn with the current text colour).

const wrap = (body, extra = '') =>
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${body}</svg>`;

export const ICONS = {
  learn: wrap('<ellipse cx="8.5" cy="17" rx="3.6" ry="2.7" transform="rotate(-20 8.5 17)" fill="currentColor" stroke="none"/><path d="M11.6 15.6V4.2c2.6.4 5.6 2 6.6 5"/>'),
  practice: wrap('<path d="M12 3.5l1.9 5.2 5.4.3-4.2 3.4 1.5 5.3L12 14.6l-4.6 3.1 1.5-5.3L4.7 9l5.4-.3z"/>'),
  me: wrap('<circle cx="12" cy="8.2" r="3.6"/><path d="M4.8 20c1.1-3.6 3.8-5.4 7.2-5.4s6.1 1.8 7.2 5.4"/>'),
  play: wrap('<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>'),
  close: wrap('<path d="M6 6l12 12M18 6L6 18"/>'),
  back: wrap('<path d="M14.5 5.5L8 12l6.5 6.5"/>'),
  replay: wrap('<path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5"/><path d="M4.5 4.5v4h4"/>'),
  listen: wrap('<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3.5" y="13.5" width="4" height="6" rx="1.6"/><rect x="16.5" y="13.5" width="4" height="6" rx="1.6"/>'),
  ear: wrap('<path d="M7.5 9a4.8 4.8 0 1 1 9.6 0c0 2.6-1.7 3.6-2.7 4.6-.9.9-1 2-1.4 3.2A3 3 0 0 1 7.4 17"/><path d="M10.2 9.3a2.1 2.1 0 1 1 3.6 1.4"/>'),
  chord: wrap('<ellipse cx="9" cy="17.5" rx="2.6" ry="1.9" fill="currentColor" stroke="none"/><ellipse cx="9" cy="12.5" rx="2.6" ry="1.9" fill="currentColor" stroke="none"/><ellipse cx="9" cy="7.5" rx="2.6" ry="1.9" fill="currentColor" stroke="none"/><path d="M11.6 17.3V3.5"/>'),
  rush: wrap('<ellipse cx="6.5" cy="16.5" rx="2.6" ry="2" fill="currentColor" stroke="none"/><ellipse cx="15.5" cy="13.5" rx="2.6" ry="2" fill="currentColor" stroke="none"/><path d="M9 16.3V6.5l9-2.5v9.3"/><path d="M9 9.5l9-2.5"/>'),
  flash: wrap('<rect x="4" y="5" width="16" height="14" rx="3"/><path d="M7 9h10M7 12h10M7 15h10" stroke-width="1.2"/><ellipse cx="12.5" cy="13.5" rx="1.9" ry="1.4" fill="currentColor" stroke="none"/>'),
  keys: wrap('<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M8 5v14M12 5v14M16 5v14"/><path d="M6.6 5v7.5M10.6 5v7.5M14.6 5v7.5M18.6 5v7.5" stroke-width="2.6"/>'),
  free: wrap('<path d="M12 20.5s-7-4.3-7-9.4a4 4 0 0 1 7-2.6 4 4 0 0 1 7 2.6c0 5.1-7 9.4-7 9.4z"/>'),
  mix: wrap('<path d="M4 7h3.5c4.5 0 4.5 10 9 10H20"/><path d="M4 17h3.5c1.9 0 2.9-1.6 3.7-3.5"/><path d="M13.3 10.4C14.1 8.5 15 7 16.5 7H20"/><path d="M17.5 4.5L20 7l-2.5 2.5M17.5 14.5L20 17l-2.5 2.5"/>'),
  check: wrap('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  lock: wrap('<rect x="5.5" y="10.5" width="13" height="9" rx="2.4"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>'),
  star: wrap('<path d="M12 3.8l2.4 5 5.4.6-4 3.7 1.1 5.4L12 15.8l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z" fill="currentColor"/>'),
  flower: wrap('<circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none"/><path d="M12 9.6c-1.7-2.2-1.4-5 0-5.6 1.4.6 1.7 3.4 0 5.6zM14.3 10.8c1.1-2.6 3.8-3.5 4.9-2.6-.1 1.5-2.3 3.2-4.9 2.6zM14.1 13.6c2.7.5 4.1 3 3.4 4.2-1.5.2-3.5-1.6-3.4-4.2zM11.3 14.4c-.2 2.8-2.6 4.4-3.9 3.8-.3-1.5 1.4-3.6 3.9-3.8zM9.6 11.9C7 11 6 8.4 6.8 7.2c1.5-.1 3.3 2 2.8 4.7z"/>'),
  shield: wrap('<path d="M12 3.5l7 2.8v5.2c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6.3z"/><path d="M9 12l2.2 2.2L15.5 10"/>'),
  plug: wrap('<path d="M9 3.5v4M15 3.5v4"/><path d="M6.5 7.5h11v3.2a5.5 5.5 0 0 1-11 0z"/><path d="M12 16.2v4.3"/>'),
  share: wrap('<path d="M12 4v11"/><path d="M7.5 8.5L12 4l4.5 4.5"/><path d="M5 13.5v4a2.5 2.5 0 0 0 2.5 2.5h9a2.5 2.5 0 0 0 2.5-2.5v-4"/>'),
  download: wrap('<path d="M12 4v11"/><path d="M7.5 10.5L12 15l4.5-4.5"/><path d="M5 19.5h14"/>'),
  copy: wrap('<rect x="8.5" y="8.5" width="11" height="11" rx="2.4"/><path d="M15.5 8.5V6.5A2 2 0 0 0 13.5 4.5h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/>'),
  upload: wrap('<path d="M12 15V4"/><path d="M7.5 8.5L12 4l4.5 4.5"/><path d="M5 19.5h14"/>'),
  gear: wrap('<circle cx="12" cy="12" r="3"/><path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.5-2-3.4-2.3 1a7.5 7.5 0 0 0-2.6-1.5L14.2 2.6h-4l-.4 2.5a7.5 7.5 0 0 0-2.6 1.5l-2.3-1-2 3.4 2 1.5a7.6 7.6 0 0 0 0 3l-2 1.5 2 3.4 2.3-1a7.5 7.5 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a7.5 7.5 0 0 0 2.6-1.5l2.3 1 2-3.4z"/>'),
  metronome: wrap('<path d="M9 3.8h6l3.5 16.4H5.5z"/><path d="M12 15l4.5-8"/><path d="M7 16h10"/>'),
  sparkle: wrap('<path d="M12 3c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7z" fill="currentColor"/>'),
  up: wrap('<path d="M12 19V5M6 11l6-6 6 6"/>'),
  down: wrap('<path d="M12 5v14M6 13l6 6 6-6"/>'),
  sound: wrap('<path d="M4.5 9.5h3l4.5-4v13l-4.5-4h-3z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>'),
  info: wrap('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.2"/>'),
  moon: wrap('<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/>'),
  install: wrap('<rect x="6.5" y="2.8" width="11" height="18.4" rx="2.6"/><path d="M12 7.5v7M9.3 12l2.7 2.7 2.7-2.7"/>'),
};

export function icon(name, cls = '') {
  const span = document.createElement('span');
  span.className = 'ico' + (cls ? ' ' + cls : '');
  span.innerHTML = ICONS[name] || '';
  return span;
}
