// The coupled planet: the slow forcings (a fainter Sun, a hotter mantle,
// continents rising out of the sea), the air, the climate, the ocean slice,
// and the carbon and sulfur cycles that tie them together. One step is half
// a million years; a run goes from 3.0 to 1.8 billion years ago. Runs the
// same in a Web Worker, on the main thread and in Node.

import { Rng } from './rng.js';
import { Ocean } from './ocean.js';
import { Climate, CLIMATE, greenhouse, hazeAmount, forcingCH4, forcingCO2 } from './climate.js';
import { AIR, stepAir, ozoneColumn } from './atmosphere.js';
import { sunLuminosity, heatFlow, landArea, subaerialShare } from './forcing.js';
import { DEFAULTS, SCENARIOS, K } from './params.js';

const HF0 = heatFlow(K.startAge);
const SUB0 = subaerialShare(K.startAge);
const MOL_PER_UM = K.oceanVolume * 1e-3; // mol of a solute per µM over the whole ocean
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth01 = (x) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};

// Large igneous provinces: brief floods of lava that add CO₂, reducing gas
// and vent iron for about a million years, then leave fresh basalt that
// weathers fast (drawing down CO₂, washing in phosphorus) for tens of
// millions. Their ages and sizes come from the seed.
export function makeLips(seed) {
  const rng = new Rng(`${seed}:lips`);
  const list = [];
  let age = K.startAge;
  for (;;) {
    age -= -Math.log(1 - rng.float()) / K.lipRate / 1000;
    if (age < K.endAge) break;
    const u = rng.float();
    list.push({ age, size: 0.4 + 1.2 * u * u });
  }
  return list;
}

function lipEffect(lists, age) {
  let pulse = 0;
  let basalt = 0;
  for (const list of lists) {
    for (const e of list) {
      const t = (e.age - age) * 1000; // Myr since it began
      if (t < 0 || t > 60) continue;
      if (t < 1) pulse += e.size;
      basalt += e.size * Math.exp(-t / 8);
    }
  }
  return { pulse, basalt };
}

// The record a geologist would find in rocks laid down at each step.
export const LITH = {
  carbonate: { label: 'Carbonate platform', color: '#c9c2a8' },
  shale: { label: 'Black shale', color: '#3b3a3f' },
  bifOx: { label: 'Banded iron (oxide)', color: '#a5402c' },
  bifRed: { label: 'Iron formation (siderite, greenalite)', color: '#6e7a52' },
  pyrite: { label: 'Pyritic shale', color: '#8b8455' },
  diamictite: { label: 'Glacial diamictite', color: '#9aa3ad' },
  capCarbonate: { label: 'Cap carbonate', color: '#e2d6b5' },
  evaporite: { label: 'Gypsum (evaporite)', color: '#efe9e1' },
};

export class Engine {
  constructor({ seed = 'earth', scenario = 'real', params = {} } = {}) {
    this.ocean = new Ocean();
    this.oceanStart = this.ocean.saveState();
    this.climate = new Climate();
    this.climateStart = new Float64Array(this.climate.n);
    this.reset({ seed, scenario, params });
  }

  reset({ seed = this.seed, scenario = this.scenario, params = {} } = {}) {
    this.seed = String(seed);
    this.scenario = SCENARIOS[scenario] ? scenario : 'real';
    this.params = { ...DEFAULTS, ...SCENARIOS[this.scenario].params, ...params };
    this.rngRecord = new Rng(`${this.seed}:record`);
    this.lips = makeLips(this.seed);
    this.injected = [];
    this.kicks = { O2: 0, CH4: 0, CO2: 0, cold: 0 };
    this.age = K.startAge;
    this.step = 0;
    this.air = { O2: 1e-13 * AIR.moles, CH4: 5e-4 * AIR.moles };
    this.pCO2 = 0.02;
    this.SO4 = 2;
    this.crustOx = 0;
    this.mifMemory = 1;
    this.history = [];
    this.core = [];
    this.log = [];
    this.flags = { cyano: false, goe: false, snowball: false, lastThaw: -1 };
    this.ocean.reset();
    this.climate.T.fill(20);
    this.climate.dust = 0;
    this.climate.summarise();
    for (let s = 0; s < K.spinUp; s++) this.advance(true);
    this.crustOx = 0;
    this.record();
  }

