// Golf maths and the views of the data that several screens share.
// Pure functions, so they can be tested in Node.

const byDateDesc = (a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || ''));
const round1 = (n) => Math.round(n * 10) / 10;
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const live = (obj) => Object.values(obj || {}).filter((x) => !x.deleted);
const norm = (s = '') => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/* ---------- course handicap, shots and the hole-by-hole card ---------- */

// "Oakmere Golf Club" and "Oakmere GC" are the same course.
const courseName = (s = '') => norm(s.replace(/\s+(?:Golf\s*(?:&|and)\s*Country\s+Club|Golf\s+Club|Golf\s+Course|Country\s+Club|G\.?C\.?)$/i, ''));

/** The saved course (par, rating, slope, hole card) for a course name from an email or a form. */
export function courseRecord(courses, name) {
  if (!name) return null;
  const want = courseName(name);
  return live(courses).find((c) => courseName(c.name) === want) || null;
}

/** A Handicap Index as a number: "+1.2" (a plus handicap) is -1.2. */
export function indexValue(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  const n = parseFloat(s.replace(/^\+/, ''));
  if (!Number.isFinite(n)) return null;
  return s.startsWith('+') ? -n : n;
}

// A 9-hole round may have been given the 18-hole rating and par from the card; halve them if so.
const nineRating = (rating) => (rating > 50 ? rating / 2 : rating);
const ninePar = (par) => (par > 45 ? par / 2 : par);

function rawCourseHandicap(index, { rating, slope, par, holes = 18 } = {}) {
  const idx = indexValue(index);
  if (idx === null || !rating || !slope) return null;
  const nine = holes === 9;
  const r = nine ? nineRating(rating) : rating;
  const p = par ? (nine ? ninePar(par) : par) : r;
  return (nine ? idx / 2 : idx) * (slope / 113) + (r - p);
}

/**
 * WHS course handicap: the shots he gets over the holes he's playing, from his
 * index and the course's rating, slope and par. Null without a rating and slope.
 */
export function courseHandicap(index, course) {
  const raw = rawCourseHandicap(index, course);
  return raw === null ? null : Math.round(raw);
}

/**
 * Shots for a round he's scoring hole by hole: the course handicap when the
 * rating and slope are known, otherwise his index as a rough guide.
 * `allowance` is 0.95 for Stableford points, as clubs use for individual play.
 */
export function roundShots(index, course, allowance = 1) {
  const idx = indexValue(index);
  if (idx === null) return null;
  const raw = rawCourseHandicap(idx, course);
  const holes = (course && course.holes) || 18;
  return Math.round((raw === null ? (holes === 9 ? idx / 2 : idx) : raw) * allowance);
}

/** "16 shots", "Scratch", or "Plus 2" for a plus handicap. */
export function shotsLabel(n) {
  if (n === null || n === undefined) return '';
  if (n === 0) return 'Scratch';
  return n < 0 ? `Plus ${-n}` : `${n} shot${n === 1 ? '' : 's'}`;
}

/**
 * The shots he gets on each hole of a card, given out by stroke index: 20 shots
 * over 18 holes is two on the two hardest holes and one on the rest. A plus
 * handicap gives shots back on the easiest holes. Without stroke indexes the
 * shots are spread evenly, which is near enough for a running total.
 */
export function shotsPerHole(card, shots) {
  const n = card.length;
  if (!n || !shots) return card.map(() => 0);
  if (card.some((x) => !x.si)) return card.map(() => shots / n);
  const order = card.map((_, i) => i).sort((a, b) => card[a].si - card[b].si);
  const abs = Math.abs(shots);
  const base = Math.floor(abs / n);
  const extra = abs % n;
  const out = new Array(n).fill(0);
  order.forEach((hole, rank) => {
    const more = shots < 0 ? rank >= n - extra : rank < extra;
    const given = base + (more ? 1 : 0);
    out[hole] = shots < 0 ? -given || 0 : given;
  });
  return out;
}

/**
 * The most a hole can count for his handicap: net double bogey (par + 2 + his
 * shots there), or par + 5 before he has an index. Also what a picked-up hole scores.
 */
