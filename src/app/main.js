// The page: wires the simulation to the picture, the charts, the readouts,
// the Learn chapters, the Lab and the Validation tab.

import { createHost } from './host.js';
import { Scene, LAYER_COLORS } from './scene.js';
import { Charts } from './charts.js';
import { CHAPTERS, GLOSSARY, READOUTS, LAYERS, PICTURE_HELP, ABOUT_MODEL, explain, narrate, markup } from './guide.js';
import { evaluate } from './validation.js';
import * as fmt from './format.js';

/* global __VALIDATION__ */
const BUILT = typeof __VALIDATION__ === 'object' ? __VALIDATION__ : null;

const $ = (id) => document.getElementById(id);
const esc = fmt.esc;
const SPEED_LABELS = ['1 Myr/s', '3 Myr/s', '10 Myr/s', 'Fastest'];
const DEFAULT_SPEED = 2;
const WIDE = window.matchMedia('(min-width: 1040px)');
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)');
const reveal = (el, block = 'start') => el?.scrollIntoView?.({ behavior: REDUCED_MOTION.matches ? 'auto' : 'smooth', block });

const store = {
  get(k, d) {
    try {
      const v = window.localStorage.getItem(`goe:${k}`);
      return v === null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      window.localStorage.setItem(`goe:${k}`, JSON.stringify(v));
    } catch {
      /* storage unavailable: nothing to remember */
    }
  },
};

const state = {
  ready: false,
  geometry: null,
  lith: {},
  scenarios: {},
  defaults: {},
  ranges: {},
  start: 3,
  end: 1.8,
  points: [],
  notes: [],
  frame: null,
  params: {},
  running: false,
  done: false,
  speed: store.get('speed', DEFAULT_SPEED),
  seed: 'earth',
  scenario: 'real',
  labParams: {},
  custom: false, // the run was changed while it went (Lab buttons or sliders)
  layer: store.get('layer', 'redox'),
  tab: store.get('tab', 'learn'),
  chapter: Math.min(CHAPTERS.length - 1, store.get('chapter', 0)),
  answers: store.get('answers', {}),
  show: null, // the "Show me" steps still to run
  afterReady: null,
  note: null,
  narratorHtml: '',
  dirty: true,
  chartsDirty: true,
  lastCharts: 0,
  cursor: null,
  validation: null,
  checkView: 'model',
};
if (!Number.isInteger(state.speed) || state.speed < 0 || state.speed > 3) state.speed = DEFAULT_SPEED;

const scene = new Scene($('scene'));
const charts = new Charts($('charts'));
let host = null;

const last = () => state.points[state.points.length - 1];
const age = () => (last() ? last().age : state.start);

// ---------------------------------------------------------------- the sim

function onSim(msg) {
  switch (msg.type) {
    case 'ready': {
      state.ready = true;
      state.geometry = msg.geometry;
      state.lith = msg.lith;
      state.scenarios = msg.scenarios;
      state.defaults = msg.defaults;
      state.ranges = msg.ranges;
      state.start = msg.startAge;
      state.end = msg.endAge;
      state.seed = msg.seed;
      state.scenario = msg.scenario;
      state.points = [];
      state.notes = [];
      state.note = null;
      state.done = false;
      state.running = false;
      scene.setGeometry(msg.geometry, msg.lith);
      scene.resize();
      charts.setRange(msg.startAge, msg.endAge);
      charts.lith = msg.lith;
      charts.cursor = null;
      state.cursor = null;
      $('events').innerHTML = '';
      renderLab();
      renderLithLegend();
      const then = state.afterReady;
      state.afterReady = null;
      if (then) then();
      break;
    }
    case 'tick': {
      state.frame = msg.frame;
      for (const p of msg.points) state.points.push(p);
      for (const n of msg.notes) {
        state.notes.push(n);
        state.note = { ...n, at: performance.now() };
        addEvent(n);
      }
      state.params = msg.params;
      state.running = msg.running;
      state.done = msg.frame.done;
      if (last()) scene.setFrame(msg.frame, last());
      state.dirty = true;
      state.chartsDirty = true;
      break;
    }
    case 'paused':
      state.running = false;
      state.done = msg.done;
      state.dirty = true;
      if (state.show) nextShowStep();
      break;
    case 'error':
      showError(msg.message);
      break;
    default:
      break;
  }
}

function startRun({ seed = state.seed, scenario = state.scenario, params = state.labParams, then = null } = {}) {
  state.afterReady = then;
  state.custom = false;
  state.labParams = { ...params };
  host.send({ type: 'init', seed, scenario, params: state.labParams });
}

