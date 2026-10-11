import { h, icon, card, switchRow, segmented, toggleChips, timeAgo } from '../ui.js';
import { CATEGORIES } from '../parser.js';
import { HOME_SECTIONS, ROUND_FIELDS } from '../store.js';
import { connectCard } from './common.js';
import { partnersSheet } from './partners.js';

function group(title, hint, ...children) {
  return card({ title, className: 'settings-group' }, hint ? h('p', { class: 'card-sub' }, hint) : null, ...children);
}

const block = (...children) => h('div', { class: 'setting-block' }, ...children);

function accountGroup(ctx) {
  if (ctx.demo) {
    return group('Email account', 'You’re looking at sample data. Nothing here is saved.',
      block(h('button', { class: 'btn', type: 'button', onclick: ctx.actions.exitDemo }, 'Leave demo')));
  }
  if (!ctx.connected) return connectCard(ctx, { compact: true });

  const p = ctx.state.meta.profile;
  const s = ctx.settings;
  const lastBackup = ctx.state.meta.lastBackup;
  const backupStatus = () => {
    if (!ctx.unsaved) return lastBackup ? `Everything is backed up. Last backed up ${timeAgo(lastBackup)}.` : 'Not backed up yet.';
    if (ctx.backupError) return `Not backed up yet. ${ctx.backupError}`;
    return lastBackup ? `Last backed up ${timeAgo(lastBackup)}. Your latest changes aren’t backed up yet.` : 'Not backed up yet.';
  };
  return group(`${ctx.provider.mail} account`, null,
    h('div', { class: 'account' },
      p.picture ? h('img', { class: 'avatar', src: p.picture, alt: '', width: 44, height: 44, referrerpolicy: 'no-referrer' }) : h('span', { class: 'avatar avatar-blank' }, icon('mail', 20)),
      h('div', { class: 'account-text' },
        h('div', { class: 'account-name' }, p.fullName || p.name || p.email),
        h('div', { class: 'muted' }, p.email, ' · read-only')),
      h('button', { class: 'btn btn-small', type: 'button', onclick: ctx.actions.disconnect }, 'Disconnect')),
    switchRow({
      id: 'set-drive',
      label: `Back up to ${ctx.provider.drive}`,
      hint: s.driveBackup ? backupStatus() : 'Keeps your scores safe and the same on all your devices.',
      checked: s.driveBackup,
      onChange: (v) => ctx.actions.setSetting('driveBackup', v),
    }),
    s.driveBackup ? block(h('button', { class: 'btn btn-small', type: 'button', onclick: ctx.actions.backupNow, disabled: !!ctx.busy }, icon('cloud', 16), h('span', null, 'Back up now'))) : null);
}

function mailGroup(ctx) {
  const s = ctx.settings;
  const hiddenCount = ctx.hiddenCount();
  return group('Golf mail', 'The kinds of golf email to collect. Tap to turn on or off.',
    block(toggleChips({
      id: 'set-cat',
      label: 'Kinds of golf email',
      options: Object.entries(CATEGORIES).map(([key, c]) => [key, c.label, s.categories[key] !== false]),
      onChange: (key, on) => ctx.actions.setSetting(`categories.${key}`, on),
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
      h('p', { class: 'field-hint' }, 'Only needed if some golf emails are missed. Separate words with commas.')),
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

    group('Home screen', 'What appears on your home screen. Tap to turn on or off.',
      block(toggleChips({
        id: 'set-home',
        label: 'Home screen sections',
        options: Object.entries(HOME_SECTIONS).map(([key, label]) => [key, label, !!s.home[key]]),
        onChange: (key, on) => ctx.actions.setSetting(`home.${key}`, on),
      })),
      h('div', { class: 'divider' }),
      switchRow({
        id: 'set-weather',
        label: 'Weather for tee times',
        hint: 'Finds the course on OpenStreetMap and the forecast on Open-Meteo. Only the course name and where it is are sent.',
        checked: s.weather,
        onChange: (v) => ctx.actions.setSetting('weather', v),
      })),

    mailGroup(ctx),

    group('Scores', null,
      switchRow({
        id: 'set-handicap',
        label: 'Estimate my handicap',
        hint: 'From rounds that have a course rating and slope.',
        checked: s.handicapEstimate,
        onChange: (v) => ctx.actions.setSetting('handicapEstimate', v),
      }),
      switchRow({
        id: 'set-gps',
        label: 'Distances on the course',
        hint: 'Uses GPS while you score hole by hole, and keeps the screen on. Your position stays on this phone.',
        checked: s.gps,
        onChange: (v) => ctx.actions.setSetting('gps', v),
      }),
      h('div', { class: 'setting-line' },
        h('span', null, h('strong', null, 'Playing partners'), h('span', { class: 'muted' }, ` · ${ctx.friends().length || 'none yet'}`)),
        h('button', { class: 'btn btn-small', type: 'button', onclick: () => partnersSheet(ctx) }, 'Manage')),
      h('div', { class: 'divider' }),
      h('h3', { class: 'subhead' }, 'Score form'),
      h('p', { class: 'card-sub' }, 'Date, course and score are always there. Add anything else you track.'),
      block(toggleChips({
        id: 'set-field',
        label: 'Boxes on the score form',
        options: Object.entries(ROUND_FIELDS).map(([key, label]) => [key, label, !!s.roundFields[key]]),
        onChange: (key, on) => ctx.actions.setSetting(`roundFields.${key}`, on),
      }))),

    group('Display', null,
      h('div', { class: 'display-grid' },
        h('div', { class: 'field' },
          h('span', { class: 'label' }, 'Appearance'),
          segmented({ id: 'set-theme', label: 'Appearance', value: s.theme, options: [['auto', 'Automatic'], ['light', 'Light'], ['dark', 'Dark']], onChange: (v) => ctx.actions.setSetting('theme', v) })),
        h('div', { class: 'field' },
          h('span', { class: 'label' }, 'Text size'),
          segmented({ id: 'set-size', label: 'Text size', value: s.textSize, options: [['normal', 'Standard'], ['large', 'Large']], onChange: (v) => ctx.actions.setSetting('textSize', v) })),
        h('div', { class: 'field' },
          h('span', { class: 'label' }, 'Distances in'),
          segmented({ id: 'set-distance', label: 'Distances in', value: s.distance, options: [['auto', 'Automatic'], ['yards', 'Yards'], ['metres', 'Metres']], onChange: (v) => ctx.actions.setSetting('distance', v) })))),

    // Hidden in the demo: restoring would only fill the sample data, and deleting would remove his real data.
    ctx.demo ? null : group('Your data', 'Kept on this device. Save a copy as a file at any time.',
      h('div', { class: 'button-row' },
        h('button', { class: 'btn', type: 'button', onclick: ctx.actions.exportData }, icon('download', 18), h('span', null, 'Save backup file')),
        h('button', { class: 'btn', type: 'button', onclick: () => importInput.click() }, icon('upload', 18), h('span', null, 'Restore from file')),
        importInput),
      h('div', { class: 'divider' }),
      h('button', { class: 'btn btn-ghost-danger', type: 'button', onclick: ctx.actions.deleteAll }, icon('trash', 18), h('span', null, 'Delete everything from this device'))),

    h('p', { class: 'footnote' }, icon('shield', 16), h('span', null,
      'Clubhouse runs in your browser. Email is read straight from Google or Microsoft, and only the golf details are kept, on this device. ',
      h('a', { href: 'privacy.html' }, 'Privacy'))));
}
