// Playing partners: the people he plays with, each shown as a ball marker, the
// little coin golfers put down to mark their ball on the green.
import { h, add, icon, card, openDialog, toast, marker, firstName, defaultColour, squarePhoto, MARKER_COLOURS, MARKER_EMBLEMS, formatDay } from '../ui.js';
import { partnerStats } from '../golf.js';
import { roundRow } from './common.js';

const EMBLEM_NAMES = {
  flag: 'Flag', ball: 'Golf ball', tee: 'Tee', iron: 'Iron', birdie: 'Birdie',
  trophy: 'Trophy', buggy: 'Buggy', pint: 'Pint', star: 'Star', heart: 'Heart',
};
const COLOUR_NAMES = { green: 'Green', navy: 'Navy', claret: 'Claret', red: 'Red', teal: 'Teal', plum: 'Plum', slate: 'Slate', gold: 'Gold' };

/** "Mike", "Mike & Steve", "Mike, Steve & Dave". */
export function joinNames(names) {
  if (names.length < 2) return names.join('');
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}

/** First names, or the full name where two partners share a first name. */
export function shortNames(ctx, friends) {
  const all = ctx.friends();
  return friends.map((f) => (all.filter((o) => firstName(o.name) === firstName(f.name)).length > 1 ? f.name : firstName(f.name)));
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/* ---------- picking who he played with ---------- */

/** Ball markers to tick on the score and tee time forms. value() gives the chosen ids. */
export function partnerPicker(ctx, selectedIds = [], { onChange } = {}) {
  const selected = new Set(selectedIds.filter((id) => ctx.state.friends[id] && !ctx.state.friends[id].deleted));
  const el = h('div', { class: 'partner-picker', role: 'group', 'aria-label': 'Playing partners' });
  const changed = () => { if (onChange) onChange([...selected]); };

  const chip = (f, label) => {
    const btn = h('button', {
      class: `partner-chip ${selected.has(f.id) ? 'on' : ''}`,
      type: 'button',
      role: 'checkbox',
      'aria-checked': selected.has(f.id) ? 'true' : 'false',
      'aria-label': f.name,
      onclick: () => {
        if (selected.has(f.id)) selected.delete(f.id);
        else selected.add(f.id);
        const on = selected.has(f.id);
        btn.classList.toggle('on', on);
        btn.setAttribute('aria-checked', on ? 'true' : 'false');
        changed();
      },
    }, h('span', { class: 'chip-marker' }, marker(f, 34), h('span', { class: 'chip-tick', 'aria-hidden': 'true' }, icon('check', 12))), h('span', { class: 'chip-name' }, label));
    return btn;
  };

  const draw = () => {
    const friends = ctx.friends();
    const names = shortNames(ctx, friends);
    el.replaceChildren(
      ...friends.map((f, i) => chip(f, names[i])),
      h('button', {
        class: 'partner-chip partner-new',
        type: 'button',
        onclick: () => partnerEditSheet(ctx, null, {
          onSaved: (id) => {
            selected.add(id);
            draw();
            changed();
          },
        }),
      }, h('span', { class: 'chip-marker' }, h('span', { class: 'marker marker-new', 'aria-hidden': 'true' }, icon('plus', 16))), h('span', { class: 'chip-name' }, friends.length ? 'New' : 'Add a partner')));
  };
  draw();
  return { el, value: () => [...selected] };
}

/* ---------- adding or changing a partner ---------- */

export function partnerEditSheet(ctx, friend, { onSaved } = {}) {
  const draft = { name: '', colour: null, emblem: null, photo: null, ...(friend || {}) };

  openDialog({
    title: friend ? 'Edit partner' : 'New playing partner',
    className: 'sheet-partner',
    build: (close) => {
      const form = h('form', { class: 'form', id: 'partner-form' });
      const nameInput = h('input', {
        id: 'partner-name', name: 'name', type: 'text', required: true, maxlength: '40',
        value: draft.name, placeholder: 'e.g. Mike Turner', autocomplete: 'off', autocapitalize: 'words', autofocus: !friend,
      });
      const preview = h('div', { class: 'marker-preview' });
      const emblems = h('div', { class: 'emblem-grid', role: 'radiogroup', 'aria-label': 'Marker' });
      const swatches = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Colour' });
      const photoRow = h('div', { class: 'photo-row' });

      const name = () => nameInput.value.trim() || draft.name || '';
      const colour = () => draft.colour || defaultColour(name());
      const coin = (extra) => ({ name: name() || '?', colour: colour(), emblem: draft.emblem, ...extra });

      const fileInput = h('input', {
        type: 'file', accept: 'image/*', class: 'sr-only', tabindex: '-1',
        onchange: async (e) => {
          const file = e.target.files[0];
          e.target.value = '';
          if (!file) return;
          try {
            draft.photo = await squarePhoto(file);
            drawAll();
          } catch {
            toast('That picture couldn’t be opened. Try a different one.', { tone: 'error' });
          }
        },
      });

      function drawAll() {
        preview.replaceChildren(marker({ ...coin(), photo: draft.photo }, 104));
        const usingPhoto = !!draft.photo;
        emblems.replaceChildren(...[null, ...MARKER_EMBLEMS].map((e) => {
          const on = !usingPhoto && (draft.emblem || null) === e;
          return h('button', {
            class: `emblem ${on ? 'on' : ''}`, type: 'button', role: 'radio',
            'aria-checked': on ? 'true' : 'false', 'aria-label': e ? EMBLEM_NAMES[e] : 'Initials',
            onclick: () => { draft.emblem = e; draft.photo = null; drawAll(); },
          }, marker(coin({ emblem: e }), 42));
        }));
        swatches.replaceChildren(...Object.entries(MARKER_COLOURS).map(([key, [bg]]) => {
          const on = !usingPhoto && colour() === key;
          const sw = h('button', {
            class: `swatch ${on ? 'on' : ''}`, type: 'button', role: 'radio',
            'aria-checked': on ? 'true' : 'false', 'aria-label': COLOUR_NAMES[key],
            onclick: () => { draft.colour = key; draft.photo = null; drawAll(); },
          }, on ? icon('check', 16) : null);
          sw.style.setProperty('--m', bg);
          sw.style.setProperty('--m-ink', MARKER_COLOURS[key][1]);
          return sw;
        }));
        photoRow.replaceChildren();
        add(photoRow,
          h('button', { class: 'btn btn-small', type: 'button', onclick: () => fileInput.click() },
            icon('camera', 16), h('span', null, usingPhoto ? 'Change photo' : 'Use a photo')),
          usingPhoto ? h('button', { class: 'link-btn', type: 'button', onclick: () => { draft.photo = null; drawAll(); } }, 'Remove photo') : null,
          fileInput);
      }
      nameInput.addEventListener('input', drawAll);
      drawAll();

      form.append(
        h('div', { class: 'partner-head' },
          preview,
          h('div', { class: 'field' }, h('label', { for: 'partner-name' }, 'Name'), nameInput)),
        h('div', { class: 'field' }, h('span', { class: 'label' }, 'Marker'), emblems),
        h('div', { class: 'field' }, h('span', { class: 'label' }, 'Colour'), swatches),
        h('div', { class: 'field' }, h('span', { class: 'label' }, 'Photo'), photoRow,
          h('p', { class: 'field-hint' }, 'A photo is made small and kept with your scores, on this device and in your backup.')));

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!form.reportValidity()) return;
        const id = ctx.actions.savePartner({ ...(friend || {}), name: name(), colour: colour(), emblem: draft.emblem || null, photo: draft.photo || null });
        close();
        if (onSaved) onSaved(id);
      });

      return {
        body: form,
        footer: [
          friend ? h('button', {
            class: 'btn btn-ghost-danger', type: 'button',
            onclick: () => { close(); ctx.actions.deletePartner(friend.id); },
          }, icon('trash', 18), h('span', null, 'Remove')) : null,
          h('span', { class: 'spacer' }),
          h('button', { class: 'btn', type: 'button', onclick: close }, 'Cancel'),
          h('button', { class: 'btn btn-primary', type: 'submit', form: 'partner-form' }, friend ? 'Save' : 'Add partner'),
        ],
      };
    },
  });
}

