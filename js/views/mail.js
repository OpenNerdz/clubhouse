import { h, icon, empty, timeAgo } from '../ui.js';
import { CATEGORIES } from '../parser.js';
import { mailRow, connectCard } from './common.js';

// Remembered while the app is open, so going back to this screen keeps your place.
let filter = 'all';
let query = '';

const monthFormat = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });

export function mailView(ctx) {
  if (!ctx.connected && !ctx.demo) {
    return h('div', { class: 'page' },
      h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Golf mail'))),
      connectCard(ctx));
  }

  const all = ctx.emails();
  const enabled = Object.keys(CATEGORIES).filter((k) => ctx.settings.categories[k] !== false);
  if (filter !== 'all' && !enabled.includes(filter)) filter = 'all';

  const listWrap = h('div', { class: 'mail-list' });
  const chipsWrap = h('div', { class: 'filters', role: 'group', 'aria-label': 'Show' });

  const matches = (e) => {
    if (filter !== 'all' && e.category !== filter) return false;
    if (!query) return true;
    const q = query.toLowerCase();
    return `${e.subject} ${e.fromName} ${e.snippet} ${e.details.course || ''}`.toLowerCase().includes(q);
  };

  function drawChips() {
    const count = (k) => all.filter((e) => e.category === k).length;
    const make = (key, label, n) => h('button', {
      class: `filter ${filter === key ? 'on' : ''}`,
      type: 'button',
      'aria-pressed': filter === key ? 'true' : 'false',
      onclick: () => { filter = key; drawChips(); drawList(); },
    }, label, h('span', { class: 'filter-count' }, String(n)));
    chipsWrap.replaceChildren(
      make('all', 'All', all.length),
      ...enabled.filter((k) => count(k) > 0 || filter === k).map((k) => make(k, CATEGORIES[k].label, count(k))));
  }

  function drawList() {
    const shown = all.filter(matches);
    if (!shown.length) {
      listWrap.replaceChildren(empty(all.length
        ? 'No golf emails match.'
        : 'No golf emails found yet. Press “Check email” to search your inbox.'));
      return;
    }
    const groups = [];
    for (const e of shown) {
      const label = monthFormat.format(new Date(e.date));
      if (!groups.length || groups[groups.length - 1].label !== label) groups.push({ label, items: [] });
      groups[groups.length - 1].items.push(e);
    }
    listWrap.replaceChildren(...groups.map((g) =>
      h('section', { class: 'card mail-group' },
        h('h2', { class: 'group-label' }, g.label),
        h('ul', { class: 'list' }, g.items.map((e) => mailRow(ctx, e))))));
  }

  drawChips();
  drawList();

  const search = h('div', { class: 'search' },
    icon('search', 18),
    h('input', {
      id: 'mail-search',
      type: 'search',
      placeholder: 'Search golf mail',
      'aria-label': 'Search golf mail',
      value: query,
      oninput: (e) => { query = e.target.value.trim(); drawList(); },
    }));

  return h('div', { class: 'page page-medium' },
    h('div', { class: 'page-head' },
      h('div', null,
        h('h1', null, 'Golf mail'),
        h('p', { class: 'page-sub' }, `${all.length} email${all.length === 1 ? '' : 's'}${ctx.demo ? '' : ` · checked ${timeAgo(ctx.state.meta.lastScan)}`}`))),
    h('div', { class: 'toolbar' }, search, chipsWrap),
    listWrap);
}
