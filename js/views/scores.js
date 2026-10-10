import { h, icon, card, penCircle } from '../ui.js';
import { scoreChart, trendChart } from '../chart.js';
import { latestHandicapEmail, officialIndexHistory, estimatedIndexHistory, formatIndex } from '../golf.js';
import { roundRow, statStrip } from './common.js';
import { roundSheet } from './sheets.js';
import { partnersCard } from './partners.js';

/** How his handicap has moved: from his handicap emails, or else the estimate after each round. */
function handicapCard(ctx) {
  const official = officialIndexHistory(ctx.emails());
  const estimated = ctx.settings.handicapEstimate ? estimatedIndexHistory(ctx.state.rounds) : [];
  // Official figures when there are a few of them; until then the estimate tells more of a story.
  const fromEmail = official.length >= 3 || (official.length === 2 && estimated.length < 2);
  const points = (fromEmail ? official : estimated).slice(-20);
  if (points.length < 2) return null;
  return card({ title: 'Handicap', className: 'card-chart' },
    h('p', { class: 'card-sub' }, fromEmail ? 'From your handicap emails · lowest ringed' : 'Estimated after each round · lowest ringed'),
    trendChart(points.map((p) => ({ date: p.date, value: p.value, note: p.course })), { name: 'Handicap index', format: formatIndex, height: 170, onCleanup: ctx.onCleanup }));
}

export function scoresView(ctx) {
  const rounds = ctx.rounds();
  const stats = ctx.stats();
  const fields = ctx.settings.roundFields;
  const full = rounds.filter((r) => (r.holes || 18) === 18 && r.score).slice(0, 20).reverse();
  const addRound = () => h('button', { class: 'btn btn-primary', type: 'button', onclick: () => roundSheet(ctx) }, icon('plus', 18), h('span', null, 'Add score'));

  // Averages only for the boxes he fills in.
  const averages = [
    fields.points && stats.points !== null ? ['Stableford', `${stats.points} pts`] : null,
    fields.putts && stats.putts !== null ? ['Putts', stats.putts] : null,
    fields.fairways && stats.fairways !== null ? ['Fairways', stats.fairways] : null,
    fields.greens && stats.greens !== null ? ['Greens', stats.greens] : null,
  ].filter(Boolean);
  const averagesRow = averages.length
    ? h('dl', { class: 'averages', 'aria-label': `Averages over the last ${stats.averageOf} rounds` },
      averages.map(([k, v]) => h('div', null, h('dt', null, `${k} average`), h('dd', null, String(v)))))
    : null;

  const byYear = [];
  for (const r of rounds) {
    const y = r.date.slice(0, 4);
    if (!byYear.length || byYear[byYear.length - 1].year !== y) byYear.push({ year: y, items: [] });
    byYear[byYear.length - 1].items.push(r);
  }

  const year = new Date().getFullYear();
  const good = ctx.goodRounds();
  const sub = !rounds.length ? 'Keep a record of every round'
    : stats.thisYear === rounds.length ? `${rounds.length} round${rounds.length === 1 ? '' : 's'} in ${year}`
      : `${stats.thisYear} in ${year} · ${rounds.length} in total`;

  // Only explain the estimate when it's the figure being shown.
  const estimateShown = ctx.settings.handicapEstimate && stats.index !== null && !latestHandicapEmail(ctx.emails());

  return h('div', { class: 'page page-medium' },
    h('div', { class: 'page-head' },
      h('div', null, h('h1', null, 'Scores'), h('p', { class: 'page-sub' }, sub)),
      rounds.length ? addRound() : null),
    ctx.backupPending() ? h('div', { class: 'notice', role: 'status' },
      h('span', null, icon('cloud', 18), `Your recent changes aren’t backed up to ${ctx.provider.drive} yet.`),
      h('button', { class: 'btn btn-small', type: 'button', onclick: ctx.actions.backupNow }, 'Back up now')) : null,
    rounds.length ? statStrip(ctx) : null,
    full.length >= 2
      ? card({ title: 'Score trend', className: 'card-chart' },
        h('p', { class: 'card-sub' }, `Last ${full.length} rounds of 18 holes · best round ringed`),
        scoreChart(full, { onCleanup: ctx.onCleanup }),
        averagesRow)
      : averagesRow ? card({}, averagesRow) : null,
    handicapCard(ctx),
    rounds.length || ctx.friends().length ? partnersCard(ctx) : null,
    rounds.length
      ? byYear.map((g) => card({ title: g.year, className: 'card-scorecard' },
        h('div', { class: 'scorecard-head', 'aria-hidden': 'true' }, h('span', null, 'Date'), h('span', null, 'Course'), h('span', null, 'Points'), h('span', null, 'Score')),
        h('ul', { class: 'list scorecard' }, g.items.map((r) => roundRow(ctx, r, { good: good.has(r.id) })))))
      : card({ className: 'card-empty' },
        h('div', { class: 'empty empty-centre' },
          h('span', { class: 'empty-icon' }, icon('scores', 24)),
          h('p', null, 'No rounds yet. Add your first score to start following your game.'),
          addRound())),
    good.size ? h('p', { class: 'footnote footnote-key' },
      h('span', { class: 'key-circle', 'aria-hidden': 'true' }, penCircle()),
      h('span', null, 'Circled: your best round, and any round played to your handicap (36 points or more).')) : null,
    estimateShown
      ? h('p', { class: 'footnote' }, icon('info', 16), h('span', null,
        `Handicap estimate uses the World Handicap System method on your last ${Math.min(stats.eligible, 20)} rounds that have a course rating and slope.`))
      : null);
}