function play() {
  if (state.done) {
    startRun({ then: () => play() });
    return;
  }
  state.show = null;
  state.running = true;
  host.send({ type: 'play', speed: state.speed });
  state.dirty = true;
}

function pause() {
  state.show = null;
  host.send({ type: 'pause' });
}

function runTo(a, speed = 3) {
  if (a >= age() - 1e-9 || state.done) return;
  state.running = true;
  host.send({ type: 'runTo', age: a, speed });
  state.dirty = true;
}

// ---------------------------------------------------------------- Show me

function showMe(ch) {
  const s = ch.show;
  if (s.tab) {
    setTab(s.tab);
    reveal($('side'));
    return;
  }
  if (s.layer) setLayer(s.layer);
  const first = s.steps[0].age;
  const fresh = state.scenario === 'real' && state.seed === 'earth' && !state.custom && !Object.keys(state.labParams).length;
  state.show = { steps: s.steps.slice(), chapter: ch };
  if (!fresh || age() < first - 1e-9) startRun({ seed: 'earth', scenario: 'real', params: {}, then: () => nextShowStep() });
  else nextShowStep();
  syncLabControls();
  if (s.focus === 'charts') focusCharts(s.highlight);
  else reveal($('stage'));
  if (s.highlight) flashReadout(s.highlight);
}

function nextShowStep() {
  const show = state.show;
  if (!show) return;
  while (show.steps.length && show.steps[0].age >= age() - 1e-9) show.steps.shift();
  const step = show.steps.shift();
  if (!step) {
    state.show = null;
    const look = document.querySelector(`[data-look="${show.chapter.id}"]`);
    if (look) look.hidden = false;
    return;
  }
  state.running = true;
  host.send({ type: 'runTo', age: step.age, speed: step.speed });
}

function focusCharts() {
  if (!WIDE.matches) {
    state.fromLesson = true;
    setTab('watch');
  }
  requestAnimationFrame(() => reveal($('charts')));
}

function flashReadout(key) {
  const el = document.querySelector(`.readout[data-explain="${key}"]`);
  if (!el) return;
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
}

// ---------------------------------------------------------------- top bar

const ICONS = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.6v14H7zM13.4 5H17v14h-3.6z"/></svg>',
  again: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5a7 7 0 1 1-6.6 4.7l1.9.7A5 5 0 1 0 12 7v3L7.5 6 12 2z"/></svg>',
  step: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5.5v13l9-6.5zM16 5h2.6v14H16z"/></svg>',
};

function renderBar() {
  $('speed').innerHTML = SPEED_LABELS.map((l, i) => `<option value="${i}">${l}</option>`).join('');
  $('speed').value = String(state.speed);
  $('step').innerHTML = ICONS.step;
  $('restart').innerHTML = ICONS.again;
  $('play').addEventListener('click', () => (state.running ? pause() : play()));
  $('step').addEventListener('click', () => {
    state.show = null;
    host.send({ type: 'step', n: 1 });
  });
  $('restart').addEventListener('click', () => startRun());
  $('speed').addEventListener('change', (e) => {
    state.speed = Number(e.target.value);
    store.set('speed', state.speed);
    if (state.running && !state.show) host.send({ type: 'speed', speed: state.speed });
  });
  const tl = $('timeline');
  tl.addEventListener('click', (e) => {
    const r = tl.getBoundingClientRect();
    const t = (e.clientX - r.left) / r.width;
    const a = state.start - t * (state.start - state.end);
    if (a < age() - 0.002) {
      state.show = null;
      runTo(Math.max(state.end, a), 3);
      toast(`Running to ${a.toFixed(2)} billion years ago`);
    } else toast('You can only run forward in time. Restart to go back.');
  });
}

function updateBar() {
  const playing = state.running;
  const b = $('play');
  const mode = playing ? 'pause' : state.done ? 'again' : 'play';
  if (b.dataset.mode !== mode) {
    b.dataset.mode = mode;
    b.innerHTML = `${ICONS[mode]}<span>${mode === 'pause' ? 'Pause' : mode === 'again' ? 'Again' : 'Play'}</span>`;
    b.setAttribute('aria-label', mode === 'pause' ? 'Pause' : mode === 'again' ? 'Run again from the start' : 'Play');
  }
  $('age').textContent = fmt.age(age());
  const t = (state.start - age()) / (state.start - state.end);
  $('tl-fill').style.width = `${(t * 100).toFixed(2)}%`;
  $('timeline').setAttribute('aria-valuenow', age().toFixed(3));
}

