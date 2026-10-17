// The Validation tab: run the real-Earth default to the end and set what it
// did beside what the rocks say happened. The same checks run in the
// headless long-run test.

import { Engine } from '../sim/engine.js';
import { K } from '../sim/params.js';

export const breathe = () => new Promise((resolve) => setTimeout(resolve, 0));

export async function runValidation(onProgress, { seed = 'earth', scenario = 'real' } = {}) {
  const e = new Engine({ seed, scenario });
  const total = Math.round(((K.startAge - K.endAge) * 1000) / K.stepMyr);
  let t = Date.now();
  while (!e.done) {
    e.run(1);
    if (Date.now() - t > 40) {
      if (onProgress) onProgress({ step: e.step, total, age: e.age });
      await breathe();
      t = Date.now();
    }
  }
  return evaluate(e.history, e.log);
}

const ga = (x) => (x === null || x === undefined ? 'never' : `${x.toFixed(2)} Ga`);
const sci = (x) => {
  if (x === 0) return '0';
  const p = Math.floor(Math.log10(Math.abs(x)));
  if (p >= -2 && p < 4) return x.toPrecision(2);
  return `${(x / 10 ** p).toFixed(1)}×10${sup(p)}`;
};
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const sup = (n) => String(n).replace(/./g, (c) => SUP[c] ?? c);

