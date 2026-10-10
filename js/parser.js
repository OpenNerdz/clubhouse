// Turns a raw email into a golf item: decides whether it is about golf,
// sorts it into a category and pulls out the useful details.
// Pure functions only, so it runs in the browser and in the Node tests.

export const CATEGORIES = {
  teetime: { label: 'Tee times', icon: 'flag' },
  competition: { label: 'Competitions', icon: 'trophy' },
  handicap: { label: 'Handicap', icon: 'gauge' },
  club: { label: 'Club news', icon: 'club' },
  shop: { label: 'Shop & offers', icon: 'tag' },
  other: { label: 'Other golf', icon: 'message' },
};

// Words used to search Gmail. Kept broad; parseEmail() does the real filtering.
export const SEARCH_TERMS = [
  'golf', '"tee time"', '"tee times"', 'teetime', '"tee sheet"', 'stableford',
  'handicap', 'fairway', 'fairways', '"pro shop"', '"green fee"', '"green fees"',
  'fourball', 'foursomes', '"country club"',
];

export function buildQuery({ months = 6, extraTerms = [], after } = {}) {
  const extra = extraTerms
    .map((t) => t.trim().replace(/["()]/g, ''))
    .filter(Boolean)
    .map((t) => (/\s/.test(t) ? `"${t}"` : t));
  let q = `(${[...SEARCH_TERMS, ...extra].join(' OR ')}) newer_than:${months}m`;
  if (after) q += ` after:${Math.floor(after / 1000)}`;
  return q;
}

/* ---------- text clean-up ---------- */

const ENTITIES = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", rsquo: '’', lsquo: '‘',
  ldquo: '“', rdquo: '”', ndash: '–', mdash: '—', pound: '£', euro: '€', hellip: '…',
  copy: '©', reg: '®', trade: '™', bull: '•', middot: '·', zwnj: '', zwj: '', shy: '',
};

export function decodeEntities(s = '') {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '';
    }
    const v = ENTITIES[code.toLowerCase()];
    return v === undefined ? m : v;
  });
}

export function htmlToText(html = '') {
  return decodeEntities(
    html
      .replace(/<(script|style|head|title)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|tr|li|h[1-6]|table|section|blockquote|ul|ol)>/gi, '\n')
      .replace(/<(td|th)\b[^>]*>/gi, ' ')
      .replace(/<[^>]+>/g, '')
  );
}

// Strips invisible padding characters, quoted replies and excess whitespace.
export function cleanText(text = '') {
  let t = text
    .replace(/\r\n?/g, '\n')
    .replace(/[​-‍⁠﻿­͏؜᠎]/g, '')
    .replace(/[ \t   ]+/g, ' ');
  const cuts = [
    /^\s*On .{5,200}wrote:\s*$/m,
    /^\s*-{2,}\s*Original Message\s*-{2,}/im,
    /^\s*From:\s.+\n\s*(?:Sent|Date):/im,
    /^\s*_{10,}\s*$/m,
  ];
  for (const re of cuts) {
    const m = re.exec(t);
    if (m && m.index > 0) t = t.slice(0, m.index);
  }
  return t
    .split('\n')
    .filter((line) => !/^\s*>/.test(line))
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 15000);
}

export function parseSender(raw = '') {
  const m = raw.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim() || m[2].trim(), email: m[2].trim().toLowerCase() };
  const email = raw.trim().toLowerCase();
  return { name: email, email };
}

/* ---------- is it about golf? ---------- */