function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), 2600);
}

function showError(message) {
  const e = $('error');
  e.textContent = `The simulation stopped: ${message.split('\n')[0]}`;
  e.hidden = false;
  state.running = false;
  state.dirty = true;
}

// ---------------------------------------------------------------- picture

function renderLayers() {
  $('layers').innerHTML = LAYERS.map(
    (l) => `<button type="button" class="chip" data-layer="${l.key}" aria-pressed="${l.key === state.layer}">${esc(l.label)}</button>`,
  ).join('');
  $('layers').addEventListener('click', (e) => {
    const b = e.target.closest('[data-layer]');
    if (b) setLayer(b.dataset.layer);
  });
  renderLegend();
}

function setLayer(key) {
  state.layer = key;
  store.set('layer', key);
  scene.setLayer(key);
  for (const b of document.querySelectorAll('[data-layer]')) b.setAttribute('aria-pressed', String(b.dataset.layer === key));
  renderLegend();
}

function renderLegend() {
  const l = LAYERS.find((x) => x.key === state.layer) ?? LAYERS[0];
  const sw = (c) => `rgb(${c.join(',')})`;
  $('legend').innerHTML =
    l.legend.map(([c, text]) => `<span class="key"><i style="background:${sw(LAYER_COLORS[c])}"></i>${esc(text)}</span>`).join('') +
    '<span class="key faint">brighter = more</span>';
}

// ---------------------------------------------------------------- readouts and narrator

function renderReadouts() {
  $('readouts').innerHTML = READOUTS.map(
    (r) => `<button type="button" class="readout" data-explain="${r.key}">
      <span class="r-label">${esc(r.short ?? r.label)}</span>
      <span class="r-value" data-value="${r.key}">–</span>
      <span class="r-unit" data-unit="${r.key}">${typeof r.unit === 'string' ? esc(r.unit) : ''}</span></button>`,
  ).join('');
}

function updateReadouts() {
  const h = last();
  if (!h) return;
  for (const r of READOUTS) {
    const el = document.querySelector(`[data-value="${r.key}"]`);
    const v = r.value(h);
    if (el && el.dataset.html !== v) {
      el.dataset.html = v;
      el.innerHTML = v;
    }
    if (typeof r.unit === 'function') {
      const u = document.querySelector(`[data-unit="${r.key}"]`);
      const t = r.unit(h);
      if (u && u.textContent !== t) u.textContent = t;
    }
  }
}

const KIND_LABEL = { air: 'Air', ice: 'Ice', rock: 'Rocks', life: 'Life', volcano: 'Volcanoes', lab: 'You' };

function updateNarrator(now) {
  const h = last();
  let html;
  if (!h) html = 'Starting the planet…';
  else if (state.note && now - state.note.at < 7000) html = `<span class="tag tag-${state.note.kind}">${KIND_LABEL[state.note.kind] ?? ''}</span> ${esc(state.note.text)}`;
  else html = narrate(h);
  if (html !== state.narratorHtml) {
    state.narratorHtml = html;
    $('narrator').innerHTML = html;
  }
}

// ---------------------------------------------------------------- charts and events

function themeColors() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n) => cs.getPropertyValue(n).trim();
  return {
    ink: v('--ink'),
    ink2: v('--ink-2'),
    ink3: v('--ink-3'),
    line: v('--line'),
    plot: v('--plot'),
    plotFade: v('--plot-fade'),
    ref: v('--ref'),
    ice: v('--ice-band'),
    iceSoft: v('--ice-soft'),
    sky: v('--sky'),
    amber: v('--amber'),
    rust: v('--rust'),
    teal: v('--teal'),
  };
}
let colors = null;

function drawCharts(now) {
  if (!colors) colors = themeColors();
  charts.points = state.points;
  charts.cursor = state.cursor;
  charts.draw(colors);
  state.chartsDirty = false;
  state.lastCharts = now;
  updateCaption();
}

