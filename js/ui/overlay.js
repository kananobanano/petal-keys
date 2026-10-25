// Toasts, bottom sheets and in-page confirmations (no browser dialogs).

import { h } from '../core/util.js';

let toastRoot = null;
let sheetRoot = null;

export function initOverlays(root) {
  toastRoot = h('div', { class: 'toasts', 'aria-live': 'polite' });
  sheetRoot = h('div', { class: 'sheets' });
  root.append(toastRoot, sheetRoot);
}

export function toast(msg, { kind = 'info', ms = 2800, action = null } = {}) {
  if (!toastRoot) return () => {};
  const el = h('div', { class: `toast t-${kind}`, role: 'status' }, h('span', { class: 'toast-msg' }, msg));
  let timer = null;
  const dismiss = () => {
    clearTimeout(timer);
    el.classList.remove('in');
    setTimeout(() => el.remove(), 260);
  };
  if (action) {
    el.append(h('button', { class: 'toast-act', type: 'button', onclick: () => { dismiss(); action.fn(); } }, action.label));
  }
  toastRoot.append(el);
  requestAnimationFrame(() => el.classList.add('in'));
  if (ms) timer = setTimeout(dismiss, ms);
  return dismiss;
}

/** Bottom sheet. Returns a close() function. */
export function sheet(content, { title = '', onClose = null, dismissible = true, cls = '' } = {}) {
  if (!sheetRoot) return () => {};
  const backdrop = h('div', { class: 'sheet-backdrop' });
  const panel = h(
    'div',
    { class: `sheet ${cls}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'Dialog' },
    h('div', { class: 'sheet-grip', 'aria-hidden': 'true' }),
    title ? h('h2', { class: 'sheet-title' }, title) : null,
    content,
  );
  const wrap = h('div', { class: 'sheet-wrap' }, backdrop, panel);
  sheetRoot.append(wrap);
  const prevFocus = document.activeElement;
  requestAnimationFrame(() => wrap.classList.add('in'));
  let closed = false;
  const onKey = (e) => {
    if (e.key === 'Escape' && dismissible) close();
  };
  function close() {
    if (closed) return;
    closed = true;
    wrap.classList.remove('in');
    document.removeEventListener('keydown', onKey, true);
    setTimeout(() => wrap.remove(), 240);
    if (prevFocus && prevFocus.focus) prevFocus.focus({ preventScroll: true });
    onClose && onClose();
  }
  if (dismissible) backdrop.addEventListener('click', close);
  document.addEventListener('keydown', onKey, true);
  setTimeout(() => {
    const f = panel.querySelector('[data-autofocus], button, input, select, textarea');
    f && f.focus({ preventScroll: true });
  }, 60);
  return close;
}

export function confirmSheet({ title, body = '', ok = 'OK', cancel = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    const done = (v) => {
      if (answered) return;
      answered = true;
      close();
      resolve(v);
    };
    const content = h(
      'div',
      { class: 'confirm' },
      body ? h('p', { class: 'muted' }, body) : null,
      h(
        'div',
        { class: 'row-actions' },
        h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => done(false) }, cancel),
        h('button', { class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, type: 'button', 'data-autofocus': '', onclick: () => done(true) }, ok),
      ),
    );
    const close = sheet(content, { title, onClose: () => { if (!answered) { answered = true; resolve(false); } } });
  });
}
