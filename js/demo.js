// Sample data for "Try with sample data". The emails go through the real parser,
// so the demo shows exactly what Clubhouse would pull from a real inbox.

import { parseEmail } from './parser.js';
import { emptyState } from './store.js';

const DAY = 86400000;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function at(daysFromNow, hour = 9, minute = 0) {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  d.setDate(d.getDate() + daysFromNow);
  return d;
}

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function sampleEmails(dayFirst = true) {
  const long = (d) => (dayFirst
    ? `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
    : `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`);
  const short = (d) => (dayFirst ? `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}` : `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}`);

  const teeA = at(3);
  const teeB = at(12);
  const teeC = at(6);
  const comp = at(10);
  const winter = at(24);
  const played = at(-2);

  return [
    {
      id: 'demo-1', received: at(-5, 18, 4),
      from: 'Oakmere Golf Club <bookings@oakmeregolf.example>',
      subject: 'Tee time confirmation',
      text: `Thank you for booking with Oakmere Golf Club.\n\nTee time: ${long(teeA)} at 08:30\nPlayers: 4\nBooking reference: OAK48213\n\nPlease arrive 20 minutes before your tee time and check in at the pro shop.\nYou can change or cancel your booking online up to 48 hours before play.\n\nOakmere Golf Club, Mill Lane`,
    },
    {
      id: 'demo-2', received: at(-1, 7, 30),
      from: 'Oakmere Golf Club <bookings@oakmeregolf.example>',
      subject: `Reminder: your tee time on ${short(teeA)}`,
      text: `This is a reminder of your upcoming tee time at Oakmere Golf Club.\n\nDate: ${long(teeA)}\nTime: 08:30\nPlayers: 4\nBooking reference: OAK48213\n\nThe course is open and trolleys are permitted.`,
    },
    {
      id: 'demo-3', received: at(-4, 20, 12),
      from: 'TeeBooker <noreply@teebooker.example>',
      subject: 'Your booking at Kingsdown Golf & Country Club is confirmed',
      text: `Hi,\n\nYou're all set! Here are the details of your round.\n\nCourse: Kingsdown Golf & Country Club\nDate: ${long(teeB)}\nTee time: 10:10\nNumber of players: 2\nGreen fees paid: £90.00\nConfirmation number: KGC-77120\n\nBuggies can be booked at the pro shop on arrival.\n\nThe TeeBooker team`,
    },
    {
      id: 'demo-4', received: at(-9, 12, 40),
      from: 'Hollins Park Golf Club <proshop@hollinspark.example>',
      subject: 'Tee time booked',
      text: `Your tee time at Hollins Park Golf Club has been booked.\n\n${long(teeC)}, 13:20, 3 players.\nBooking ref: HP3392\n\nSee you on the first tee!`,
    },
    {
      id: 'demo-5', received: at(-2, 9, 15),
      from: 'Hollins Park Golf Club <proshop@hollinspark.example>',
      subject: 'Tee time cancelled',
      text: `Your booking HP3392 for ${long(teeC)} at 13:20 has been cancelled as requested. Any green fees paid will be refunded within 5 working days.`,
    },
    {
      id: 'demo-6', received: at(-3, 16, 2),
      from: 'Oakmere Golf Club <competitions@oakmeregolf.example>',
      subject: 'Entry confirmed: Autumn Stableford',
      text: `You have been entered into the Autumn Stableford.\n\nCompetition date: ${long(comp)}\nYour tee time: 09:12\nEntry fee: £5 (charged to your member account)\n\nThe draw will be published on the club website. Good luck!`,
    },
    {
      id: 'demo-7', received: at(-1, 11, 0),
      from: 'Oakmere Golf Club <competitions@oakmeregolf.example>',
      subject: 'Winter Fourball Series: entries now open',
      text: `Entries are now open for the Winter Fourball Series, starting ${long(winter)} with a shotgun start at 10:00.\n\nPairs can sign up on the competition sheet in the clubhouse or online. £10 per pair.`,
    },
    {
      id: 'demo-8', received: at(-6, 19, 45),
      from: 'Oakmere Golf Club <competitions@oakmeregolf.example>',
      subject: 'Results: October Medal',
      text: `The results of the October Medal are now available.\n\nYour result: you finished 7th out of 64 with a gross 85, net 71.\n\nWinner: Paul Hendry (net 66). Well done to all who played.`,
    },
    {
      id: 'demo-9', received: at(-13, 18, 30),
      from: 'Oakmere Golf Club <competitions@oakmeregolf.example>',
      subject: 'Saturday Stableford results',
      text: `Thank you for playing in the Saturday Stableford.\n\nYour score: 36 points, 3rd place in Division 2.\nPrize vouchers can be collected from the pro shop.`,
    },
    {
      id: 'demo-10', received: at(-4, 6, 0),
      from: 'Handicap Service <noreply@handicaps.example>',
      subject: 'Your Handicap Index has changed',
      text: `Following your most recent score, your Handicap Index has been revised from 15.1 to 14.6.\n\nYour new Handicap Index is effective immediately and will be used for all rounds from today.`,
    },
    {
      id: 'demo-11', received: at(-34, 6, 0),
      from: 'Handicap Service <noreply@handicaps.example>',
      subject: 'Your Handicap Index has changed',
      text: `Your Handicap Index has been revised from 15.4 to 15.1 following your score at Hollins Park Golf Club.`,
    },
    {
      id: 'demo-12', received: at(-7, 10, 0), unsubscribe: true,
      from: 'Oakmere Golf Club <news@oakmeregolf.example>',
      subject: 'Members’ Newsletter: October',
      text: `Welcome to the October members' newsletter.\n\nCaptain's Day raised £2,340 for charity. Thank you to everyone who took part.\n\nHollow tining of the greens takes place next month; temporary greens will be in play for two days.\n\nThe winter menu starts in the clubhouse restaurant from the 1st. Book the Christmas dinner at the bar.`,
    },
    {
      id: 'demo-13', received: at(-1, 8, 10),
      from: 'Oakmere Golf Club <news@oakmeregolf.example>',
      subject: 'Course update: temporary greens on the 4th and 11th',
      text: `Course status: open. Temporary greens are in play on the 4th and 11th holes while drainage work is completed. Buggies must keep to the paths.`,
    },
    {
      id: 'demo-14', received: at(-3, 14, 22),
      from: 'Fairway Store <orders@fairwaystore.example>',
      subject: 'Your order FS-204881 has been dispatched',
      text: `Good news, your order is on its way!\n\nOrder number: FS-204881\n1 × Waterproof golf jacket (L)\n1 × Golf balls, 12 pack\nOrder total: £89.99\n\nTrack your parcel with the link below.`,
    },
    {
      id: 'demo-15', received: at(-2, 9, 0), unsubscribe: true, labels: ['CATEGORY_PROMOTIONS'],
      from: 'Fairway Store <offers@fairwaystore.example>',
      subject: 'Up to 40% off waterproofs this weekend',
      text: `Stay dry on the golf course. Up to 40% off waterproof jackets and trousers, plus free delivery on orders over £50. Shop now.`,
    },
    {
      id: 'demo-17', received: at(-8, 19, 30),
      from: 'Hollins Park Golf Club <proshop@hollinspark.example>',
      subject: 'Tee time booked',
      text: `Your tee time at Hollins Park Golf Club has been booked.\n\n${long(played)}, 10:20, 2 players.\nBooking ref: HP3371\n\nSee you on the first tee!`,
    },
    {
      id: 'demo-16', received: at(-1, 21, 5),
      from: 'Mike Turner <mike.turner@example.com>',
      subject: 'Golf on Saturday?',
      text: `Hi mate,\n\nFancy a round at Brackenwood Golf Club on Saturday? I can get us on at 9:40. Steve is up for it too.\n\nMike`,
    },
  ];
}