const STRONG = [
  /\bgolf/i, /\btee[\s-]?times?\b/i, /\btee[\s-]?off\b/i, /\btee sheet\b/i, /\bstableford\b/i,
  /\bfairways?\b/i, /\bbirdies?\b/i, /\bbogeys?\b/i, /\bgreen ?fees?\b/i, /\bdriving range\b/i,
  /\bpro shop\b/i, /\bhandicap index\b/i, /\bcountry club\b/i, /\bfour[\s-]?ball\b/i,
  /\bfoursomes\b/i, /\btexas scramble\b/i, /\bshotgun start\b/i, /\bghin\b/i, /\bwhs\b/i,
  /\bhowdidido\b/i, /\b(?:9|18|nine|eighteen) holes\b/i,
];
const WEAK = [
  /\bhandicap\b/i, /\bmedal\b/i, /\bscramble\b/i, /\bputter\b/i, /\bwedges?\b/i, /\bcaddie\b/i,
  /\bgreens\b/i, /\bclubhouse\b/i, /\bcompetition\b/i, /\btournament\b/i, /\bpga\b/i,
  /\bryder cup\b/i, /\bmatch ?play\b/i,
];
const NOT_GOLF = [
  // The Volkswagen Golf is the classic false positive.
  [/\bvolkswagen\b|\bvw\b|\bgolf (?:gti|gtd|gte|tdi|tsi|r line|r-line|estate|mk ?\d)\b|\btest drive\b|\bdealership\b|\bmot\b/i, 8],
  [/\b(?:mini|crazy|adventure|disc)[\s-]?golf\b|\bminigolf\b|\bputt[\s-]putt\b/i, 5],
  [/\b(?:racecard|hurdle|furlongs?|accumulator|acca|free bets?|bookmaker|each[\s-]way)\b/i, 6],
];
const GOLF_DOMAINS = [
  'brsgolf', 'intelligentgolf', 'clubv1', 'howdidido', 'golfgenius', 'golfnow', 'teeitup',
  'chronogolf', 'foreup', 'golfbox', 'miclub', 'golflink', 'ghin.com', 'usga.org', 'englandgolf',
  'golfireland', 'scottishgolf', 'walesgolf', 'golf.org.au', 'randa.org', 'pga.com', 'pga.org',
];
const SHOP_DOMAINS = [
  'americangolf', 'golfgalaxy', 'pgatoursuperstore', 'taylormade', 'titleist', 'callaway',
  'ping.com', 'golfbidder', 'golfsupport', 'snainton', 'scottsdalegolf', 'function18',
  'golfgeardirect', 'dickssportinggoods', 'globalgolf', 'golfonline', 'cobragolf', 'mizuno',
  'footjoy', 'srixon', 'clevelandgolf', 'odysseygolf', 'bridgestonegolf', 'garmin', 'bushnell',
];
const PLATFORM_HINTS = /\b(brs|intelligent ?golf|club ?v1|howdidido|golf ?genius|golf ?now|tee ?it ?up|chronogolf|fore ?up|golfbox|miclub|golflink|club systems|dotgolf|no-?reply|notifications?|mailer|team)\b/i;

function relevance(subject, body, sender, labels) {
  const text = `${subject}\n${body}\n${sender.name}`;
  let score = 0;
  for (const re of STRONG) if (re.test(text)) score += 3;
  for (const re of WEAK) if (re.test(text)) score += 1;
  const domain = sender.email.split('@')[1] || '';
  if (/golf/.test(domain) || /golf|\bG\.?C\.?\b|country club/i.test(sender.name)) score += 4;
  if (GOLF_DOMAINS.some((d) => domain.includes(d))) score += 5;
  if (SHOP_DOMAINS.some((d) => domain.includes(d))) score += 3;
  const strongGolfOnly = /\btee[\s-]?times?\b|\bhandicap index\b|\bstableford\b|\bfairways?\b|\bgolf (?:club|course|links)\b/i.test(text);
  for (const [re, penalty] of NOT_GOLF) if (re.test(text)) score -= strongGolfOnly ? Math.ceil(penalty / 3) : penalty;
  if (labels.includes('SPAM')) score -= 20;
  return score;
}

/* ---------- which kind of golf email? ---------- */

