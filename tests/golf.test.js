import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  differential, handicapIndex, roundStats, bookingsFromEmails, upcomingItems, calendarUrl, scoreToPar, formatIndex, eventTitle, resultTitle, goodRoundIds, unscoredRounds, partnerStats, partnerCounts,
  indexValue, courseHandicap, roundShots, shotsLabel, shotsPerHole, cardScore, adjustedGross, cardPoints, cardPar, holesPlayed, scoreName, officialIndexHistory, estimatedIndexHistory,
} from '../js/golf.js';

const round = (date, score, rating = 72, slope = 113, extra = {}) => ({ id: date, date, score, rating, slope, holes: 18, ...extra });

test('score differential', () => {
  assert.equal(differential(round('2026-01-01', 90, 70.1, 125)), 18);
  assert.equal(differential(round('2026-01-01', 85, 72, 113)), 13);
  assert.equal(differential({ date: '2026-01-01', score: 42, holes: 9, rating: 35, slope: 120 }), null);
  assert.equal(differential({ date: '2026-01-01', score: 85 }), null);
});

test('handicap index needs 3 rounds and uses the WHS table', () => {
  assert.equal(handicapIndex([round('2026-01-01', 90), round('2026-01-02', 88)]), null);
  // 3 rounds: lowest 1, minus 2.0
  assert.equal(handicapIndex([round('2026-01-01', 90), round('2026-01-02', 88), round('2026-01-03', 86)]), 12);
  // 6 rounds: average of lowest 2, minus 1.0
  const six = [90, 89, 88, 87, 86, 85].map((s, i) => round(`2026-01-0${i + 1}`, s));
  assert.equal(handicapIndex(six), 12.5);
  // 25 rounds: only the latest 20 count, best 8 of them
  const many = Array.from({ length: 25 }, (_, i) => round(`2026-02-${String(i + 1).padStart(2, '0')}`, i < 5 ? 75 : 80 + (i % 10)));
  assert.equal(handicapIndex(many), 9.5);
});

test('round stats ignore deleted and 9-hole rounds for averages', () => {
  const rounds = {
    a: round('2026-03-01', 90, 72, 113, { points: 30 }),
    b: round('2026-03-08', 80, 72, 113, { points: 38 }),
    c: { id: 'c', date: '2026-03-10', score: 40, holes: 9 },
    d: { id: 'd', deleted: true, date: '2026-03-11' },
  };
  const s = roundStats(rounds, 2026);
  assert.equal(s.count, 3);
  assert.equal(s.thisYear, 3);
  assert.equal(s.average, 85);
  assert.equal(s.best.score, 80);
  assert.equal(s.points, 34);
});

const mail = (id, date, details) => ({ id, category: 'teetime', date: new Date(date).getTime(), details, subject: '' });

test('booking emails collapse into one booking, and cancellations count', () => {
  const emails = [
    mail('1', '2026-10-01', { date: '2026-10-17', time: '08:30', course: 'Oak GC', ref: 'A1', status: 'confirmed' }),
    mail('2', '2026-10-10', { date: '2026-10-17', time: '08:30', course: 'Oak GC', ref: 'A1', status: 'reminder' }),
    mail('3', '2026-10-02', { date: '2026-10-20', time: '13:00', course: 'Elm GC', status: 'confirmed' }),
    mail('4', '2026-10-05', { date: '2026-10-20', time: '13:00', status: 'cancelled' }),
    mail('5', '2026-10-03', { date: '2026-10-22', time: '10:00', course: 'Ash GC', ref: 'B2', status: 'confirmed' }),
    mail('6', '2026-10-06', { date: '2026-10-24', time: '11:00', course: 'Ash GC', ref: 'B2', status: 'changed' }),
  ];
  const rebooked = bookingsFromEmails([
    mail('7', '2026-10-01', { date: '2026-11-01', time: '09:00', course: 'Fir GC', ref: 'C3', status: 'cancelled' }),
    mail('8', '2026-10-02', { date: '2026-11-01', time: '09:00', course: 'Fir GC', ref: 'C3', status: 'confirmed' }),
  ]);
  assert.equal(rebooked[0].status, 'confirmed', 'a later confirmation un-cancels');
  const b = bookingsFromEmails(emails);
  assert.equal(b.length, 3);
  assert.equal(b.find((x) => x.ref === 'A1').status, 'reminder');
  assert.equal(b.find((x) => x.course === 'Elm GC').status, 'cancelled');
  assert.equal(b.find((x) => x.ref === 'B2').date, '2026-10-24');

  const up = upcomingItems({ emails, teeTimes: { t: { id: 't', date: '2026-10-18', time: '09:00', course: 'Pine GC' }, old: { id: 'old', date: '2026-09-01' } } }, '2026-10-12');
  assert.deepEqual(up.map((x) => x.title), ['Oak GC', 'Pine GC', 'Ash GC']);
});

