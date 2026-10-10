// Golf maths and the views of the data that several screens share.
// Pure functions, so they can be tested in Node.

const byDateDesc = (a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || ''));
const round1 = (n) => Math.round(n * 10) / 10;
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const live = (obj) => Object.values(obj || {}).filter((x) => !x.deleted);
const norm = (s = '') => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** World Handicap System score differential, or null if the round can't produce one. */
export function differential(r) {
  if (!r || (r.holes || 18) !== 18 || !r.score || !r.rating || !r.slope) return null;
  return round1((113 / r.slope) * (r.score - r.rating));
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
    if (!g) {
      g = groups.find((x) =>
        x.date === d.date &&
        (!x.time || !d.time || x.time === d.time) &&
        (!x.course || !d.course || norm(x.course) === norm(d.course)) &&
        (!x.ref || !d.ref));
    }
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
