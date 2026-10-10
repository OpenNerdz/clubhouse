import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEmail, findDates, findTimes, findClubs, htmlToText, decodeEntities, buildQuery, cleanText } from '../js/parser.js';
import { sampleEmails } from '../js/demo.js';

const at = (s) => new Date(s).getTime();
const parse = (msg, opts) => parseEmail({ id: 'm1', labels: [], ...msg }, opts);

test('UK club booking confirmation', () => {
  const e = parse({
    date: at('2026-10-02T18:00:00'),
    from: 'Royal Wessex Golf Club <bookings@royalwessex.example>',
    subject: 'Booking Confirmation',
    text: 'Thank you for your booking at Royal Wessex Golf Club.\nBooking made on 2 October 2026.\nTee Time: 08:24 on Saturday 17th October 2026\nPlayers: 4\nBooking Reference: 123456\nGreen fee £12.50 per player.',
  });
  assert.equal(e.category, 'teetime');
  assert.equal(e.details.date, '2026-10-17', 'uses the play date, not the booking date');
  assert.equal(e.details.time, '08:24', 'a price like £12.50 is not a time');
  assert.equal(e.details.players, 4);
  assert.equal(e.details.ref, '123456');
  assert.equal(e.details.course, 'Royal Wessex Golf Club');
  assert.equal(e.details.status, 'confirmed');
});

test('US booking site with month-first date and am/pm time', () => {
  const e = parse({
    date: at('2026-10-05T12:00:00'),
    from: 'GolfNow <noreply@golfnow.com>',
    subject: 'Your tee time at Pine Valley Golf Course is confirmed',
    text: 'Get ready to play!\nSat, Oct 17, 2026 at 7:50 AM\n4 Golfers\nConfirmation #: GN-883271\nPine Valley Golf Course',
  }, { dayFirst: false });
  assert.equal(e.category, 'teetime');
  assert.equal(e.details.date, '2026-10-17');
  assert.equal(e.details.time, '07:50');
  assert.equal(e.details.players, 4);
  assert.equal(e.details.ref, 'GN-883271');
  assert.equal(e.details.course, 'Pine Valley Golf Course');
});

test('numeric dates follow the locale but correct themselves when unambiguous', () => {
  const ref = new Date('2026-10-01T09:00:00');
  assert.equal(findDates('Date: 05/11/2026', ref, { dayFirst: true })[0].date, '2026-11-05');
  assert.equal(findDates('Date: 05/11/2026', ref, { dayFirst: false })[0].date, '2026-05-11');
  assert.equal(findDates('Date: 10/17/2026', ref, { dayFirst: true })[0].date, '2026-10-17');
  assert.equal(findDates('Date: 2026-10-17', ref)[0].date, '2026-10-17');
});

test('a date without a year rolls into next year when it has to', () => {
  const ref = new Date('2026-12-20T09:00:00');
  assert.equal(findDates('Saturday 2nd January', ref)[0].date, '2027-01-02');
  const mid = new Date('2026-06-10T09:00:00');
  assert.equal(findDates('on 14 June', mid)[0].date, '2026-06-14');
});

test('words that look like months are not dates', () => {
  const ref = new Date('2026-10-01');
  assert.equal(findDates('Mark scored 3 Junior points', ref).length, 0);
});

test('times', () => {
  assert.deepEqual(findTimes('Tee off 8.30am').map((t) => t.time), ['08:30']);
  assert.deepEqual(findTimes('starts at 1:15 pm').map((t) => t.time), ['13:15']);
  assert.deepEqual(findTimes('arrive by 12pm').map((t) => t.time), ['12:00']);
  assert.deepEqual(findTimes('Tee time: 0930').map((t) => t.time), ['09:30']);
  assert.deepEqual(findTimes('costs £22.50 and 40.5% off').map((t) => t.time), []);
});

test('HTML emails are converted to text', () => {
  const html = '<html><head><style>td{color:red}</style></head><body><table><tr><td>Date</td><td>17/10/2026</td></tr><tr><td>Time</td><td>09:10</td></tr></table><p>Players:&nbsp;3</p><script>alert(1)</script></body></html>';
  const text = htmlToText(html);
  assert.ok(!text.includes('color:red') && !text.includes('alert'));
  const e = parse({ date: at('2026-10-01T10:00:00'), from: 'Oak Hill Golf Club <x@oakhill.example>', subject: 'Tee time booked', html });
  assert.equal(e.details.date, '2026-10-17');
  assert.equal(e.details.time, '09:10');
  assert.equal(e.details.players, 3);
});