function updateCaption() {
  const h = state.cursor !== null ? charts.pointAt(state.cursor) : last();
  if (!h) return;
  const n = (key, text) => `<button type="button" class="num" data-explain="${key}" data-age="${h.age}">${text}</button>`;
  const lith = state.lith[h.lith]?.label ?? '';
  const lip = state.cursor !== null ? lipNear(state.cursor) : null;
  $('chart-caption').innerHTML =
    `<b>${state.cursor !== null ? `At ${fmt.age(h.age)}` : `Now, ${fmt.age(h.age)}`} billion years ago:</b> ` +
    `oxygen ${n('o2', fmt.pal(h.pal, true))} of today · methane ${n('ch4', fmt.ppm(h.ch4, true))} · CO₂ ${n('co2', fmt.ppm(h.co2 * 1e6, true))} · ` +
    `${n('temp', fmt.temp(h.T))} · ice ${n('ice', fmt.iceText(h.iceLat))} · Δ³³S ${fmt.fixed(h.d33S)} ‰ · δ¹³C ${fmt.fixed(h.d13C)} ‰ · rock: ${esc(lith.toLowerCase())}` +
    (lip ? ` · <span class="lip-name">lava flood: ${esc(lip)}</span>` : '');
}

function lipNear(a) {
  const near = (state.geometry?.lips ?? []).find((e) => Math.abs(e.age - a) < 0.006);
  return near ? near.name ?? 'a large igneous province' : null;
}

function wireCharts() {
  const c = $('charts');
  const move = (e) => {
    const r = c.getBoundingClientRect();
    const a = charts.ageAt(e.clientX - r.left);
    state.cursor = state.points.length ? Math.max(a, age()) : null;
    state.chartsDirty = true;
  };
  c.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') move(e);
  });
  c.addEventListener('pointerdown', move);
  c.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse') {
      state.cursor = null;
      state.chartsDirty = true;
    }
  });
}

function addEvent(n) {
  const li = document.createElement('li');
  li.dataset.age = n.age;
  li.innerHTML = `<span class="ev-age">${fmt.age(n.age)}</span><span class="tag tag-${n.kind}">${KIND_LABEL[n.kind] ?? ''}</span><span class="ev-text">${esc(n.text)}</span>`;
  $('events').prepend(li);
}

function renderLithLegend() {
  const items = Object.entries(state.lith)
    .map(([, l]) => `<span class="key"><i style="background:${l.color}"></i>${esc(l.label)}</span>`)
    .join('');
  $('lith-legend').innerHTML = `<span class="key faint">Rock strip:</span>${items}`;
}

// ---------------------------------------------------------------- tabs and layout

function setTab(tab) {
  if (tab === 'watch' && WIDE.matches) tab = 'learn';
  state.tab = tab;
  store.set('tab', tab);
  for (const b of document.querySelectorAll('[data-tab]')) {
    const on = b.dataset.tab === tab;
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
  }
  for (const p of document.querySelectorAll('.panel')) p.classList.toggle('active', p.dataset.panel === tab || (p.dataset.panel === 'watch' && WIDE.matches));
  $('back-to-lesson').hidden = !(state.fromLesson && tab === 'watch');
  if (tab === 'watch' || WIDE.matches) requestAnimationFrame(sizeCanvases);
  if (tab === 'check') renderCheck();
}

function placePanels() {
  const watch = $('panel-watch');
  if (WIDE.matches) $('main-col').appendChild(watch);
  else $('side').insertBefore(watch, $('panel-learn'));
  setTab(state.tab);
  sizeCanvases();
}

function sizeCanvases() {
  scene.resize();
  if (state.frame && last()) scene.setFrame(state.frame, last());
  charts.resize();
  state.chartsDirty = true;
}

// ---------------------------------------------------------------- Learn