const SIGNALS = {
  teetime: [
    /\btee[\s-]?times?\b/i, /\btee[\s-]?off\b/i, /\bbook(?:ed|ing)\b/i, /\breservation\b/i,
    /\bconfirm(?:ed|ation)\b/i, /\bplayers?\b/i, /\bgreen ?fees?\b/i, /\b(?:9|18|nine|eighteen) holes\b/i,
    /\btee sheet\b/i, /\bcancel(?:l?ed|lation)\b/i, /\b(?:buggy|buggies|cart)\b/i,
  ],
  competition: [
    /\bcompetitions?\b/i, /\bresults?\b/i, /\bstableford\b/i, /\bmedal\b/i, /\bfour[\s-]?ball\b/i,
    /\bfoursomes\b/i, /\bscramble\b/i, /\btournament\b/i, /\bchampionships?\b/i, /\binvitational\b/i,
    /\bgolf day\b/i, /\bsociety\b/i, /\bdraw\b/i, /\bstart(?:ing)? sheet\b/i, /\bleaderboard\b/i,
    /\bentr(?:y|ies)\b/i, /\bfixtures?\b/i, /\bmatch ?play\b/i, /\bknock[\s-]?out\b/i,
    /\bwinners?\b/i, /\bprizes?\b/i, /\b(?:cup|trophy|shield|salver)\b/i, /\bpoints\b/i,
  ],
  handicap: [
    /\bhandicap index\b/i, /\bhandicap\b/i, /\bwhs\b/i, /\bghin\b/i, /\bscore (?:posted|submitted|record)/i,
    /\brevis(?:ed|ion)\b/i, /\b(?:playing|course) handicap\b/i, /\b(?:soft|hard) cap\b/i,
  ],
  club: [
    /\bnewsletter\b/i, /\bmembers?(?:hip)?\b/i, /\bsubscriptions?\b/i, /\brenewal\b/i,
    /\bagm\b|\bannual general\b/i, /\bcourse (?:update|status|report|news|closed|closure)/i,
    /\btemporary (?:greens|tees)\b/i, /\b(?:hollow[\s-]?tin|aerat|verti[\s-]?drain|top[\s-]?dress)/i,
    /\bclubhouse\b/i, /\b(?:bar|restaurant|dining|menu|dinner|lunch|carvery)\b/i, /\bcaptain'?s?\b/i,
    /\bcommittee\b/i, /\bsocial\b/i, /\bnotice\b/i, /\bopening hours\b/i,
  ],
  shop: [
    /\border(?:ed)?\b/i, /\b(?:dispatched|shipped|delivered|delivery|tracking)\b/i, /\breceipt\b/i,
    /\binvoice\b/i, /\d{1,2} ?% off\b/i, /\bsale\b/i, /\boffers?\b/i, /\bdiscount\b/i, /\bdeals?\b/i,
    /\bshop now\b/i, /\bnew (?:arrivals|season|range)\b/i, /\bvoucher\b/i, /\bblack friday\b|\bcyber monday\b/i,
    /\bfree (?:delivery|shipping)\b/i, /\bclearance\b/i, /\bgift card\b/i,
  ],
};
const PRIORITY = ['teetime', 'handicap', 'competition', 'shop', 'club'];

function classify(subject, body, sender, labels, hasUnsubscribe) {
  const scores = {};
  for (const [cat, patterns] of Object.entries(SIGNALS)) {
    let s = 0;
    for (const re of patterns) {
      if (re.test(subject)) s += 3;
      if (re.test(body)) s += 1;
    }
    scores[cat] = s;
  }
  const domain = sender.email.split('@')[1] || '';
  const subj = subject.toLowerCase();

  if (/tee[\s-]?time|booking|reservation|booked/.test(subj) && !/competition|entry|draw|result/.test(subj)) scores.teetime += 5;
  if (/handicap/.test(subj)) scores.handicap += 6;
  if (/result|leaderboard|draw|start sheet|competition|entry|entries/.test(subj)) scores.competition += 4;
  if (/newsletter|course (?:update|status)|members'? (?:update|news)|agm/.test(subj)) scores.club += 5;
  if (/order|dispatched|shipped|% off|sale\b|offer/.test(subj)) scores.shop += 4;

  if (/howdidido/.test(domain)) scores.competition += 3;
  if (/golfnow|teeitup|chronogolf|foreup/.test(domain)) scores.teetime += 4;
  if (/englandgolf|ghin|usga|golfireland|scottishgolf|walesgolf/.test(domain)) scores.handicap += 3;
  if (SHOP_DOMAINS.some((d) => domain.includes(d))) scores.shop += 5;
  if (labels.includes('CATEGORY_PROMOTIONS')) scores.shop += 3;
  if (hasUnsubscribe) { scores.shop += 1; scores.club += 1; }

  let best = 'other';
  let bestScore = 4;
  for (const cat of PRIORITY) {
    if (scores[cat] > bestScore) { best = cat; bestScore = scores[cat]; }
  }
  return best;
}

/* ---------- dates & times ---------- */

const MON = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const DOW = '(?:(mon|tue|wed|thu|fri|sat|sun)[a-z]*\\.?,?\\s+)?';
const ORD = '(?:st|nd|rd|th)?';
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_MS = 86400000;

const pad = (n) => String(n).padStart(2, '0');
export const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function makeDate(y, m, d) {
  if (m < 0 || m > 11 || d < 1 || d > 31) return null;
  const dt = new Date(y, m, d);
  return dt.getMonth() === m && dt.getDate() === d ? dt : null;
}

function inferYear(m, d, ref) {
  let y = ref.getFullYear();
  const cand = new Date(y, m, d).getTime();
  if (cand < ref.getTime() - 120 * DAY_MS) y += 1;
  else if (cand > ref.getTime() + 240 * DAY_MS) y -= 1;
  return y;
}

function fullYear(y) {
  const n = parseInt(y, 10);
  return n < 100 ? 2000 + n : n;
}

export function findDates(text, ref = new Date(), { dayFirst = true } = {}) {
  const found = [];
  const add = (index, length, dt, extra = {}) => {
    if (dt && !found.some((f) => index >= f.index && index < f.index + f.length)) {
      found.push({ index, length, date: isoDate(dt), ...extra });
    }
  };
  const run = (re, fn) => {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) fn(m);
  };

  run(new RegExp(`\\b${DOW}(\\d{1,2})${ORD}(?:\\s+of)?[\\s-]+${MON}\\.?(?:,?[\\s-]+(\\d{4}))?\\b`, 'gi'), (m) => {
    const mon = MONTHS.indexOf(m[3].slice(0, 3).toLowerCase());
    const day = parseInt(m[2], 10);
    const y = m[4] ? parseInt(m[4], 10) : inferYear(mon, day, ref);
    add(m.index, m[0].length, makeDate(y, mon, day), { weekday: !!m[1], year: !!m[4] });
  });
  run(new RegExp(`\\b${DOW}${MON}\\.?\\s+(\\d{1,2})${ORD}(?:,?\\s+(\\d{4}))?\\b`, 'gi'), (m) => {
    const mon = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    const day = parseInt(m[3], 10);
    const y = m[4] ? parseInt(m[4], 10) : inferYear(mon, day, ref);
    add(m.index, m[0].length, makeDate(y, mon, day), { weekday: !!m[1], year: !!m[4] });
  });
  run(/\b(20\d{2})-(\d{2})-(\d{2})\b/g, (m) => {
    add(m.index, m[0].length, makeDate(+m[1], +m[2] - 1, +m[3]), { year: true });
  });
  run(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{4}|\d{2})\b/g, (m) => {
    const a = parseInt(m[1], 10);
    const b = parseInt(m[2], 10);
    // A date that can only be read one way settles the order for the rest of the email.
    if (a > 12 && b <= 12) dayFirst = true;
    else if (b > 12 && a <= 12) dayFirst = false;
    const [d, mo] = dayFirst ? [a, b] : [b, a];
    add(m.index, m[0].length, makeDate(fullYear(m[3]), mo - 1, d), { year: true, numeric: true });
  });
  return found.sort((x, y) => x.index - y.index);
}