  setParams(patch) {
    for (const [k, v] of Object.entries(patch)) if (k in DEFAULTS) this.params[k] = v;
  }

  get done() {
    return this.age <= K.endAge + 1e-9;
  }

  run(n = 1) {
    for (let i = 0; i < n && !this.done; i++) {
      this.advance(false);
      this.record();
    }
  }

  // The slow forcings at an age (Ga).
  forcing(age) {
    const p = this.params;
    const hf = heatFlow(age) / HF0;
    const land = clamp(landArea(age) * p.continents, 0.02, 1.5);
    const sub = subaerialShare(age);
    return {
      lum: sunLuminosity(age),
      hf,
      land,
      sub,
      subFactor: (1 - K.subaerialOxidised * sub) / (1 - K.subaerialOxidised * SUB0),
    };
  }

  cyanoAt(age) {
    const a = this.params.cyanoAge;
    return a > 0 ? smooth01((a - age) / K.cyanoSpread) : 0;
  }

  // Lab buttons: things a player can do to the planet right now.
  inject(kind) {
    const pal = this.air.O2 / AIR.PAL;
    switch (kind) {
      case 'lip':
        this.injected.push({ age: this.age, size: 1.6 });
        this.note('lab', 'You set off a flood of lava (a large igneous province).');
        break;
      case 'oxygen':
        this.air.O2 = Math.max(this.air.O2, 0.01 * AIR.PAL) + 0.01 * AIR.PAL;
        this.note('lab', 'You puffed oxygen into the air: about 2 % of today’s level.');
        break;
      case 'methane':
        this.air.CH4 += 1e-3 * AIR.moles;
        this.note('lab', 'You released 1,000 ppm of methane.');
        break;
      case 'co2':
        this.pCO2 += 0.05;
        this.note('lab', 'You added 0.05 bar of CO₂.');
        break;
      case 'freeze':
        this.climate.T.fill(-40);
        this.climate.summarise();
        this.note('lab', 'You froze the planet over.');
        break;
      case 'cyano':
        if (!(this.params.cyanoAge > this.age)) this.params.cyanoAge = this.age + K.cyanoSpread;
        this.note('lab', 'Cyanobacteria arrive.');
        break;
      default:
        break;
    }
    return pal;
  }

  note(kind, text) {
    this.log.push({ age: this.age, step: this.step, kind, text });
  }