function renderLearn() {
  const ch = CHAPTERS[state.chapter];
  const i = state.chapter;
  const ans = state.answers[ch.id];
  const pr = ch.predict;
  const options = pr
    ? pr.options
        .map((o, k) => {
          const cls = ans === undefined ? '' : o.right ? ' right' : k === ans ? ' wrong' : ' dim';
          return `<button type="button" class="option${cls}" data-option="${k}" ${ans !== undefined ? 'aria-disabled="true"' : ''}>${esc(o.text)}</button>`;
        })
        .join('')
    : '';
  const verdict = ans === undefined ? '' : pr.options[ans]?.right ? 'Right.' : 'Not quite.';
  $('panel-learn').innerHTML = `
    <div class="chapter-nav">
      <span class="kicker">Chapter ${i + 1} of ${CHAPTERS.length}</span>
      <div class="dots">${CHAPTERS.map((c, k) => `<button type="button" class="dot${k === i ? ' on' : ''}${state.answers[c.id] !== undefined ? ' done' : ''}" data-chapter="${k}" aria-label="Chapter ${k + 1}: ${esc(c.title)}"></button>`).join('')}</div>
    </div>
    <article class="chapter">
      <h2>${esc(ch.title)}</h2>
      ${ch.body.map((p) => `<p>${markup(p)}</p>`).join('')}
      ${
        pr
          ? `<div class="predict">
        <p class="kicker">Predict first</p>
        <p class="predict-q">${esc(pr.q)}</p>
        <div class="options">${options}</div>
        <p class="predict-a" ${ans === undefined ? 'hidden' : ''}><b>${verdict}</b> ${markup(pr.explain)}</p>
      </div>`
          : ''
      }
      <div class="show">
        <button type="button" class="btn primary" data-show="${i}">${esc(ch.showLabel ?? 'Show me')}</button>
        ${ch.look ? `<p class="look" data-look="${ch.id}" hidden><b>Look:</b> ${markup(ch.look)}</p>` : ''}
      </div>
    </article>
    <div class="pager">
      <button type="button" class="btn ghost" data-chapter="${i - 1}" ${i === 0 ? 'disabled' : ''}>← Previous</button>
      <button type="button" class="btn ghost" data-chapter="${i + 1}" ${i === CHAPTERS.length - 1 ? 'disabled' : ''}>Next →</button>
    </div>
    <details class="glossary">
      <summary>Glossary</summary>
      <dl>${Object.entries(GLOSSARY)
        .sort((a, b) => a[1][0].localeCompare(b[1][0]))
        .map(([k, [t, d]]) => `<dt id="term-${k}">${esc(t)}</dt><dd>${esc(d)}</dd>`)
        .join('')}</dl>
    </details>`;
}

function wireLearn() {
  $('panel-learn').addEventListener('click', (e) => {
    const nav = e.target.closest('[data-chapter]');
    if (nav && !nav.disabled) {
      const k = Number(nav.dataset.chapter);
      if (k >= 0 && k < CHAPTERS.length) {
        state.chapter = k;
        store.set('chapter', k);
        renderLearn();
        reveal($('panel-learn'));
      }
      return;
    }
    const opt = e.target.closest('[data-option]');
    if (opt) {
      const ch = CHAPTERS[state.chapter];
      if (state.answers[ch.id] !== undefined) return;
      state.answers[ch.id] = Number(opt.dataset.option);
      store.set('answers', state.answers);
      renderLearn();
      return;
    }
    const show = e.target.closest('[data-show]');
    if (show) showMe(CHAPTERS[Number(show.dataset.show)]);
  });
}

// ---------------------------------------------------------------- Lab

const SLIDERS = [
  { key: 'cyanoAge', label: 'Cyanobacteria appear', fmt: (v) => (v === 0 ? 'never' : `${v.toFixed(2)} Ga`), restart: true },
  { key: 'reductants', label: 'Reducing gas from volcanoes and hot rock', fmt: (v) => `× ${v.toFixed(2)}` },
  { key: 'ventIron', label: 'Iron from hot springs', fmt: (v) => `× ${v.toFixed(2)}` },
  { key: 'weatheringP', label: 'Phosphate washed in by rivers', fmt: (v) => `× ${v.toFixed(2)}` },
  { key: 'volcanicCO2', label: 'CO₂ from volcanoes', fmt: (v) => `× ${v.toFixed(2)}` },
  { key: 'continents', label: 'Land area', fmt: (v) => `× ${v.toFixed(2)}` },
];
const TOGGLES = [
  { key: 'ferrotrophs', label: 'Iron-eating microbes', note: 'photosynthesisers that make rust, not oxygen' },
  { key: 'events', label: 'Lava floods', note: 'large igneous provinces' },
  { key: 'lull', label: 'Magmatic lull', note: 'quieter volcanoes, 2.45 to 2.2 Ga' },
];
const INJECT = [
  { kind: 'lip', label: 'Flood of lava', note: 'A large igneous province erupts now.' },
  { kind: 'oxygen', label: 'Puff of oxygen', note: 'About 2 % of today’s oxygen, added to the air.' },
  { kind: 'methane', label: 'Burst of methane', note: '1,000 ppm, released at once.' },
  { kind: 'co2', label: 'Add CO₂', note: '0.05 bar, about 50,000 ppm.' },
  { kind: 'freeze', label: 'Freeze the planet', note: 'Ice to the equator. Will it recover?' },
  { kind: 'cyano', label: 'Bring in cyanobacteria', note: 'If they have not appeared yet.' },
];

