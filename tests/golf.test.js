import { test } from 'node:test';
import assert from 'node:assert/strict';
import { differential, handicapIndex, roundStats, bookingsFromEmails, upcomingItems, calendarUrl, scoreToPar, formatIndex, eventTitle, resultTitle } from '../js/golf.js';

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

test('formatting', () => {
  assert.equal(scoreToPar({ score: 85, par: 72 }), '+13');
  assert.equal(scoreToPar({ score: 70, par: 72 }), '-2');
  assert.equal(scoreToPar({ score: 72, par: 72 }), 'E');
  assert.equal(formatIndex(-1.2), '+1.2');
  assert.equal(formatIndex('+0.4'), '+0.4');
  assert.equal(formatIndex('14.6'), '14.6');
  assert.equal(formatIndex(12), '12.0');
});