  // One step. The slow parts (CO₂ held by the sea and air, the oxidised
  // crust, dust on the ice) move once per step. The fast parts (air, ice,
  // rivers, sulfate, the sea) all settle within centuries to thousands of
  // years, so they are solved together for their joint balance at the end
  // of the step.
  advance(spin) {
    const p = this.params;
    const age = this.age;
    const dt = K.stepMyr * 1e6;
    const f = this.forcing(age);
    const ev = spin || !p.events ? { pulse: 0, basalt: 0 } : lipEffect([this.lips, this.injected], age);
    const cl = this.climate;
    const pc = Math.max(this.pCO2, 1e-6);
    const basalt = 1 + 0.25 * ev.basalt;
    const crustFactor = 1 / (1 + this.crustOx / K.crustHalf);
    const Rv =
      K.reductant *
      p.reductants *
      ((1 - K.metaShare) * f.hf * f.hf * f.subFactor + K.metaShare * f.hf * crustFactor) *
      (1 + 0.2 * ev.pulse);
    const V = K.volcCO2 * p.volcanicCO2 * f.hf * (1 + 0.15 * ev.pulse);
    const Svolc = K.volcS * f.hf * (1 + 0.3 * ev.pulse);
    const air0 = { O2: this.air.O2, CH4: this.air.CH4 };
    const so40 = Math.max(this.SO4, 1e-4);
    const T0 = this.climateStart;
    T0.set(cl.T);
    this.ocean.saveState(this.oceanStart);
    const env = {
      pO2: 0,
      pCH4: 0,
      SO4: so40,
      ventFe: K.ventFe * p.ventIron * f.hf * f.hf * (1 + 0.3 * ev.pulse),
      ventCH4: K.ventCH4 * f.hf,
      riverP: 0,
      riverFe: 0,
      iceFrac: 0,
      tempFactor: 1,
      lightFactor: 1,
      cyano: this.cyanoAt(age),
      ferro: p.ferrotrophs ? 1 : 0,
    };

    // Everything fast, for a guess of the air at the end of the step.
    const evaluate = (g, sweeps, settleClimate) => {
      if (settleClimate) {
        cl.restore(T0);
        cl.settle(f.lum, greenhouse(pc, (g.CH4 / AIR.moles) * 1e6, g.CH4 / AIR.moles));
      }
      const ice = cl.iceFrac;
      const open = 1 - ice;
      const tFree = freeTemp(cl);
      const tFac = Math.exp((tFree - K.weathT0) / K.weathTe);
      const W = K.weathK * f.land * basalt * (pc / K.pRef) ** K.weathCO2 * tFac * open;
      const Wsf = K.seafloorK * f.hf * (pc / K.pRef) ** K.seafloorCO2;
      const Wcarb = K.carbWeathK * f.land * tFac * open;
      const oxWeath = K.oxWeath * f.land * open; // O₂ demand at PAL
      const pal = g.O2 / AIR.PAL;
      env.pO2 = g.O2 / AIR.moles;
      env.pCH4 = g.CH4 / AIR.moles;
      env.SO4 = g.SO4;
      env.riverP =
        K.riverP *
        p.weatheringP *
        ((2 / 12) * (W / K.riverPRef) + (5 / 12) * (Wcarb / K.carbWeathK) + (5 / 12) * K.oxidativeP * f.land * open * Math.sqrt(pal));
      const anoxicLand = 1 - smooth01((Math.log10(Math.max(pal, 1e-12)) + 5) / 2);
      env.riverFe = K.riverFe * f.land * open * (W / K.riverPRef) * anoxicLand;
      const haze = hazeAmount(env.pCH4, pc);
      env.lightFactor = 1 - 0.3 * haze;
      env.iceFrac = ice;
      env.tempFactor = clamp(2 ** ((tFree - 15) / 10), 0.25, 3);
      this.ocean.loadState(this.oceanStart);
      let oc;
      for (let s = 0; s < sweeps; s++) oc = this.ocean.solve(env, dt);
      const inp = {
        shield: p.ozoneShield,
        escapeOn: p.hydrogenEscape,
        reductant: Rv,
        weathering: oxWeath,
        oceanO2: oc.o2ToAir + oc.o2Slope * env.pO2,
        oceanO2Slope: oc.o2Slope,
        oceanCH4: oc.ch4ToAir + oc.ch4Slope * env.pCH4,
        oceanCH4Slope: oc.ch4Slope,
      };
      const air = { O2: air0.O2, CH4: air0.CH4 };
      const ar = stepAir(air, inp, dt);
      // sulfate: from volcanoes and from pyrite weathered in oxygen; removed
      // as pyrite in the sea and as gypsum where seawater dries up
      const Spyr = (K.pyriteShare * ar.weath) / 2.25;
      const sg = Math.max(g.SO4, 1e-4);
      const evap = K.evapK * f.land * (sg / 28000) ** 2;
      const dPyr = (oc.pyrite / sg) * (400 / (400 + sg));
      const dEvap = (2 * evap) / sg;
      const pyrAt0 = oc.pyrite + dPyr * (so40 - sg);
      const evapAt0 = evap + dEvap * (so40 - sg);
      const SO4 = Math.max(1e-4, so40 + (dt * (Svolc + Spyr - pyrAt0 - evapAt0)) / (MOL_PER_UM + dt * (dPyr + dEvap)));
      return { O2: air.O2, CH4: air.CH4, SO4, oc, ar, W, Wsf, Wcarb, ice, tFree, haze, Spyr, evap };
    };
    const gap = (a, b) =>
      Math.max(Math.abs(Math.log10(a.O2 / b.O2)), Math.abs(Math.log10(a.CH4 / b.CH4)), Math.abs(Math.log10(a.SO4 / b.SO4)));

    // Usually the start state is close enough: one ocean solve.
    let guess = { O2: air0.O2, CH4: air0.CH4, SO4: so40 };
    let r = evaluate(guess, 1, false);
    this.coupleIters = 1;
    if (this.debugCouple) this.debugCouple(0, guess, r, env);
    if (gap(r, guess) > 0.3) {
      // Near a tipping point: move the guess part way towards the answer,
      // letting the sea settle for each guess, until the two agree.
      guess = { O2: Math.sqrt(r.O2 * guess.O2), CH4: Math.sqrt(r.CH4 * guess.CH4), SO4: Math.sqrt(r.SO4 * guess.SO4) };
      for (let it = 1; it <= 10; it++) {
        r = evaluate(guess, 4, true);
        this.coupleIters = it + 1;
        if (this.debugCouple) this.debugCouple(it, guess, r, env);
        if (gap(r, guess) < 0.1) break;
        for (const k of ['O2', 'CH4', 'SO4']) guess[k] *= 10 ** clamp(0.5 * Math.log10(r[k] / guess[k]), -1, 1);
      }
    }
    const { oc, ar, W, Wsf, Wcarb, haze, tFree, Spyr, evap } = r;
    this.air.O2 = r.O2;
    this.air.CH4 = r.CH4;
    this.SO4 = r.SO4;
    if (!spin) this.crustOx += (2 * ar.esc - ar.escO2) * dt;

    // ---- carbon: volcanoes and burning old organic matter add CO₂;
    // weathering of rock and burial of organic matter take it out
    const open = 1 - r.ice;
    const Worg = K.kerogenShare * ar.weath;
    const src = V + Worg - W - Wsf - oc.orgBur;
    let cap = K.carbonCap * (1 + K.oceanCarbon * open);
    if (spin) cap *= 0.05;
    const dWdp = (K.weathCO2 * W + K.seafloorCO2 * Wsf) / pc;
    this.pCO2 = Math.max(1e-5, pc + (dt * src) / (cap + dt * dWdp));

    // ---- climate for the new air
    const ch4ppm = (this.air.CH4 / AIR.moles) * 1e6;
    const F = greenhouse(this.pCO2, ch4ppm, this.air.CH4 / AIR.moles);
    cl.settle(f.lum, F);
    if (!spin) cl.weather(dt);

    this.now = { f, ev, W, Wsf, Wcarb, V, Worg, Rv, riverP: env.riverP, riverFe: env.riverFe, env, oc, ar, haze, F, Svolc, Spyr, evap, tFree, crustFactor };
    if (!spin) {
      this.age = Math.max(K.endAge, age - K.stepMyr / 1000);
      this.step++;
    }
  }

