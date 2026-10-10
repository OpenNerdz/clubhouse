// Pieces shared by several screens.
import { h, icon, googleLogo, microsoftLogo, formatDay, formatTime, formatEmailDate, formatFullDate, whenLabel, weekdayShort, monthShort, fromIso } from '../ui.js';
import { CATEGORIES } from '../parser.js';
import { latestHandicapEmail, formatIndex, scoreToPar } from '../golf.js';
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

function chip(iconName, text, tone = '') {
  return h('span', { class: `chip ${tone}` }, iconName ? icon(iconName, 14) : null, text);
}

/** The few most useful facts about an email, as small chips. */
export function detailChips(e) {
  const d = e.details || {};
  const out = [];
  const when = () => {
    if (d.date) out.push(chip('calendar', formatDay(d.date)));
    if (d.time) out.push(chip('clock', formatTime(d.time)));
  };
  switch (e.category) {
    case 'teetime':
      if (d.status === 'cancelled') out.push(chip(null, 'Cancelled', 'chip-danger'));
      when();
      if (d.players) out.push(chip('users', `${d.players} player${d.players === 1 ? '' : 's'}`));
      break;
    case 'competition':
      if (d.kind === 'result') {
        if (d.position) out.push(chip('trophy', d.field ? `${ordinal(d.position)} of ${d.field}` : ordinal(d.position)));
        if (d.points) out.push(chip(null, `${d.points} pts`));
        if (d.net) out.push(chip(null, `Net ${d.net}`));
        else if (d.gross) out.push(chip(null, `Gross ${d.gross}`));
      } else when();
      break;
    case 'handicap':
      if (d.index) {
        out.push(chip('gauge', `Index ${formatIndex(d.index)}`));
        const change = d.prevIndex ? Math.round((parseFloat(d.index) - parseFloat(d.prevIndex)) * 10) / 10 : 0;
        if (change) out.push(chip(null, `${change < 0 ? '↓' : '↑'} ${Math.abs(change).toFixed(1)}`, change < 0 ? 'chip-good' : ''));
      }
      break;
    case 'shop':
      if (d.status) out.push(chip(null, d.status));
      if (d.total) out.push(chip(null, d.total));
      if (d.discount) out.push(chip('tag', d.discount));
      break;
    case 'club':
      if (d.notice) out.push(chip('info', d.notice));
      break;
    default:
      when();
  }
  return out;
}

export function mailRow(ctx, e) {
  const chips = detailChips(e);
  return h('li', null,
    h('button', { class: 'row mail-row', type: 'button', onclick: () => emailSheet(ctx, e.id) },
      categoryBadge(e.category),
      h('span', { class: 'row-main' },
        h('span', { class: 'row-top' },
          h('span', { class: 'row-from' }, e.fromName),
          h('span', { class: 'row-date' }, formatEmailDate(e.date))),
        h('span', { class: 'row-title' }, e.subject),
        chips.length ? h('span', { class: 'chips' }, chips) : null)));
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
        h('span', { class: 'row-title' }, e.subject),
        h('span', { class: 'row-meta' }, meta.join(' · '))),
      figure ? h('span', { class: 'figure' }, figure) : null));
}

export function statTiles(ctx) {
  const stats = ctx.stats();
  const tiles = [];
  const official = latestHandicapEmail(ctx.emails());
  if (official) {
    tiles.push(tile('Handicap index', formatIndex(official.details.index), `From email, ${formatEmailDate(official.date)}`));
  } else if (ctx.settings.handicapEstimate) {
    tiles.push(stats.index !== null
      ? tile('Handicap index', formatIndex(stats.index), 'Estimate from your scores')
      : tile('Handicap index', '–', 'Needs 3 rounds with course rating', true));
  }
  tiles.push(stats.average !== null
    ? tile('Average score', String(stats.average), `Last ${stats.averageOf} round${stats.averageOf === 1 ? '' : 's'}`)
    : tile('Average score', '–', 'No 18-hole rounds yet', true));
  tiles.push(stats.best
    ? tile('Best round', String(stats.best.score), `${stats.best.course ? `${shortCourse(stats.best.course)}, ` : ''}${formatDay(stats.best.date)}`)
    : tile('Best round', '–', 'No 18-hole rounds yet', true));
  tiles.push(tile(`Rounds in ${new Date().getFullYear()}`, String(stats.thisYear), stats.count > stats.thisYear ? `${stats.count} in total` : 'Keep it up', !stats.thisYear));
  return h('div', { class: 'tiles' }, tiles);
}

function tile(label, value, note, muted = false) {
  return h('div', { class: `tile ${muted ? 'tile-muted' : ''}` },
    h('div', { class: 'tile-label' }, label),
    h('div', { class: 'tile-value' }, value),
    h('div', { class: 'tile-note' }, note));
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