/* ---------- one partner ---------- */

export function partnerSheet(ctx, friend) {
  openDialog({
    title: friend.name,
    className: 'sheet-partner',
    build: (close) => {
      const s = partnerStats(ctx.state.rounds, friend.id);
      const good = ctx.goodRounds();
      const first = firstName(friend.name);
      const stat = (label, value, note) => h('div', { class: 'board-item' },
        h('div', { class: 'board-label' }, label),
        h('div', { class: 'board-value' }, value),
        h('div', { class: 'board-note' }, note));
      return {
        body: [
          h('div', { class: 'partner-hero' },
            marker(friend, 88),
            h('p', { class: 'partner-hero-text' },
              s.count ? `Played together ${s.count === 1 ? 'once' : `${s.count} times`}` : 'No rounds together yet',
              s.last ? h('span', null, `Last time ${formatDay(s.last)}`) : null)),
          s.count ? h('section', { class: 'board board-compact', 'aria-label': `Your game with ${first}` },
            stat('Rounds', String(s.count), 'together'),
            stat('Average', s.average !== null ? String(s.average) : '–', `with ${first}`),
            stat('Best', s.best ? String(s.best.score) : '–', s.best ? formatDay(s.best.date) : `with ${first}`)) : null,
          s.count
            ? h('div', { class: 'partner-rounds' },
              h('h3', { class: 'subhead' }, 'Rounds together'),
              h('ul', { class: 'list scorecard' }, s.rounds.slice(0, 8).map((r) => roundRow(ctx, r, { good: good.has(r.id) }))))
            : h('p', { class: 'dialog-text' }, `When you add a score, tick ${first}’s marker under Playing partners and your rounds together will show here.`),
        ],
        footer: [
          h('button', { class: 'btn', type: 'button', onclick: () => { close(); partnerEditSheet(ctx, friend); } }, icon('edit', 18), h('span', null, 'Edit')),
          h('span', { class: 'spacer' }),
          h('button', { class: 'btn btn-primary', type: 'button', onclick: close }, 'Done'),
        ],
      };
    },
  });
}