  // One point of the history, the rock laid down and anything worth a note.
  record() {
    const n = this.now;
    const oc = n.oc;
    const O = this.air.O2;
    const pal = O / AIR.PAL;
    const lp = Math.log10(Math.max(pal, 1e-14));
    // Mass-independent sulfur fractionation survives only while sunlight
    // splits SO₂ in air with almost no oxygen (Pavlov & Kasting 2002).
    const mif = 1 - smooth01(lp + 6);
    const tau = 15; // Myr: old sulfides keep a faint signal in eroded rock
    this.mifMemory += (mif - this.mifMemory) * (1 - Math.exp(-K.stepMyr / tau));
    const g = gauss(this.rngRecord);
    const d33S = mif * (2 + 2.5 * g) + (1 - mif) * this.mifMemory * (0.6 + 0.4 * g) + 0.08 * gauss(this.rngRecord);
    // carbon isotopes: inputs mixed, organic matter 28 ‰ lighter than carbonate
    const inTot = n.V + n.Wcarb + n.Worg;
    const dIn = (-5 * n.V - 25 * n.Worg) / Math.max(inTot, 1);
    const Bcarb = n.W + n.Wsf + n.Wcarb;
    const fOrg = oc.orgBur / Math.max(oc.orgBur + Bcarb, 1);
    const d13C = dIn + 28 * fOrg + 0.4 * gauss(this.rngRecord);
    const X = oc.o2ToAir - 2 * oc.ch4ToAir;
    const ch4 = (this.air.CH4 / AIR.moles) * 1e6;
    const cl = this.climate;
    const h = {
      step: this.step,
      age: this.age,
      pal,
      ch4,
      co2: this.pCO2,
      T: cl.meanT,
      iceLat: cl.iceLat,
      so4: this.SO4,
      X,
      Rv: n.Rv,
      o2ToAir: oc.o2ToAir,
      ch4ToAir: oc.ch4ToAir,
      orgBur: oc.orgBur,
      bifOx: oc.bifOx,
      bifRed: oc.bifRed,
      pyrite: oc.pyrite,
      prodCyano: oc.prodCyano,
      prodFerro: oc.prodFerro,
      riverP: n.riverP,
      W: n.W,
      weath: n.ar.weath,
      esc: n.ar.esc,
      photo: n.ar.photo,
      deepFe: this.ocean.meanBelow(this.ocean.Fe, 500),
      deepO2: this.ocean.meanBelow(this.ocean.O2, 500),
      surfO2: this.ocean.maxSurface(this.ocean.O2),
      d13C,
      d33S,
      mif,
      fOrg,
      haze: n.haze,
      ozone: ozoneColumn(pal),
      cyano: this.cyanoAt(this.age),
      lip: n.ev.pulse > 0 ? 1 : 0,
      crust: n.crustFactor,
      lith: '',
    };
    h.lith = this.lithology(h);
    this.history.push(h);
    this.layCore(h);
    this.watch(h);
  }

