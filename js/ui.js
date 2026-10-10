// Small DOM toolkit. Every piece of text goes in as a text node, so nothing from
// an email can ever run as code on the page.

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value' || k === 'checked' || k === 'selected' || k === 'indeterminate') el[k] = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  append(el, children);
  return el;
}

/** Like element.append(), but skips null/false instead of printing "null". */
export function add(el, ...children) {
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false || c === '') continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/* ---------- icons (24px line icons) ---------- */

const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9v12h14V9"/><path d="M10 21v-6h4v6"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 7 8.5 6 8.5-6"/>',
  scores: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  settings: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.6-4.5L3 9"/><path d="M3 4v5h5"/><path d="M4 13a8 8 0 0 0 14.6 4.5L21 15"/><path d="M21 20v-5h-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8"/><path d="M18.5 14.5A6.5 6.5 0 0 1 21.5 20"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  external: '<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  trash: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
  hide: '<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c5 0 9 4.5 10 7a13 13 0 0 1-2.4 3.5"/><path d="M6.6 6.6C4.3 8 2.7 10.2 2 12c1 2.5 5 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  flag: '<path d="M6 21V3"/><path d="M6 4h11l-2.5 4L17 12H6"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4"/><path d="M12 13v4M8 21h8M10 17h4"/>',
  gauge: '<path d="M3.5 17a9 9 0 1 1 17 0"/><path d="m12 17 4-6"/>',
  club: '<path d="M3 21h18"/><path d="M5 21V10l7-5 7 5v11"/><path d="M10 21v-5h4v5"/>',
  tag: '<path d="M3 3h8l10 10-8 8L3 11z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  message: '<path d="M4 5h16v11H9l-5 4z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13 7 4 4"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  download: '<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>',
  upload: '<path d="M12 20V9"/><path d="m7 14 5-5 5 5"/><path d="M5 4h14"/>',
  cloud: '<path d="M7 18a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 8.5a4.5 4.5 0 0 1-.5 9.5z"/>',
  logout: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4"/><path d="M10 17l-5-5 5-5"/><path d="M5 12h11"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  alert: '<path d="M12 4 2.5 20h19z"/><path d="M12 10v4M12 17h.01"/>',
  shield: '<path d="M12 3 5 6v5c0 4.5 3 8.5 7 10 4-1.5 7-5.5 7-10V6z"/><path d="m9 12 2 2 4-4"/>',
};

export function icon(name, size = 20) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'icon');
  svg.innerHTML = ICONS[name] || ''; // static markup from the table above only
  return svg;
}

export function googleLogo(size = 18) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 48 48');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML =
    '<path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>' +
    '<path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>' +
    '<path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>' +
    '<path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>';
  return svg;
}

export function microsoftLogo(size = 18) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 21 21');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML =
    '<rect x="1" y="1" width="9" height="9" fill="#f25022"/><rect x="11" y="1" width="9" height="9" fill="#7fba00"/>' +
    '<rect x="1" y="11" width="9" height="9" fill="#00a4ef"/><rect x="11" y="11" width="9" height="9" fill="#ffb900"/>';
  return svg;
}

/* ---------- dates ---------- */

const pad = (n) => String(n).padStart(2, '0');
export const today = () => isoLocal(new Date());
export const isoLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromIso = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const fmtCache = new Map();
function fmt(opts) {
  const key = JSON.stringify(opts);
  if (!fmtCache.has(key)) fmtCache.set(key, new Intl.DateTimeFormat(undefined, opts));
  return fmtCache.get(key);
}

export const formatDay = (iso) => fmt({ weekday: 'short', day: 'numeric', month: 'short' }).format(fromIso(iso));
export const formatShortDate = (iso) => fmt({ day: 'numeric', month: 'short' }).format(fromIso(iso));
export const formatLongDay = (iso) => fmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(fromIso(iso));
export const formatFullDate = (iso) => fmt({ day: 'numeric', month: 'short', year: 'numeric' }).format(fromIso(iso));
export const formatTime = (hhmm) => {
  const [hh, mm] = hhmm.split(':').map(Number);
  return fmt({ hour: 'numeric', minute: '2-digit' }).format(new Date(2000, 0, 1, hh, mm));
};
/** "8:30" and "AM" separately, so the time can be large and the AM/PM small (en-GB gives "08:30" and ""). */
export function timeParts(hhmm) {
  const [hh, mm] = hhmm.split(':').map(Number);
  const parts = fmt({ hour: 'numeric', minute: '2-digit' }).formatToParts(new Date(2000, 0, 1, hh, mm));
  const period = parts.filter((p) => p.type === 'dayPeriod').map((p) => p.value).join('');
  const main = parts.filter((p) => p.type !== 'dayPeriod').map((p) => p.value).join('').trim();
  return { main, period };
}
export const weekdayShort = (iso) => fmt({ weekday: 'short' }).format(fromIso(iso));
export const monthShort = (iso) => fmt({ month: 'short' }).format(fromIso(iso));

