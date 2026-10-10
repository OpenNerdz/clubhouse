import { h, icon, card, empty, greeting, formatLongDay, today, timeAgo } from '../ui.js';
import { scoreChart } from '../chart.js';
import { mailRow, upcomingRow, nextUp, roundRow, resultRow, statStrip, connectCard } from './common.js';
import { roundSheet, teeTimeSheet } from './sheets.js';

const seeAll = (href, text = 'See all') => h('a', { class: 'link', href }, text, icon('chevron', 16));

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
        ? [nextUp(ctx, items[0]), items.length > 1 ? h('ul', { class: 'list' }, items.slice(1, 5).map((it) => upcomingRow(ctx, it))) : null]
        : empty(hasMail ? 'Nothing booked. Tee times and competitions from your email will show here.' : 'Nothing booked. Add a tee time, or connect your email to pick them up automatically.')));
  }

  if (show.mail && hasMail) {
    main.push(card({ title: 'Latest golf mail', action: emails.length > 4 ? seeAll('#/mail') : null },
      emails.length
        ? h('ul', { class: 'list' }, emails.slice(0, 4).map((e) => mailRow(ctx, e)))
        : empty('No golf email found yet. Press “Check email” to look again.')));
  }

  if (show.rounds) {
    side.push(card({
      title: 'Recent scores',
      action: h('button', { class: 'btn btn-small', type: 'button', onclick: () => roundSheet(ctx) }, icon('plus', 16), h('span', null, 'Add score')),
    }, rounds.length
      ? [h('ul', { class: 'list' }, rounds.slice(0, 3).map((r) => roundRow(ctx, r))),
        rounds.length > 3 ? h('div', { class: 'card-foot' }, seeAll('#/scores', `All ${rounds.length} rounds`)) : null]
      : empty('Record your rounds here to follow your scoring and handicap.')));
  }

  if (show.trend) {
    const full = rounds.filter((r) => (r.holes || 18) === 18 && r.score).slice(0, 20).reverse();
    if (full.length >= 2) side.push(card({ title: 'Score trend' }, scoreChart(full, { onCleanup: ctx.onCleanup, height: 170 })));
  }

  if (show.results && hasMail) {
    const results = emails.filter((e) => e.category === 'competition' && e.details.kind === 'result').slice(0, 3);
    if (results.length) side.push(card({ title: 'Results' }, h('ul', { class: 'list' }, results.map((e) => resultRow(ctx, e)))));
  }

  const nothingOn = !show.upcoming && !show.mail && !show.rounds && !show.stats && !show.trend && !show.results;

  return h('div', { class: 'page' },
    h('div', { class: 'page-head' },
      h('div', null,
        h('h1', null, name ? `${greeting()}, ${name}` : greeting()),
        h('p', { class: 'page-sub' }, formatLongDay(today()), ctx.connected && !ctx.demo && meta.lastScan ? ` · email checked ${timeAgo(meta.lastScan)}` : ''))),
    !hasMail ? connectCard(ctx) : null,
    show.stats ? statStrip(ctx) : null,
    main.length || side.length
      ? h('div', { class: `columns ${main.length && side.length ? '' : 'columns-single'}` },
        main.length ? h('div', { class: 'col' }, main) : null,
        side.length ? h('div', { class: 'col' }, side) : null)
      : null,
    nothingOn ? empty('Your home screen is empty. Choose what to show in Settings.', h('a', { class: 'btn', href: '#/settings' }, 'Open Settings')) : null);
}
