import { h, icon, card, switchRow, segmented, timeAgo } from '../ui.js';
import { CATEGORIES } from '../parser.js';
import { HOME_SECTIONS, ROUND_FIELDS } from '../store.js';
import { connectCard } from './common.js';

function group(title, hint, ...children) {
  return card({ title, className: 'settings-group' }, hint ? h('p', { class: 'card-sub' }, hint) : null, ...children);
}

function accountGroup(ctx) {
  if (ctx.demo) {
    return group('Email account', null,
      h('p', { class: 'setting-text' }, 'You’re looking at sample data. Nothing here is saved.'),
      h('div', { class: 'setting-block' }, h('button', { class: 'btn', type: 'button', onclick: ctx.actions.exitDemo }, 'Leave demo')));
  }
  if (!ctx.connected) return connectCard(ctx, { compact: true });

  const p = ctx.state.meta.profile;
  const s = ctx.settings;
  const lastBackup = ctx.state.meta.lastBackup;
  return group(`${ctx.provider.mail} account`, null,
    h('div', { class: 'account' },
      p.picture ? h('img', { class: 'avatar', src: p.picture, alt: '', width: 44, height: 44, referrerpolicy: 'no-referrer' }) : h('span', { class: 'avatar avatar-blank' }, icon('mail', 20)),
      h('div', { class: 'account-text' },
        h('div', { class: 'account-name' }, p.fullName || p.name || p.email),
        h('div', { class: 'muted' }, p.email)),
      h('button', { class: 'btn', type: 'button', onclick: ctx.actions.disconnect }, icon('logout', 18), h('span', null, 'Disconnect'))),
    h('p', { class: 'setting-text' }, icon('shield', 16), h('span', null, 'Read-only access. Clubhouse can’t send, change or delete your email.')),
    h('div', { class: 'divider' }),
    switchRow({
      id: 'set-drive',
      label: `Back up to ${ctx.provider.drive}`,
      hint: `Keeps your scores safe and in step across your phone, tablet and computer. Saved in a private app folder in your ${ctx.provider.drive}.`,
      checked: s.driveBackup,
      onChange: (v) => ctx.actions.setSetting('driveBackup', v),
    }),
    s.driveBackup ? h('div', { class: 'setting-line' },
      h('span', { class: 'muted' }, lastBackup ? `Last backed up ${timeAgo(lastBackup)}` : 'Not backed up yet'),
      h('button', { class: 'btn btn-small', type: 'button', onclick: ctx.actions.backupNow }, icon('cloud', 16), h('span', null, 'Back up now'))) : null);
}

function mailGroup(ctx) {
  const s = ctx.settings;
  const hiddenCount = ctx.hiddenCount();
  return group('Golf mail', 'Choose which kinds of golf email to collect and show.',
    Object.entries(CATEGORIES).map(([key, c]) => switchRow({
      id: `set-cat-${key}`,
      label: c.label,
      checked: s.categories[key] !== false,
      onChange: (v) => ctx.actions.setSetting(`categories.${key}`, v),
    })),
    h('div', { class: 'divider' }),
    h('div', { class: 'field field-inline' },
      h('label', { for: 'set-months' }, 'Look back'),
      h('select', { id: 'set-months', onchange: (e) => ctx.actions.setSetting('months', Number(e.target.value)) },
        [[3, '3 months'], [6, '6 months'], [12, '1 year'], [24, '2 years']].map(([v, t]) => h('option', { value: String(v), selected: s.months === v }, t)))),
    h('div', { class: 'field' },
      h('label', { for: 'set-terms' }, 'Extra search words'),
      h('input', {
        id: 'set-terms', type: 'text', value: s.extraTerms.join(', '), placeholder: 'e.g. your club or society name',
        onchange: (e) => ctx.actions.setSetting('extraTerms', e.target.value.split(',').map((t) => t.trim()).filter(Boolean)),
      }),
      h('p', { class: 'field-hint' }, 'If some golf emails are being missed, add words they always contain, separated by commas.')),
    s.hiddenSenders.length || hiddenCount ? h('div', { class: 'divider' }) : null,
    s.hiddenSenders.length ? h('div', { class: 'hidden-list' },
      h('h3', null, 'Hidden senders'),
      h('ul', null, s.hiddenSenders.map((email) => h('li', null,
        h('span', null, email),
        h('button', { class: 'link-btn', type: 'button', onclick: () => ctx.actions.unhideSender(email) }, 'Show again'))))) : null,
    hiddenCount ? h('div', { class: 'setting-line' },
      h('span', { class: 'muted' }, `${hiddenCount} hidden email${hiddenCount === 1 ? '' : 's'}`),
      h('button', { class: 'link-btn', type: 'button', onclick: ctx.actions.restoreHidden }, 'Show them again')) : null);
}