let labWired = false;
function renderLab() {
  const p = { ...state.defaults, ...(state.scenarios[state.scenario]?.params ?? {}), ...state.labParams };
  const earth = state.seed === 'earth';
  $('panel-lab').innerHTML = `
    <h2>Lab</h2>
    <p class="lede">Change the planet, then run its history again. The same settings and seed always give the same history.</p>
    <h3>Start from</h3>
    <div class="scenarios" role="radiogroup">
      ${Object.entries(state.scenarios)
        .map(
          ([k, s]) => `<button type="button" class="scenario" role="radio" aria-checked="${k === state.scenario}" data-scenario="${k}">
            <b>${esc(s.label)}</b><span>${esc(s.blurb)}</span></button>`,
        )
        .join('')}
    </div>
    <h3>Lava floods</h3>
    <div class="seed-row">
      <button type="button" class="chip" data-seedmode="earth" aria-pressed="${earth}">The real record</button>
      <button type="button" class="chip" data-seedmode="random" aria-pressed="${!earth}">Made up from a seed</button>
      <label class="seed-field" ${earth ? 'hidden' : ''}><span>Seed</span><input id="seed" type="text" inputmode="numeric" value="${earth ? '' : esc(state.seed)}" maxlength="12" autocomplete="off"></label>
      <button type="button" class="btn ghost small" data-newseed ${earth ? 'hidden' : ''}>New seed</button>
    </div>
    <h3>Change the planet</h3>
    <p class="hint">Changes work from now on. Press Restart to run the whole history with them.</p>
    <div class="sliders">
      ${SLIDERS.map((s) => {
        const r = state.ranges[s.key];
        return `<label class="slider"><span class="s-label">${esc(s.label)}</span><output data-out="${s.key}">${esc(s.fmt(p[s.key]))}</output>
          <input type="range" id="lab-${s.key}" data-param="${s.key}" min="${r.min}" max="${r.max}" step="${r.step}" value="${p[s.key]}">
          ${s.restart ? '<span class="s-note">used from the next restart</span>' : ''}</label>`;
      }).join('')}
    </div>
    <div class="toggles">
      ${TOGGLES.map((t) => `<label class="toggle"><input type="checkbox" id="lab-${t.key}" data-param="${t.key}" ${p[t.key] ? 'checked' : ''}><span><b>${esc(t.label)}</b> ${esc(t.note)}</span></label>`).join('')}
    </div>
    <div class="lab-actions">
      <button type="button" class="btn primary" data-labrestart>Restart with these settings</button>
      <button type="button" class="btn ghost" data-labreset>Back to the defaults</button>
    </div>
    <h3>Do something now</h3>
    <div class="injects">
      ${INJECT.map((x) => `<button type="button" class="inject" data-inject="${x.kind}"><b>${esc(x.label)}</b><span>${esc(x.note)}</span></button>`).join('')}
    </div>`;
  if (!labWired) wireLab();
}

function syncLabControls() {
  if (state.ready) renderLab();
}

function wireLab() {
  labWired = true;
  const panel = $('panel-lab');
  panel.addEventListener('click', (e) => {
    const sc = e.target.closest('[data-scenario]');
    if (sc) {
      state.show = null;
      startRun({ scenario: sc.dataset.scenario, params: {}, then: () => toast(`${state.scenarios[sc.dataset.scenario].label}: press Play`) });
      return;
    }
    const sm = e.target.closest('[data-seedmode]');
    if (sm) {
      const seed = sm.dataset.seedmode === 'earth' ? 'earth' : String(Math.floor(1000 + Math.random() * 9000));
      startRun({ seed });
      return;
    }
    if (e.target.closest('[data-newseed]')) {
      startRun({ seed: String(Math.floor(1000 + Math.random() * 9000)) });
      return;
    }
    if (e.target.closest('[data-labrestart]')) {
      startRun();
      return;
    }
    if (e.target.closest('[data-labreset]')) {
      startRun({ params: {} });
      return;
    }
    const inj = e.target.closest('[data-inject]');
    if (inj) {
      host.send({ type: 'inject', kind: inj.dataset.inject });
      state.custom = true;
      reveal($('stage'));
    }
  });
  panel.addEventListener('input', (e) => {
    const el = e.target;
    if (!el.dataset.param || el.type !== 'range') return;
    const s = SLIDERS.find((x) => x.key === el.dataset.param);
    const v = Number(el.value);
    panel.querySelector(`[data-out="${s.key}"]`).textContent = s.fmt(v);
  });
  panel.addEventListener('change', (e) => {
    const el = e.target;
    if (el.id === 'seed') {
      const seed = el.value.trim();
      if (seed) startRun({ seed });
      return;
    }
    const key = el.dataset.param;
    if (!key) return;
    const v = el.type === 'checkbox' ? el.checked : Number(el.value);
    state.labParams[key] = v;
    const s = SLIDERS.find((x) => x.key === key);
    if (!s?.restart) {
      host.send({ type: 'set', patch: { [key]: v } });
      state.custom = true;
    }
  });
}

