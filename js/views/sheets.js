// Pop-up sheets: forms for rounds and tee times, and detail views.
import { h, add, icon, openDialog, confirmDialog, today, formatLongDay, formatTime, formatFullDate, formatEmailDate, segmented, whenLabel } from '../ui.js';
import { CATEGORIES } from '../parser.js';
import { calendarUrl, outlookCalendarUrl, differential, formatIndex } from '../golf.js';
import { categoryBadge, ordinal, ticket } from './common.js';

let fieldCount = 0;

function field(label, input, hint) {
  const id = input.id || `f${++fieldCount}`;
  input.id = id;
  return h('div', { class: 'field' },
    h('label', { for: id }, label),
    input,
    hint ? h('p', { class: 'field-hint' }, hint) : null);
}

function numberInput(name, value, { min, max, step = '1', placeholder, required } = {}) {
  return h('input', {
    name, type: 'number', inputmode: step === '1' ? 'numeric' : 'decimal', min, max, step, placeholder, required,
    value: value === undefined || value === null ? '' : String(value),
  });
}

function courseList(ctx, id) {
  return h('datalist', { id }, ctx.courses().map((c) => h('option', { value: c.name })));
}

const num = (v) => (v === '' || v === null || v === undefined ? undefined : Number(v));

/* ---------- round ---------- */

export function roundSheet(ctx, { round, prefill } = {}) {
  const r = round || { date: today(), holes: 18, ...prefill };
  const show = ctx.settings.roundFields;
  let holes = r.holes || 18;
  const listId = `courses-${Date.now()}`;

  openDialog({
    title: round ? 'Edit round' : 'Add a round',
    build: (close) => {
      const form = h('form', { class: 'form', id: 'round-form' });
      const courseInput = h('input', { name: 'course', type: 'text', list: listId, autocomplete: 'off', value: r.course || '', placeholder: 'e.g. Oakmere Golf Club', autofocus: !round });
      const parInput = numberInput('par', r.par, { min: 27, max: 80, placeholder: holes === 9 ? '36' : '72' });
      const ratingInput = numberInput('rating', r.rating, { min: 25, max: 85, step: '0.1', placeholder: 'e.g. 71.4' });
      const slopeInput = numberInput('slope', r.slope, { min: 55, max: 155, placeholder: 'e.g. 128' });

      // Picking a course you've played before fills in its par, rating and slope.
      courseInput.addEventListener('change', () => {
        const known = ctx.courses().find((c) => c.name.toLowerCase() === courseInput.value.trim().toLowerCase());
        if (!known) return;
        if (!parInput.value && known.par) parInput.value = known.par;
        if (!ratingInput.value && known.rating) ratingInput.value = known.rating;
        if (!slopeInput.value && known.slope) slopeInput.value = known.slope;
      });

      const holesControl = segmented({
        id: 'holes', label: 'Holes played', value: String(holes),
        options: [['18', '18 holes'], ['9', '9 holes']],
        onChange: (v) => {
          holes = Number(v);
          holesControl.querySelectorAll('.seg').forEach((s) => s.classList.toggle('on', s.querySelector('input').value === v));
          parInput.placeholder = holes === 9 ? '36' : '72';
        },
      });

      add(form,
        h('div', { class: 'field-row' },
          field('Date', h('input', { name: 'date', type: 'date', required: true, value: r.date, max: '2100-12-31' })),
          field('Score', Object.assign(numberInput('score', r.score, { min: 18, max: 200, required: true, placeholder: 'Total' }), { className: 'score-input' }))),
        field('Course', courseInput),
        courseList(ctx, listId),
        h('div', { class: 'field-row field-row-holes' },
          h('div', { class: 'field' }, h('span', { class: 'label' }, 'Holes'), holesControl),
          show.par ? field('Par', parInput) : null),
        show.rating ? h('div', { class: 'field-row' },
          field('Course rating', ratingInput),
          field('Slope', slopeInput)) : null,
        show.rating ? h('p', { class: 'field-hint field-hint-row' }, 'Both are printed on the scorecard for your tees. They’re used to estimate your handicap.') : null,
        show.points ? field('Stableford points', numberInput('points', r.points, { min: 0, max: 60 })) : null,
        show.putts || show.fairways || show.greens ? h('div', { class: 'field-row field-row-3' },
          show.putts ? field('Putts', numberInput('putts', r.putts, { min: 0, max: 80 })) : null,
          show.fairways ? field('Fairways hit', numberInput('fairways', r.fairways, { min: 0, max: 18 })) : null,
          show.greens ? field('Greens in reg.', numberInput('greens', r.greens, { min: 0, max: 18 })) : null) : null,
        show.partners ? field('Played with', h('input', { name: 'partners', type: 'text', value: r.partners || '', placeholder: 'Names' })) : null,
        show.notes ? field('Notes', h('textarea', { name: 'notes', rows: '2', placeholder: 'Anything worth remembering' }, r.notes || '')) : null,
      );

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!form.reportValidity()) return;
        const data = Object.fromEntries(new FormData(form));
        const saved = {
          ...(round || {}),
          date: data.date,
          score: num(data.score),
          course: (data.course || '').trim(),
          holes,
        };
        for (const k of ['par', 'rating', 'slope', 'points', 'putts', 'fairways', 'greens']) if (k in data) saved[k] = num(data[k]);
        for (const k of ['partners', 'notes']) if (k in data) saved[k] = data[k].trim();
        ctx.actions.saveRound(saved);
        close();
      });

      const diff = round && differential(round);
      return {
        body: [form, diff !== null && diff !== undefined ? h('p', { class: 'field-hint' }, `Score differential for this round: ${diff.toFixed(1)}`) : null],
        footer: [
          round ? h('button', {
            class: 'btn btn-ghost-danger', type: 'button',
            onclick: async () => {
              close();
              if (await confirmDialog({ title: 'Delete this round?', message: `${r.course || 'Round'}, ${formatFullDate(r.date)}. This can’t be undone.`, confirmLabel: 'Delete', danger: true })) ctx.actions.deleteRound(round.id);
            },
          }, icon('trash', 18), h('span', null, 'Delete')) : null,
          h('span', { class: 'spacer' }),
          h('button', { class: 'btn', type: 'button', onclick: close }, 'Cancel'),
          h('button', { class: 'btn btn-primary', type: 'submit', form: 'round-form' }, round ? 'Save' : 'Save round'),
        ],
      };
    },
  });
}