export function evaluate(H) {
  const at = (a) => H.reduce((b, h) => (Math.abs(h.age - a) < Math.abs(b.age - a) ? h : b));
  const win = (a, b) => H.filter((h) => h.age <= a && h.age >= b);
  const mean = (arr, k) => arr.reduce((s, h) => s + h[k], 0) / Math.max(1, arr.length);
  const first = H.find((h) => h.pal > 1e-5);
  const goe = first ? first.age : null;
  let lastMif = null;
  for (const h of H) if (h.mif > 0.5) lastMif = h;
  const mifEnd = lastMif && lastMif !== H[H.length - 1] ? lastMif.age : null;
  const peak = H.reduce((b, h) => (h.bifOx > b.bifOx ? h : b));
  const hur = win(2.45, 2.22).reduce((b, h) => (h.iceLat < b.iceLat ? h : b), { iceLat: 90, age: null });
  const late = win(2.15, 1.8).reduce((b, h) => (h.iceLat < b.iceLat ? h : b), { iceLat: 90, age: null });
  const base = mean(win(2.8, 2.5), 'd13C');
  const lomPeak = win(2.25, 2.0).reduce((b, h) => (h.d13C > b.d13C ? h : b), { d13C: -99, age: null });
  const bifBefore = mean(win(2.6, Math.max(goe ?? 2.47, 2.47)), 'bifOx');
  const bifAfter = mean(win(2.2, 1.9), 'bifOx');
  const h27 = at(2.7);
  const h20 = at(2.0);

  const checks = [
    {
      id: 'goe',
      what: 'Oxygen first rises above 1/100,000 of today’s level',
      model: ga(goe),
      real: 'about 2.43 Ga (accept 2.50 to 2.30)',
      pass: goe !== null && goe <= 2.5 && goe >= 2.3,
      source: 'Gumsley et al. 2017; Warke et al. 2020',
    },
    {
      id: 'mif',
      what: 'Sulfur isotopes lose their mass-independent signal for good',
      model: ga(mifEnd),
      real: 'about 2.22 to 2.33 Ga (accept 2.35 to 2.20)',
      pass: mifEnd !== null && mifEnd <= 2.35 && mifEnd >= 2.2,
      source: 'Luo et al. 2016; Poulton et al. 2021',
    },
    {
      id: 'methane',
      what: 'Methane in the air at 2.7 Ga',
      model: `${sci(h27.ch4)} ppm`,
      real: 'tens to hundreds of ppm (accept 20 to 3,000)',
      pass: h27.ch4 >= 20 && h27.ch4 <= 3000,
      source: 'Pavlov et al. 2000; Haqq-Misra et al. 2008',
    },
    {
      id: 'warm',
      what: 'Mean surface temperature at 2.7 Ga, under a fainter Sun',
      model: `${h27.T.toFixed(1)} °C`,
      real: 'liquid oceans, no ice near the equator (accept 0 to 40 °C)',
      pass: h27.T >= 0 && h27.T <= 40,
      source: 'Feulner 2012 (the faint young Sun problem)',
    },
    {
      id: 'bif',
      what: 'Oxide banded iron is laid down fastest before oxygen rises',
      model: `peak at ${ga(peak.age)}`,
      real: 'big pulses near 2.7 and 2.5 Ga, before oxygen rose',
      pass: goe !== null && peak.age > goe,
      source: 'Bekker et al. 2010',
    },
    {
      id: 'huronian',
      what: 'Ice reaches below 35° latitude (or the equator) between 2.45 and 2.22 Ga',
      model: hur.age === null ? 'no' : hur.iceLat < 5 ? `Snowball at ${ga(hur.age)}` : `ice to ${hur.iceLat.toFixed(0)}° at ${ga(hur.age)}`,
      real: 'Makganyene and Huronian glaciations, 2.43 to 2.29 Ga, some near the equator',
      pass: hur.age !== null && hur.iceLat < 35,
      source: 'Evans et al. 1997; Gumsley et al. 2017',
    },
    {
      id: 'warmAfter',
      what: 'No ice age from 2.15 to 1.8 Ga (ice stays poleward of 40°)',
      model: late.age === null ? '-' : `ice line at least ${late.iceLat.toFixed(0)}°`,
      real: 'no glacial deposits for over a billion years after 2.2 Ga',
      pass: late.iceLat >= 40,
      source: 'Hoffman 2013',
    },
    {
      id: 'o2Later',
      what: 'Oxygen in the air at 2.0 Ga',
      model: `${sci(h20.pal * 100)} % of today`,
      real: 'about 0.1 to 10 % of today (accept 0.1 to 40 %)',
      pass: h20.pal >= 1e-3 && h20.pal <= 0.4,
      source: 'Kump 2008; Planavsky et al. 2014',
    },
    {
      id: 'deep',
      what: 'The deep sea still has no oxygen at 2.0 Ga',
      model: `${h20.deepO2.toFixed(2)} µM of O₂, ${h20.deepFe.toFixed(0)} µM of iron below 500 m`,
      real: 'deep water stayed iron-rich or sulfidic',
      pass: h20.deepO2 < 1,
      source: 'Poulton & Canfield 2011',
    },
    {
      id: 'lomagundi',
      what: 'Carbonate δ¹³C climbs 5 ‰ above its Archean level between 2.25 and 2.0 Ga',
      model: lomPeak.age === null ? '-' : `+${(lomPeak.d13C - base).toFixed(1)} ‰ at ${ga(lomPeak.age)}`,
      real: '+8 to +12 ‰ (the Lomagundi event, 2.22 to 2.06 Ga)',
      pass: lomPeak.d13C - base >= 5,
      source: 'Karhu & Holland 1996; Bekker 2022',
      why: 'In the model the burst of phosphate from weathering long-buried sulfide rock comes right after the first rise of oxygen and is small, so carbon isotopes rise only a little, and too early. What drove the real shift of about +10 ‰ is still debated.',
    },
    {
      id: 'bifGap',
      what: 'Banded iron fades after oxygen rises (2.2 to 1.9 Ga under half of 2.6 Ga onward)',
      model: `${bifBefore > 0 ? Math.round((100 * bifAfter) / bifBefore) : 0} % of the earlier rate`,
      real: 'almost none from 2.4 until 1.9 Ga',
      pass: bifAfter < 0.5 * bifBefore,
      source: 'Bekker et al. 2010',
      why: 'Vents keep feeding iron into the model’s deep sea, and rust keeps forming where it meets oxygen near the surface. In the real ocean the deep water may have turned sulfidic, trapping the iron as pyrite; this model makes too little sulfate for that.',
    },
  ];
  return { checks, passed: checks.filter((c) => c.pass).length, total: checks.length };
}