  lithology(h) {
    if (h.iceLat < 40) return 'diamictite';
    if (this.flags.lastThaw >= 0 && this.step - this.flags.lastThaw <= 2) return 'capCarbonate';
    if (h.bifOx > 2e12) return 'bifOx';
    if (h.bifRed > 2e12) return 'bifRed';
    if (h.so4 > 3000) return 'evaporite';
    if (h.pyrite > 1.5e12) return 'pyrite';
    if (h.orgBur > 6e12 && h.deepO2 < 1) return 'shale';
    return 'carbonate';
  }

  layCore(h) {
    const last = this.core[this.core.length - 1];
    if (last && last.lith === h.lith) {
      last.bottom = h.age;
      last.steps++;
    } else {
      this.core.push({ lith: h.lith, top: h.age + K.stepMyr / 1000, bottom: h.age, steps: 1 });
    }
  }

  // Notes for the timeline and the narrator.
  watch(h) {
    const fl = this.flags;
    if (!fl.cyano && h.cyano > 0.5) {
      fl.cyano = true;
      this.note('life', 'Cyanobacteria spread through the sunlit sea, splitting water and giving off oxygen.');
    }
    if (!fl.goe && h.pal > 1e-5) {
      fl.goe = true;
      fl.goeAge = h.age;
      this.note('air', 'Oxygen in the air passes 1/100,000 of today’s level: the Great Oxygenation has begun.');
    }
    if (fl.goe && !fl.mifGone && h.mif < 0.05) {
      fl.mifGone = true;
      this.note('rock', 'Sulfur isotopes stop showing the mass-independent signal: the ozone layer now shields the air.');
    }
    if (fl.mifGone && h.mif > 0.5) {
      fl.mifGone = false;
      this.note('rock', 'The mass-independent sulfur signal is back: the air has lost its oxygen again.');
    }
    const frozen = h.iceLat < 5;
    if (frozen && !fl.snowball) {
      fl.snowball = true;
      this.note('ice', 'Ice reaches the equator: a Snowball Earth.');
    } else if (!frozen && fl.snowball && h.iceLat > 30) {
      fl.snowball = false;
      fl.lastThaw = this.step;
      this.note('ice', 'The snowball melts: volcanic CO₂ has built up enough greenhouse to break the ice.');
    }
  }

  historySince(step) {
    let i = this.history.length;
    while (i > 0 && this.history[i - 1].step > step) i--;
    return this.history.slice(i);
  }
}

// Mean temperature of the ice-free latitude bands: where rain falls on
// bare rock.
function freeTemp(cl) {
  let t = 0;
  let n = 0;
  for (let j = 0; j < cl.n; j++) {
    if (cl.T[j] > CLIMATE.iceAt) {
      t += cl.T[j];
      n++;
    }
  }
  return n ? t / n : CLIMATE.iceAt;
}

function gauss(rng) {
  const u = 1 - rng.float();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng.float());
}
