import { test } from 'node:test';
import assert from 'node:assert/strict';
import { merge, normalise, sameData, forBackup, emptyState } from '../js/store.js';

test('normalise fills in missing settings', () => {
  const s = normalise({ settings: { months: 12, home: { trend: true } } });
  assert.equal(s.settings.months, 12);
  assert.equal(s.settings.home.trend, true);
  assert.equal(s.settings.home.upcoming, true);
  assert.deepEqual(s.rounds, {});
});

test('merge keeps the newest copy of each item, including deletions', () => {
  const local = emptyState();
  local.rounds = { a: { id: 'a', score: 80, updatedAt: 5 }, b: { id: 'b', score: 90, updatedAt: 9 }, c: { id: 'c', score: 70, updatedAt: 1 } };
  local.meta.profile = { email: 'me@example.com' };
  local.settings.updatedAt = 10;
  local.settings.months = 3;
  const remote = emptyState();
  remote.rounds = { a: { id: 'a', score: 82, updatedAt: 6 }, b: { id: 'b', score: 91, updatedAt: 2 }, d: { id: 'd', score: 85, updatedAt: 3 }, c: { id: 'c', deleted: true, updatedAt: 4 } };
  remote.settings.updatedAt = 4;
  remote.settings.months = 12;
  const m = merge(local, remote);
  assert.equal(m.rounds.a.score, 82);
  assert.equal(m.rounds.b.score, 90);
  assert.equal(m.rounds.d.score, 85);
  assert.equal(m.rounds.c.deleted, true);
  assert.equal(m.settings.months, 3);
  assert.equal(m.meta.profile.email, 'me@example.com');
});

test('comparing data ignores key order', () => {
  const a = emptyState();
  a.rounds = { r1: { id: 'r1', score: 80 }, r2: { id: 'r2', score: 90 } };
  const b = emptyState();
  b.rounds = { r2: { score: 90, id: 'r2' }, r1: { score: 80, id: 'r1' } };
  assert.ok(sameData(a, b));
  b.rounds.r1.score = 81;
  assert.ok(!sameData(a, b));
});

test('backups leave out device-only details', () => {
  const s = emptyState();
  s.meta.profile = { email: 'me@example.com' };
  const b = forBackup(s);
  assert.equal(b.meta, undefined);
  assert.ok(b.savedAt > 0);
  assert.ok(sameData(s, b));
});