test('calendar links', () => {
  const url = new URL(calendarUrl({ title: 'Golf: Oak GC', date: '2026-10-17', time: '08:30', location: 'Oak GC' }));
  assert.equal(url.searchParams.get('dates'), '20261017T083000/20261017T130000');
  assert.equal(url.searchParams.get('text'), 'Golf: Oak GC');
  const allDay = new URL(calendarUrl({ title: 'Comp', date: '2026-12-31' }));
  assert.equal(allDay.searchParams.get('dates'), '20261231/20270101');
});

test('event titles drop email boilerplate', () => {
  assert.equal(eventTitle('Entry confirmed: Autumn Stableford'), 'Autumn Stableford');
  assert.equal(eventTitle('Draw published - Club Championship'), 'Club Championship');
  assert.equal(eventTitle('Winter Fourball Series: entries now open'), 'Winter Fourball Series');
  assert.equal(eventTitle('Seniors Open'), 'Seniors Open');
});

test('result titles drop email boilerplate', () => {
  assert.equal(resultTitle('Results: October Medal'), 'October Medal');
  assert.equal(resultTitle('Saturday Stableford results'), 'Saturday Stableford');
  assert.equal(resultTitle('Monthly Medal - results now available'), 'Monthly Medal');
  assert.equal(resultTitle('Results'), 'Results');
});

test('rounds worth circling: the best score and any played to handicap', () => {
  const ids = goodRoundIds({
    a: { id: 'a', date: '2026-01-01', score: 88, holes: 18, points: 32 },
    b: { id: 'b', date: '2026-01-08', score: 84, holes: 18, points: 33 },
    c: { id: 'c', date: '2026-01-15', score: 86, holes: 18, points: 37 },
    d: { id: 'd', date: '2026-01-20', score: 41, holes: 9, points: 19 },
    e: { id: 'e', date: '2026-01-21', score: 80, holes: 18, deleted: true },
  });
  assert.deepEqual([...ids].sort(), ['b', 'c', 'd']);
});

test('formatting', () => {
  assert.equal(scoreToPar({ score: 85, par: 72 }), '+13');
  assert.equal(scoreToPar({ score: 70, par: 72 }), '-2');
  assert.equal(scoreToPar({ score: 72, par: 72 }), 'E');
  assert.equal(formatIndex(-1.2), '+1.2');
  assert.equal(formatIndex('+0.4'), '+0.4');
  assert.equal(formatIndex('14.6'), '14.6');
  assert.equal(formatIndex(12), '12.0');
});