function relativeDate(text, ref) {
  const r = /\b(today|tonight|tomorrow)\b/i.exec(text);
  if (r) return { index: r.index, date: isoDate(new Date(ref.getTime() + (/tomorrow/i.test(r[1]) ? DAY_MS : 0))) };
  const w = /\b(?:(this|next|on)\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.exec(text);
  if (w) {
    const target = DAYS.indexOf(w[2].slice(0, 3).toLowerCase());
    let diff = (target - ref.getDay() + 7) % 7 || 7;
    if (w[1] && w[1].toLowerCase() === 'next' && diff < 3) diff += 7;
    return { index: w.index, date: isoDate(new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + diff)) };
  }
  return null;
}

const DATE_CUE = /(tee[\s-]?time|date|when|playing|play|starts?|start time|on|for|event|competition|day)\s*[:\-]?\s*$/i;
const BOOKED_ON = /(booked|made|created|placed|issued|sent|ordered|purchased|received|posted|updated|revised)\s+(?:on\s*)?[:\-]?\s*$/i;

function pickDate(text, dates, ref, future) {
  if (!dates.length) return null;
  const refDay = isoDate(ref);
  let best = null;
  let bestScore = -Infinity;
  for (const d of dates) {
    const before = text.slice(Math.max(0, d.index - 40), d.index);
    let s = 0;
    if (DATE_CUE.test(before)) s += 3;
    if (BOOKED_ON.test(before)) s -= 5;
    if (d.weekday) s += 2;
    if (d.year) s += 1;
    if (future && d.date < refDay) s -= 3;
    if (s > bestScore) { best = d; bestScore = s; }
  }
  return best;
}

const TIME_RE = /\b([01]?\d|2[0-3])([:.])([0-5]\d)(?!\d|[.:/]\d)\s*([ap]\.?m\b\.?)?/gi;
const TIME_AMPM_RE = /\b(1[0-2]|0?[1-9])\s*([ap])\.?m\b\.?/gi;
const TEE_COMPACT_RE = /\btee[\s-]?time\s*[:\-]?\s*([01]\d|2[0-3])([0-5]\d)\b/i;

