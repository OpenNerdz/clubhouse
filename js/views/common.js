// Pieces shared by several screens. The look borrows from golf's own objects:
// the scorecard, the clubhouse honours board, the starter's ticket and tee sheet.
import { h, icon, googleLogo, microsoftLogo, penCircle, markerStack, formatDay, formatTime, formatEmailDate, formatFullDate, formatShortDate, timeParts, whenLabel, weekdayShort, monthShort, fromIso } from '../ui.js';
import { CATEGORIES } from '../parser.js';
import { latestHandicapEmail, formatIndex, scoreToPar, resultTitle, shotsLabel } from '../golf.js';
import { describe } from '../weather.js';
import { emailSheet, roundSheet, upcomingSheet } from './sheets.js';
import { joinNames, shortNames } from './partners.js';

/** Small overlapping markers and first names, e.g. ◉◉ Mike & Steve. */
function withPartners(ctx, friends) {
  return h('span', { class: 'with' }, markerStack(friends, 20), h('span', null, joinNames(shortNames(ctx, friends))));
}

export const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const indexChange = (d) => (d.prevIndex ? Math.round((parseFloat(d.index) - parseFloat(d.prevIndex)) * 10) / 10 : 0);
const label = (cat) => (CATEGORIES[cat] || CATEGORIES.other).label;

/** A small stamped label in the category's colour, e.g. TEE TIMES. */
export function categoryBadge(cat) {
  return h('span', { class: `tag cat-${cat}` }, label(cat));
}

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

/** An email as a ledger line, edged in its category's colour. */
export function mailRow(ctx, e) {
  return h('li', null,
    h('button', { class: `row ledger cat-${e.category}`, type: 'button', onclick: () => emailSheet(ctx, e.id) },
      h('span', { class: 'row-main' },
        h('span', { class: 'row-top' },
          h('span', { class: 'ledger-cat' }, label(e.category)),
          h('span', { class: 'row-from' }, e.fromName),
          h('span', { class: 'row-date' }, formatEmailDate(e.date))),
        h('span', { class: 'row-title' }, e.subject),
        summary(e))));
}

/**
 * The forecast for a round, filled in when it arrives (straight away once it has
 * been fetched): "14° · 20% rain · wind 11 mph". Stays hidden when there isn't one.
 */
export function weatherLine(ctx, item, { detailed = false } = {}) {
  const el = h('span', { class: `weather ${detailed ? 'weather-detailed' : ''}`, hidden: true });
  ctx.forecast(item).then((w) => {
    if (!w) return;
    const sky = describe(w.code);
    const wind = `wind ${w.wind} ${w.units.wind === 'kmh' ? 'km/h' : 'mph'}`;
    const rain = `${w.rain}% rain`;
    el.replaceChildren(icon(sky.icon, detailed ? 26 : 18),
      detailed
        ? h('span', { class: 'weather-text' },
          h('strong', null, `${sky.text}, ${w.temp}°${w.units.temp === 'fahrenheit' ? 'F' : 'C'}`),
          h('span', null, `${rain} · ${wind}`),
          h('small', null, ctx.demo ? 'Sample forecast' : 'Forecast for your round · Open-Meteo'))
        : h('span', null, `${w.temp}° · ${rain} · ${wind}`));
    el.setAttribute('aria-label', `Forecast: ${sky.text}, ${w.temp} degrees, ${rain}, ${wind}`);
    el.hidden = false;
  });
  return el;
}

const longDay = (iso) => new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).format(fromIso(iso));

