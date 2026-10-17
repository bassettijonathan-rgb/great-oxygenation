// The air as one well-mixed box of oxygen and methane. The two destroy each
// other in sunlight; how fast depends on the ozone layer, which only forms
// once there is some oxygen. That is the switch behind the Great
// Oxygenation: more oxygen → more ozone → less ultraviolet reaching the
// lower air → oxygen destroyed more slowly → more oxygen.
//
// The photochemistry is the fit of Goldblatt, Lenton & Watson (2006), made
// to a one-dimensional photochemical model (Claire et al. 2006): methane
// oxidation consumes Ψ(O₂)·[CH₄]^0.7 mol O₂ per year, with [O₂] and [CH₄] in
// moles and log Ψ a quartic in log [O₂]. Hydrogen escape to space follows
// the diffusion limit (Catling, Zahnle & McKay 2001).

export const AIR = {
  moles: 1.8e20, // mol of air in 1 bar
  PAL: 3.78e19, // mol O₂ today (0.21 bar)
  escape: 3.7e-5, // per year: fraction of CH₄ whose hydrogen escapes to space
  kOmega: 1e15, // mol O₂: above this, volcanic H₂ burns with O₂ instead of feeding methanogens
  kEscapeO2: 1e14, // mol O₂: below this, escape takes its oxygen from water
};

const A = [0.003, -0.1655, 3.2305, -25.8343, 71.5398];
const polyLog = (phi) => (((A[0] * phi + A[1]) * phi + A[2]) * phi + A[3]) * phi + A[4];
const PHI_LOW = 10.5; // below this the fit is extended as a straight line in log-log
const SLOPE_LOW = (polyLog(PHI_LOW + 0.01) - polyLog(PHI_LOW - 0.01)) / 0.02;

// Where log Ψ peaks: past this point the ozone shield makes oxygen last longer.
export const PHI_PEAK = (() => {
  let best = 12;
  for (let p = 12; p < 18; p += 0.001) if (polyLog(p) > polyLog(best)) best = p;
  return best;
})();
const SLOPE_RISE = (polyLog(PHI_PEAK - 0.5) - polyLog(PHI_PEAK - 1.5)) / 1;

// log10 Ψ for log10 [O₂ in mol]. Without the ozone shield the rising branch
// simply continues: more oxygen keeps destroying methane faster.
export function logPsi(phi, shield = true) {
  if (phi < PHI_LOW) return polyLog(PHI_LOW) + SLOPE_LOW * (phi - PHI_LOW);
  if (!shield && phi > PHI_PEAK - 1) return polyLog(PHI_PEAK - 1) + SLOPE_RISE * (phi - (PHI_PEAK - 1));
  return polyLog(Math.min(phi, 20));
}

export function psi(O, shield = true) {
  return Math.pow(10, logPsi(Math.log10(Math.max(O, 1)), shield));
}

// Rough ozone column relative to today, for drawing and for the narrator.
export function ozoneColumn(pal) {
  if (pal <= 1e-7) return 0;
  const x = Math.log10(pal);
  return Math.min(1, Math.max(0, (x + 6) / 6)) ** 1.6;
}

// Rates (mol/yr) for the current state and inputs; used by the solver and
// reported to the page.
export function airRates(O, M, inp) {
  const Ps = psi(O, inp.shield);
  const photo = Ps * Math.pow(Math.max(M, 0), 0.7); // mol O₂/yr (half as much CH₄)
  const om = O / (O + AIR.kOmega);
  const volcO2 = inp.reductant * om; // mol O₂/yr burned by volcanic gases
  const volcCH4 = 0.5 * inp.reductant * (1 - om); // mol CH₄/yr from H₂ via methanogens
  const esc = inp.escapeOn ? AIR.escape * M : 0; // mol CH₄/yr lost to space
  const escO2 = esc * (O / (O + AIR.kEscapeO2));
  const pal = O / AIR.PAL;
  const weath = inp.weathering * Math.sqrt(Math.max(0, pal)); // mol O₂/yr
  const seaO2 = inp.oceanO2 - inp.oceanO2Slope * (O / AIR.moles);
  const seaCH4 = inp.oceanCH4 - inp.oceanCH4Slope * (M / AIR.moles);
  return {
    photo,
    volcO2,
    volcCH4,
    esc,
    escO2,
    weath,
    seaO2,
    seaCH4,
    dO: seaO2 - volcO2 - photo - escO2 - weath,
    dM: seaCH4 + volcCH4 - 0.5 * photo - esc,
  };
}