export function findTimes(text) {
  const out = [];
  const to24 = (h, ap) => {
    if (!ap) return h;
    const pm = ap[0].toLowerCase() === 'p';
    return h === 12 ? (pm ? 12 : 0) : pm ? h + 12 : h;
  };
  let m;
  TIME_RE.lastIndex = 0;
  while ((m = TIME_RE.exec(text))) {
    const prev = text[m.index - 1] || '';
    const next = text.slice(m.index + m[0].length, m.index + m[0].length + 8);
    if (/[£$€\d.,]/.test(prev)) continue;
    if (/^\s*(?:%|pts|points|miles|km|kg|m\b|yds?|yards)/i.test(next)) continue;
    if (m[2] === '.' && !m[4] && !/(tee|time|at|from|start)\W*$/i.test(text.slice(Math.max(0, m.index - 20), m.index))) continue;
    const h = parseInt(m[1], 10);
    if (m[4] && h > 12) continue;
    out.push({ index: m.index, time: `${pad(to24(h, m[4]))}:${m[3]}` });
  }
  TIME_AMPM_RE.lastIndex = 0;
  while ((m = TIME_AMPM_RE.exec(text))) {
    if (/[£$€\d.:,]/.test(text[m.index - 1] || '')) continue;
    if (out.some((t) => Math.abs(t.index - m.index) < 6)) continue;
    out.push({ index: m.index, time: `${pad(to24(parseInt(m[1], 10), m[2]))}:00` });
  }
  const c = TEE_COMPACT_RE.exec(text);
  if (c) out.push({ index: c.index, time: `${c[1]}:${c[2]}` });
  return out.sort((a, b) => a.index - b.index);
}

function pickTime(text, times, date) {
  if (!times.length) return null;
  const before = (t) => text.slice(Math.max(0, t.index - 28), t.index);
  // "Tee time: 08:30" or "Time 08:30" wins over "please arrive by 08:00".
  const labelled = times.find((t) => /(?:tee[\s-]?(?:time|off)|\btime|\bstart(?:s|ing)?(?: time)?)(?:\s+(?:is|at|of))?\s*[:\-]?\s*$/i.test(before(t)));
  if (labelled) return labelled;
  if (date) {
    const near = times.find((t) => t.index >= date.index && t.index - date.index < 140);
    if (near) return near;
  }
  return times.find((t) => /\bat\s*$/i.test(before(t))) || times[0];
}

/* ---------- other details ---------- */

const CLUB_SUFFIX = '(?:Golf\\s*(?:&|and)\\s*Country\\s+Club|Golf\\s+(?:&|and)\\s+Leisure(?:\\s+Club)?|Golf\\s+Club|Golf\\s+Course|Golf\\s+Links|Golf\\s+Resort|Golf\\s+Centre|Golf\\s+Center|Golf\\s+Park|Country\\s+Club|G\\.?C\\.?)';
const CLUB_RE = new RegExp(`((?:(?:St\\.?|[A-Z][\\w'’-]*)\\s+(?:(?:&|and|of|the|on|upon|in|at)\\s+)?){1,4})${CLUB_SUFFIX}(?![\\w])`, 'g');
const LEAD_STOP = new Set(('thank thanks you for booking booked at to welcome your dear hi hello from book visit play playing ' +
  'confirmed confirmation reminder re fwd fw tee time times member members news newsletter results result ' +
  'competition entry in on a an of and with our this next please note important update new upcoming ' +
  'monday tuesday wednesday thursday friday saturday sunday mon tue wed thu fri sat sun ' +
  'january february march april may june july august september october november december').split(' '));

export function findClubs(text = '') {
  const out = [];
  CLUB_RE.lastIndex = 0;
  let m;
  while ((m = CLUB_RE.exec(text))) {
    const words = m[0].trim().split(/\s+/);
    let lead = m[1].trim().split(/\s+/).length;
    // Drop leading words like "Welcome to" or "Booking at", but keep the name itself.
    while (lead > 0 && LEAD_STOP.has(words[0].toLowerCase().replace(/[^a-z]/g, ''))) {
      words.shift();
      lead -= 1;
    }
    if (lead > 0 && !/^(?:&|and)$/i.test(words[0])) out.push(words.join(' '));
  }
  return out;
}

function findCourse(subject, body, sender) {
  const fromSubject = findClubs(subject)[0];
  if (fromSubject) return fromSubject;
  const m = /^(?:course|club|venue|location|golf course)\s*[:\-]\s*(.{3,60})$/im.exec(body);
  const label = m ? m[1].replace(/[.,;]+$/, '').trim() : '';
  // A label like "Course: Main Course" names a layout, not the club.
  if (label && findClubs(label).length) return label;
  const fromBody = findClubs(body)[0];
  if (fromBody) return fromBody;
  const fromName = findClubs(sender.name)[0];
  if (fromName) return fromName;
  return label;
}

