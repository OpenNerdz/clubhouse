// Scoring hole by hole out on the course: one hole at a time with big buttons,
// saved on the phone after every tap so nothing is lost if it closes or the
// battery runs out. Shots and points follow the stroke index, as on the card.
import { h, icon, openDialog, confirmDialog, toast, segmented } from '../ui.js';
import { roundShots, shotsPerHole, holePoints, cardScore, cardPoints, cardPar, holesPlayed, scoreName } from '../golf.js';
import { toGreen, courseAt, follow, keepAwake, distanceUnit, inUnit } from '../gps.js';
import { shortCourse, ordinal } from './common.js';
import { roundSheet } from './sheets.js';

const played = (hole) => hole.picked || (hole.strokes !== null && hole.strokes !== undefined);
const sum = (xs) => xs.reduce((a, b) => a + b, 0);

/** Shots for Stableford points (95%, as clubs use) and for the most a hole can count (the full course handicap). */
export function liveShots(draft) {
  const course = { rating: draft.rating, slope: draft.slope, par: sum(draft.card.map((x) => x.par)), holes: draft.holes };
  return { points: roundShots(draft.indexAtPlay, course, 0.95), full: roundShots(draft.indexAtPlay, course) };
}

/** "Thru 7 · 34 · +3 · 15 pts" */
export function liveSummary(draft) {
  const n = holesPlayed(draft.card);
  if (!n) return 'Not started yet';
  const s = liveShots(draft);
  const score = cardScore(draft.card, s.full);
  const diff = score - cardPar(draft.card);
  const inOrder = draft.card.slice(0, n).every(played);
  const parts = [n === draft.card.length ? 'All holes' : inOrder ? `Thru ${n}` : `${n} holes`, String(score), diff === 0 ? 'Level' : diff > 0 ? `+${diff}` : String(diff)];
  if (s.points !== null) parts.push(`${cardPoints(draft.card, s.points)} pts`);
  return parts.join(' · ');
}

function shotsHere(n) {
  if (!Number.isInteger(n)) return '';
  if (n === 0) return 'No shot';
  return n > 0 ? `${n} shot${n === 1 ? '' : 's'}` : `Give ${-n}`;
}

/** A score on the card: birdies ringed, eagles double-ringed, bogeys boxed, doubles double-boxed. */
function mark(hole) {
  if (hole.picked) return h('span', { class: 'mark mark-picked', title: 'Picked up' }, 'P');
  if (!played(hole)) return h('span', { class: 'mark' }, '');
  const d = hole.strokes - hole.par;
  const kind = d <= -2 ? 'eagle' : d === -1 ? 'birdie' : d === 1 ? 'bogey' : d >= 2 ? 'double' : 'par';
  return h('span', { class: `mark mark-${kind}` }, String(hole.strokes));
}

/** The card as printed: hole, par and his score, a nine to a row. */
export function cardGrid(card) {
  const nines = [];
  for (let i = 0; i < card.length; i += 9) nines.push(card.slice(i, i + 9).map((x, j) => ({ ...x, n: i + j + 1 })));
  return h('div', { class: 'cardgrid' }, nines.map((nine, k) => {
    const picked = nine.some((x) => x.picked);
    const total = sum(nine.filter((x) => !x.picked && played(x)).map((x) => x.strokes));
    return h('table', { class: 'cardgrid-nine' },
      h('caption', { class: 'sr-only' }, k ? 'Back nine' : nines.length > 1 ? 'Front nine' : 'Nine holes'),
      h('thead', null, h('tr', null, h('th', { scope: 'row' }, 'Hole'), nine.map((x) => h('th', { scope: 'col' }, String(x.n))), h('th', { scope: 'col' }, k ? 'In' : 'Out'))),
      h('tbody', null,
        h('tr', { class: 'cardgrid-par' }, h('th', { scope: 'row' }, 'Par'), nine.map((x) => h('td', null, String(x.par))), h('td', null, String(sum(nine.map((x) => x.par))))),
        h('tr', null, h('th', { scope: 'row' }, 'Score'), nine.map((x) => h('td', null, mark(x))), h('td', { class: 'cardgrid-total' }, picked ? '–' : String(total)))));
  }));
}

