// Runs with made-up eruptions finish, stay physical, and repeat exactly.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../../src/sim/engine.js';

test('a seeded run reaches the end and oxygen rises', () => {
  const e = new Engine({ seed: '1234' });
  while (!e.done) e.run(1);
  const H = e.history;
  assert.ok(H.every((h) => Number.isFinite(h.pal) && Number.isFinite(h.T)));
  assert.ok(H.some((h) => h.pal > 1e-5));
  assert.ok(H.at(-1).pal > 1e-4, 'oxygen is in the air at the end');
});

test('the earliest steps of a seeded run repeat exactly', () => {
  const a = new Engine({ seed: 'abc', scenario: 'noLull' });
  const b = new Engine({ seed: 'abc', scenario: 'noLull' });
  a.run(400);
  b.run(400);
  assert.deepEqual(a.history, b.history);
});