const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };

function findPlayers(text) {
  const a = /\b(?:no\.?\s*of\s*players|number\s+of\s+(?:players|golfers)|players|golfers|party\s+size|group\s+size)\s*[:\-]?\s*(\d{1,2})\b/i.exec(text);
  const b = /\b(\d{1,2}|one|two|three|four|five|six|seven|eight)\s+(?:players?|golfers?)\b/i.exec(text);
  const c = /\b([1-4])[\s-]?ball\b/i.exec(text);
  for (const m of [a, b, c]) {
    if (!m) continue;
    const n = NUMBER_WORDS[m[1].toLowerCase()] || parseInt(m[1], 10);
    if (n >= 1 && n <= 8) return n;
  }
  return undefined;
}

// First captured code that contains a digit, so words like "confirmed" are skipped.
function codeAfter(re, text) {
  for (const m of text.matchAll(re)) if (/\d/.test(m[1])) return m[1].toUpperCase();
  return undefined;
}

function findRef(text) {
  return codeAfter(/\b(?:booking|confirmation|reservation)\s*(?:ref(?:erence)?|no\.?|number|id|code|#)\s*[:#.]?\s*([A-Z0-9][A-Z0-9-]{3,19})\b/gi, text)
    || codeAfter(/\bref(?:erence)?\s*(?:no\.?|number)?\s*[:#]\s*([A-Z0-9][A-Z0-9-]{3,19})\b/gi, text);
}

const HCP = '([+]?\\d{1,2}\\.\\d)(?![\\d.]\\d|\\d)';
function findHandicap(text) {
  const valid = (s) => s && Math.abs(parseFloat(s)) <= 54;
  let index;
  let prev;
  const fromTo = new RegExp(`handicap[^\\n]{0,80}?from\\s*:?\\s*${HCP}\\s*to\\s*:?\\s*${HCP}`, 'i').exec(text);
  const labelled = new RegExp(`\\b(?:new|current|revised|updated)\\s+(?:handicap\\s*)?(?:index\\s*)?(?:®\\s*)?(?:is\\s*)?[:=]?\\s*${HCP}`, 'i').exec(text);
  const old = new RegExp(`\\b(?:previous|old|was)\\s+(?:handicap\\s*)?(?:index\\s*)?(?:®\\s*)?[:=]?\\s*${HCP}`, 'i').exec(text);
  const generic = new RegExp(`\\b(?:handicap\\s+index|new\\s+handicap|handicap\\s+is|index\\s+is)[^0-9+\\n]{0,40}${HCP}`, 'i').exec(text);
  if (fromTo) { prev = fromTo[1]; index = fromTo[2]; }
  if (labelled && !index) index = labelled[1];
  if (old && !prev) prev = old[1];
  if (!index && generic) index = generic[1];
  return { index: valid(index) ? index : undefined, prevIndex: valid(prev) ? prev : undefined };
}

// Only reads numbers from sentences about him ("you finished 7th", "Your score: 36 points"),
// so a list of the club's winners isn't mistaken for his own result.
function personalText(text) {
  const parts = [];
  for (const m of text.matchAll(/\b(?:you|your)\b/gi)) {
    parts.push(text.slice(m.index, m.index + 220).split(/\.\s|\n\s*\n/)[0]);
  }
  return parts.join('\n');
}

function findResult(fullText) {
  const out = {};
  const text = personalText(fullText);
  const pts = /\b(\d{1,2})\s*(?:stableford\s+)?(?:pts|points)\b/i.exec(text);
  if (pts && +pts[1] <= 60) out.points = +pts[1];
  const pos = /\b(?:finished|placed|came|position(?:ed)?)\s*(?:in\s*)?:?\s*(\d{1,3})(?:st|nd|rd|th)?\b/i.exec(text)
    || /\b(\d{1,3})(?:st|nd|rd|th)\s+(?:place|position|overall)\b/i.exec(text);
  if (pos && +pos[1] > 0) out.position = +pos[1];
  const field = /\bout of\s+(\d{1,3})\b/i.exec(text);
  if (field && out.position && +field[1] >= out.position) out.field = +field[1];
  const gross = /\bgross(?:\s+score)?\s*[:\-]?\s*(\d{2,3})\b/i.exec(text);
  if (gross && +gross[1] >= 50 && +gross[1] <= 160) out.gross = +gross[1];
  const net = /\bnet(?:\s+score)?\s*[:\-]?\s*(\d{2,3})\b/i.exec(text);
  if (net && +net[1] >= 40 && +net[1] <= 130) out.net = +net[1];
  return out;
}

const ENTRY_WORDS = /\bentr(?:y|ies|ered)\b|\bdraw\b|start(?:ing)? sheet|sign[\s-]?up|book(?:ing)? (?:now )?open|tee times? (?:are )?(?:out|available|published)|\bconfirm/i;
const RESULT_WORDS = /\bresults?\b(?! will)|leaderboard|\bwinners?\b|how did i do|scores? (?:are )?(?:now )?(?:in|available|published)/i;

function compKind(subject, body) {
  const top = body.slice(0, 600);
  if (RESULT_WORDS.test(subject) && !ENTRY_WORDS.test(subject)) return 'result';
  if (ENTRY_WORDS.test(subject)) return 'entry';
  if (/\byour (?:result|score|position|round)\b|\byou (?:finished|came|placed|scored)\b/i.test(top)) return 'result';
  if (ENTRY_WORDS.test(top)) return 'entry';
  if (RESULT_WORDS.test(top)) return 'result';
  return 'event';
}

function findOrder(text) {
  const out = {};
  out.order = codeAfter(/\border\s*(?:number|no\.?|#|id|ref(?:erence)?)?\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{3,19})\b/gi, text);
  const total = /\b(?:order\s+)?total(?:\s+paid)?\s*[:\-]?\s*([£$€]\s?\d[\d,]*(?:\.\d{2})?)/i.exec(text);
  if (total) out.total = total[1].replace(/\s/g, '');
  const off = /\b(?:up to\s+)?(\d{1,2}) ?% off\b/i.exec(text);
  if (off) out.discount = `${off[1]}% off`;
  if (/\bout for delivery\b/i.test(text)) out.status = 'Out for delivery';
  else if (/\bdelivered\b/i.test(text)) out.status = 'Delivered';
  else if (/\b(?:dispatched|shipped|on (?:its|it's) way)\b/i.test(text)) out.status = 'On its way';
  else if (/\brefund/i.test(text)) out.status = 'Refund';
  else if (out.order) out.status = 'Ordered';
  return out;
}

function findNotice(text) {
  if (/\bcourse (?:is |will be |remains )?closed\b|\bclosed (?:today|until|due)\b/i.test(text)) return 'Course closed';
  if (/\btemporary greens\b/i.test(text)) return 'Temporary greens';
  if (/\b(?:no|ban on) (?:buggies|trolleys)\b|\b(?:buggies|trolleys) (?:are )?(?:not (?:allowed|permitted)|banned)\b/i.test(text)) return 'Buggy/trolley ban';
  if (/\bcourse (?:is )?(?:now )?(?:fully )?open\b/i.test(text)) return 'Course open';
  return undefined;
}

// "has been cancelled" counts; "free cancellation up to 24 hours" and
// "bookings cancelled within 48h will be charged" don't.
const CANCELLED = /\b(?:has|have)\s+been\s+cancel(?:l)?ed\b|\b(?:booking|tee[\s-]?time|reservation)\s+(?:is\s+(?:now\s+)?)?cancel(?:l)?ed\b|\bcancellation\s+(?:is\s+)?confirmed\b|\bwe(?:'ve| have)\s+cancel(?:l)?ed\b/gi;

function bookingStatus(subject, body) {
  if (/\bcancel(?:l?ed|lation)\b/i.test(subject) && !/\bpolic(?:y|ies)\b|\bfree cancel/i.test(subject)) return 'cancelled';
  const top = body.slice(0, 600);
  for (const m of top.matchAll(CANCELLED)) {
    const after = top.slice(m.index + m[0].length, m.index + m[0].length + 30);
    if (!/^\s*(?:within|less than|up to|before|after|with less|inside)\b/i.test(after)) return 'cancelled';
  }
  if (/\b(?:amended|updated|changed|modified|rescheduled|moved)\b/i.test(subject)) return 'changed';
  if (/\breminder\b/i.test(subject)) return 'reminder';
  return 'confirmed';
}

const BOOKING_SUBJECT = /\bconfirm|\bbooked\b|\bbooking\b|\breservation\b|\breminder\b|\bcancel|\byour tee[\s-]?time\b|\btee[\s-]?time (?:on|at|for)\b/i;
const BOOKING_BODY = /\byour (?:booking|reservation)\b|\byour tee[\s-]?time (?:is|has|at|on|for|was|with)\b|\bha(?:s|ve) been (?:booked|confirmed|reserved|cancel(?:l)?ed)\b|\byou(?:'ve| have) booked\b|\bbooking (?:ref|reference|confirmation|number|details|id)\b|\bconfirmation (?:number|#|code|no)\b/i;
const PROMO_SUBJECT = /\b(?:deals?|offers?|sale|save|discount)\b|\bfrom [£$€]|% off/i;

/** True when a tee-time email is about an actual booking rather than advertising tee times. */
function isBooking(subject, body, text, labels) {
  if (findRef(text)) return true;
  const promo = labels.includes('CATEGORY_PROMOTIONS');
  if (BOOKING_SUBJECT.test(subject) && !PROMO_SUBJECT.test(subject)) return true;
  return !promo && !PROMO_SUBJECT.test(subject) && BOOKING_BODY.test(body);
}

export function cleanSubject(subject = '') {
  return subject.replace(/^\s*(?:(?:re|fw|fwd|aw)\s*:\s*)+/i, '').trim() || '(no subject)';
}

/* ---------- main entry ---------- */

/**
 * @param {object} msg  { id, threadId, date (ms), from, subject, text, html, snippet, labels, unsubscribe }
 * @param {object} opts { dayFirst, extraTerms }
 * @returns parsed item, or null when the email is not about golf
 */
export function parseEmail(msg, { dayFirst = true, extraTerms = [] } = {}) {
  const sender = parseSender(msg.from || '');
  const subject = cleanSubject(decodeEntities(msg.subject || ''));
  const raw = msg.text && msg.text.trim().length > 200 ? msg.text : msg.html ? htmlToText(msg.html) : msg.text || '';
  const body = cleanText(raw);
  const labels = msg.labels || [];

  let rel = relevance(subject, body, sender, labels);
  const lowered = `${subject}\n${body}\n${sender.name}`.toLowerCase();
  if (extraTerms.some((t) => t.trim() && lowered.includes(t.trim().toLowerCase()))) rel += 4;
  if (rel < 3) return null;

  const text = `${subject}\n${body}`;
  let category = classify(subject, body, sender, labels, !!msg.unsubscribe);
  if (category === 'teetime' && !isBooking(subject, body, text, labels)) {
    // "Weekend tee times from $29" is an advert, not a booking.
    category = labels.includes('CATEGORY_PROMOTIONS') || msg.unsubscribe ? 'shop' : 'other';
  }
  const ref = new Date(msg.date || Date.now());
  const details = {};

  if (category === 'teetime' || category === 'competition' || category === 'other' || category === 'club') {
    const dates = findDates(text, ref, { dayFirst });
    const future = category === 'teetime' || category === 'competition';
    let date = pickDate(text, dates, ref, future);
    if (!date && (category === 'teetime' || category === 'other')) date = relativeDate(text, ref);
    if (date) details.date = date.date;
    const time = pickTime(text, findTimes(text), date);
    if (time && category !== 'club') details.time = time.time;
    const course = findCourse(subject, body, sender);
    if (course) details.course = course;
  }

  if (category === 'teetime') {
    const players = findPlayers(text);
    if (players) details.players = players;
    const bookingRef = findRef(text);
    if (bookingRef) details.ref = bookingRef;
    details.status = bookingStatus(subject, body);
    if (!details.course && !PLATFORM_HINTS.test(sender.name) && sender.name !== sender.email) {
      details.course = sender.name.replace(/\b(?:bookings?|reservations?|pro shop|tee times?)\b/gi, '').replace(/[-–|·]+$/, '').trim() || undefined;
    }
  } else if (category === 'competition') {
    details.kind = compKind(subject, body);
    if (details.kind === 'result') Object.assign(details, findResult(text));
  } else if (category === 'handicap') {
    Object.assign(details, findHandicap(text));
  } else if (category === 'shop') {
    Object.assign(details, findOrder(text));
  } else if (category === 'club') {
    const notice = findNotice(text);
    if (notice) details.notice = notice;
  }

  for (const k of Object.keys(details)) if (details[k] === undefined || details[k] === '') delete details[k];

  return {
    id: msg.id,
    threadId: msg.threadId || msg.id,
    date: ref.getTime(),
    fromName: sender.name,
    fromEmail: sender.email,
    subject,
    snippet: decodeEntities(msg.snippet || body.slice(0, 200)).replace(/\s+/g, ' ').trim().slice(0, 240),
    category,
    details,
    ...(msg.link ? { link: msg.link } : {}),
  };
}