function holeCap(hole, shots) {
  return shots === null ? hole.par + 5 : hole.par + 2 + Math.ceil(shots);
}

const played = (hole) => hole.picked || (hole.strokes !== null && hole.strokes !== undefined);
export const holesPlayed = (card) => card.filter(played).length;

/** Strokes for the holes played so far, a picked-up hole counting as net double bogey. */
export function cardScore(card, shots) {
  const per = shots === null ? null : shotsPerHole(card, shots);
  let total = 0;
  card.forEach((hole, i) => {
    if (hole.picked) total += holeCap(hole, per && per[i]);
    else if (played(hole)) total += hole.strokes;
  });
  return total;
}

/** WHS adjusted gross score: every hole capped at net double bogey. */
export function adjustedGross(card, shots) {
  const per = shots === null ? null : shotsPerHole(card, shots);
  return card.reduce((sum, hole, i) => {
    const cap = holeCap(hole, per && per[i]);
    return sum + (hole.picked || !played(hole) ? cap : Math.min(hole.strokes, cap));
  }, 0);
}

/** Stableford points on one hole: two for a net par, one more for each shot better. */
export function holePoints(hole, shots) {
  if (hole.picked || !played(hole)) return 0;
  return Math.max(0, Math.round(2 + hole.par + shots - hole.strokes));
}

/** Stableford points for the holes played so far. */
export function cardPoints(card, shots) {
  const per = shotsPerHole(card, shots || 0);
  return card.reduce((sum, hole, i) => sum + holePoints(hole, per[i]), 0);
}

/** Par for the holes played so far. */
export const cardPar = (card) => card.filter(played).reduce((sum, hole) => sum + hole.par, 0);

/** "Birdie", "Par", "Double bogey"… for a score on a hole. */
export function scoreName(strokes, par) {
  const d = strokes - par;
  if (strokes === 1) return 'Hole in one';
  return { '-3': 'Albatross', '-2': 'Eagle', '-1': 'Birdie', 0: 'Par', 1: 'Bogey', 2: 'Double bogey', 3: 'Triple bogey' }[d] || (d > 0 ? `+${d}` : `${d}`);
}

/** The score that counts for his handicap: the adjusted gross score when there's a card. */
function handicapScore(r) {
  if (Array.isArray(r.card) && r.card.length === (r.holes || 18)) {
    return adjustedGross(r.card, courseHandicap(r.indexAtPlay, r));
  }
  return r.score;
}

/**
 * World Handicap System score differential, or null if the round can't produce one.
 * A 9-hole round counts once his index at the time is known: its 9-hole
 * differential plus the score expected of him on the other nine.
 */
export function differential(r) {
  if (!r || !r.score || !r.rating || !r.slope) return null;
  const holes = r.holes || 18;
  const score = handicapScore(r);
  if (holes === 18) return round1((113 / r.slope) * (score - r.rating));
  const idx = indexValue(r.indexAtPlay);
  if (holes !== 9 || idx === null) return null;
  return round1((113 / r.slope) * (score - nineRating(r.rating)) + (idx * 0.52 + 1.2));
}

// How many of the lowest differentials count, and the adjustment, when there are fewer than 20.
const WHS_TABLE = {
  3: [1, -2], 4: [1, -1], 5: [1, 0], 6: [2, -1], 7: [2, 0], 8: [2, 0], 9: [3, 0], 10: [3, 0],
  11: [3, 0], 12: [4, 0], 13: [4, 0], 14: [4, 0], 15: [5, 0], 16: [5, 0], 17: [6, 0], 18: [6, 0],
  19: [7, 0], 20: [8, 0],
};

/** Estimated Handicap Index from the most recent 20 eligible rounds (needs at least 3). */
export function handicapIndex(rounds) {
  const diffs = [...rounds].sort(byDateDesc).map(differential).filter((d) => d !== null).slice(0, 20);
  const entry = WHS_TABLE[diffs.length];
  if (!entry) return null;
  const [count, adjust] = entry;
  const best = diffs.sort((a, b) => a - b).slice(0, count);
  return Math.min(54, round1(mean(best) + adjust));
}

