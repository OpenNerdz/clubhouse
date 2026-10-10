// Pieces shared by several screens.
import { h, icon, googleLogo, microsoftLogo, formatDay, formatTime, formatEmailDate, formatFullDate, formatLongDay, formatShortDate, whenLabel, weekdayShort, monthShort, fromIso } from '../ui.js';
import { CATEGORIES } from '../parser.js';
import { latestHandicapEmail, formatIndex, scoreToPar, resultTitle } from '../golf.js';
import { emailSheet, roundSheet, upcomingSheet } from './sheets.js';

export const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

export function categoryBadge(cat, { withLabel = false } = {}) {
  const c = CATEGORIES[cat] || CATEGORIES.other;
  return h('span', { class: `cat cat-${cat}`, title: c.label }, icon(c.icon, 16), withLabel ? h('span', null, c.label) : h('span', { class: 'sr-only' }, c.label));
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const indexChange = (d) => (d.prevIndex ? Math.round((parseFloat(d.index) - parseFloat(d.prevIndex)) * 10) / 10 : 0);

/** One short line with the facts that matter, e.g. "Tue 13 Oct · 8:30 AM · 4 players". */
export function summary(e) {
  const d = e.details || {};
  const parts = [];
  const when = () => {
    if (d.date) parts.push(formatDay(d.date));
    if (d.time) parts.push(formatTime(d.time));
  };
  switch (e.category) {
    case 'teetime':
      if (d.status === 'cancelled') parts.push(h('strong', { class: 'tone-danger' }, 'Cancelled'));
      when();
      if (d.players) parts.push(plural(d.players, 'player'));
      break;
    case 'competition':
      if (d.kind === 'result') {
        if (d.position) parts.push(h('strong', null, d.field ? `${ordinal(d.position)} of ${d.field}` : ordinal(d.position)));
        if (d.points) parts.push(`${d.points} pts`);
        if (d.net) parts.push(`Net ${d.net}`);
        else if (d.gross) parts.push(`Gross ${d.gross}`);
      } else when();
      break;
    case 'handicap':
      if (d.index) {
        parts.push(h('strong', null, `Index ${formatIndex(d.index)}`));
        const change = indexChange(d);
        if (change) parts.push(h('span', { class: change < 0 ? 'tone-good' : '' }, `${change < 0 ? 'down' : 'up'} ${Math.abs(change).toFixed(1)}`));
      }
      break;
    case 'shop':
      for (const k of ['status', 'total', 'discount']) if (d[k]) parts.push(d[k]);
      break;
    case 'club':
      if (d.notice) parts.push(d.notice);
      break;
    default:
      when();
  }
  if (!parts.length) return null;
  const line = h('span', { class: 'row-meta' });
  parts.forEach((p, i) => line.append(...(i ? [' · ', p] : [p])));
  return line;
}

export function mailRow(ctx, e) {
  return h('li', null,
    h('button', { class: 'row mail-row', type: 'button', onclick: () => emailSheet(ctx, e.id) },
      categoryBadge(e.category),
      h('span', { class: 'row-main' },
        h('span', { class: 'row-top' },
          h('span', { class: 'row-from' }, e.fromName),
          h('span', { class: 'row-date' }, formatEmailDate(e.date))),
        h('span', { class: 'row-title' }, e.subject),
        summary(e))));
}

/** The next booking, shown large: where, when and who. */
export function nextUp(ctx, item) {
  const soon = whenLabel(item.date);
  const meta = [];
  if (item.type === 'event' && item.course) meta.push(item.course);
  if (item.players) meta.push(plural(item.players, 'player'));
  return h('button', { class: `next ${item.type === 'event' ? 'next-event' : ''}`, type: 'button', onclick: () => upcomingSheet(ctx, item) },
    h('span', { class: 'next-kicker' }, item.type === 'event' ? 'Next competition' : 'Next tee time', soon ? ` · ${soon}` : ''),
    h('span', { class: 'next-title' }, item.title),
    h('span', { class: 'next-when' }, formatLongDay(item.date), item.time ? `, ${formatTime(item.time)}` : ''),
    meta.length ? h('span', { class: 'next-meta' }, meta.join(' · ')) : null);
}

export function upcomingRow(ctx, item) {
  const meta = [];
  if (item.time) meta.push(formatTime(item.time));
  if (item.type === 'event') meta.push('Competition');
  if (item.players) meta.push(`${item.players} player${item.players === 1 ? '' : 's'}`);
  if (item.type === 'event' && item.course) meta.push(item.course);
  const label = whenLabel(item.date);
  const d = fromIso(item.date);
  return h('li', null,
    h('button', { class: 'row upcoming-row', type: 'button', onclick: () => upcomingSheet(ctx, item) },
      h('span', { class: `datebox ${item.type === 'event' ? 'datebox-event' : ''}`, 'aria-hidden': 'true' },
        h('span', { class: 'datebox-dow' }, weekdayShort(item.date)),
        h('span', { class: 'datebox-day' }, String(d.getDate())),
        h('span', { class: 'datebox-mon' }, monthShort(item.date))),
      h('span', { class: 'row-main' },
        h('span', { class: 'sr-only' }, `${formatFullDate(item.date)}. `),
        h('span', { class: 'row-title' }, item.title),
        meta.length ? h('span', { class: 'row-meta' }, meta.join(' · ')) : null),
      label ? h('span', { class: `when ${label === 'Today' || label === 'Tomorrow' ? 'when-soon' : ''}` }, label) : null));
}

export function roundRow(ctx, r) {
  const toPar = scoreToPar(r);
  const meta = [formatDay(r.date)];
  if (r.holes === 9) meta.push('9 holes');
  if (r.points) meta.push(`${r.points} pts`);
  if (r.partners) meta.push(`with ${r.partners}`);
  return h('li', null,
    h('button', { class: 'row round-row', type: 'button', onclick: () => roundSheet(ctx, { round: r }) },
      h('span', { class: 'row-main' },
        h('span', { class: 'row-title' }, r.course || 'Round'),
        h('span', { class: 'row-meta' }, meta.join(' · '))),
      h('span', { class: 'score' },
        h('span', { class: 'score-value' }, String(r.score)),
        toPar ? h('span', { class: 'score-par' }, toPar) : null)));
}

export function resultRow(ctx, e) {
  const d = e.details;
  let figure = '';
  if (d.position) figure = d.field ? `${ordinal(d.position)}/${d.field}` : ordinal(d.position);
  else if (d.points) figure = `${d.points} pts`;
  else if (d.net) figure = `Net ${d.net}`;
  const meta = [formatEmailDate(e.date)];
  if (d.points && d.position) meta.push(`${d.points} pts`);
  if (d.net && (d.position || d.points)) meta.push(`Net ${d.net}`);
  return h('li', null,
    h('button', { class: 'row', type: 'button', onclick: () => emailSheet(ctx, e.id) },
      h('span', { class: 'row-main' },
        h('span', { class: 'row-title' }, resultTitle(e.subject)),
        h('span', { class: 'row-meta' }, meta.join(' · '))),
      figure ? h('span', { class: 'figure' }, figure) : null));
}

/** Handicap, average and best score in one compact strip. */
export function statStrip(ctx) {
  const s = ctx.stats();
  const items = [];
  const official = latestHandicapEmail(ctx.emails());
  if (official) {
    const change = indexChange(official.details);
    items.push(stat('Handicap', formatIndex(official.details.index),
      change ? h('span', { class: change < 0 ? 'tone-good' : '' }, `${change < 0 ? '↓' : '↑'} ${Math.abs(change).toFixed(1)}`) : 'Official'));
  } else if (ctx.settings.handicapEstimate) {
    items.push(stat('Handicap', s.index !== null ? formatIndex(s.index) : '–', s.index !== null ? 'Estimate' : 'Needs 3 rounds'));
  }
  items.push(stat('Average', s.average !== null ? String(s.average) : '–', s.average !== null ? `Last ${s.averageOf}` : 'No rounds yet'));
  items.push(stat('Best', s.best ? String(s.best.score) : '–', s.best ? formatShortDate(s.best.date) : 'No rounds yet'));
  return h('section', { class: 'stats', 'aria-label': 'Your game' }, items);
}

function stat(label, value, note) {
  return h('div', { class: `stat ${value === '–' ? 'stat-empty' : ''}` },
    h('div', { class: 'stat-label' }, label),
    h('div', { class: 'stat-value' }, value),
    h('div', { class: 'stat-note' }, note));
}

export const shortCourse = (name = '') => name.replace(/\s+(?:Golf\s*(?:&|and)\s*Country\s+Club|Golf\s+Club|Golf\s+Course|Country\s+Club|G\.?C\.?)$/i, '');

export function connectCard(ctx, { compact = false } = {}) {
  return h('section', { class: `card connect ${compact ? 'connect-compact' : ''}` },
    h('div', { class: 'connect-icon' }, icon('mail', 22)),
    h('div', { class: 'connect-text' },
      h('h2', null, 'Connect your email'),
      h('p', null, 'Clubhouse will find tee times, competitions, handicap updates and club news in your Gmail or Outlook. It only reads; it can’t send or delete anything.')),
    h('div', { class: 'connect-action' }, signInButtons(ctx, 'Connect')));
}

/** "Continue with Google" and "Continue with Microsoft", with a note for any not set up yet. */
export function signInButtons(ctx, verb = 'Continue') {
  const button = (id, logo, name) => h('button', {
    class: 'btn btn-google',
    type: 'button',
    onclick: () => ctx.actions.connect(id),
    disabled: !ctx.configuredFor(id) || !!ctx.busy,
  }, logo, h('span', null, `${verb} with ${name}`));
  const missing = [['google', 'Gmail'], ['microsoft', 'Outlook']].filter(([id]) => !ctx.configuredFor(id)).map(([, n]) => n);
  return h('div', { class: 'signin-buttons' },
    button('google', googleLogo(18), 'Google'),
    button('microsoft', microsoftLogo(17), 'Microsoft'),
    ctx.busy ? h('p', { class: 'setup-note', role: 'status' }, ctx.busy) : null,
    missing.length ? h('p', { class: 'setup-note' }, `${missing.join(' and ')} sign-in needs a one-time setup first. See SETUP.md.`) : null);
}