test('played rounds with no score yet are offered for scoring', () => {
  const now = new Date(2026, 9, 10, 15, 0); // Sat 10 Oct, 3 pm
  const emails = [
    mail('1', '2026-10-01', { date: '2026-10-08', time: '08:30', course: 'Oak GC', status: 'confirmed' }),
    mail('2', '2026-10-01', { date: '2026-10-07', time: '09:00', course: 'Elm GC', status: 'cancelled' }),
    mail('3', '2026-09-20', { date: '2026-09-25', time: '09:00', course: 'Old GC', status: 'confirmed' }),
    mail('4', '2026-10-01', { date: '2026-10-10', time: '08:00', course: 'Ash GC', status: 'confirmed' }),
    mail('5', '2026-10-01', { date: '2026-10-10', time: '13:00', course: 'Late GC', status: 'confirmed' }),
    { id: '6', category: 'competition', date: 0, subject: 'Entry confirmed: Autumn Stableford', details: { kind: 'entry', date: '2026-10-06' } },
    { id: '7', category: 'competition', date: 0, subject: 'Winter League: entries now open', details: { kind: 'entry', date: '2026-10-05' } },
  ];
  const teeTimes = { t: { id: 't', date: '2026-10-09', course: 'Pine GC' }, gone: { id: 'gone', date: '2026-10-04', deleted: true } };
  const rounds = { r: { id: 'r', date: '2026-10-09', score: 90 } };
  const got = unscoredRounds({ emails, teeTimes, rounds }, now);
  // 10 Oct 8:00 is over by 3 pm, 13:00 isn't; 9 Oct already has a score; 7 Oct was cancelled;
  // 25 Sep is too long ago; "entries open" doesn't mean he played.
  assert.deepEqual(got.map((x) => `${x.date} ${x.course || x.event}`), ['2026-10-10 Ash GC', '2026-10-08 Oak GC', '2026-10-06 Autumn Stableford']);
  const after = unscoredRounds({ emails, teeTimes, rounds, dismissed: ['2026-10-08'] }, now);
  assert.equal(after.length, 2, 'a day he said he didn’t play is left alone');
});

test('partner stats: rounds together, average and best', () => {
  const rounds = {
    a: { id: 'a', date: '2026-09-01', score: 90, holes: 18, friendIds: ['m', 's'] },
    b: { id: 'b', date: '2026-09-08', score: 84, holes: 18, friendIds: ['m'] },
    c: { id: 'c', date: '2026-09-15', score: 41, holes: 9, friendIds: ['m'] },
    d: { id: 'd', date: '2026-09-22', score: 80, holes: 18, friendIds: ['m'], deleted: true },
    e: { id: 'e', date: '2026-09-29', score: 88, holes: 18 },
  };
  const m = partnerStats(rounds, 'm');
  assert.equal(m.count, 3);
  assert.equal(m.average, 87, '9-hole rounds left out of the average');
  assert.equal(m.best.id, 'b');
  assert.equal(m.last, '2026-09-15');
  assert.deepEqual([...partnerCounts(rounds).entries()].sort(), [['m', 3], ['s', 1]]);
  assert.equal(partnerStats(rounds, 'nobody').count, 0);
});

test('course handicap from index, rating, slope and par', () => {
  const oak = { rating: 71.4, slope: 128, par: 72 };
  assert.equal(courseHandicap(14.6, oak), 16);
  assert.equal(courseHandicap('14.6', oak), 16);
  assert.equal(courseHandicap('+1.2', oak), -2, 'a plus handicap gives shots back');
  assert.equal(courseHandicap(14.6, { ...oak, holes: 9 }), 8, '9 holes: half the index, and the 18-hole rating halved');
  assert.equal(courseHandicap(14.6, { par: 72 }), null, 'no rating or slope, no course handicap');
  assert.equal(courseHandicap(null, oak), null);
  assert.equal(roundShots(14.6, oak, 0.95), 15, '95% for Stableford');
  assert.equal(roundShots(14.6, {}), 15, 'his index as a guide when the course isn’t known');
  assert.equal(roundShots(null, oak), null);
  assert.equal(indexValue('+0.4'), -0.4);
  assert.deepEqual([shotsLabel(16), shotsLabel(1), shotsLabel(0), shotsLabel(-2)], ['16 shots', '1 shot', 'Scratch', 'Plus 2']);
});

const card18 = (strokes = []) => Array.from({ length: 18 }, (_, i) => ({ par: 4, si: i + 1, strokes: strokes[i] ?? null }));