const isoOf = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** His official index from each handicap email, oldest first (one per day). */
export function officialIndexHistory(emails) {
  const byDay = new Map();
  for (const e of [...emails].sort((a, b) => a.date - b.date)) {
    const v = e.category === 'handicap' ? indexValue(e.details && e.details.index) : null;
    if (v !== null) byDay.set(isoOf(e.date), v);
  }
  return [...byDay].map(([date, value]) => ({ date, value }));
}

/** His estimated index after each round that counts towards it, oldest first. */
export function estimatedIndexHistory(roundsObj) {
  const all = live(roundsObj).sort((a, b) => byDateDesc(b, a));
  const out = [];
  all.forEach((r, i) => {
    if (differential(r) === null) return;
    const value = handicapIndex(all.slice(0, i + 1));
    if (value !== null) out.push({ date: r.date, value, course: r.course });
  });
  return out;
}

export function roundStats(roundsObj, year = new Date().getFullYear()) {
  const all = live(roundsObj).sort(byDateDesc);
  const full = all.filter((r) => (r.holes || 18) === 18 && r.score);
  const recent = full.slice(0, 10);
  const pick = (key) => mean(recent.filter((r) => r[key] != null && r[key] !== '').map((r) => +r[key]));
  let best = null;
  for (const r of full) if (!best || r.score < best.score) best = r;
  return {
    count: all.length,
    thisYear: all.filter((r) => r.date.startsWith(String(year))).length,
    average: recent.length ? round1(mean(recent.map((r) => r.score))) : null,
    averageOf: recent.length,
    best,
    putts: pick('putts') !== null ? round1(pick('putts')) : null,
    fairways: pick('fairways') !== null ? round1(pick('fairways')) : null,
    greens: pick('greens') !== null ? round1(pick('greens')) : null,
    points: pick('points') !== null ? round1(pick('points')) : null,
    index: handicapIndex(all),
    eligible: all.filter((r) => differential(r) !== null).length,
  };
}

/**
 * Rounds worth circling, the way golfers ring a good score on the card: his best
 * 18-hole round, and any round where he played to his handicap (36+ Stableford
 * points over 18 holes, 18+ over nine).
 */
export function goodRoundIds(roundsObj) {
  const all = live(roundsObj);
  const ids = new Set();
  let best = null;
  for (const r of all) {
    const holes = r.holes || 18;
    if (holes === 18 && r.score && (!best || r.score < best.score || (r.score === best.score && r.date > best.date))) best = r;
    if (r.points && r.points >= (holes === 9 ? 18 : 36)) ids.add(r.id);
  }
  if (best) ids.add(best.id);
  return ids;
}

/** Collapses confirmation / reminder / change / cancellation emails into one booking each. */
export function bookingsFromEmails(emails) {
  const groups = [];
  const sorted = emails.filter((e) => e.category === 'teetime' && e.details.date).sort((a, b) => a.date - b.date);
  for (const e of sorted) {
    const d = e.details;
    let g = d.ref && groups.find((x) => x.ref === d.ref);
    const sameDay = (x) => x.date === d.date && (!x.course || !d.course || norm(x.course) === norm(d.course)) && (!x.ref || !d.ref);
    if (!g) g = groups.find((x) => sameDay(x) && (!x.time || !d.time || x.time === d.time));
    // "Your tee time has changed" with no booking reference: a new time for that day's booking.
    if (!g && d.status === 'changed') g = groups.filter(sameDay).pop();
    if (!g) {
      g = { id: `b-${e.id}`, emailIds: [] };
      groups.push(g);
    }
    g.date = d.date;
    g.time = d.time || g.time;
    g.course = d.course || g.course;
    g.players = d.players || g.players;
    g.ref = d.ref || g.ref;
    g.status = d.status; // the most recent email decides (a re-booking after a cancellation counts)
    g.emailId = e.id;
    g.emailIds.push(e.id);
  }
  return groups;
}