/** The starter's ticket: a stub with the time, then where, when and who. */
export function ticket(item, { onClick, kicker, ctx, weather = false } = {}) {
  const soon = whenLabel(item.date);
  const t = item.time ? timeParts(item.time) : null;
  const d = fromIso(item.date);
  const shots = ctx ? ctx.shotsAt(item.course) : null;
  const meta = [];
  if (item.type === 'event' && item.course) meta.push(item.course);
  if (item.players) meta.push(plural(item.players, 'player'));
  if (shots !== null) meta.push(shotsLabel(shots));
  if (item.ref) meta.push(`Ref ${item.ref}`);
  return h(onClick ? 'button' : 'div', {
    class: `ticket ${item.type === 'event' ? 'ticket-event' : ''}`,
    type: onClick ? 'button' : null,
    onclick: onClick || null,
  },
    h('span', { class: 'ticket-stub' },
      h('span', { class: 'stub-label' }, item.type === 'event' ? 'Start' : 'Tee time'),
      t ? h('span', { class: 'stub-time' }, t.main, t.period ? h('small', null, t.period) : null)
        : h('span', { class: 'stub-time' }, String(d.getDate())),
      h('span', { class: 'stub-date' }, `${weekdayShort(item.date)} ${d.getDate()} ${monthShort(item.date)}`)),
    h('span', { class: 'ticket-body' },
      h('span', { class: 'ticket-kicker' },
        h('span', null, kicker || (item.type === 'event' ? 'Next competition' : 'Next tee time')),
        soon ? h('span', { class: `stamp ${soon === 'Today' || soon === 'Tomorrow' ? 'stamp-now' : ''}` }, soon) : null),
      h('span', { class: 'ticket-title' }, item.title),
      h('span', { class: 'sr-only' }, longDay(item.date), item.time ? `, ${formatTime(item.time)}` : ''),
      meta.length ? h('span', { class: 'ticket-meta' }, meta.join(' · ')) : null,
      ctx && ctx.friendsOf(item).length ? withPartners(ctx, ctx.friendsOf(item)) : null,
      weather ? weatherLine(ctx, item) : null));
}

export function nextUp(ctx, item) {
  return ticket(item, { ctx, weather: true, onClick: () => upcomingSheet(ctx, item) });
}

/** A line on the starter's tee sheet: date, time, then what and who. */
export function upcomingRow(ctx, item) {
  const d = fromIso(item.date);
  const t = item.time ? timeParts(item.time) : null;
  const meta = [];
  const shots = ctx.shotsAt(item.course);
  if (item.type === 'event') meta.push('Competition');
  if (item.players) meta.push(plural(item.players, 'player'));
  if (item.type === 'event' && item.course) meta.push(item.course);
  if (shots !== null) meta.push(shotsLabel(shots));
  const soon = whenLabel(item.date);
  return h('li', null,
    h('button', { class: 'row teesheet', type: 'button', onclick: () => upcomingSheet(ctx, item) },
      h('span', { class: `cal ${item.type === 'event' ? 'cal-event' : ''}`, 'aria-hidden': 'true' },
        h('span', { class: 'cal-dow' }, weekdayShort(item.date)),
        h('span', { class: 'cal-day' }, String(d.getDate())),
        h('span', { class: 'cal-mon' }, monthShort(item.date))),
      h('span', { class: 'teesheet-time', 'aria-hidden': 'true' }, t ? [t.main, t.period ? h('small', null, t.period) : null] : '–'),
      h('span', { class: 'row-main' },
        h('span', { class: 'sr-only' }, `${formatFullDate(item.date)}${item.time ? `, ${formatTime(item.time)}` : ''}. `),
        h('span', { class: 'row-title' }, item.title),
        meta.length ? h('span', { class: 'row-meta' }, meta.join(' · ')) : null,
        ctx.friendsOf(item).length ? withPartners(ctx, ctx.friendsOf(item)) : null),
      soon ? h('span', { class: 'when' }, soon) : null));
}