test('entities', () => {
  assert.equal(decodeEntities('Tom&#39;s &amp; Jerry&rsquo;s &pound;5 &#x2014; ok'), 'Tom\'s & Jerry’s £5 — ok');
  assert.equal(decodeEntities('&unknown; stays'), '&unknown; stays');
});

test('quoted replies are ignored', () => {
  const text = cleanText('Yes, see you Friday at 9:00\n\nOn Tue, 6 Oct 2026 at 10:00, Mike wrote:\n> Golf on 30 November 2026?');
  assert.ok(!text.includes('November'));
});

test('handicap updates', () => {
  const a = parse({ date: at('2026-10-01'), from: 'England Golf <noreply@englandgolf.org>', subject: 'Your Handicap Index has been updated', text: 'Your Handicap Index® is now 12.3. Previous Handicap Index: 12.9' });
  assert.equal(a.category, 'handicap');
  assert.equal(a.details.index, '12.3');
  assert.equal(a.details.prevIndex, '12.9');
  const b = parse({ date: at('2026-10-01'), from: 'GHIN <noreply@ghin.com>', subject: 'Handicap revision', text: 'Your handicap index has changed from 3.1 to +1.2 after your latest score.' });
  assert.equal(b.details.index, '+1.2');
  assert.equal(b.details.prevIndex, '3.1');
});

test('competition results', () => {
  const e = parse({ date: at('2026-10-04'), from: 'Oakmere Golf Club <comps@oakmere.example>', subject: 'Results: Monthly Stableford', text: 'Well played. You scored 38 points and finished 2nd out of 40.' });
  assert.equal(e.category, 'competition');
  assert.equal(e.details.kind, 'result');
  assert.equal(e.details.points, 38);
  assert.equal(e.details.position, 2);
  assert.equal(e.details.field, 40);
});

test('shop orders and offers', () => {
  const order = parse({ date: at('2026-10-04'), from: 'Golf Shop <orders@golfshop.example>', subject: 'Order confirmed', text: 'Thanks for your order of golf balls. Order number: 77812. Order total: $49.99' });
  assert.equal(order.category, 'shop');
  assert.equal(order.details.order, '77812');
  assert.equal(order.details.total, '$49.99');
  const promo = parse({ date: at('2026-10-04'), from: 'Golf Shop <offers@golfshop.example>', subject: 'Weekend sale', text: 'Up to 30% off golf shoes.', labels: ['CATEGORY_PROMOTIONS'], unsubscribe: true });
  assert.equal(promo.category, 'shop');
  assert.equal(promo.details.discount, '30% off');
});

test('cancellations are spotted', () => {
  const e = parse({ date: at('2026-10-04'), from: 'Oak Hill Golf Club <x@oakhill.example>', subject: 'Booking cancelled', text: 'Your tee time on Saturday 17 October 2026 at 09:10 has been cancelled.' });
  assert.equal(e.details.status, 'cancelled');
});

test('not golf: car, horse racing, mini golf, ordinary email', () => {
  assert.equal(parse({ date: at('2026-10-01'), from: 'VW Service <service@vwdealer.example>', subject: 'Your Golf is due a service', text: 'Book your Volkswagen Golf GTI in for its MOT and service at our dealership.' }), null);
  assert.equal(parse({ date: at('2026-10-01'), from: 'BetNow <promo@bet.example>', subject: 'Today’s Handicap Hurdle', text: 'Best odds guaranteed on the 3.15 Handicap Hurdle. Free bets for new customers.' }), null);
  assert.equal(parse({ date: at('2026-10-01'), from: 'Fun Park <hi@funpark.example>', subject: 'Crazy golf voucher', text: 'Enjoy 18 holes of crazy golf this half term.' }), null);
  assert.equal(parse({ date: at('2026-10-01'), from: 'Sam <sam@example.com>', subject: 'Dinner Friday?', text: 'Fancy dinner on Friday at 7pm?' }), null);
});

test('extra search words make an email count', () => {
  const msg = { date: at('2026-10-01'), from: 'Brookfield Seniors <sec@brookfield.example>', subject: 'Brookfield Seniors: next outing', text: 'Next outing is on Thursday 22 October 2026, meet at 9:00.' };
  assert.equal(parse(msg), null);
  const e = parse(msg, { extraTerms: ['Brookfield Seniors'] });
  assert.ok(e);
  assert.equal(e.details.date, '2026-10-22');
});

