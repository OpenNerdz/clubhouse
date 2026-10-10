import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { metres, toGreen, courseFromOsm, distanceUnit, inUnit, mapQuery } from '../js/gps.js';

// Real Club de Golf de Sevilla (its clubhouse is the "Casa Club"), as mapped on OpenStreetMap.
const sevilla = JSON.parse(readFileSync(new URL('./fixtures/osm-sevilla.json', import.meta.url))).elements;

test('distance between two points', () => {
  // One minute of latitude is a nautical mile.
  assert.equal(Math.round(metres({ lat: 51, lon: 0 }, { lat: 51 + 1 / 60, lon: 0 })), 1853);
  assert.equal(metres({ lat: 37.35, lon: -5.91 }, { lat: 37.35, lon: -5.91 }), 0);
  assert.equal(inUnit(137.16, 'yards'), 150);
  assert.equal(inUnit(137.16, 'metres'), 137);
  assert.equal(distanceUnit('auto', 'en-GB'), 'yards');
  assert.equal(distanceUnit('auto', 'es-ES'), 'metres');
  assert.equal(distanceUnit('metres', 'en-GB'), 'metres');
});

test('the Casa Club course: every hole finds its green on the map', () => {
  const c = courseFromOsm(sevilla);
  assert.deepEqual(Object.keys(c.greens).map(Number).sort((a, b) => a - b), Array.from({ length: 18 }, (_, i) => i + 1));
  for (const g of Object.values(c.greens)) {
    assert.ok(g.edge && g.edge.length >= 3, 'each green has its outline');
    assert.ok(g.edge.length <= 33);
  }
  assert.equal(c.pars[6], undefined, 'the map says par 6 for the 6th, which is a mistake, so it is left out');
  assert.equal(c.pars[5], 5);
  assert.equal(c.sis[4], undefined, 'stroke index 6 is on two holes in the map, so neither is trusted');
  assert.equal(c.sis[6], undefined);
  assert.equal(c.sis[15], 1);
});

test('front, middle and back of the green from the tee', () => {
  const c = courseFromOsm(sevilla);
  const hole1 = sevilla.find((e) => e.tags.golf === 'hole' && e.tags.ref === '1');
  const tee = hole1.geometry[0];
  const d = toGreen(tee, c.greens[1]);
  assert.ok(d.front < d.middle && d.middle < d.back, JSON.stringify(d));
  assert.ok(d.middle > 250 && d.middle < 450, `a par 4: ${Math.round(d.middle)} m`);
  assert.ok(d.back - d.front > 10 && d.back - d.front < 60, 'a green is 10 to 60 metres deep');
  const onIt = toGreen({ lat: c.greens[1].lat, lon: c.greens[1].lon }, c.greens[1]);
  assert.equal(onIt.front, undefined, 'standing on the green: just the middle');
  assert.deepEqual(Object.keys(toGreen(tee, { lat: c.greens[1].lat, lon: c.greens[1].lon })), ['middle'], 'a green he saved himself has no outline');
});

test('a pitch-and-putt next door does not replace the real hole', () => {
  const real = { tags: { golf: 'hole', ref: '1', par: '4' }, geometry: [{ lat: 37.35, lon: -5.92 }, { lat: 37.353, lon: -5.92 }] };
  const pitch = { tags: { golf: 'hole', ref: '1', par: '3' }, geometry: [{ lat: 37.36, lon: -5.92 }, { lat: 37.3605, lon: -5.92 }] };
  const c = courseFromOsm([pitch, real]);
  assert.equal(c.greens[1].lat, 37.353);
  assert.equal(c.greens[1].edge, undefined, 'no green drawn: the end of the hole line will do');
  assert.match(mapQuery({ lat: 37.3514637, lon: -5.9188081 }), /is_in\(37\.351464,-5\.918808\)/);
});