/* ---------- tee time added by hand ---------- */

export function teeTimeSheet(ctx, t) {
  const listId = `courses-${Date.now()}`;
  openDialog({
    title: t ? 'Edit tee time' : 'Add a tee time',
    build: (close) => {
      const form = h('form', { class: 'form', id: 'tee-form' },
        h('div', { class: 'field-row' },
          field('Date', h('input', { name: 'date', type: 'date', required: true, value: (t && t.date) || today() })),
          field('Time', h('input', { name: 'time', type: 'time', value: (t && t.time) || '' }))),
        field('Course', h('input', { name: 'course', type: 'text', list: listId, autocomplete: 'off', value: (t && t.course) || '', placeholder: 'Where are you playing?', autofocus: !t })),
        courseList(ctx, listId),
        field('Players', h('select', { name: 'players' },
          h('option', { value: '' }, 'Not set'),
          [1, 2, 3, 4].map((n) => h('option', { value: String(n), selected: t && t.players === n }, String(n))))),
        field('Notes', h('textarea', { name: 'notes', rows: '2', placeholder: 'Who with, buggy booked…' }, (t && t.notes) || '')));
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!form.reportValidity()) return;
        const data = Object.fromEntries(new FormData(form));
        ctx.actions.saveTeeTime({ ...(t || {}), date: data.date, time: data.time, course: data.course.trim(), players: num(data.players), notes: data.notes.trim() });
        close();
      });
      return {
        body: form,
        footer: [
          t ? h('button', {
            class: 'btn btn-ghost-danger', type: 'button',
            onclick: () => { ctx.actions.deleteTeeTime(t.id); close(); },
          }, icon('trash', 18), h('span', null, 'Remove')) : null,
          h('span', { class: 'spacer' }),
          h('button', { class: 'btn', type: 'button', onclick: close }, 'Cancel'),
          h('button', { class: 'btn btn-primary', type: 'submit', form: 'tee-form' }, 'Save'),
        ],
      };
    },
  });
}

/* ---------- details ---------- */

function facts(rows) {
  const items = rows.filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (!items.length) return null;
  return h('dl', { class: 'facts' }, items.map(([k, v]) => h('div', { class: 'fact' }, h('dt', null, k), h('dd', null, v))));
}

/** Google Calendar for Gmail users, Outlook's calendar for Outlook users. */
function calendarLink(ctx, event) {
  const outlook = ctx.provider.id === 'microsoft' && !ctx.demo;
  return { href: outlook ? outlookCalendarUrl(event) : calendarUrl(event), label: outlook ? 'Add to Outlook calendar' : 'Add to Google Calendar' };
}

function whenText(d) {
  if (!d.date) return '';
  return `${formatLongDay(d.date)}${d.time ? `, ${formatTime(d.time)}` : ''}`;
}

