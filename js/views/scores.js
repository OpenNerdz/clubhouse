import { h, icon, card, empty } from '../ui.js';
import { scoreChart } from '../chart.js';
import { differential, latestHandicapEmail } from '../golf.js';
import { roundRow, statTiles } from './common.js';
import { roundSheet } from './sheets.js';

export function scoresView(ctx) {
  const rounds = ctx.rounds();
  const stats = ctx.stats();
  const fields = ctx.settings.roundFields;
  const full = rounds.filter((r) => (r.holes || 18) === 18 && r.score).slice(0, 20).reverse();

  const averages = [
    fields.points && stats.points !== null ? ['Stableford', `${stats.points} pts`] : null,
    fields.putts && stats.putts !== null ? ['Putts', stats.putts] : null,
    fields.fairways && stats.fairways !== null ? ['Fairways hit', stats.fairways] : null,
    fields.greens && stats.greens !== null ? ['Greens in reg.', stats.greens] : null,
  ].filter(Boolean);

  const byYear = [];
  for (const r of rounds) {
    const y = r.date.slice(0, 4);
    if (!byYear.length || byYear[byYear.length - 1].year !== y) byYear.push({ year: y, items: [] });
    byYear[byYear.length - 1].items.push(r);
  }

  // Only explain the estimate when the tile is showing it (an index from email takes priority).
  const handicapNote = ctx.settings.handicapEstimate && stats.index !== null && !latestHandicapEmail(ctx.emails())
    ? h('p', { class: 'footnote' }, icon('info', 16), h('span', null,
      `The handicap estimate uses the World Handicap System method on your last ${Math.min(stats.eligible, 20)} eligible round${stats.eligible === 1 ? '' : 's'} (18 holes with course rating and slope). Your official index from your club or golf union may differ.`))
    : null;

  return h('div', { class: 'page page-medium' },
    h('div', { class: 'page-head' },
      h('div', null,
        h('h1', null, 'Scores'),
        h('p', { class: 'page-sub' }, rounds.length ? `${rounds.length} round${rounds.length === 1 ? '' : 's'} recorded` : 'Keep a record of every round')),
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => roundSheet(ctx) }, icon('plus', 18), h('span', null, 'Add round'))),
    ctx.backupPending() ? h('div', { class: 'notice', role: 'status' },
      h('span', null, icon('cloud', 18), `Your latest changes aren’t backed up to ${ctx.provider.drive} yet.`),
      h('button', { class: 'btn btn-small', type: 'button', onclick: ctx.actions.backupNow }, 'Back up now')) : null,
    statTiles(ctx),
    full.length >= 2 ? card({ title: 'Score trend', className: 'card-chart' },
      h('p', { class: 'card-sub' }, `Last ${full.length} rounds of 18 holes`),
      scoreChart(full, { onCleanup: ctx.onCleanup })) : null,
    averages.length ? card({ title: 'Averages', className: 'card-averages' },
      h('p', { class: 'card-sub' }, `Last ${stats.averageOf} rounds of 18 holes`),
      h('dl', { class: 'averages' }, averages.map(([k, v]) => h('div', null, h('dt', null, k), h('dd', null, String(v)))))) : null,
    rounds.length
      ? byYear.map((g) => card({ title: g.year },
        h('ul', { class: 'list' }, g.items.map((r) => {
          const row = roundRow(ctx, r);
          const diff = ctx.settings.handicapEstimate ? differential(r) : null;
          if (diff !== null) row.querySelector('.row-meta').append(` · Diff ${diff.toFixed(1)}`);
          return row;
        }))))
      : card({}, empty('No rounds yet. Add your first score to start tracking.', h('button', { class: 'btn btn-primary', type: 'button', onclick: () => roundSheet(ctx) }, icon('plus', 18), h('span', null, 'Add round')))),
    handicapNote);
}
