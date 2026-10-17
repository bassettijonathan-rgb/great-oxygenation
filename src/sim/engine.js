// The coupled planet: the slow forcings (a fainter Sun, a hotter mantle,
// continents rising out of the sea), the air, the climate, the ocean slice,
// and the carbon and sulfur cycles that tie them together. One step is half
// a million years; a run goes from 3.0 to 1.8 billion years ago. Runs the
// same in a Web Worker, on the main thread and in Node.

import { Rng } from './rng.js';
import { Ocean } from './ocean.js';
import { Climate, CLIMATE, greenhouse, hazeAmount } from './climate.js';
import { AIR, stepAir, ozoneColumn } from './atmosphere.js';
import { sunLuminosity, heatFlow, landArea, subaerialShare, magmaticLull } from './forcing.js';
import { DEFAULTS, SCENARIOS, K } from './params.js';

const HF0 = heatFlow(K.startAge);
const FAST = ['CH4', 'O2'];
const OXIC = 1e-5 * AIR.PAL; // above this the ozone layer shields the air
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
// Large igneous provinces of the real record (Ernst & Youbi 2017; Gumsley
// et al. 2017), used for the default seed; any other seed draws its own.
export const REAL_LIPS = [
  { age: 2.775, size: 1.2, name: 'Mount Roe (Fortescue)' },
  { age: 2.72, size: 1.0, name: 'Ventersdorp' },
  { age: 2.575, size: 0.8, name: 'Great Dyke' },
  { age: 2.505, size: 0.8, name: 'Mistassini' },
  { age: 2.46, size: 1.4, name: 'Matachewan' },
  { age: 2.426, size: 1.4, name: 'Ongeluk' },
  { age: 2.41, size: 0.8, name: 'Widgiemooltha' },
  { age: 2.367, size: 0.7, name: 'Bangalore' },
  { age: 2.217, size: 1.2, name: 'Nipissing' },
  { age: 2.11, size: 0.8, name: 'Marathon' },
  { age: 2.055, size: 1.4, name: 'Bushveld' },
  { age: 1.98, size: 0.8, name: 'Jatulian' },
  { age: 1.88, size: 1.6, name: 'Circum-Superior' },
];