test('shots are given out by stroke index', () => {
  const shots = shotsPerHole(card18(), 20);
  assert.deepEqual([shots[0], shots[1], shots[2], shots[17]], [2, 2, 1, 1]);
  const plus = shotsPerHole(card18(), -2);
  assert.deepEqual([plus[0], plus[15], plus[16], plus[17]], [0, 0, -1, -1], 'given back on the easiest holes');
  const front = [7, 3, 17, 1, 11, 5, 15, 9, 13].map((si) => ({ par: 4, si }));
  assert.deepEqual(shotsPerHole(front, 8), [1, 1, 0, 1, 1, 1, 1, 1, 1], '9 holes: the hardest 8 of the nine');
  const noSi = [{ par: 4 }, { par: 4 }];
  assert.deepEqual(shotsPerHole(noSi, 1), [0.5, 0.5], 'spread evenly without stroke indexes');
});

test('a hole-by-hole card: score, net double bogey and Stableford points', () => {
  const card = card18([9, null, ...Array(16).fill(5)]);
  card[1].picked = true;
  assert.equal(holesPlayed(card), 18);
  assert.equal(cardPar(card), 72);
  assert.equal(cardScore(card, 18), 96, 'the pick-up counts as net double bogey (7)');
  assert.equal(adjustedGross(card, 18), 94, 'the 9 is capped at net double bogey too');
  assert.equal(adjustedGross(card, null), 98, 'no index yet: capped at par + 5');
  assert.equal(cardPoints(card, 18), 32);
  const half = card18([4, 5, 6]);
  assert.equal(holesPlayed(half), 3);
  assert.equal(cardScore(half, 18), 15);
  assert.equal(cardPoints(half, 18), 3 + 2 + 1);
  assert.deepEqual([scoreName(3, 4), scoreName(4, 4), scoreName(6, 4), scoreName(9, 4), scoreName(1, 3)], ['Birdie', 'Par', 'Double bogey', '+5', 'Hole in one']);
});

test('the handicap uses the adjusted score from a card, and 9-hole rounds count once his index is known', () => {
  const card = card18([9, null, ...Array(16).fill(5)]);
  card[1].picked = true;
  const r = { date: '2026-05-01', holes: 18, score: 96, rating: 72, slope: 113, par: 72, card, indexAtPlay: 18 };
  assert.equal(differential(r), 22);
  assert.equal(differential({ ...r, card: undefined }), 24);
  assert.equal(differential({ date: '2026-05-02', holes: 9, score: 42, rating: 35, slope: 120, indexAtPlay: 14 }), 15.1);
  assert.equal(differential({ date: '2026-05-02', holes: 9, score: 42, rating: 70, slope: 120, indexAtPlay: '14.0' }), 15.1, 'an 18-hole rating is halved');
});

test('a changed tee time with no booking reference replaces the old time', () => {
  const b = bookingsFromEmails([
    mail('1', '2026-10-01', { date: '2026-10-17', time: '08:30', course: 'Oak GC', status: 'confirmed' }),
    mail('2', '2026-10-03', { date: '2026-10-17', time: '09:10', course: 'Oak GC', status: 'changed' }),
    mail('3', '2026-10-04', { date: '2026-10-17', time: '14:00', course: 'Oak GC', status: 'confirmed' }),
  ]);
  assert.deepEqual(b.map((x) => `${x.time} ${x.status}`), ['09:10 changed', '14:00 confirmed'], 'a second booking that day stays separate');
});

test('index history: official from email, or estimated round by round', () => {
  const hcp = (id, date, index) => ({ id, category: 'handicap', date: new Date(date).getTime(), details: { index } });
  assert.deepEqual(officialIndexHistory([hcp('b', '2026-09-20T09:00', '14.6'), hcp('a', '2026-08-01T09:00', '15.1'), { id: 'c', category: 'teetime', date: 0, details: {} }]),
    [{ date: '2026-08-01', value: 15.1 }, { date: '2026-09-20', value: 14.6 }]);
  const rounds = Object.fromEntries([90, 88, 86, 84].map((s, i) => [`r${i}`, round(`2026-01-0${i + 1}`, s)]));
  assert.deepEqual(estimatedIndexHistory(rounds).map((x) => x.value), [12, 11], '3 rounds: best one minus 2; 4 rounds: best one minus 1');
});