/** The round in progress. Opens on the next hole to play. */
export function playSheet(ctx) {
  if (!ctx.live) return;
  const draft = JSON.parse(JSON.stringify(ctx.live)); // a working copy, saved after every change
  const n = draft.card.length;
  const showPutts = ctx.settings.roundFields.putts;
  const hole = () => draft.card[draft.hole];
  const shown = () => hole().strokes ?? hole().par; // par until he changes it
  let closeSheet = () => {};
  let thrownAway = false;

  const kicker = h('p', { class: 'play-kicker' });
  const parBox = h('div', { class: 'play-par' });
  const siSelect = h('select', {
    class: 'play-si', 'aria-label': 'Stroke index',
    onchange: (e) => { hole().si = Number(e.target.value) || null; changed(); },
  }, h('option', { value: '' }, 'SI –'), Array.from({ length: 18 }, (_, i) => h('option', { value: String(i + 1) }, `SI ${i + 1}`)));
  const shotsNote = h('span', { class: 'play-shots' });
  const value = h('output', { class: 'play-value', 'aria-live': 'polite' });
  const verdict = h('p', { class: 'play-verdict' });
  const pickBtn = h('button', { class: 'link-btn play-pick', type: 'button', onclick: togglePick });
  const puttsValue = h('output', { class: 'play-putts-value' });
  const total = h('p', { class: 'play-total' });
  const strip = h('div', { class: 'play-strip', role: 'group', 'aria-label': 'Go to a hole' });
  const prevBtn = h('button', { class: 'btn', type: 'button', onclick: () => go(draft.hole - 1) }, icon('back', 18), h('span', null, 'Back'));
  const nextBtn = h('button', { class: 'btn btn-primary play-next', type: 'button', onclick: next });

  /* ----- distances to the green, when he has turned them on ----- */

  const gpsBox = h('div', { class: 'gps' });
  let stopFollow = null;
  let stopAwake = null;
  let fix = null;
  let gpsError = null;
  let mapState = 'idle'; // idle, loading, done, none (course not mapped) or failed (map service busy)
  let lastFound = null; // map data waiting for a course name to be kept under
  let lastSig = '';
  const nameInput = h('input', { type: 'text', placeholder: 'Which course is this?', 'aria-label': 'Course name', autocomplete: 'off' });
  const nameRow = h('form', {
    class: 'gps-name',
    onsubmit: (e) => {
      e.preventDefault();
      const name = nameInput.value.trim();
      if (!name) return;
      draft.course = name;
      if (lastFound) ctx.actions.saveCourseMap(name, lastFound);
      retitle();
      changed();
    },
  }, nameInput, h('button', { class: 'btn btn-small', type: 'submit' }, 'OK'));

  const greenFor = (i) => {
    const c = draft.course ? ctx.course(draft.course) : null;
    return (c && c.greens && c.greens[i + 1]) || (lastFound && lastFound.greens[i + 1]) || null;
  };
  // Where to look the course up: where he's standing, or where the weather found it.
  const spot = () => fix || (draft.course && ctx.placeOf(draft.course)) || null;

  function startGps() {
    if (stopFollow) return;
    gpsError = null;
    stopFollow = follow((p) => { fix = p; gpsError = null; loadMap(); drawGps(); }, (e) => { gpsError = e; drawGps(); });
    stopAwake = keepAwake(); // a screen that keeps going dark is the biggest nuisance on the course
  }

  function stopGps() {
    if (stopFollow) stopFollow();
    if (stopAwake) stopAwake();
    stopFollow = null;
    stopAwake = null;
    fix = null;
  }

  function setGps(on) {
    ctx.actions.setSetting('gps', on);
    if (on) startGps();
    else stopGps();
    drawGps();
  }

  function retitle() {
    const title = gpsBox.closest('dialog') && gpsBox.closest('dialog').querySelector('.sheet-title');
    if (title) title.textContent = shortCourse(draft.course);
  }

  /** Looks the course up on OpenStreetMap: by itself once, when none of its greens are known, or when he asks. */
  async function loadMap(asked = false) {
    const where = spot();
    const c = draft.course ? ctx.course(draft.course) : null;
    const known = (c && c.greens && Object.keys(c.greens).length) || lastFound;
    if (!where || mapState === 'loading' || (!asked && (mapState !== 'idle' || known))) return;
    mapState = 'loading';
    drawGps();
    try {
      const found = await courseAt(where);
      if (!found) {
        mapState = 'none';
        drawGps();
        return;
      }
      if (!draft.course && found.name) {
        draft.course = found.name;
        retitle();
      }
      const before = draft.course ? ctx.course(draft.course) : null;
      if (draft.course) ctx.actions.saveCourseMap(draft.course, found);
      else lastFound = found;
      // Fill in the card from the map where it's still blank, leaving holes already played alone.
      draft.card.forEach((x, i) => {
        if (!(before && before.card) && found.pars[i + 1] && !played(x)) x.par = found.pars[i + 1];
        if (!x.si && found.sis[i + 1]) x.si = found.sis[i + 1];
      });
      mapState = 'done';
      toast(`Found ${Object.keys(found.greens).length} greens on OpenStreetMap${found.name ? ` for ${found.name}` : ''}. Check the pars against the card.`);
      changed();
    } catch {
      mapState = 'failed';
      drawGps();
    }
  }

  function saveHere() {
    if (!fix) return;
    if (!draft.course) {
      toast('Name the course first, so its greens can be kept.');
      nameInput.focus();
      return;
    }
    ctx.actions.saveGreen(draft.course, draft.hole + 1, fix);
    lastSig = '';
    drawGps();
  }

  function drawGps() {
    if (!ctx.settings.gps) {
      lastSig = '';
      gpsBox.className = 'gps gps-off';
      gpsBox.replaceChildren(h('button', { class: 'link-btn', type: 'button', onclick: () => setGps(true) }, icon('pin', 16), h('span', null, 'Show distances to the green')));
      return;
    }
    const unit = distanceUnit(ctx.settings.distance);
    const short = unit === 'yards' ? 'yds' : 'm';
    const holeNo = draft.hole + 1;
    const g = greenFor(draft.hole);
    const d = fix && g ? toGreen(fix, g) : null;
    const weak = fix && fix.accuracy > 20 ? inUnit(fix.accuracy, unit) : 0;
    // Positions come every second or two; only redraw when what's shown changes, so taps aren't lost.
    const sig = JSON.stringify([holeNo, unit, gpsError, !!fix, mapState, !!g, d && [d.front, d.middle, d.back].map((m) => (m === undefined ? m : inUnit(m, unit))), weak, draft.course]);
    if (sig === lastSig) return;
    lastSig = sig;
    const note = (text) => h('p', { class: 'gps-note' }, text);
    const link = (text, onclick) => h('button', { class: 'link-btn', type: 'button', onclick }, text);
    const body = [];
    if (gpsError === 'denied') body.push(note('Location is blocked for this site. Allow it in the browser’s site settings to see distances.'));
    else if (gpsError === 'unsupported') body.push(note('This browser can’t share your location.'));
    else if (!fix) body.push(note(gpsError ? 'No GPS fix yet. Distances will show once the phone finds you.' : 'Finding where you are…'));
    else if (d) {
      body.push(h('div', { class: 'gps-main' },
        h('span', { class: 'gps-big' }, String(inUnit(d.middle, unit))),
        h('button', {
          class: 'gps-unit', type: 'button', 'aria-label': `${unit}, tap for ${unit === 'yards' ? 'metres' : 'yards'}`,
          onclick: () => { ctx.actions.setSetting('distance', unit === 'yards' ? 'metres' : 'yards'); drawGps(); },
        }, short),
        h('span', { class: 'gps-to' }, 'to the middle')));
      if (d.front !== undefined) body.push(h('p', { class: 'gps-fb' }, `Front ${inUnit(d.front, unit)} · Back ${inUnit(d.back, unit)}`));
      if (weak) body.push(note(`Weak signal: give or take ${weak} ${short}`));
    } else {
      body.push(note(mapState === 'loading' ? 'Looking for the course on OpenStreetMap…'
        : mapState === 'none' ? `This course isn’t mapped on OpenStreetMap. Stand on the ${ordinal(holeNo)} green and save it, and the distance will be here next time.`
          : mapState === 'failed' ? 'The map service is busy. Try again in a minute, or save the green when you reach it.'
            : `The ${ordinal(holeNo)} green isn’t saved yet. Stand on it and save it for next time.`));
    }
    const links = [];
    if (!g && spot() && mapState !== 'loading' && mapState !== 'none') links.push(link('Look for the course map', () => loadMap(true)));
    // Moving a green is only offered on or near it, so a tap on the tee can't send it there.
    if (fix && (!g || d.middle < 40)) links.push(link(g ? `Move green ${holeNo} to here` : `I’m on green ${holeNo}: save it`, saveHere));
    links.push(link('Turn off', () => setGps(false)));
    gpsBox.className = 'gps';
    gpsBox.replaceChildren(...[...body, draft.course ? null : nameRow, h('div', { class: 'gps-links' }, links)].filter(Boolean));
  }

  function changed() {
    ctx.actions.saveLive(draft);
    draw();
  }

  function step(d) {
    const x = hole();
    x.strokes = Math.min(15, Math.max(1, (x.picked ? x.par : shown()) + d));
    x.picked = false;
    changed();
  }

  function stepPutts(d) {
    const x = hole();
    x.putts = x.putts === null || x.putts === undefined ? (d > 0 ? 2 : 1) : Math.min(9, Math.max(0, x.putts + d));
    changed();
  }

  function togglePick() {
    const x = hole();
    x.picked = !x.picked;
    x.strokes = null;
    changed();
  }

  function go(i) {
    if (i < 0 || i >= n) return;
    draft.hole = i;
    changed();
  }

  // Moving on records the score shown, which is par if he didn't change it.
  function next() {
    const x = hole();
    if (!played(x)) x.strokes = x.par;
    if (draft.hole < n - 1) go(draft.hole + 1);
    else finish();
  }

  function finish() {
    const missing = draft.card.findIndex((x) => !played(x));
    if (missing >= 0) {
      go(missing);
      toast(`Hole ${missing + 1} has no score yet.`);
      return;
    }
    ctx.actions.saveLive(draft);
    const s = liveShots(draft);
    const card = draft.card.map(({ par, si, strokes, putts, picked }) => ({ par, si: si || null, strokes: picked ? null : strokes, putts: putts ?? null, picked: !!picked }));
    const withPutts = card.filter((x) => x.putts !== null);
    const prefill = {
      course: draft.course,
      date: draft.date,
      holes: draft.holes,
      score: cardScore(card, s.full),
      par: cardPar(card),
      rating: draft.rating,
      slope: draft.slope,
      card,
      indexAtPlay: draft.indexAtPlay,
      points: s.points !== null ? cardPoints(card, s.points) : undefined,
      putts: withPutts.length === card.filter((x) => !x.picked).length ? sum(withPutts.map((x) => x.putts)) : undefined,
    };
    for (const k of Object.keys(prefill)) if (prefill[k] === undefined || prefill[k] === null) delete prefill[k];
    const existing = draft.roundId && ctx.state.rounds[draft.roundId];
    closeSheet();
    roundSheet(ctx, { round: existing && !existing.deleted ? existing : undefined, prefill, fromCard: true });
  }

  async function discard() {
    const ok = await confirmDialog({
      title: 'Throw this round away?',
      message: 'The scores entered so far will be lost.',
      confirmLabel: 'Throw away',
      danger: true,
    });
    if (!ok) return;
    thrownAway = true;
    closeSheet();
    ctx.actions.clearLive();
  }

  function draw() {
    drawGps();
    const x = hole();
    const i = draft.hole;
    const s = liveShots(draft);
    const per = s.points === null ? null : shotsPerHole(draft.card, s.points);
    kicker.textContent = `Hole ${i + 1} of ${n}`;
    parBox.replaceChildren(segmented({
      id: 'play-par', label: 'Par', value: String(x.par),
      options: [['3', 'Par 3'], ['4', 'Par 4'], ['5', 'Par 5']],
      onChange: (v) => { hole().par = Number(v); changed(); },
    }));
    siSelect.value = x.si ? String(x.si) : '';
    shotsNote.textContent = per ? shotsHere(per[i]) : '';
    value.textContent = x.picked ? 'P' : String(shown());
    value.classList.toggle('is-default', !played(x));
    verdict.textContent = x.picked ? 'Picked up · no points'
      : !played(x) ? `Par ${x.par}. Tap + or − if you took more or fewer.`
        : `${scoreName(x.strokes, x.par)}${per ? ` · ${holePoints(x, per[i])} pts` : ''}`;
    pickBtn.textContent = x.picked ? 'I finished the hole' : 'I picked up';
    puttsValue.textContent = x.putts === null || x.putts === undefined ? '–' : String(x.putts);
    total.textContent = liveSummary(draft);
    strip.replaceChildren(...draft.card.map((c, k) => h('button', {
      class: `strip-hole ${k === i ? 'on' : ''} ${played(c) ? 'done' : ''}`,
      type: 'button',
      'aria-label': `Hole ${k + 1}${c.picked ? ', picked up' : played(c) ? `, ${c.strokes}` : ''}`,
      'aria-current': k === i ? 'true' : null,
      onclick: () => go(k),
    }, h('span', { class: 'strip-n' }, String(k + 1)), h('span', { class: 'strip-score' }, c.picked ? 'P' : played(c) ? String(c.strokes) : '·'))));
    prevBtn.disabled = i === 0;
    nextBtn.replaceChildren(...(i === n - 1 ? [h('span', null, 'Finish round'), icon('check', 18)] : [h('span', null, `Hole ${i + 2}`), icon('chevron', 18)]));
  }

  closeSheet = openDialog({
    title: draft.course ? shortCourse(draft.course) : 'Your round',
    className: 'sheet-play',
    onClose: () => {
      stopGps();
      if (!thrownAway) ctx.actions.saveLive(draft, { redraw: true });
    },
    build: () => ({
      body: [
        gpsBox,
        h('div', { class: 'play-hole' },
          kicker,
          h('div', { class: 'play-hole-setup' }, parBox, siSelect, shotsNote)),
        h('div', { class: 'play-score' },
          h('button', { class: 'play-step', type: 'button', 'aria-label': 'One fewer', onclick: () => step(-1) }, icon('minus', 30)),
          value,
          h('button', { class: 'play-step', type: 'button', 'aria-label': 'One more', onclick: () => step(1) }, icon('plus', 30))),
        verdict,
        pickBtn,
        showPutts ? h('div', { class: 'play-putts' },
          h('span', { class: 'label' }, 'Putts'),
          h('button', { class: 'play-step play-step-small', type: 'button', 'aria-label': 'One putt fewer', onclick: () => stepPutts(-1) }, icon('minus', 20)),
          puttsValue,
          h('button', { class: 'play-step play-step-small', type: 'button', 'aria-label': 'One putt more', onclick: () => stepPutts(1) }, icon('plus', 20))) : null,
        total,
        strip,
        h('button', { class: 'link-btn play-discard', type: 'button', onclick: discard }, icon('trash', 16), h('span', null, 'Throw this round away')),
      ],
      footer: [prevBtn, h('span', { class: 'spacer' }), nextBtn],
    }),
  });
  draw();
  if (ctx.settings.gps) startGps();
}

/** On the home screen while a round is being scored. */
export function liveCard(ctx, draft) {
  const where = draft.course ? shortCourse(draft.course) : 'Your round';
  return h('section', { class: 'card return live', 'aria-label': 'Round in progress' },
    h('div', { class: 'return-text' },
      h('p', { class: 'return-kicker' }, 'Round in progress'),
      h('h2', { class: 'return-title' }, `${where} · hole ${draft.hole + 1}`),
      h('p', { class: 'return-meta' }, liveSummary(draft))),
    h('div', { class: 'return-actions' },
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => playSheet(ctx) }, icon('flag', 18), h('span', null, 'Carry on scoring'))));
}