export function makeLips(seed) {
  if (seed === 'earth') return REAL_LIPS.map((e) => ({ ...e }));
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
    this.climate = new Climate();
    this.climateStart = new Float64Array(this.climate.n);
    this.climateMid = new Float64Array(this.climate.n);
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
    this.backlog = K.backlog0;
    this.slope = { CH4: 0, O2: 0 }; // how the coupled loop answers a change in the guess
    this.history = [];
    this.core = [];
    this.log = [];
    this.flags = { cyano: false, goe: false, snowball: false, lastThaw: -1, lull: false, glacial: false, methaneLow: false };
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
    const lull = p.lull ? magmaticLull(age) : 0;
    return {
      lum: sunLuminosity(age),
      hf,
      land,
      sub,
      lull,
      quiet: 1 - K.lullDepth * lull, // volcanoes and ridges, × usual
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
    const V = K.volcCO2 * p.volcanicCO2 * f.hf * f.quiet * (1 + 0.15 * ev.pulse);
    const Svolc = K.volcS * f.hf * f.quiet * (1 + 0.3 * ev.pulse);
    const air0 = { O2: this.air.O2, CH4: this.air.CH4 };
    const so40 = Math.max(this.SO4, 1e-4);
    const T0 = this.climateStart;
    T0.set(cl.T);
    const env = {
      pO2: 0,
      pCH4: 0,
      SO4: so40,
      ventFe: K.ventFe * p.ventIron * f.hf * f.hf * f.quiet * (1 + 0.3 * ev.pulse),
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
    const evaluate = (g, settleClimate) => {
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
      // old sulfides weathering in oxygen (FeS₂/yr if the guess is right)
      const backlogFull = K.backlogRate * this.backlog * f.land * open;
      const backlogNow = (backlogFull * pal) / (pal + K.backlogHalf);
      env.riverP =
        p.weatheringP *
        (K.riverP *
          ((2 / 12) * (W / K.riverPRef) + (5 / 12) * (Wcarb / K.carbWeathK) + (5 / 12) * K.oxidativeP * f.land * open * Math.sqrt(pal)) +
          K.backlogP * backlogNow);
      const anoxicLand = 1 - smooth01((Math.log10(Math.max(pal, 1e-12)) + 5) / 2);
      env.riverFe = K.riverFe * f.land * open * (W / K.riverPRef) * anoxicLand;
      const haze = hazeAmount(env.pCH4, pc);
      env.lightFactor = 1 - 0.3 * haze;
      env.iceFrac = ice;
      env.tempFactor = clamp(2 ** ((tFree - 15) / 10), 0.25, 3);
      // the sea starts from where the last guess left it
      const oc = this.ocean.solve(env, dt);
      const inp = {
        shield: p.ozoneShield,
        escapeOn: p.hydrogenEscape,
        reductant: Rv,
        methanogens: clamp(open / 0.1, 0, 1), // only a sea frozen almost to the equator keeps H₂ from them
        weathering: oxWeath,
        backlog: 3.75 * backlogFull,
        backlogHalf: K.backlogHalf * AIR.PAL,
        ...seaFlux('O2', oc.o2ToAir, oc.o2Slope, env.pO2),
        ...seaFlux('CH4', oc.ch4ToAir, oc.ch4Slope, env.pCH4),
      };
      const air = { O2: air0.O2, CH4: air0.CH4 };
      const ar = stepAir(air, inp, dt);
      // sulfate: from volcanoes and from pyrite weathered in oxygen; removed
      // as pyrite in the sea and as gypsum where seawater dries up
      const Spyr = (K.pyriteShare * ar.weath) / 2.25 + (2 * ar.weathB) / 3.75;
      const sg = Math.max(g.SO4, 1e-4);
      const evap = K.evapK * f.land * (sg / 28000) ** 2;
      const dPyr = (oc.pyrite / sg) * (400 / (400 + sg));
      const dEvap = (2 * evap) / sg;
      const pyrAt0 = oc.pyrite + dPyr * (so40 - sg);
      const evapAt0 = evap + dEvap * (so40 - sg);
      const SO4 = Math.max(1e-4, so40 + (dt * (Svolc + Spyr - pyrAt0 - evapAt0)) / (MOL_PER_UM + dt * (dPyr + dEvap)));
      return { O2: air.O2, CH4: air.CH4, SO4, oc, ar, W, Wsf, Wcarb, ice, tFree, haze, Spyr, evap };
    };
    // ---- Solve the fast parts together. The unknowns are the methane and
    // oxygen the air ends the step with (sulfate follows along). Each guess
    // sets the climate, the rivers and the sea; the air then runs through
    // the step with the fluxes they give. Most steps agree at once. Near a
    // tipping point the loop is steep (more methane → warmer → more
    // phosphorus → more oxygen → less methane), so each unknown moves by
    // Newton's method, using the slope seen in earlier guesses and kept from
    // step to step, inside the range where its answer changes sign.
    const L = Math.log10;
    const slope = this.slope;
    const tolOf = (k, g) => (k === 'O2' ? 0.02 : g.CH4 > 1e-6 * AIR.moles ? 0.01 : 0.05);
    const miss = (g, r) => {
      let worst = Math.abs(L(r.SO4 / g.SO4)) / 0.02;
      for (const k of FAST) worst = Math.max(worst, Math.abs(L(r[k] / g[k])) / tolOf(k, g));
      return worst; // ≤ 1: the guess and the answer agree
    };
    const ice0 = cl.iceFrac;
    let g = { O2: air0.O2, CH4: air0.CH4, SO4: so40 };
    let r = evaluate(g, false);
    let err = miss(g, r);
    const tried = [{ g, r, err }];
    const lo = { CH4: -Infinity, O2: -Infinity }; // highest guess whose answer came out higher
    const hi = { CH4: Infinity, O2: Infinity }; // lowest guess whose answer came out lower
    while (err > 1 && tried.length < 10) {
      const next = { SO4: r.SO4 };
      for (const k of FAST) {
        const s = L(g[k]);
        const F = L(r[k]) - s;
        if (k === 'O2' && g.O2 > OXIC !== r.O2 > OXIC) {
          // the air crossed the oxygen switch: let it lead
          next.O2 = r.O2;
          lo.O2 = -Infinity;
          hi.O2 = Infinity;
          continue;
        }
        if (F > 0) lo[k] = Math.max(lo[k], s);
        else hi[k] = Math.min(hi[k], s);
        if (lo[k] >= hi[k]) {
          lo[k] = -Infinity;
          hi[k] = Infinity;
        }
        let sn = s + clamp(-F / (slope[k] - 1), -0.7, 0.7);
        if ((sn <= lo[k] || sn >= hi[k]) && isFinite(lo[k]) && isFinite(hi[k])) sn = 0.5 * (lo[k] + hi[k]);
        next[k] = 10 ** sn;
      }
      const prev = { g, r };
      g = next;
      r = evaluate(g, true);
      err = miss(g, r);
      tried.push({ g, r, err });
      if (this.debug) this.debug(tried.length, g, r, err, slope);
      for (const k of FAST) {
        const ds = L(g[k] / prev.g[k]);
        if (Math.abs(ds) > 1e-3) slope[k] = clamp(L(r[k] / prev.r[k]) / ds, -60, 0.9);
      }
    }
    this.coupleIters = tried.length;
    if (err > 1) {
      // No agreement: the step sits on an edge. Where the climate itself
      // jumps (into or out of a snowball) the jump wins, as it would in the
      // real world; otherwise take the closest guess.
      const jumped = tried.filter((t) => t.r.ice > 0.9 !== ice0 > 0.9);
      const pick = (jumped.length ? jumped : tried).reduce((a, b) => (b.err < a.err ? b : a));
      if (pick.r !== r) r = evaluate(pick.g, true);
    }
    const { oc, ar, W, Wsf, Wcarb, haze, tFree, Spyr, evap } = r;
    this.air.O2 = r.O2;
    this.air.CH4 = r.CH4;
    this.SO4 = r.SO4;
    if (!spin) {
      this.crustOx += (2 * ar.esc - ar.escO2 + ar.volcH2) * dt;
      this.backlog = Math.max(0, this.backlog - (ar.weathB / 3.75) * dt);
    }

    // ---- carbon: volcanoes and burning old organic matter add CO₂;
    // weathering of rock and burial of organic matter take it out. The CO₂
    // at the end of the step is found with the climate settling for each
    // guess: a warm planet weathers fast, and as CO₂ falls it cools and
    // weathers slower. Leaving that out lets a hot planet just out of a
    // snowball pull its CO₂ far below balance in one step.
    const open = 1 - r.ice;
    const Worg = K.kerogenShare * ar.weath;
    let cap = K.carbonCap * (1 + K.oceanCarbon * open);
    if (spin) cap *= 0.05;
    const ch4ppm = (this.air.CH4 / AIR.moles) * 1e6;
    const Tc = this.climateMid;
    Tc.set(cl.T);
    const settleAt = (q) => {
      cl.restore(Tc);
      cl.settle(f.lum, greenhouse(q, ch4ppm, this.air.CH4 / AIR.moles));
    };
    const resid = (u) => {
      const q = Math.exp(u);
      settleAt(q);
      const tf = freeTemp(cl);
      const w = K.weathK * f.land * basalt * (q / K.pRef) ** K.weathCO2 * Math.exp((tf - K.weathT0) / K.weathTe) * (1 - cl.iceFrac);
      const wsf = K.seafloorK * f.hf * (q / K.pRef) ** K.seafloorCO2;
      return q - pc - (dt * (V + Worg - oc.orgBur - w - wsf)) / cap;
    };
    this.pCO2 = solveRising(resid, Math.log(pc), Math.log(1e-5), Math.log(10));

    // ---- climate for the new air
    const F = greenhouse(this.pCO2, ch4ppm, this.air.CH4 / AIR.moles);
    settleAt(this.pCO2);
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
      lull: n.f.lull,
      crust: n.crustFactor,
      backlog: this.backlog / K.backlog0,
      weathB: n.ar.weathB,
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
    const span = K.stepMyr / 1000;
    for (const e of this.lips) {
      if (e.age <= h.age || e.age > h.age + span) continue;
      const what = e.name ? `the ${e.name} large igneous province` : 'a large igneous province';
      const more = fl.lips ? '' : ' For a million years it breathes out CO₂ and reducing gas; then its fresh basalt weathers fast and draws CO₂ down.';
      fl.lips = (fl.lips ?? 0) + 1;
      this.note('volcano', `Lava floods out: ${what}.${more}`);
    }
    if (!fl.lull && h.lull > 0.5) {
      fl.lull = true;
      this.note('volcano', 'Volcanoes and mid-ocean ridges go quiet (the magmatic lull): less CO₂ and less iron come out of the Earth.');
    } else if (fl.lull && h.lull < 0.5) {
      fl.lull = false;
      this.note('volcano', 'Volcanoes wake up again: more CO₂ warms the planet.');
    }
    if (fl.cyano && !fl.goe && !fl.methaneLow && h.ch4 < 10) {
      fl.methaneLow = true;
      this.note('air', 'Methane has fallen below 10 ppm: the methane greenhouse is fading and the planet is cooling.');
    }
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
      fl.glacial = true;
      this.note('ice', 'Ice reaches the equator: a Snowball Earth.');
    } else if (!frozen && fl.snowball && h.iceLat > 30) {
      fl.snowball = false;
      fl.glacial = h.iceLat < 45;
      fl.lastThaw = this.step;
      this.note('ice', 'The snowball melts: volcanic CO₂ has built up enough greenhouse to break the ice.');
    }
    if (!fl.glacial && h.iceLat < 40) {
      fl.glacial = true;
      this.note('ice', 'Ice sheets spread to the middle latitudes: an ice age.');
    } else if (fl.glacial && h.iceLat > 45) {
      fl.glacial = false;
      this.note('ice', 'The ice retreats towards the poles.');
    }
  }

  // The shape of the ocean slice, sent once to whoever draws it.
  geometry() {
    const oc = this.ocean;
    return {
      NX: oc.NX,
      NZ: oc.NZ,
      dx: oc.dx,
      zi: Array.from(oc.zi),
      floor: Array.from(oc.floor),
      kb: Array.from(oc.kb),
      water: Array.from(oc.water),
      bands: this.climate.n,
      lips: this.lips.map((e) => ({ ...e })),
    };
  }

  // Everything the page draws for the present moment (fields as float32).
  frame() {
    const oc = this.ocean;
    const d = oc.diag;
    const f32 = (a) => Float32Array.from(a);
    return {
      step: this.step,
      age: this.age,
      done: this.done,
      O2: f32(oc.O2),
      Fe: f32(oc.Fe),
      P: f32(oc.P),
      CH4: f32(oc.M),
      H2S: f32(oc.H),
      prod: f32(d.prodCyano),
      ferro: f32(d.prodFerro),
      rust: f32(d.rust),
      open: f32(oc.openW),
      T: f32(this.climate.T),
      iceLat: this.climate.iceLat,
      dust: this.climate.dust,
    };
  }

  historySince(step) {
    let i = this.history.length;
    while (i > 0 && this.history[i - 1].step > step) i--;
    return this.history.slice(i);
  }
}

