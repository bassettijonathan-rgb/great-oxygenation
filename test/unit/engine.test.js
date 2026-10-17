import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine, REAL_LIPS, makeLips } from '../../src/sim/engine.js';
import { airStats } from '../../src/sim/atmosphere.js';
import { K } from '../../src/sim/params.js';

const run = (opts, steps) => {
  const e = new Engine(opts);
  e.run(steps);
  return e;
};
const fingerprint = (e) => JSON.stringify(e.history.map((h) => [h.age, h.pal, h.ch4, h.co2, h.T, h.iceLat, h.d33S, h.d13C, h.lith]));

test('the same seed gives the same run', () => {
  const a = run({ seed: 'earth' }, 120);
  const b = run({ seed: 'earth' }, 120);
  assert.equal(fingerprint(a), fingerprint(b));
  const c = run({ seed: '42', scenario: 'volcanoes' }, 80);
  const d = run({ seed: '42', scenario: 'volcanoes' }, 80);
  assert.equal(fingerprint(c), fingerprint(d));
});

test('a run is the same whether it goes in one go or in pieces', () => {
  const a = run({ seed: '7' }, 60);
  const b = new Engine({ seed: '7' });
  for (let i = 0; i < 6; i++) b.run(10);
  assert.equal(fingerprint(a), fingerprint(b));
});

test('seeds draw their own eruptions; the default uses the real ones', () => {
  assert.deepEqual(
    makeLips('earth').map((e) => e.age),
    REAL_LIPS.map((e) => e.age),
  );
  const a = makeLips('1').map((e) => e.age.toFixed(4)).join();
  const b = makeLips('2').map((e) => e.age.toFixed(4)).join();
  assert.notEqual(a, b);
  for (const e of makeLips('3')) assert.ok(e.age <= K.startAge && e.age >= K.endAge);
});

test('the coupled solver never skips time and stays finite', () => {
  const before = airStats.skipped;
  const e = run({ seed: 'earth' }, 300);
  assert.equal(airStats.skipped, before);
  for (const h of e.history) {
    for (const k of ['pal', 'ch4', 'co2', 'T', 'iceLat', 'so4', 'deepFe', 'd13C', 'd33S']) assert.ok(Number.isFinite(h[k]), `${k} at ${h.age}`);
    assert.ok(h.pal > 0 && h.ch4 > 0 && h.co2 > 0);
    assert.ok(h.iceLat >= 0 && h.iceLat <= 90);
  }
  assert.equal(e.step, 300);
  assert.ok(Math.abs(e.age - (K.startAge - 300 * K.stepMyr * 1e-3)) < 1e-9);
});

test('a run ends at the end age', () => {
  const e = new Engine({ seed: 'earth' });
  e.age = K.endAge + 0.001; // skip ahead: only the bookkeeping is under test
  e.run(10);
  assert.ok(e.done);
  assert.ok(Math.abs(e.age - K.endAge) < 1e-9);
});

test('the frame and geometry describe the same slice', () => {
  const e = run({ seed: 'earth' }, 2);
  const g = e.geometry();
  const f = e.frame();
  const cells = g.NX * g.NZ;
  for (const k of ['O2', 'Fe', 'P', 'CH4', 'H2S', 'prod', 'ferro', 'rust']) assert.equal(f[k].length, cells, k);
  assert.equal(f.open.length, g.NX);
  assert.equal(f.T.length, g.bands);
  assert.equal(g.water.length, cells);
  for (let i = 0; i < g.NX; i++) {
    for (let k = 0; k < g.NZ; k++) assert.equal(g.water[i * g.NZ + k], k <= g.kb[i] ? 1 : 0, `column ${i} layer ${k}`);
  }
  // structured-cloneable: plain arrays and typed arrays only
  assert.doesNotThrow(() => structuredClone({ g, f }));
});

test('Lab buttons change the planet and leave a note', () => {
  const e = run({ seed: 'earth' }, 4);
  const co2 = e.pCO2;
  e.inject('co2');
  assert.ok(e.pCO2 > co2);
  e.inject('freeze');
  assert.ok(e.climate.iceLat < 5);
  e.inject('lip');
  assert.equal(e.injected.length, 1);
  assert.equal(e.log.filter((n) => n.kind === 'lab').length, 3);
  e.setParams({ reductants: 1.4, notAParam: 3 });
  assert.equal(e.params.reductants, 1.4);
  assert.equal(e.params.notAParam, undefined);
});
