// Pop-up sheets: forms for rounds and tee times, and detail views.
import { h, add, icon, openDialog, today, formatLongDay, formatTime, formatEmailDate, segmented } from '../ui.js';
import { CATEGORIES } from '../parser.js';
import { calendarUrl, outlookCalendarUrl, differential, formatIndex } from '../golf.js';
import { categoryBadge, ordinal, ticket, shortCourse } from './common.js';
import { partnerPicker } from './partners.js';

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

/** The courses he plays most often lately, for one-tap picking. */
function recentCourses(ctx, n = 3) {
  const counts = new Map();
  for (const r of ctx.rounds().slice(0, 20)) {
    if (r.course) counts.set(r.course, (counts.get(r.course) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([name]) => name);
}

export function roundSheet(ctx, { round, prefill } = {}) {
  const r = round || { date: today(), holes: 18, ...prefill };
  const show = ctx.settings.roundFields;
  let holes = r.holes || 18;
  const listId = `courses-${Date.now()}`;

  openDialog({
    title: round ? 'Edit round' : 'Add score',
    build: (close) => {
      const form = h('form', { class: 'form', id: 'round-form' });
      const courseInput = h('input', { id: 'round-course', name: 'course', type: 'text', list: listId, autocomplete: 'off', value: r.course || '', placeholder: 'Where did you play?', autofocus: !round && !r.course });
      const scoreInput = Object.assign(numberInput('score', r.score, { min: 18, max: 200, required: true, placeholder: 'Total' }), { className: 'score-input', autofocus: !round && !!r.course });
      const parInput = numberInput('par', r.par, { min: 27, max: 80, placeholder: holes === 9 ? '36' : '72' });
      const ratingInput = numberInput('rating', r.rating, { min: 25, max: 85, step: '0.1', placeholder: '71.4' });
      const slopeInput = numberInput('slope', r.slope, { min: 55, max: 155, placeholder: '128' });

      // Picking a course he's played before fills in its par, rating and slope.
      const fillFromCourse = () => {
        const known = ctx.courses().find((c) => c.name.toLowerCase() === courseInput.value.trim().toLowerCase());
        if (!known) return;
        if (!parInput.value && known.par) parInput.value = known.par;
        if (!ratingInput.value && known.rating) ratingInput.value = known.rating;
        if (!slopeInput.value && known.slope) slopeInput.value = known.slope;
      };
      courseInput.addEventListener('change', fillFromCourse);
      if (!round) fillFromCourse();

      const picks = round ? [] : recentCourses(ctx).filter((c) => c !== r.course);
      const quickPicks = picks.length ? h('div', { class: 'picks', role: 'group', 'aria-label': 'Recent courses' },
        picks.map((name) => h('button', {
          class: 'pick', type: 'button',
          onclick: () => {
            courseInput.value = name;
            parInput.value = '';
            ratingInput.value = '';
            slopeInput.value = '';
            fillFromCourse();
            scoreInput.focus();
          },
        }, shortCourse(name)))) : null;

      const holesControl = segmented({
        id: 'holes', label: 'Holes played', value: String(holes),
        options: [['18', '18'], ['9', '9']],
        onChange: (v) => {
          holes = Number(v);
          holesControl.querySelectorAll('.seg').forEach((s) => s.classList.toggle('on', s.querySelector('input').value === v));
          parInput.placeholder = holes === 9 ? '36' : '72';
        },
      });

      const picker = show.partners || ctx.friends().length ? partnerPicker(ctx, r.friendIds || []) : null;
      const courseFields = [show.par ? field('Par', parInput) : null, show.rating ? field('Rating', ratingInput) : null, show.rating ? field('Slope', slopeInput) : null].filter(Boolean);

      add(form,
        h('div', { class: 'field' },
          h('label', { for: 'round-course' }, 'Course'),
          courseInput,
          quickPicks),
        courseList(ctx, listId),
        h('div', { class: 'field-row' },
          field('Score', scoreInput),
          show.points ? field('Stableford points', numberInput('points', r.points, { min: 0, max: 60 })) : null),
        h('div', { class: 'field-row field-row-holes' },
          field('Date', h('input', { name: 'date', type: 'date', required: true, value: r.date, max: '2100-12-31' })),
          h('div', { class: 'field' }, h('span', { class: 'label' }, 'Holes'), holesControl)),
        courseFields.length ? h('div', { class: `field-row ${courseFields.length === 3 ? 'field-row-3' : ''}` }, courseFields) : null,
        show.rating ? h('p', { class: 'field-hint field-hint-row' }, 'Rating and slope are printed on the scorecard for your tees. They’re used to estimate your handicap, and are filled in for courses you’ve played before.') : null,
        show.putts || show.fairways || show.greens ? h('div', { class: 'field-row field-row-3' },
          show.putts ? field('Putts', numberInput('putts', r.putts, { min: 0, max: 80 })) : null,
          show.fairways ? field('Fairways hit', numberInput('fairways', r.fairways, { min: 0, max: 18 })) : null,
          show.greens ? field('Greens in reg.', numberInput('greens', r.greens, { min: 0, max: 18 })) : null) : null,
        picker ? h('div', { class: 'field' },
          h('span', { class: 'label' }, 'Played with'),
          picker.el,
          r.partners && !(r.friendIds || []).length ? h('p', { class: 'field-hint' }, `Noted before: ${r.partners}`) : null) : null,
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
        if ('notes' in data) saved.notes = data.notes.trim();
        if (picker) saved.friendIds = picker.value();
        ctx.actions.saveRound(saved);
        close();
      });

      const diff = round && differential(round);
      return {
        body: [form, diff !== null && diff !== undefined ? h('p', { class: 'field-hint' }, `Score differential for this round: ${diff.toFixed(1)}`) : null],
        footer: [
          round ? h('button', {
            class: 'btn btn-ghost-danger', type: 'button',
            onclick: () => { close(); ctx.actions.deleteRound(round.id); },
          }, icon('trash', 18), h('span', null, 'Delete')) : null,
          h('span', { class: 'spacer' }),
          h('button', { class: 'btn', type: 'button', onclick: close }, 'Cancel'),
          h('button', { class: 'btn btn-primary', type: 'submit', form: 'round-form' }, round ? 'Save' : 'Save score'),
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
      const playersSelect = h('select', { name: 'players' },
        h('option', { value: '' }, 'Not set'),
        [1, 2, 3, 4].map((n) => h('option', { value: String(n), selected: t && t.players === n }, String(n))));
      // Ticking partners fills in the number of players, unless he has set it himself.
      let playersSetByHand = !!(t && t.players);
      playersSelect.addEventListener('change', () => { playersSetByHand = true; });
      const picker = partnerPicker(ctx, (t && t.friendIds) || [], {
        onChange: (ids) => {
          if (!playersSetByHand) playersSelect.value = ids.length ? String(Math.min(4, ids.length + 1)) : '';
        },
      });
      const form = h('form', { class: 'form', id: 'tee-form' },
        h('div', { class: 'field-row' },
          field('Date', h('input', { name: 'date', type: 'date', required: true, value: (t && t.date) || today() })),
          field('Time', h('input', { name: 'time', type: 'time', value: (t && t.time) || '' }))),
        field('Course', h('input', { name: 'course', type: 'text', list: listId, autocomplete: 'off', value: (t && t.course) || '', placeholder: 'Where are you playing?', autofocus: !t })),
        courseList(ctx, listId),
        h('div', { class: 'field' }, h('span', { class: 'label' }, 'Playing with'), picker.el),
        field('Players', playersSelect),
        field('Notes', h('textarea', { name: 'notes', rows: '2', placeholder: 'Buggy booked, meeting at the bar…' }, (t && t.notes) || '')));
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!form.reportValidity()) return;
        const data = Object.fromEntries(new FormData(form));
        ctx.actions.saveTeeTime({ ...(t || {}), date: data.date, time: data.time, course: data.course.trim(), players: num(data.players), friendIds: picker.value(), notes: data.notes.trim() });
        close();
      });
      return {
        body: form,
        footer: [
          t ? h('button', {
            class: 'btn btn-ghost-danger', type: 'button',
            onclick: () => { close(); ctx.actions.deleteTeeTime(t.id); },
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
            }, icon('plus', 18), h('span', null, 'Add score')) : null),
          h('div', { class: 'email-controls' },
            h('div', { class: 'field field-inline' }, h('label', { for: 'email-category' }, 'Show under'), categorySelect),
            h('div', { class: 'email-hide' },
              h('button', { class: 'link-btn', type: 'button', onclick: () => { close(); ctx.actions.hideEmail(e.id); } }, icon('hide', 16), h('span', null, 'Hide this email')),
              h('button', {
                class: 'link-btn', type: 'button',
                onclick: () => { close(); ctx.actions.hideSender(e.fromEmail, e.fromName); },
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
        ticket(item, { ctx, kicker: item.type === 'event' ? 'Competition' : 'Tee time' }),
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