// The sea's flux of a gas to the air, as a straight line in its partial
// pressure through the value at the guess. Where the sea takes up more of
// the gas than the line allows, it becomes a pure uptake that falls to zero
// with the gas: an empty sky gives the sea nothing to take.
function seaFlux(gas, flux, slope, p) {
  const at0 = flux + slope * p;
  if (at0 >= 0 || p <= 0) return { [`ocean${gas}`]: Math.max(0, at0), [`ocean${gas}Slope`]: slope };
  return { [`ocean${gas}`]: 0, [`ocean${gas}Slope`]: -flux / p };
}

// Root of a rising function of u (the log of the unknown) between lo and
// hi, starting the search at u0: widen until the sign changes, then the
// Illinois variant of false position. Returns exp(root); a root beyond the
// range returns the nearest end.
function solveRising(fn, u0, lo, hi) {
  let a = clamp(u0, lo, hi);
  let fa = fn(a);
  if (fa === 0) return Math.exp(a);
  const dir = fa < 0 ? 1 : -1;
  let b = a;
  let fb = fa;
  let width = 0.05;
  while (Math.sign(fb) === Math.sign(fa)) {
    if ((dir > 0 && b >= hi) || (dir < 0 && b <= lo)) return Math.exp(b);
    a = b;
    fa = fb;
    b = clamp(b + dir * width, lo, hi);
    fb = fn(b);
    width *= 2;
  }
  let side = 0;
  for (let i = 0; i < 60 && Math.abs(b - a) > 1e-5; i++) {
    const c = (a * fb - b * fa) / (fb - fa);
    const fc = fn(c);
    if (fc === 0) return Math.exp(c);
    if (Math.sign(fc) === Math.sign(fb)) {
      b = c;
      fb = fc;
      if (side === -1) fa /= 2;
      side = -1;
    } else {
      a = c;
      fa = fc;
      if (side === 1) fb /= 2;
      side = 1;
    }
  }
  return Math.exp(Math.abs(fa) < Math.abs(fb) ? a : b);
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