/** "2 Oct", or "2 Oct 2025" when it isn't this year. */
export function formatEmailDate(ms) {
  const d = new Date(ms);
  const now = new Date();
  if (isoLocal(d) === isoLocal(now)) return formatTime(`${d.getHours()}:${pad(d.getMinutes())}`);
  const opts = d.getFullYear() === now.getFullYear() ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' };
  return fmt(opts).format(d);
}

export function daysUntil(iso) {
  return Math.round((fromIso(iso) - fromIso(today())) / 86400000);
}

export function whenLabel(iso) {
  const n = daysUntil(iso);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n > 1 && n < 7) return `In ${n} days`;
  if (n >= 7 && n < 14) return 'Next week';
  return '';
}

export function timeAgo(ms) {
  if (!ms) return 'never';
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export function greeting() {
  const hr = new Date().getHours();
  return hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
}

/* ---------- toast & dialogs ---------- */

let toastTimer = null;
export function toast(message, { tone = 'info' } = {}) {
  let el = document.getElementById('toast');
  if (!el) {
    el = h('div', { id: 'toast', class: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(el);
  }
  el.className = `toast toast-${tone}`;
  el.textContent = message;
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), tone === 'error' ? 6000 : 3200);
}

/**
 * Opens a modal sheet. build(close) returns { body, footer } nodes.
 * Returns a close function.
 */
export function openDialog({ title, build, className = '', onClose }) {
  const dlg = h('dialog', { class: `sheet ${className}`, 'aria-label': title });
  const close = () => dlg.close();
  const { body, footer } = build(close);
  add(dlg,
    h('div', { class: 'sheet-head' },
      h('h2', { class: 'sheet-title' }, title),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: close }, icon('close'))),
    h('div', { class: 'sheet-body' }, body),
    footer ? h('div', { class: 'sheet-foot' }, footer) : null,
  );
  dlg.addEventListener('close', () => {
    dlg.remove();
    if (onClose) onClose();
  });
  // Tapping the dimmed area outside the sheet closes it.
  dlg.addEventListener('mousedown', (e) => {
    if (e.target === dlg) close();
  });
  document.body.append(dlg);
  dlg.showModal();
  // On phones, jumping into a text box would pop the keyboard over the form.
  const first = dlg.querySelector('[autofocus]');
  if (first && window.matchMedia('(pointer: fine)').matches) first.focus();
  else dlg.querySelector('.sheet-head .icon-btn').blur();
  return close;
}

export function confirmDialog({ title, message, confirmLabel = 'OK', danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    openDialog({
      title,
      className: 'sheet-small',
      onClose: () => resolve(answered),
      build: (close) => ({
        body: h('p', { class: 'dialog-text' }, message),
        footer: [
          h('button', { class: 'btn', type: 'button', onclick: close }, 'Cancel'),
          h('button', {
            class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`,
            type: 'button',
            onclick: () => { answered = true; close(); },
          }, confirmLabel),
        ],
      }),
    });
  });
}

/* ---------- small components ---------- */

export function card({ title, action, className = '' }, ...children) {
  return h('section', { class: `card ${className}` },
    title || action ? h('div', { class: 'card-head' }, title ? h('h2', null, title) : null, action || null) : null,
    ...children);
}

export function empty(text, action) {
  return h('div', { class: 'empty' }, h('p', null, text), action || null);
}

export function switchRow({ id, label, hint, checked, onChange }) {
  return h('label', { class: 'switch-row', for: id },
    h('span', { class: 'switch-text' }, h('span', { class: 'switch-label' }, label), hint ? h('span', { class: 'switch-hint' }, hint) : null),
    h('input', { id, type: 'checkbox', role: 'switch', class: 'switch', checked: !!checked, onchange: (e) => onChange(e.target.checked) }));
}

/** Tick boxes, like a printed form, for choosing several things at once. */
export function toggleChips({ id, label, options, onChange }) {
  return h('div', { class: 'ticks', role: 'group', 'aria-label': label },
    options.map(([key, text, on]) => h('button', {
      id: `${id}-${key}`,
      class: `tick ${on ? 'on' : ''}`,
      type: 'button',
      role: 'checkbox',
      'aria-checked': on ? 'true' : 'false',
      onclick: () => onChange(key, !on),
    }, h('span', { class: 'tick-box', 'aria-hidden': 'true' }, on ? icon('check', 15) : null), h('span', null, text))));
}

/** A hand-drawn ring in red pen, for circling a good score. */
export function penCircle() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 64 48');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'pen-circle');
  svg.innerHTML = '<path d="M11 28C6 15 21 5 36 6c15 1 25 10 22 22-3 12-20 17-34 14C11 39 6 30 11 21c3-6 9-9 16-11" vector-effect="non-scaling-stroke"/>';
  return svg;
}

export function segmented({ id, options, value, onChange, label }) {
  return h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': label },
    options.map(([val, text]) =>
      h('label', { class: `seg ${val === value ? 'on' : ''}` },
        h('input', { type: 'radio', name: id, id: `${id}-${val}`, value: val, checked: val === value, onchange: () => onChange(val) }),
        h('span', null, text))));
}

export function download(filename, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
