import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sameCourse, summarise, describe, inRange, units } from '../js/weather.js';

test('a map result only counts when it shares a distinctive word with the course', () => {
  assert.equal(sameCourse('Sunningdale Golf Club', 'Sunningdale Golf Club'), true);
  assert.equal(sameCourse('Hollins Hall Golf Club', 'Bury Golf Club'), false);
  assert.equal(sameCourse('Casa Club', 'Casa Green Golf Club'), false, '"Casa Club" is Spanish for clubhouse');
  assert.equal(sameCourse('Royal Birkdale', 'Royal Liverpool Golf Club'), false);
  assert.equal(sameCourse('Golf Olivar de la Hinojosa', 'Club de Golf Olivar de la Hinojosa'), true);
  assert.equal(sameCourse('Real Club de Golf de Sevilla', 'Real Club Sevilla Golf'), true);
  assert.equal(sameCourse('Golf La Cañada', 'La Canada Golf'), true, 'accents don’t matter');
});

test('the weather over a round', () => {
  const hourly = {
    time: ['2026-10-17T07:00', '2026-10-17T08:00', '2026-10-17T09:00', '2026-10-17T10:00', '2026-10-17T11:00', '2026-10-17T12:00', '2026-10-17T13:00', '2026-10-17T14:00'],
    temperature_2m: [8, 10, 12, 14, 15, 16, 17, 18],
    precipitation_probability: [0, 10, 40, 20, 10, 5, 0, 0],
    weather_code: [0, 1, 61, 3, 2, 1, 0, 0],
    wind_speed_10m: [5, 8, 12, 14, 9, 7, 6, 5],
  };
  // 8:30 tee time: 8:00 to 13:00.
  assert.deepEqual(summarise(hourly, '2026-10-17', '08:30'), { temp: 14, rain: 40, wind: 14, code: 61 });
  assert.equal(summarise(hourly, '2026-10-18', '08:30'), null);
  assert.equal(describe(61).text, 'Rain');
  assert.equal(describe(2).icon, 'partsun');
  assert.equal(describe(95).text, 'Thunderstorms');
  assert.equal(inRange('2026-10-20', '2026-10-10'), true);
  assert.equal(inRange('2026-10-30', '2026-10-10'), false);
  assert.equal(inRange('2026-10-09', '2026-10-10'), false);
  assert.deepEqual(units('en-US'), { temp: 'fahrenheit', wind: 'mph' });
  assert.deepEqual(units('es-ES'), { temp: 'celsius', wind: 'kmh' });
});