test('club names', () => {
  assert.deepEqual(findClubs('Welcome to The Belfry Golf Club'), ['The Belfry Golf Club']);
  assert.deepEqual(findClubs('Thank You For Booking At Royal Oak Golf Club'), ['Royal Oak Golf Club']);
  assert.deepEqual(findClubs('Played Oakmere. Next: Kingsdown Golf & Country Club'), ['Kingsdown Golf & Country Club']);
  assert.deepEqual(findClubs('Booked at St. George’s Hill Golf Club'), ['St. George’s Hill Golf Club']);
  assert.deepEqual(findClubs('Bring your golf clubs'), []);
});

test('the Gmail search query', () => {
  const q = buildQuery({ months: 12, extraTerms: ['Brookfield Seniors', 'BGS'], after: Date.UTC(2026, 9, 1) });
  assert.match(q, /^\(golf OR /);
  assert.ok(q.includes('"Brookfield Seniors" OR BGS) newer_than:12m after:'));
});

test('every sample email is understood', () => {
  for (const s of sampleEmails(true)) {
    const e = parseEmail({ id: s.id, date: s.received.getTime(), from: s.from, subject: s.subject, text: s.text, labels: s.labels || [], unsubscribe: !!s.unsubscribe });
    assert.ok(e, `${s.id} should be golf`);
  }
});

test('a cancellation policy does not make a booking cancelled', () => {
  const e = parse({
    date: at('2026-10-02T18:00:00'), from: 'Oakmere Golf Club <bookings@oakmere.example>', subject: 'Booking confirmation',
    text: 'Your booking is confirmed.\nCancellation policy: free cancellation up to 24 hours before play. Bookings cancelled within 48 hours will be charged.\nTee time: Saturday 17 October 2026 at 09:00\nPlayers: 2',
  });
  assert.equal(e.category, 'teetime');
  assert.equal(e.details.status, 'confirmed');
  const c = parse({ date: at('2026-10-05'), from: 'Oakmere Golf Club <bookings@oakmere.example>', subject: 'Booking update', text: 'Your tee time on Saturday 17 October 2026 at 09:00 has been cancelled.' });
  assert.equal(c.details.status, 'cancelled');
});

test('tee-time adverts are not bookings', () => {
  const e = parse({
    date: at('2026-10-10'), from: 'GolfNow <deals@golfnow.com>', subject: 'Hot Deals: Weekend Tee Times from $29',
    text: 'Book your tee time now for this Saturday, October 18. Hot deals at courses near you.', labels: ['CATEGORY_PROMOTIONS'], unsubscribe: true,
  }, { dayFirst: false });
  assert.notEqual(e.category, 'teetime');
});

test('a club-wide results list is not his result, and entry emails stay entries', () => {
  const list = parse({ date: at('2026-10-04'), from: 'Oakmere Golf Club <comps@oakmere.example>', subject: 'Monthly Medal results', text: 'Thank you to everyone who played.\n\n1st place: John Smith 42 pts\n2nd place: Alan Brown 40 pts' });
  assert.equal(list.details.kind, 'result');
  assert.equal(list.details.position, undefined);
  assert.equal(list.details.points, undefined);
  const entry = parse({ date: at('2026-10-04'), from: 'Oakmere Golf Club <comps@oakmere.example>', subject: 'Entry confirmed', text: 'You are entered in the Club Stableford on Saturday 24 October 2026. Prizes for the winners. Results will be published on HowDidiDo.' });
  assert.equal(entry.details.kind, 'entry');
  assert.equal(entry.details.date, '2026-10-24');
});

test('the labelled tee time beats an arrival time', () => {
  const e = parse({ date: at('2026-10-02'), from: 'Oakmere Golf Club <bookings@oakmere.example>', subject: 'Tee time booked', text: 'Your tee time at 08:30 on Saturday 17 October 2026 is confirmed. Please arrive by 08:00.' });
  assert.equal(e.details.time, '08:30');
});

test('handicap ignores dates that look like numbers', () => {
  const e = parse({ date: at('2026-04-18'), from: 'England Golf <noreply@englandgolf.org>', subject: 'Handicap update', text: 'Your Handicap Index has changed from 14.2 to 13.8. Last updated 18.04.2026' });
  assert.equal(e.details.index, '13.8');
  assert.equal(e.details.prevIndex, '14.2');
  assert.deepEqual(findTimes('Tee time: 18.10.2026'), []);
});

test('a layout name does not replace the club name', () => {
  const e = parse({ date: at('2026-10-02'), from: 'Ferndown Golf Club <bookings@ferndown.example>', subject: 'Tee time confirmation', text: 'Course: Main Course\nDate: Saturday 17 October 2026\nTime: 10:20' });
  assert.equal(e.details.course, 'Ferndown Golf Club');
});
