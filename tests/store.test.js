import { test } from 'node:test';
import assert from 'node:assert/strict';
import { merge, normalise, sameData, forBackup, emptyState, hasOwnData, ownDataChangedSince, freshStart, sameAccount } from '../js/store.js';

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

test('a backup read back from Drive matches, even when a round has empty fields', () => {
  const s = emptyState();
  s.rounds = { a: { id: 'a', score: 84, rating: undefined, slope: undefined, updatedAt: 1 } };
  const fromDrive = JSON.parse(JSON.stringify(forBackup(s)));
  assert.ok(sameData(merge(s, fromDrive), fromDrive));
});

test('backups leave out device-only details', () => {
  const s = emptyState();
  s.meta.profile = { email: 'me@example.com' };
  const b = forBackup(s);
  assert.equal(b.meta, undefined);
  assert.ok(b.savedAt > 0);
  assert.ok(sameData(s, b));
});

test('playing partners sync like rounds, and old backups without them still load', () => {
  const local = emptyState();
  local.friends = { m: { id: 'm', name: 'Mike', updatedAt: 2 } };
  const remote = emptyState();
  remote.friends = { m: { id: 'm', name: 'Mike Turner', updatedAt: 5 }, s: { id: 's', name: 'Steve', updatedAt: 1 } };
  const m = merge(local, remote);
  assert.equal(m.friends.m.name, 'Mike Turner');
  assert.ok(m.friends.s);
  const old = { rounds: { a: { id: 'a', score: 80, updatedAt: 1 } }, settings: {} };
  assert.deepEqual(merge(local, old).friends, local.friends);
});

test('data saved before owners were kept belongs to the connected account, with older changes still to back up', () => {
  const old = {
    settings: { updatedAt: 3 },
    rounds: { a: { id: 'a', score: 80, updatedAt: 7 } },
    meta: { profile: { email: 'Dad@Example.com' }, lastBackup: 5 },
  };
  const s = normalise(old);
  assert.equal(s.meta.owner, 'Dad@Example.com');
  assert.equal(s.meta.changedAt, 7);
  assert.ok(s.meta.changedAt > s.meta.lastBackup);
  // Once kept, they're left alone.
  const kept = normalise({ ...old, meta: { ...old.meta, owner: 'someone@example.com', changedAt: 2 } });
  assert.equal(kept.meta.owner, 'someone@example.com');
  assert.equal(kept.meta.changedAt, 2);
  assert.equal(normalise({}).meta.owner, null);
});

test('merging a backup keeps this device\'s owner and change time', () => {
  const local = emptyState();
  Object.assign(local.meta, { owner: 'me@example.com', changedAt: 9, lastBackup: 4 });
  const m = merge(local, forBackup(emptyState()));
  assert.equal(m.meta.owner, 'me@example.com');
  assert.equal(m.meta.changedAt, 9);
});

test('own data is what he entered, not email or deleted items', () => {
  const s = emptyState();
  s.emails = { e: { id: 'e', updatedAt: 1 } };
  s.rounds = { a: { id: 'a', deleted: true, updatedAt: 1 } };
  assert.ok(!hasOwnData(s));
  s.friends = { f: { id: 'f', name: 'Mike', updatedAt: 6 } };
  assert.ok(hasOwnData(s));
  const playing = emptyState();
  playing.meta.live = { course: 'Old Course', card: [] };
  assert.ok(hasOwnData(playing));
  assert.ok(ownDataChangedSince(s, 5));
  assert.ok(!ownDataChangedSince(s, 6));
  s.settings.updatedAt = 99; // settings and email alone don't count
  assert.ok(!ownDataChangedSince(s, 6));
});

test('a fresh start for another account keeps only how the screen looks', () => {
  const s = emptyState();
  s.rounds = { a: { id: 'a', score: 80, updatedAt: 1 } };
  s.friends = { f: { id: 'f', name: 'Mike', updatedAt: 1 } };
  Object.assign(s.settings, { theme: 'dark', textSize: 'large', distance: 'metres', extraTerms: ['Royal Somewhere'], updatedAt: 8 });
  Object.assign(s.meta, { owner: 'dad@example.com', changedAt: 8, lastBackup: 8, live: { course: 'X' }, places: { x: { lat: 1, lon: 2 } } });
  const f = freshStart(s);
  assert.deepEqual(f.rounds, {});
  assert.deepEqual(f.friends, {});
  assert.deepEqual(f.settings.extraTerms, []);
  assert.equal(f.settings.theme, 'dark');
  assert.equal(f.settings.textSize, 'large');
  assert.equal(f.settings.distance, 'metres');
  assert.equal(f.settings.updatedAt, 0); // so the new account's own settings win when its backup comes in
  assert.equal(f.meta.owner, null);
  assert.equal(f.meta.live, null);
  assert.deepEqual(f.meta.places, {});
  assert.equal(f.meta.onboarded, true);
});

test('accounts match whatever the capitals', () => {
  assert.ok(sameAccount('Dad@Example.com', 'dad@example.com '));
  assert.ok(!sameAccount('dad@example.com', 'mum@example.com'));
  assert.ok(!sameAccount(null, 'dad@example.com'));
});