/* ---------- everyone ---------- */

/** All partners, from Settings. */
export function partnersSheet(ctx) {
  openDialog({
    title: 'Playing partners',
    build: (close) => {
      const friends = ctx.friends();
      const counts = ctx.partnerCounts();
      return {
        body: friends.length
          ? h('ul', { class: 'list partner-list' }, friends.map((f) => h('li', null,
            h('button', { class: 'row partner-row', type: 'button', onclick: () => { close(); partnerSheet(ctx, f); } },
              marker(f, 44),
              h('span', { class: 'row-main' },
                h('span', { class: 'row-title' }, f.name),
                h('span', { class: 'row-meta' }, counts.get(f.id) ? `${plural(counts.get(f.id), 'round')} together` : 'No rounds together yet')),
              icon('chevron', 18)))))
          : h('p', { class: 'dialog-text' }, 'Add the people you play with. Each gets a ball marker you can tick on your scores and tee times.'),
        footer: [
          h('span', { class: 'spacer' }),
          h('button', { class: 'btn btn-primary', type: 'button', onclick: () => { close(); partnerEditSheet(ctx, null); } }, icon('partner', 18), h('span', null, 'Add partner')),
        ],
      };
    },
  });
}

/** The Scores screen's row of markers, most-played first. */
export function partnersCard(ctx) {
  const friends = ctx.friends();
  const counts = ctx.partnerCounts();
  const names = shortNames(ctx, friends);
  const add = h('button', { class: 'btn btn-small', type: 'button', onclick: () => partnerEditSheet(ctx, null) }, icon('partner', 16), h('span', null, 'Add partner'));
  return card({ title: 'Playing partners', action: add, className: 'card-partners' },
    friends.length
      ? h('ul', { class: 'partner-strip' }, friends.map((f, i) => h('li', null,
        h('button', { class: 'partner-tile', type: 'button', onclick: () => partnerSheet(ctx, f), 'aria-label': `${f.name}, ${plural(counts.get(f.id) || 0, 'round')} together` },
          marker(f, 56),
          h('span', { class: 'partner-tile-name' }, names[i]),
          h('span', { class: 'partner-tile-count' }, counts.get(f.id) ? plural(counts.get(f.id), 'round') : 'New')))))
      : h('div', { class: 'empty' }, h('p', null, 'Add the people you play with. Tick them on each score to see how you play together.')));
}
