import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildSearch, pkcePair } from '../js/microsoft.js';
import { outlookCalendarUrl } from '../js/golf.js';

test('Outlook search text', () => {
  const q = buildSearch(['Brookfield Seniors', 'BGS', ' ', '"quoted" (thing)']);
  assert.match(q, /^golf OR tee OR /);
  assert.ok(q.endsWith('OR (Brookfield AND Seniors) OR BGS OR (quoted AND thing)'), q);
  assert.ok(!/["()\\]{2}/.test(q.replace(/\(\w+ AND \w+\)/g, '')));
});

test('PKCE pair: the challenge is the SHA-256 of the verifier', async () => {
  const { verifier, challenge } = await pkcePair();
  assert.match(verifier, /^[A-Za-z0-9_-]{43}$/);
  const expected = createHash('sha256').update(verifier).digest('base64url');
  assert.equal(challenge, expected);
  const again = await pkcePair();
  assert.notEqual(again.verifier, verifier);
});

test('Outlook calendar links', () => {
  const u = new URL(outlookCalendarUrl({ title: 'Golf: Oak GC', date: '2026-10-17', time: '08:30', location: 'Oak GC' }));
  assert.equal(u.hostname, 'outlook.live.com');
  assert.equal(u.searchParams.get('subject'), 'Golf: Oak GC');
  assert.equal(u.searchParams.get('startdt'), '2026-10-17T08:30:00');
  assert.equal(u.searchParams.get('enddt'), '2026-10-17T13:00:00');
  const allDay = new URL(outlookCalendarUrl({ title: 'Comp', date: '2026-12-31' }));
  assert.equal(allDay.searchParams.get('allday'), 'true');
});