/** "Entry confirmed: Autumn Stableford" → "Autumn Stableford". */
export function eventTitle(subject = '') {
  const t = subject
    .replace(/^(?:(?:competition\s+)?entry\s+(?:confirmed|confirmation|received)|you(?:'|’)re entered|draw(?:\s+(?:published|now available))?|start(?:ing)?\s+sheet|tee\s+times?|reminder|booking\s+confirm(?:ed|ation))\s*(?:for)?\s*[:\-–—]\s*/i, '')
    .replace(/\s*[:\-–—]\s*(?:entries|entry|booking|sign[\s-]?up)s?\s+(?:are\s+)?(?:now\s+)?open\s*!?$/i, '')
    .trim();
  return t || subject;
}

/** "Results: October Medal" → "October Medal"; "Saturday Stableford results" → "Saturday Stableford". */
export function resultTitle(subject = '') {
  const t = subject
    .replace(/^(?:your\s+)?results?\s*(?:for|of)?\s*[:\-–—]\s*/i, '')
    .replace(/\s*[:\-–—]?\s*(?:results?|leaderboard)\s*(?:are\s+)?(?:now\s+)?(?:in|out|available|published)?\s*!?$/i, '')
    .trim();
  return t || subject;
}

/** Everything coming up: booked tee times, competitions entered and tee times added by hand. */
export function upcomingItems({ emails, teeTimes }, today) {
  const items = [];
  for (const b of bookingsFromEmails(emails)) {
    if (b.status === 'cancelled' || b.date < today) continue;
    items.push({ type: 'teetime', id: b.id, date: b.date, time: b.time, title: b.course || 'Tee time', course: b.course, players: b.players, ref: b.ref, emailId: b.emailId, status: b.status });
  }
  const seen = new Set();
  for (const e of emails) {
    const d = e.details;
    if (e.category !== 'competition' || d.kind === 'result' || !d.date || d.date < today) continue;
    const key = `${d.date}|${d.time || ''}|${norm(d.course || e.subject)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ type: 'event', id: `e-${e.id}`, date: d.date, time: d.time, title: eventTitle(e.subject), course: d.course, emailId: e.id });
  }
  for (const t of live(teeTimes)) {
    if (t.date < today) continue;
    items.push({ type: 'teetime', id: t.id, date: t.date, time: t.time, title: t.course || 'Tee time', course: t.course, players: t.players, notes: t.notes, friendIds: t.friendIds || [], manual: true });
  }
  return items.sort((a, b) => (a.date + (a.time || '99')).localeCompare(b.date + (b.time || '99')));
}

const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// Subjects that mean he's actually playing, not just that entries are open.
const ENTERED = /\bconfirm|you(?:'|’)re (?:entered|in)\b|\bdraw\b|start(?:ing)? sheet|tee times? (?:are )?(?:out|published|available)/i;

/**
 * Rounds he has played in the last week (going by his tee times and competition
 * entries) with no score recorded for that day yet, newest first. A tee time
 * today only counts once the round should be over. `dismissed` holds days he
 * said he didn't play.
 */
export function unscoredRounds({ emails, teeTimes, rounds, dismissed = [] }, now = new Date()) {
  const todayIso = isoDay(now);
  const weekAgo = isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7));
  const scored = new Set(live(rounds).map((r) => r.date));
  const skip = new Set(dismissed);
  const over = (date, time) => {
    if (date < weekAgo || date > todayIso) return false;
    if (date < todayIso) return true;
    if (!time) return false;
    const [hh, mm] = time.split(':').map(Number);
    return now.getHours() * 60 + now.getMinutes() >= hh * 60 + mm + 270;
  };
  const byDate = new Map();
  const consider = (item) => {
    if (!item.date || !over(item.date, item.time) || scored.has(item.date) || skip.has(item.date)) return;
    const prev = byDate.get(item.date);
    // A booking and a competition entry on the same day are the same round.
    if (!prev || (!prev.course && item.course)) byDate.set(item.date, { ...prev, ...item });
  };
  for (const b of bookingsFromEmails(emails)) {
    if (b.status !== 'cancelled') consider({ id: b.id, date: b.date, time: b.time, course: b.course });
  }
  for (const e of emails) {
    const d = e.details;
    if (e.category === 'competition' && d.kind !== 'result' && ENTERED.test(e.subject)) {
      consider({ id: `e-${e.id}`, date: d.date, time: d.time, course: d.course, event: eventTitle(e.subject) });
    }
  }
  for (const t of live(teeTimes)) consider({ id: t.id, date: t.date, time: t.time, course: t.course });
  return [...byDate.values()].sort(byDateDesc);
}

/** How many rounds he's played with each partner. */
export function partnerCounts(rounds) {
  const counts = new Map();
  for (const r of live(rounds)) for (const id of r.friendIds || []) counts.set(id, (counts.get(id) || 0) + 1);
  return counts;
}

/** Rounds with one partner, newest first, with his average and best score when they play together. */
export function partnerStats(rounds, friendId) {
  const together = live(rounds).filter((r) => (r.friendIds || []).includes(friendId)).sort(byDateDesc);
  const full = together.filter((r) => (r.holes || 18) === 18 && r.score);
  return {
    rounds: together,
    count: together.length,
    average: full.length ? round1(mean(full.map((r) => r.score))) : null,
    best: full.length ? full.reduce((b, r) => (r.score < b.score ? r : b)) : null,
    last: together.length ? together[0].date : null,
  };
}

/** Most recent handicap figure found in email. */
export function latestHandicapEmail(emails) {
  return emails
    .filter((e) => e.category === 'handicap' && e.details.index)
    .sort((a, b) => b.date - a.date)[0] || null;
}

const compact = (date, time) => (time ? `${date.replace(/-/g, '')}T${time.replace(':', '')}00` : date.replace(/-/g, ''));

/** A Google Calendar "add event" link. Times are left floating so Calendar uses his own timezone. */
export function calendarUrl({ title, date, time, location = '', details = '', minutes = 270 }) {
  let end;
  const [y, m, d] = date.split('-').map(Number);
  if (time) {
    const [hh, mm] = time.split(':').map(Number);
    const e = new Date(y, m - 1, d, hh, mm + minutes);
    const p = (n) => String(n).padStart(2, '0');
    end = `${e.getFullYear()}${p(e.getMonth() + 1)}${p(e.getDate())}T${p(e.getHours())}${p(e.getMinutes())}00`;
  } else {
    const e = new Date(y, m - 1, d + 1);
    end = `${e.getFullYear()}${String(e.getMonth() + 1).padStart(2, '0')}${String(e.getDate()).padStart(2, '0')}`;
  }
  const params = new URLSearchParams({ action: 'TEMPLATE', text: title, dates: `${compact(date, time)}/${end}` });
  if (location) params.set('location', location);
  if (details) params.set('details', details);
  return `https://calendar.google.com/calendar/render?${params}`;
}

/** An Outlook.com "new event" link. */
export function outlookCalendarUrl({ title, date, time, location = '', details = '', minutes = 270 }) {
  const [y, m, d] = date.split('-').map(Number);
  const p = (n) => String(n).padStart(2, '0');
  const local = (x) => `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}T${p(x.getHours())}:${p(x.getMinutes())}:00`;
  const params = new URLSearchParams({ path: '/calendar/action/compose', rru: 'addevent', subject: title });
  if (time) {
    const [hh, mm] = time.split(':').map(Number);
    params.set('startdt', local(new Date(y, m - 1, d, hh, mm)));
    params.set('enddt', local(new Date(y, m - 1, d, hh, mm + minutes)));
  } else {
    params.set('startdt', date);
    params.set('enddt', date);
    params.set('allday', 'true');
  }
  if (location) params.set('location', location);
  if (details) params.set('body', details);
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params}`;
}

export function scoreToPar(r) {
  if (!r.score || !r.par) return null;
  const diff = r.score - r.par;
  return diff === 0 ? 'E' : diff > 0 ? `+${diff}` : String(diff);
}

export function formatIndex(value) {
  if (value === null || value === undefined) return '';
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (typeof value === 'string' && value.trim().startsWith('+')) return value.trim();
  return n < 0 ? `+${Math.abs(n).toFixed(1)}` : n.toFixed(1);
}
