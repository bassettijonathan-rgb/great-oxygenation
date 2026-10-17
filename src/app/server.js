// The simulation side of the page. It owns an Engine and talks to the page
// only through messages, so the same code runs in a Web Worker or, where a
// worker cannot start, on the page itself in short slices.
//
// Page → sim:  init {seed, scenario, params} · play {speed} · pause
//              runTo {age} · step {n} · inject {kind} · set {patch}
// Sim → page:  ready {geometry, …} · tick {frame, points, notes, core}
//              paused · error {message}

import { Engine, LITH } from '../sim/engine.js';
import { DEFAULTS, SCENARIOS, RANGES, K } from '../sim/params.js';

// Steps per second at each speed. One step is half a million years.
export const SPEEDS = [2, 6, 20, 1000];

export function createSimServer(post) {
  let engine = null;
  let timer = null;
  let running = false;
  let speed = 1;
  let target = null; // age to stop at, for runTo
  let sentPoints = 0;
  let sentNotes = 0;

  const send = () => {
    const h = engine.history;
    const points = h.slice(sentPoints);
    sentPoints = h.length;
    const notes = engine.log.slice(sentNotes);
    sentNotes = engine.log.length;
    post({
      type: 'tick',
      frame: engine.frame(),
      points,
      notes,
      core: engine.core.slice(-3),
      params: engine.params,
      running,
    });
  };

  const stop = () => {
    running = false;
    target = null;
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const loop = () => {
    timer = null;
    if (!running) return;
    const rate = SPEEDS[speed] ?? SPEEDS[1];
    const budget = 24; // ms of work per slice, so the page stays smooth
    const t0 = Date.now();
    const want = Math.max(1, Math.round(rate / 20));
    let n = 0;
    while (!engine.done && (n < want || (rate >= 1000 && Date.now() - t0 < budget))) {
      if (target !== null && engine.age <= target + 1e-9) break;
      engine.run(1);
      n++;
      if (Date.now() - t0 > budget * 2) break;
    }
    const reached = target !== null && engine.age <= target + 1e-9;
    if (engine.done || reached) {
      running = false;
      target = null;
    }
    send();
    // slow speeds wait between steps; the fastest runs flat out in slices
    const wait = rate >= 1000 ? 0 : Math.max(0, (1000 * Math.max(n, 1)) / rate - (Date.now() - t0));
    if (running) timer = setTimeout(loop, wait);
    else post({ type: 'paused', age: engine.age, done: engine.done });
  };

  const start = () => {
    if (engine.done) return;
    running = true;
    if (!timer) timer = setTimeout(loop, 0);
  };

  return function handle(msg) {
    try {
      switch (msg.type) {
        case 'init': {
          stop();
          engine = new Engine({ seed: msg.seed, scenario: msg.scenario, params: msg.params ?? {} });
          sentPoints = 0;
          sentNotes = 0;
          post({
            type: 'ready',
            geometry: engine.geometry(),
            seed: engine.seed,
            scenario: engine.scenario,
            scenarios: SCENARIOS,
            defaults: DEFAULTS,
            ranges: RANGES,
            lith: LITH,
            startAge: K.startAge,
            endAge: K.endAge,
            stepMyr: K.stepMyr,
          });
          send();
          break;
        }
        case 'play':
          if (!engine) break;
          if (typeof msg.speed === 'number') speed = msg.speed;
          target = null;
          start();
          break;
        case 'speed':
          speed = msg.speed;
          break;
        case 'pause':
          stop();
          if (engine) post({ type: 'paused', age: engine.age, done: engine.done });
          break;
        case 'runTo':
          if (!engine) break;
          if (typeof msg.speed === 'number') speed = msg.speed;
          if (engine.age <= msg.age + 1e-9) {
            stop();
            post({ type: 'paused', age: engine.age, done: engine.done });
            break;
          }
          target = msg.age;
          start();
          break;
        case 'step':
          if (!engine) break;
          stop();
          engine.run(msg.n ?? 1);
          send();
          post({ type: 'paused', age: engine.age, done: engine.done });
          break;
        case 'inject':
          if (!engine) break;
          engine.inject(msg.kind);
          send();
          break;
        case 'set':
          if (!engine) break;
          engine.setParams(msg.patch);
          send();
          break;
        default:
          break;
      }
    } catch (err) {
      stop();
      post({ type: 'error', message: String(err && err.stack ? err.stack : err) });
    }
  };
}