// ---------------------------------------------------------------- Validation

function renderCheck() {
  const res = state.checkView === 'run' && state.done ? evaluate(state.points) : state.validation ?? BUILT;
  const fromBuild = !state.validation && state.checkView !== 'run';
  const canScore = state.done && state.points.length > 10;
  const checks = res
    ? res.checks
        .map(
          (c) => `<li class="check ${c.pass ? 'pass' : 'miss'}">
          <div class="check-head"><span class="badge">${c.pass ? 'Match' : 'Miss'}</span><span class="check-what">${esc(c.what)}</span></div>
          <dl><dt>Model</dt><dd>${esc(c.model)}</dd><dt>Rocks</dt><dd>${esc(c.real)}</dd></dl>
          ${!c.pass && c.why ? `<p class="why">${esc(c.why)}</p>` : ''}
          <p class="source">${esc(c.source)}</p></li>`,
        )
        .join('')
    : '<li class="check">Press the button to run the check.</li>';
  $('panel-check').innerHTML = `
    <h2>Validation</h2>
    <p class="lede">The model run from 3.0 to 1.8 billion years ago, set beside what the rocks record. Every check is fixed in advance; the misses are shown, not tuned away.</p>
    <div class="check-tabs" role="radiogroup">
      <button type="button" class="chip" data-checkview="model" aria-pressed="${state.checkView !== 'run'}">Real-Earth model</button>
      <button type="button" class="chip" data-checkview="run" aria-pressed="${state.checkView === 'run'}" ${canScore ? '' : 'disabled'}>Your run${canScore ? '' : ' (finish it first)'}</button>
    </div>
    ${res ? `<p class="score"><b>${res.passed}</b> of ${res.total} checks match the rocks</p>` : ''}
    <div class="check-run" ${state.checkView === 'run' ? 'hidden' : ''}>
      <span class="hint">${fromBuild ? 'Computed when this page was built.' : 'Computed just now, in your browser.'}</span>
      <button type="button" class="btn ghost small" data-validate>Run it again here</button>
      <span class="progress" id="check-progress" hidden><span></span></span>
    </div>
    <ol class="checks">${checks}</ol>
    <h3>About the model</h3>
    ${ABOUT_MODEL.map((p) => `<p>${esc(p)}</p>`).join('')}`;
}

function wireCheck() {
  $('panel-check').addEventListener('click', async (e) => {
    const v = e.target.closest('[data-checkview]');
    if (v && !v.disabled) {
      state.checkView = v.dataset.checkview;
      renderCheck();
      return;
    }
    const run = e.target.closest('[data-validate]');
    if (run && !run.disabled) {
      run.disabled = true;
      run.textContent = 'Running…';
      const bar = $('check-progress');
      bar.hidden = false;
      try {
        state.validation = await host.validate((p) => {
          const b = $('check-progress');
          if (b) b.firstElementChild.style.width = `${Math.round((100 * p.step) / p.total)}%`;
        });
      } catch (err) {
        showError(String(err.message ?? err));
      }
      renderCheck();
    }
  });
}

// ---------------------------------------------------------------- the sheet

function openSheet(html) {
  $('sheet-body').innerHTML = html;
  $('sheet').hidden = false;
  $('sheet-backdrop').hidden = false;
  $('sheet-close').focus({ preventScroll: true });
}

function closeSheet() {
  $('sheet').hidden = true;
  $('sheet-backdrop').hidden = true;
}

function explainSheet(key, at) {
  const h = at !== undefined ? state.points.find((p) => Math.abs(p.age - at) < 1e-6) ?? last() : last();
  if (!h) return;
  const ex = explain(key, h);
  if (!ex) return;
  openSheet(`
    <p class="kicker">${at !== undefined ? `At ${fmt.age(h.age)}` : `Now, ${fmt.age(h.age)}`} billion years ago</p>
    <h2>${esc(ex.title)}</h2>
    <p class="sheet-value">${ex.value}</p>
    ${ex.html
      .filter(Boolean)
      .map((p) => `<p>${p}</p>`)
      .join('')}
    ${ex.chart ? `<button type="button" class="btn ghost small" data-gochart="${ex.chart}">See it on the charts</button>` : ''}`);
}