/** A line of his scorecard. Good rounds are circled in red pen. */
export function roundRow(ctx, r, { good = false } = {}) {
  const toPar = scoreToPar(r);
  const meta = [];
  if (r.holes === 9) meta.push('9 holes');
  const friends = ctx.friendsOf(r);
  if (!friends.length && r.partners) meta.push(`with ${r.partners}`);
  const withText = friends.length ? `, with ${joinNames(friends.map((f) => f.name))}` : '';
  return h('li', null,
    h('button', {
      class: 'row round',
      type: 'button',
      onclick: () => roundSheet(ctx, { round: r }),
      'aria-label': `${r.course || 'Round'}, ${formatFullDate(r.date)}, scored ${r.score}${r.points ? `, ${r.points} points` : ''}${withText}${good ? ', circled as a good round' : ''}`,
    },
      h('span', { class: 'round-date' }, formatDay(r.date)),
      h('span', { class: 'round-course' },
        h('span', { class: 'row-title' }, r.course || 'Round'),
        meta.length ? h('span', { class: 'row-meta' }, meta.join(' · ')) : null,
        friends.length ? withPartners(ctx, friends) : null),
      h('span', { class: 'round-pts' }, r.points ? [String(r.points), h('small', null, ' pts')] : ''),
      h('span', { class: `score-cell ${good ? 'is-good' : ''}` },
        h('span', { class: 'score-value' }, String(r.score)),
        good ? penCircle() : null,
        h('span', { class: 'score-par' }, toPar || ''))));
}

/** A finishing position, leaderboard style. */
export function resultRow(ctx, e) {
  const d = e.details;
  const meta = [formatEmailDate(e.date)];
  if (d.points) meta.push(`${d.points} pts`);
  if (d.net) meta.push(`Net ${d.net}`);
  return h('li', null,
    h('button', { class: 'row result', type: 'button', onclick: () => emailSheet(ctx, e.id) },
      h('span', { class: 'pos' },
        d.position ? [ordinal(d.position), d.field ? h('small', null, `of ${d.field}`) : null] : '–'),
      h('span', { class: 'row-main' },
        h('span', { class: 'row-title' }, resultTitle(e.subject)),
        h('span', { class: 'row-meta' }, meta.join(' · ')))));
}

/** Handicap, average and best score in gold on green, like the honours board in the clubhouse. */
export function statStrip(ctx) {
  const s = ctx.stats();
  const items = [];
  const official = latestHandicapEmail(ctx.emails());
  if (official) {
    const change = indexChange(official.details);
    items.push(board('Handicap', formatIndex(official.details.index),
      change ? h('span', { class: change < 0 ? 'board-down' : 'board-up' }, `${change < 0 ? '▼' : '▲'} ${Math.abs(change).toFixed(1)}`) : 'Official'));
  } else if (ctx.settings.handicapEstimate) {
    items.push(board('Handicap', s.index !== null ? formatIndex(s.index) : '–', s.index !== null ? 'Estimate' : 'Needs 3 rounds'));
  }
  items.push(board('Average', s.average !== null ? String(s.average) : '–', s.average !== null ? `Last ${s.averageOf}` : 'No rounds yet'));
  items.push(board('Best', s.best ? String(s.best.score) : '–', s.best ? formatShortDate(s.best.date) : 'No rounds yet'));
  return h('section', { class: 'board', 'aria-label': 'Your game' }, items);
}

function board(name, value, note) {
  return h('div', { class: `board-item ${value === '–' ? 'board-empty' : ''}` },
    h('div', { class: 'board-label' }, name),
    h('div', { class: 'board-value' }, value),
    h('div', { class: 'board-note' }, note));
}

export const shortCourse = (name = '') => name.replace(/\s+(?:Golf\s*(?:&|and)\s*Country\s+Club|Golf\s+Club|Golf\s+Course|Country\s+Club|G\.?C\.?)$/i, '');

export function connectCard(ctx, { compact = false } = {}) {
  return h('section', { class: `card connect ${compact ? 'connect-compact' : ''}` },
    h('div', { class: 'connect-text' },
      h('p', { class: 'kicker' }, 'Golf mail'),
      h('h2', null, 'Connect your email'),
      h('p', null, 'Clubhouse finds tee times, competitions, handicap updates and club news in your Gmail or Outlook. It only reads; it can’t send or delete anything.')),
    h('div', { class: 'connect-action' }, signInButtons(ctx, 'Connect')));
}

/** "Continue with Google" and "Continue with Microsoft", with a note for any not set up yet. */
export function signInButtons(ctx, verb = 'Continue') {
  const button = (id, logo, name) => h('button', {
    class: 'btn btn-provider',
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
