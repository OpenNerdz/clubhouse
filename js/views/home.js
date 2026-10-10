import { h, icon, card, empty, greeting, formatLongDay, formatTime, today, timeAgo, daysUntil } from '../ui.js';
import { scoreChart } from '../chart.js';
import { mailRow, upcomingRow, nextUp, roundRow, resultRow, statStrip, connectCard, shortCourse } from './common.js';
import { roundSheet, teeTimeSheet } from './sheets.js';

const seeAll = (href, text = 'See all') => h('a', { class: 'link', href }, text, icon('chevron', 16));
const SHOWN = 3; // tee sheet lines under the ticket before "Show more"
let showAllUpcoming = false;

const dayName = (iso) => {
  const n = daysUntil(iso);
  return n === 0 ? 'Today' : n === -1 ? 'Yesterday' : formatLongDay(iso);
};

/** After a round he has a booking for, asks for the score, the way a club asks you to return your card. */
function returnCard(ctx, item) {
  const where = item.course ? shortCourse(item.course) : '';
  return h('section', { class: 'card return', 'aria-label': 'Score to add' },
    h('div', { class: 'return-text' },
      h('p', { class: 'return-kicker' }, 'Card to return'),
      h('h2', { class: 'return-title' }, where ? `How did it go at ${where}?` : 'How did it go?'),
      h('p', { class: 'return-meta' }, [item.event, dayName(item.date), item.time ? formatTime(item.time) : ''].filter(Boolean).join(' · '))),
    h('div', { class: 'return-actions' },
      h('button', {
        class: 'btn btn-primary', type: 'button',
        onclick: () => roundSheet(ctx, { prefill: { date: item.date, course: item.course || '' } }),
      }, icon('plus', 18), h('span', null, 'Add score')),
      h('button', { class: 'btn btn-quiet', type: 'button', onclick: () => ctx.actions.notPlayed(item.date) }, 'I didn’t play')));
}

function upcomingList(ctx, rest) {
  const list = h('ul', { class: 'list' }, rest.slice(0, showAllUpcoming ? rest.length : SHOWN).map((it) => upcomingRow(ctx, it)));
  if (showAllUpcoming || rest.length <= SHOWN) return list;
  const more = h('button', {
    class: 'link-btn more-btn', type: 'button',
    onclick: () => {
      showAllUpcoming = true;
      list.append(...rest.slice(SHOWN).map((it) => upcomingRow(ctx, it)));
      more.parentElement.remove();
    },
  }, `Show ${rest.length - SHOWN} more`);
  return [list, h('div', { class: 'card-foot' }, more)];
}

export function homeView(ctx) {
  const show = ctx.settings.home;
  const meta = ctx.state.meta;
  const name = meta.profile && meta.profile.name;
  const hasMail = ctx.connected || ctx.demo;
  const emails = ctx.emails();
  const rounds = ctx.rounds();

  const main = [];
  const side = [];

  if (show.upcoming) {
    const items = ctx.upcoming();
    const addTeeTime = h('button', { class: 'btn btn-small', type: 'button', onclick: () => teeTimeSheet(ctx) }, icon('plus', 16), h('span', null, 'Add tee time'));
    main.push(card({ title: 'Coming up', action: addTeeTime, className: 'card-upcoming' },
      items.length
        ? [nextUp(ctx, items[0]), items.length > 1 ? upcomingList(ctx, items.slice(1)) : null]
        : empty(hasMail ? 'Nothing booked. Tee times and competitions from your email will show here.' : 'Nothing booked. Add a tee time, or connect your email to pick them up automatically.')));
  }

  if (show.mail && hasMail) {
    main.push(card({ title: 'Latest golf mail', action: emails.length > 4 ? seeAll('#/mail') : null, className: 'card-mail' },
      emails.length
        ? h('ul', { class: 'list' }, emails.slice(0, 4).map((e) => mailRow(ctx, e)))
        : empty('No golf email found yet. Press “Check email” to look again.')));
  }

  if (show.rounds) {
    const good = ctx.goodRounds();
    side.push(card({
      title: 'Recent scores',
      className: 'card-rounds',
      action: h('button', { class: 'btn btn-small', type: 'button', onclick: () => roundSheet(ctx) }, icon('plus', 16), h('span', null, 'Add score')),
    }, rounds.length
      ? [h('ul', { class: 'list scorecard' }, rounds.slice(0, 3).map((r) => roundRow(ctx, r, { good: good.has(r.id) }))),
        rounds.length > 3 ? h('div', { class: 'card-foot' }, seeAll('#/scores', `All ${rounds.length} rounds`)) : null]
      : empty('Record your rounds here to follow your scoring and handicap.')));
  }

  if (show.trend) {
    const full = rounds.filter((r) => (r.holes || 18) === 18 && r.score).slice(0, 20).reverse();
    if (full.length >= 2) side.push(card({ title: 'Score trend', className: 'card-trend' }, scoreChart(full, { onCleanup: ctx.onCleanup, height: 170 })));
  }

  if (show.results && hasMail) {
    const results = emails.filter((e) => e.category === 'competition' && e.details.kind === 'result').slice(0, 3);
    if (results.length) side.push(card({ title: 'Results', className: 'card-results' }, h('ul', { class: 'list' }, results.map((e) => resultRow(ctx, e)))));
  }

  const played = ctx.unscored()[0];
  const nothingOn = !show.upcoming && !show.mail && !show.rounds && !show.stats && !show.trend && !show.results;

  return h('div', { class: 'page' },
    h('div', { class: 'page-head' },
      h('div', null,
        h('p', { class: 'kicker' }, formatLongDay(today())),
        h('h1', null, name ? `${greeting()}, ${name}` : greeting()),
        ctx.connected && !ctx.demo && meta.lastScan ? h('p', { class: 'page-sub' }, `Email checked ${timeAgo(meta.lastScan)}`) : null)),
    played ? returnCard(ctx, played) : null,
    !hasMail ? connectCard(ctx) : null,
    show.stats ? statStrip(ctx) : null,
    main.length || side.length
      ? h('div', { class: `columns ${main.length && side.length ? '' : 'columns-single'}` },
        main.length ? h('div', { class: 'col' }, main) : null,
        side.length ? h('div', { class: 'col' }, side) : null)
      : null,
    nothingOn ? empty('Your home screen is empty. Choose what to show in Settings.', h('a', { class: 'btn', href: '#/settings' }, 'Open Settings')) : null);
}