export function buildDemoState(dayFirst = true) {
  const state = emptyState();
  state.meta.onboarded = true;
  state.meta.profile = { name: '', email: 'you@example.com', picture: '' };
  state.meta.lastScan = Date.now() - 2 * 3600000;

  for (const e of sampleEmails(dayFirst)) {
    const parsed = parseEmail({
      id: e.id,
      threadId: e.id,
      date: e.received.getTime(),
      from: e.from,
      subject: e.subject,
      text: e.text,
      labels: e.labels || [],
      unsubscribe: !!e.unsubscribe,
    }, { dayFirst });
    if (parsed) state.emails[parsed.id] = { ...parsed, updatedAt: 1 };
  }

  const courses = {
    oak: { name: 'Oakmere Golf Club', par: 72, rating: 71.4, slope: 128 },
    king: { name: 'Kingsdown Golf & Country Club', par: 71, rating: 70.2, slope: 124 },
    hol: { name: 'Hollins Park Golf Club', par: 70, rating: 69.1, slope: 121 },
    brk: { name: 'Brackenwood Golf Club', par: 72, rating: 72.3, slope: 131 },
  };
  for (const c of Object.values(courses)) {
    const id = c.name.toLowerCase();
    state.courses[id] = { ...c, id, updatedAt: 1 };
  }
  const rounds = [
    [-118, 'oak', 93, 30, 34], [-109, 'hol', 90, 31, 33], [-101, 'oak', 91, 29, 35], [-92, 'king', 89, 32, 32],
    [-80, 'oak', 88, 33, 33], [-73, 'brk', 94, 27, 36], [-64, 'oak', 87, 34, 31], [-57, 'hol', 86, 33, 32],
    [-49, 'oak', 89, 31, 34], [-41, 'king', 85, 35, 31], [-34, 'hol', 84, 35, 30], [-27, 'oak', 86, 34, 32],
    [-13, 'oak', 84, 36, 31], [-6, 'oak', 85, 34, 30],
  ];
  const friends = {
    mike: { name: 'Mike Turner', colour: 'navy', emblem: null },
    steve: { name: 'Steve Hall', colour: 'claret', emblem: 'pint' },
    dave: { name: 'Dave Wilson', colour: 'teal', emblem: 'birdie' },
    ken: { name: 'Ken Barlow', colour: 'gold', emblem: 'flag' },
  };
  for (const [key, f] of Object.entries(friends)) state.friends[`demo-f-${key}`] = { ...f, id: `demo-f-${key}`, photo: null, updatedAt: 1 };
  const who = [['mike', 'steve'], ['dave'], ['mike'], ['mike', 'steve', 'ken'], ['steve'], [], ['mike', 'dave'], ['ken'],
    ['mike', 'steve'], ['dave'], ['mike'], ['mike', 'steve'], ['mike', 'steve', 'dave'], ['mike']];
  const notes = { '-13': 'Saturday Stableford, 3rd in division', '-6': 'October Medal', '-73': 'Windy. Lost two balls on the back nine.' };
  rounds.forEach(([days, key, score, points, putts], i) => {
    const c = courses[key];
    const id = `demo-r${i}`;
    state.rounds[id] = {
      id, date: iso(at(days)), course: c.name, holes: 18, score, par: c.par, rating: c.rating, slope: c.slope,
      points, putts, notes: notes[String(days)] || '', friendIds: who[i].map((k) => `demo-f-${k}`), updatedAt: 1,
    };
  });
  state.rounds['demo-r9h'] = { id: 'demo-r9h', date: iso(at(-20)), course: 'Oakmere Golf Club', holes: 9, score: 42, par: 36, notes: 'Evening nine', updatedAt: 1 };

  state.teeTimes['demo-t1'] = { id: 'demo-t1', date: iso(at(20)), time: '11:00', course: 'Brackenwood Golf Club', players: 4, notes: 'Away day with the society', friendIds: ['demo-f-mike', 'demo-f-steve', 'demo-f-dave'], updatedAt: 1 };
  return state;
}
