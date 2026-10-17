// Each Lab scenario runs to the end and does what its card promises.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../../src/sim/engine.js';
import { airStats } from '../../src/sim/atmosphere.js';

function runAll(opts) {
  const e = new Engine(opts);
  while (!e.done) e.run(1);
  const H = e.history;
  return {
    H,
    goe: H.find((h) => h.pal > 1e-5)?.age ?? null,
    maxPal: Math.max(...H.map((h) => h.pal)),
    minIce: Math.min(...H.map((h) => h.iceLat)),
  };
}

test('without cyanobacteria oxygen never rises', () => {
  const r = runAll({ scenario: 'noCyano' });
  assert.equal(r.goe, null);
  assert.ok(r.maxPal < 1e-10, `max oxygen ${r.maxPal}`);
});

test('gassier volcanoes hold oxygen back for longer', () => {
  const skipped = airStats.skipped;
  const r = runAll({ scenario: 'volcanoes' });
  assert.ok(r.goe !== null && r.goe < 2.43, `oxygen rose at ${r.goe}`);
  assert.equal(airStats.skipped, skipped);
});

test('without the lava floods there is no snowball', () => {
  const r = runAll({ scenario: 'noLips' });
  assert.ok(r.minIce > 5, `ice reached ${r.minIce}°`);
  assert.ok(r.goe !== null);
});