export function settingsView(ctx) {
  const s = ctx.settings;
  const importInput = h('input', {
    type: 'file', accept: 'application/json,.json', class: 'sr-only', id: 'import-file', tabindex: '-1',
    onchange: (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (file) ctx.actions.importData(file);
    },
  });

  return h('div', { class: 'page page-narrow' },
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Settings'), h('p', { class: 'page-sub' }, 'Show only what you use.'))),

    accountGroup(ctx),

    group('Home screen', 'Choose what appears on your home screen.',
      Object.entries(HOME_SECTIONS).map(([key, label]) => switchRow({
        id: `set-home-${key}`,
        label,
        checked: s.home[key],
        onChange: (v) => ctx.actions.setSetting(`home.${key}`, v),
      }))),

    mailGroup(ctx),

    group('Scores', null,
      switchRow({
        id: 'set-handicap',
        label: 'Estimate my handicap',
        hint: 'Works it out from rounds that have a course rating and slope.',
        checked: s.handicapEstimate,
        onChange: (v) => ctx.actions.setSetting('handicapEstimate', v),
      }),
      h('div', { class: 'divider' }),
      h('h3', { class: 'subhead' }, 'Boxes on the score form'),
      h('p', { class: 'card-sub' }, 'Date, course and score are always there. Turn on anything else you like to keep track of.'),
      Object.entries(ROUND_FIELDS).map(([key, label]) => switchRow({
        id: `set-field-${key}`,
        label,
        checked: s.roundFields[key],
        onChange: (v) => ctx.actions.setSetting(`roundFields.${key}`, v),
      }))),

    group('Display', null,
      h('div', { class: 'field' },
        h('span', { class: 'label' }, 'Appearance'),
        segmented({ id: 'set-theme', label: 'Appearance', value: s.theme, options: [['auto', 'Automatic'], ['light', 'Light'], ['dark', 'Dark']], onChange: (v) => ctx.actions.setSetting('theme', v) })),
      h('div', { class: 'field' },
        h('span', { class: 'label' }, 'Text size'),
        segmented({ id: 'set-size', label: 'Text size', value: s.textSize, options: [['normal', 'Standard'], ['large', 'Large']], onChange: (v) => ctx.actions.setSetting('textSize', v) }))),

    group('Your data', 'Everything is kept on this device. You can save a copy as a file at any time.',
      h('div', { class: 'button-row' },
        h('button', { class: 'btn', type: 'button', onclick: ctx.actions.exportData }, icon('download', 18), h('span', null, 'Save a backup file')),
        h('button', { class: 'btn', type: 'button', onclick: () => importInput.click() }, icon('upload', 18), h('span', null, 'Restore from file')),
        importInput),
      h('div', { class: 'divider' }),
      h('button', { class: 'btn btn-ghost-danger', type: 'button', onclick: ctx.actions.deleteAll }, icon('trash', 18), h('span', null, 'Delete everything from this device'))),

    h('p', { class: 'footnote' }, icon('shield', 16), h('span', null,
      'Privacy: Clubhouse runs entirely in your browser. Your email is read directly from Google or Microsoft on this device and only the golf details it finds are kept. Nothing is sent to any other server.')));
}