// Advance [O₂] and [CH₄] (mol) by dt years with implicit Euler sub-steps,
// solved by Newton's method in log space. `inp` holds the fluxes from the
// ocean (linear in partial pressure), the volcanic reductant flux, the
// oxidative weathering scale and the switches.
const LO_O = Math.log(1e6);
const HI_O = Math.log(AIR.moles);
const LO_M = Math.log(1e8);
const HI_M = Math.log(AIR.moles * 0.05);

// One implicit Euler step of h years from (O0, M0). Residuals are taken
// relative to the new amounts so that oxygen at 1e-8 and 1e-1 of today's
// level converge alike; Newton's method with a backtracking line search.
// Returns null if it does not converge, so the caller can take shorter steps.
function implicitStep(O0, M0, inp, h) {
  const g = [0, 0];
  const gu = [0, 0];
  const gv = [0, 0];
  const gt = [0, 0];
  const G = (u, v, out) => {
    const o = Math.exp(u);
    const m = Math.exp(v);
    const r = airRates(o, m, inp);
    out[0] = 1 - O0 / o - (h * r.dO) / o;
    out[1] = 1 - M0 / m - (h * r.dM) / m;
    return out[0] * out[0] + out[1] * out[1];
  };
  const box = (u, v) => [Math.min(Math.max(u, LO_O), HI_O), Math.min(Math.max(v, LO_M), HI_M)];
  let u = Math.log(O0);
  let v = Math.log(M0);
  let ss = G(u, v, g);
  for (let it = 0; it < 60; it++) {
    if (ss < 1e-22) return [Math.exp(u), Math.exp(v)];
    const eps = 1e-7;
    G(u + eps, v, gu);
    G(u, v + eps, gv);
    const j11 = (gu[0] - g[0]) / eps;
    const j21 = (gu[1] - g[1]) / eps;
    const j12 = (gv[0] - g[0]) / eps;
    const j22 = (gv[1] - g[1]) / eps;
    const det = j11 * j22 - j12 * j21;
    if (!isFinite(det) || Math.abs(det) < 1e-300) return null;
    let du = -(g[0] * j22 - g[1] * j12) / det;
    let dv = -(j11 * g[1] - j21 * g[0]) / det;
    const big = Math.max(Math.abs(du), Math.abs(dv));
    if (big > 2) {
      du *= 2 / big;
      dv *= 2 / big;
    }
    let a = 1;
    let accepted = false;
    for (let ls = 0; ls < 30; ls++) {
      const [ut, vt] = box(u + a * du, v + a * dv);
      const st = G(ut, vt, gt);
      if (st < ss * (1 - 1e-4 * a) || st < 1e-22) {
        u = ut;
        v = vt;
        ss = st;
        g[0] = gt[0];
        g[1] = gt[1];
        accepted = true;
        break;
      }
      a *= 0.5;
    }
    if (!accepted) return ss < 1e-14 ? [Math.exp(u), Math.exp(v)] : null;
    if (a * big < 1e-11) return ss < 1e-14 ? [Math.exp(u), Math.exp(v)] : null;
  }
  return ss < 1e-14 ? [Math.exp(u), Math.exp(v)] : null;
}

export function stepAir(state, inp, dt, sub = 16) {
  let O = Math.min(Math.max(state.O2, 1e6), AIR.moles);
  let M = Math.min(Math.max(state.CH4, 1e8), AIR.moles * 0.05);
  // Fixed sub-steps, each split further where the solver struggles (the
  // switch between an oxygen-free and an oxygen-rich air is very stiff).
  const hMax = dt / sub;
  let left = dt;
  let h = hMax;
  let guard = 0;
  while (left > hMax * 1e-9 && guard++ < 20000) {
    const step = Math.min(h, left);
    const r = implicitStep(O, M, inp, step);
    if (r) {
      O = r[0];
      M = r[1];
      left -= step;
      h = Math.min(hMax, step * 2);
    } else if (step > hMax * 1e-7) {
      h = step / 4;
    } else {
      // give up on this sliver of time and move on
      left -= step;
    }
  }
  state.O2 = O;
  state.CH4 = M;
  return airRates(O, M, inp);
}