function termSheet(key) {
  const g = GLOSSARY[key];
  if (!g) return;
  openSheet(`<p class="kicker">Glossary</p><h2>${esc(g[0])}</h2><p>${esc(g[1])}</p>`);
}

function wireGlobal() {
  document.addEventListener('click', (e) => {
    const t = e.target.closest('.term[data-term]');
    if (t) {
      termSheet(t.dataset.term);
      return;
    }
    const n = e.target.closest('[data-explain]');
    if (n) {
      explainSheet(n.dataset.explain, n.dataset.age !== undefined ? Number(n.dataset.age) : undefined);
      return;
    }
    const go = e.target.closest('[data-gochart]');
    if (go) {
      closeSheet();
      focusCharts();
      return;
    }
    const ev = e.target.closest('#events li');
    if (ev) {
      state.cursor = Number(ev.dataset.age);
      state.chartsDirty = true;
      reveal($('charts'), 'center');
    }
  });
  $('sheet-close').addEventListener('click', closeSheet);
  $('sheet-backdrop').addEventListener('click', closeSheet);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('sheet').hidden) closeSheet();
  });
  $('scene-help').addEventListener('click', () =>
    openSheet(`<p class="kicker">The picture</p><h2>How to read it</h2>${PICTURE_HELP.map((p) => `<p>${esc(p)}</p>`).join('')}`),
  );
  $('tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (b) {
      if (b.dataset.tab !== 'watch') state.fromLesson = false;
      setTab(b.dataset.tab);
    }
  });
  $('tabs').addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const tabs = [...document.querySelectorAll('[data-tab]')].filter((b) => b.offsetParent !== null);
    const i = tabs.findIndex((b) => b.dataset.tab === state.tab);
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    setTab(next.dataset.tab);
    next.focus();
  });
  $('back-to-lesson').addEventListener('click', () => {
    state.fromLesson = false;
    setTab('learn');
    reveal($('panel-learn'));
  });
}

// ---------------------------------------------------------------- the loop

function tick(now) {
  scene.draw(now);
  if (state.dirty) {
    state.dirty = false;
    updateBar();
    updateReadouts();
  }
  updateNarrator(now);
  if (state.chartsDirty && (now - state.lastCharts > 150 || !state.running)) drawCharts(now);
  requestAnimationFrame(tick);
}

function boot() {
  renderBar();
  renderLayers();
  renderReadouts();
  renderLearn();
  wireLearn();
  wireCheck();
  wireCharts();
  wireGlobal();
  renderCheck();
  scene.setLayer(state.layer);
  placePanels();
  WIDE.addEventListener?.('change', placePanels);
  const bar = $('bar');
  const barSize = () => document.documentElement.style.setProperty('--bar-h', `${bar.offsetHeight}px`);
  new ResizeObserver(barSize).observe(bar);
  barSize();
  const ro = new ResizeObserver(() => sizeCanvases());
  ro.observe($('scene'));
  ro.observe($('charts'));
  const theme = window.matchMedia('(prefers-color-scheme: dark)');
  theme.addEventListener?.('change', () => {
    colors = null;
    state.chartsDirty = true;
  });
  new MutationObserver(() => {
    colors = null;
    state.chartsDirty = true;
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
  host = createHost(onSim);
  window.__goe = { state, host };
  resumeOnUpdate();
  requestAnimationFrame(tick);
}

// When a new version of the page is published while it is open, carry on
// from where the reader was. The same seed and settings always give the
// same history, so running back to the same age restores the run (Lab
// buttons pressed along the way are not replayed).
function resumeOnUpdate() {
  const hot = window.claude?.hot;
  let started = false;
  const start = (data) => {
    if (started) return;
    started = true;
    const d = data && typeof data === 'object' ? data : {};
    const at = Number(d.age);
    startRun({
      seed: typeof d.seed === 'string' && d.seed ? d.seed : 'earth',
      scenario: typeof d.scenario === 'string' ? d.scenario : 'real',
      params: d.params && typeof d.params === 'object' ? d.params : {},
      then: Number.isFinite(at) && at < state.start - 1e-9 ? () => runTo(at) : null,
    });
  };
  try {
    hot?.snapshot?.(() => ({ seed: state.seed, scenario: state.scenario, params: { ...state.labParams }, age: age() }));
    if (hot?.ready) {
      hot.ready(start);
      setTimeout(() => start({}), 1500);
    } else start(hot?.data ?? {});
  } catch {
    start({});
  }
}

boot();
