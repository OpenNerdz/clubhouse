import { h, icon, card, empty, greeting, formatLongDay, today, timeAgo } from '../ui.js';
import { scoreChart } from '../chart.js';
import { mailRow, upcomingRow, roundRow, resultRow, statTiles, connectCard } from './common.js';
import { roundSheet, teeTimeSheet } from './sheets.js';

export function homeView(ctx) {
  const show = ctx.settings.home;
  const meta = ctx.state.meta;
  const name = meta.profile && meta.profile.name;
  const emails = ctx.emails();
  const rounds = ctx.rounds();

  const sub = [formatLongDay(today())];
  if (ctx.connected && !ctx.demo) sub.push(`Email checked ${timeAgo(meta.lastScan)}`);

  const main = [];
  const side = [];

  if (show.upcoming) {
    const items = ctx.upcoming();
    main.push(card({
      title: 'Coming up',
      action: h('button', { class: 'btn btn-small', type: 'button', onclick: () => teeTimeSheet(ctx) }, icon('plus', 16), h('span', null, 'Add tee time')),
    }, items.length
      ? h('ul', { class: 'list' }, items.slice(0, 6).map((it) => upcomingRow(ctx, it)))
      : empty(ctx.connected ? 'Nothing booked yet. Tee times and competitions from your email will appear here.' : 'Nothing booked yet. Add a tee time, or connect your email to pick them up automatically.')));
  }

  if (show.mail && (ctx.connected || ctx.demo)) {
    main.push(card({
      title: 'Latest golf mail',
      action: emails.length ? h('a', { class: 'link', href: '#/mail' }, 'See all', icon('chevron', 16)) : null,
    }, emails.length
      ? h('ul', { class: 'list' }, emails.slice(0, 5).map((e) => mailRow(ctx, e)))
      : empty('No golf emails found yet. Press “Check email” to look again.')));
  }

  if (show.rounds) {
    side.push(card({
      title: 'Recent scores',
      action: h('button', { class: 'btn btn-small', type: 'button', onclick: () => roundSheet(ctx) }, icon('plus', 16), h('span', null, 'Add score')),
    }, rounds.length
      ? [h('ul', { class: 'list' }, rounds.slice(0, 3).map((r) => roundRow(ctx, r))),
        rounds.length > 3 ? h('a', { class: 'link card-foot-link', href: '#/scores' }, `All ${rounds.length} rounds`, icon('chevron', 16)) : null]
      : empty('Record your rounds here to track your scoring and handicap.')));
  }

  if (show.trend) {
    const full = rounds.filter((r) => (r.holes || 18) === 18 && r.score).slice(0, 20).reverse();
    if (full.length >= 2) side.push(card({ title: 'Score trend' }, scoreChart(full, { onCleanup: ctx.onCleanup, height: 180 })));
  }

  if (show.results && (ctx.connected || ctx.demo)) {
    const results = emails.filter((e) => e.category === 'competition' && e.details.kind === 'result').slice(0, 3);
    if (results.length) side.push(card({ title: 'Competition results' }, h('ul', { class: 'list' }, results.map((e) => resultRow(ctx, e)))));
  }

  return h('div', { class: 'page' },
    h('div', { class: 'page-head' },
      h('div', null,
        h('h1', null, name ? `${greeting()}, ${name}` : greeting()),
        h('p', { class: 'page-sub' }, sub.join(' · ')))),
    !ctx.connected && !ctx.demo ? connectCard(ctx) : null,
    show.stats ? statTiles(ctx) : null,
    main.length || side.length
      ? h('div', { class: `columns ${main.length && side.length ? '' : 'columns-single'}` },
        main.length ? h('div', { class: 'col' }, main) : null,
        side.length ? h('div', { class: 'col' }, side) : null)
      : null,
    !show.upcoming && !show.mail && !show.rounds && !show.stats
      ? empty('Your home screen is empty. Choose what to show in Settings.', h('a', { class: 'btn', href: '#/settings' }, 'Open settings'))
      : null);
}