export function emailSheet(ctx, id) {
  const e = ctx.email(id);
  if (!e) return;
  const d = e.details || {};
  let rows = [];
  if (e.category === 'teetime') {
    rows = [['When', whenText(d)], ['Course', d.course], ['Players', d.players], ['Booking ref', d.ref],
      ['Status', d.status === 'cancelled' ? 'Cancelled' : d.status === 'changed' ? 'Changed' : d.status === 'reminder' ? 'Reminder' : 'Booked']];
  } else if (e.category === 'competition') {
    rows = d.kind === 'result'
      ? [['Finished', d.position ? `${ordinal(d.position)}${d.field ? ` of ${d.field}` : ''}` : ''], ['Points', d.points], ['Gross', d.gross], ['Net', d.net], ['Course', d.course]]
      : [['When', whenText(d)], ['Course', d.course]];
  } else if (e.category === 'handicap') {
    rows = [['Handicap index', d.index ? formatIndex(d.index) : ''], ['Previously', d.prevIndex ? formatIndex(d.prevIndex) : '']];
  } else if (e.category === 'shop') {
    rows = [['Order', d.order], ['Total', d.total], ['Status', d.status], ['Offer', d.discount]];
  } else if (e.category === 'club') {
    rows = [['Notice', d.notice], ['Club', d.course]];
  } else {
    rows = [['When', whenText(d)], ['Course', d.course]];
  }

  const isPast = d.date && d.date <= today();
  const canCalendar = d.date && !isPast && d.status !== 'cancelled' && ['teetime', 'competition', 'other'].includes(e.category);
  const canScore = isPast && ['teetime', 'competition', 'other'].includes(e.category);

  openDialog({
    title: e.subject,
    className: 'sheet-email',
    build: (close) => {
      const categorySelect = h('select', {
        id: 'email-category',
        onchange: (ev) => {
          ctx.actions.updateEmail(e.id, { userCategory: ev.target.value });
          close();
        },
      }, Object.entries(CATEGORIES).map(([k, c]) => h('option', { value: k, selected: k === e.category }, c.label)));
      return {
        body: [
          h('div', { class: 'email-from' },
            categoryBadge(e.category, { withLabel: true }),
            h('span', { class: 'email-sender', title: e.fromEmail }, e.fromName),
            h('span', { class: 'muted' }, formatEmailDate(e.date))),
          facts(rows),
          e.snippet ? h('blockquote', { class: 'snippet' }, e.snippet) : null,
          h('div', { class: 'sheet-actions' },
            ctx.demo ? null : h('a', { class: 'btn', href: ctx.messageLink(e), target: '_blank', rel: 'noopener noreferrer' }, icon('external', 18), h('span', null, `Open in ${ctx.provider.mail}`)),
            canCalendar ? (() => {
              const cal = calendarLink(ctx, { title: e.category === 'teetime' ? `Golf: ${d.course || 'tee time'}` : e.subject, date: d.date, time: d.time, location: d.course || '', details: d.ref ? `Booking ref ${d.ref}` : '' });
              return h('a', { class: 'btn', target: '_blank', rel: 'noopener noreferrer', href: cal.href }, icon('calendar', 18), h('span', null, 'Add to calendar'));
            })() : null,
            canScore ? h('button', {
              class: 'btn', type: 'button',
              onclick: () => { close(); roundSheet(ctx, { prefill: { date: d.date, course: d.course || '' } }); },
            }, icon('plus', 18), h('span', null, 'Record score')) : null),
          h('div', { class: 'email-controls' },
            h('div', { class: 'field field-inline' }, h('label', { for: 'email-category' }, 'Show under'), categorySelect),
            h('div', { class: 'email-hide' },
              h('button', { class: 'link-btn', type: 'button', onclick: () => { ctx.actions.updateEmail(e.id, { hidden: true }); close(); } }, icon('hide', 16), h('span', null, 'Hide this email')),
              h('button', {
                class: 'link-btn', type: 'button',
                onclick: () => { ctx.actions.hideSender(e.fromEmail); close(); },
              }, icon('hide', 16), h('span', null, `Hide all from ${e.fromName}`)))),
        ],
      };
    },
  });
}

export function upcomingSheet(ctx, item) {
  openDialog({
    title: item.title,
    build: (close) => ({
      body: [
        ticket(item, { kicker: item.type === 'event' ? 'Competition' : 'Tee time' }),
        item.notes ? facts([['Notes', item.notes]]) : null,
        h('div', { class: 'sheet-actions' },
          (() => {
            const cal = calendarLink(ctx, { title: item.type === 'event' ? item.title : `Golf: ${item.title}`, date: item.date, time: item.time, location: item.course || '', details: item.ref ? `Booking ref ${item.ref}` : item.notes || '' });
            return h('a', { class: 'btn btn-primary', target: '_blank', rel: 'noopener noreferrer', href: cal.href }, icon('calendar', 18), h('span', null, cal.label));
          })(),
          item.emailId ? h('button', { class: 'btn', type: 'button', onclick: () => { close(); emailSheet(ctx, item.emailId); } }, icon('mail', 18), h('span', null, 'View email')) : null,
          item.manual ? h('button', { class: 'btn', type: 'button', onclick: () => { close(); teeTimeSheet(ctx, ctx.state.teeTimes[item.id]); } }, icon('edit', 18), h('span', null, 'Edit')) : null),
      ],
    }),
  });
}
