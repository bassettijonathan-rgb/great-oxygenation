import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHAPTERS, GLOSSARY, READOUTS, LAYERS, termKeys, markup, explain, narrate } from '../../src/app/guide.js';
import { createSimServer, SPEEDS } from '../../src/app/server.js';
import { evaluate } from '../../src/app/validation.js';
import { Engine } from '../../src/sim/engine.js';
import * as fmt from '../../src/app/format.js';

test('every glossary link in the lessons has an entry', () => {
  for (const ch of CHAPTERS) {
    const texts = [...ch.body, ch.look ?? '', ch.predict?.explain ?? ''];
    for (const t of texts) for (const k of termKeys(t)) assert.ok(GLOSSARY[k], `chapter "${ch.id}" links to missing term "${k}"`);
  }
});

test('every prediction has exactly one right answer, and every chapter can show itself', () => {
  for (const ch of CHAPTERS) {
    if (ch.predict) assert.equal(ch.predict.options.filter((o) => o.right).length, 1, ch.id);
    assert.ok(ch.show && (ch.show.tab || ch.show.steps?.length), ch.id);
    let last = 3;
    for (const s of ch.show.steps ?? []) {
      assert.ok(s.age < last, `${ch.id}: steps must go forward in time`);
      assert.ok(s.speed >= 0 && s.speed < SPEEDS.length);
      last = s.age;
    }
  }
});

test('markup escapes text and turns links into buttons', () => {
  const html = markup('a <b> [rust] and [red beds|redbeds]');
  assert.match(html, /a &lt;b&gt; /);
  assert.match(html, /data-term="rust">rust</);
  assert.match(html, /data-term="redbeds">red beds</);
});

test('numbers are written for people', () => {
  assert.equal(fmt.sci(2.94e-9, 0), '3×10⁻⁹');
  assert.equal(fmt.sci(2.94e-9, 0, true), '3×10<sup>−9</sup>');
  assert.equal(fmt.sci(9.96e-5, 1), '1×10⁻⁴');
  assert.equal(fmt.num(140000), '140,000');
  assert.equal(fmt.num(0.0123), '0.012');
  assert.equal(fmt.num(-3.21), '−3.2');
  assert.equal(fmt.pal(1e-5), '10⁻⁵');
  assert.equal(fmt.pal(0.0192), '1.9 %');
  assert.equal(fmt.temp(-0.04), '0.0 °C');
  assert.equal(fmt.temp(-12.34), '−12.3 °C');
  assert.equal(fmt.esc('<a href="x">&'), '&lt;a href=&quot;x&quot;&gt;&amp;');
});

test('every readout explains itself at every stage of a run', () => {
  const e = new Engine({ seed: 'earth' });
  e.run(30);
  const samples = [e.history[0], e.history.at(-1), { ...e.history.at(-1), iceLat: 0, pal: 0.01 }, { ...e.history.at(-1), iceLat: 30, pal: 2e-4 }];
  for (const h of samples) {
    assert.ok(narrate(h).length > 20);
    for (const r of READOUTS) {
      assert.ok(r.value(h));
      const ex = explain(r.key, h);
      assert.ok(ex && ex.title && ex.value && ex.html.length, r.key);
      for (const p of ex.html) for (const [, k] of p.matchAll(/data-term="([^"]+)"/g)) assert.ok(GLOSSARY[k], `${r.key} links to missing term ${k}`);
    }
  }
  assert.ok(LAYERS.every((l) => l.legend.length));
});

test('the simulation server answers init, step, inject and set', () => {
  const got = [];
  const handle = createSimServer((m) => got.push(m));
  handle({ type: 'init', seed: 'earth', scenario: 'real' });
  assert.equal(got[0].type, 'ready');
  assert.equal(got[0].geometry.NX * got[0].geometry.NZ, got[0].geometry.water.length);
  assert.equal(got[1].type, 'tick');
  assert.equal(got[1].points.length, 1);
  handle({ type: 'step', n: 3 });
  const tick = got.filter((m) => m.type === 'tick').at(-1);
  assert.equal(tick.points.length, 3, 'only the new points are sent');
  assert.equal(got.at(-1).type, 'paused');
  handle({ type: 'inject', kind: 'methane' });
  assert.ok(got.at(-1).notes.some((n) => n.kind === 'lab'));
  handle({ type: 'set', patch: { ventIron: 2 } });
  assert.equal(got.at(-1).params.ventIron, 2);
  handle({ type: 'nonsense' });
  assert.ok(!got.some((m) => m.type === 'error'));
});

test('runTo stops at its age', async () => {
  const got = [];
  const handle = createSimServer((m) => got.push(m));
  handle({ type: 'init', seed: 'earth', scenario: 'real' });
  handle({ type: 'runTo', age: 2.99, speed: 3 });
  await new Promise((resolve) => {
    const wait = () => (got.some((m) => m.type === 'paused') ? resolve() : setTimeout(wait, 20));
    wait();
  });
  const paused = got.find((m) => m.type === 'paused');
  assert.ok(Math.abs(paused.age - 2.99) < 1e-9);
});

test('the checks score a run', () => {
  const e = new Engine({ seed: 'earth' });
  e.run(40);
  const r = evaluate(e.history);
  assert.equal(r.total, r.checks.length);
  assert.ok(r.checks.every((c) => typeof c.pass === 'boolean' && c.what && c.real && c.source));
});
