// A vertical slice through the ocean, from a coast with a shallow shelf out
// over the slope to the deep basin and a mid-ocean ridge with hot vents.
// Water moves along a fixed overturning circulation (coastal upwelling over
// the shelf, a slow deep cell across the basin) and mixes by eddies.
//
// Four things are carried by the water:
//   P   phosphate, the nutrient that limits how much can grow;
//   E   "oxidising power" = O₂ − Fe²⁺/4. Dissolved oxygen and ferrous iron
//       destroy each other within hours (4 Fe²⁺ + O₂ → rust), far faster than
//       anything else here, so a cell holds one or the other: E > 0 is
//       oxygen, E < 0 is iron. Carrying their difference keeps that exact;
//   CH₄ methane, made where organic matter rots without oxygen or sulfate;
//   HS  hydrogen sulfide, made by sulfate-reducing microbes.
//
// The ocean settles in years to millennia, much faster than the geological
// changes that drive it, so each call solves for its near-steady state with
// one long implicit step: transport, uptake by plankton, gas exchange and
// the reactions are all inside the solve (banded LU per tracer). Oxygen and
// iron are solved together by Newton's method, so cells can switch between
// oxic and iron-rich without any guessing; methane and sulfide use the
// oxygen and iron that solve found.
//
// The slice stands for a typical stretch of the world's ocean margins; its
// fluxes, multiplied by the length of margin it represents, are the global
// ones.

export const SEC_YR = 3.156e7;

export const OCEAN = {
  NX: 56,
  NZ: 20,
  width: 1.4e6, // m, coast to the far end of the basin
  depth: 4000, // m
  shelfEdge: 2.0e5, // m
  ridgeX: 1.08e6, // m
  oceanArea: 3.6e14, // m², the world ocean the slice stands for
  kh: 300, // m²/s, horizontal eddy mixing
  khShelf: 300, // m²/s, over the shelf (tides, storms)
  riverPlume: 1e5, // m, how far offshore river water spreads
  kvMixed: 5e-3, // m²/s, wind-stirred surface layer
  kvShelf: 1e-3, // m²/s, shallow shelf, stirred by tides and storms
  kvDeep: 3e-5, // m²/s, interior
  mixedDepth: 50, // m
  upwelling: 0.2, // m²/s per m of coast, coastal (Ekman) cell, averaged over all margins
  overturning: 0.12, // m²/s per m of coast, deep cell
  pistonVelocity: 1000, // m/yr, gas exchange at the surface (~2.7 m/day)
  lightDepth: 20, // m, e-folding depth of sunlight
  // Henry's law, mmol/m³ per bar (≈ µM per bar)
  henryO2: 1300,
  henryCH4: 1400,
  // biology
  muCyano: 300, // mmol C/m³/yr at full light, cyanobacteria
  muFerro: 1500, // mmol C/m³/yr, photoferrotrophs (fix carbon by oxidising Fe²⁺)
  kP: 0.1, // µM, half-saturation for phosphate
  kFe: 5, // µM, half-saturation of Fe²⁺ for photoferrotrophs
  CP: 106, // Redfield C:P
  // sinking organic matter
  martinOxic: 0.86, // remineralisation exponent (Martin et al. 1987)
  martinAnoxic: 0.45, // rots more slowly without oxygen
  burialOxic: 0.08, // fraction of organic carbon reaching the seafloor that is buried
  burialAnoxic: 0.2,
  pRetainAnoxic: 0.35, // anoxic sediments give most of their phosphate back
  kSO4: 400, // µM, half-saturation of sulfate reducers
  dirShare: 0.5, // fraction of rust on the seafloor that iron-reducing microbes can reach
  dirRelease: 0.6, // fraction of the iron they reduce that returns to the water
  kdP: 0.0087, // mol P caught per mol of rust, per µM of dissolved P (Bjerrum & Canfield 2002)
  feSat: 60, // µM: above this, Fe(II) carbonate and silicate precipitate
  feSatRate: 0.01, // per yr
  kO2: 0.5, // µM, oxygen at which aerobic microbes work at half speed
  moxRate: 30, // per yr, methane eaten by aerobic microbes where there is O₂
  aomRate: 0.02, // per yr at high sulfate: anaerobic oxidation of methane
  hsOxRate: 300, // per yr, sulfide oxidised where there is O₂
  fesRate: 300, // per yr, sulfide caught by Fe²⁺ as iron sulfide (pyrite)
};

// Width (µM) of the blend between "oxygen" and "iron" around E = 0.
const OCEAN_EPS = 1e-6;
// Microbes and minerals only use oxygen or iron above a trace (µM); this
// keeps the traces left in the blend from driving big fluxes.
const TRACE = 1e-3;
const excess = (x) => {
  const y = x - TRACE;
  return 0.5 * (y + Math.sqrt(y * y + OCEAN_EPS * OCEAN_EPS));
};
const excessSlope = (x) => {
  const y = x - TRACE;
  return 0.5 * (1 + y / Math.sqrt(y * y + OCEAN_EPS * OCEAN_EPS));
};

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// Seafloor depth along the slice (m).
export function seafloorDepth(x) {
  const o = OCEAN;
  if (x < o.shelfEdge) return 25 + 125 * (x / o.shelfEdge);
  const slope = 150 + 3650 * smoothstep(o.shelfEdge, o.shelfEdge + 2.6e5, x);
  const ridge = 1500 * Math.exp(-(((x - o.ridgeX) / 9e4) ** 2));
  return slope - ridge;
}

// Banded matrix, stored row by row over columns r-p … r+p, factorised in
// place without pivoting (every matrix here is a diagonally dominant
// M-matrix, for which that is stable).
class Banded {
  constructor(n, p) {
    this.n = n;
    this.p = p;
    this.w = 2 * p + 1;
    this.a = new Float64Array(n * this.w);
  }
  load(src) {
    this.a.set(src);
  }
  add(r, c, v) {
    this.a[r * this.w + (c - r + this.p)] += v;
  }
  factor() {
    const { n, p, w, a } = this;
    for (let k = 0; k < n; k++) {
      const kb = k * w - k + p;
      const piv = a[kb + k];
      const rmax = Math.min(n - 1, k + p);
      for (let r = k + 1; r <= rmax; r++) {
        const base = r * w - r + p;
        const l = a[base + k];
        if (l === 0) continue;
        const f = l / piv;
        a[base + k] = f;
        for (let c = k + 1; c <= rmax; c++) a[base + c] -= f * a[kb + c];
      }
    }
  }
  solve(b, x) {
    const { n, p, w, a } = this;
    for (let r = 0; r < n; r++) {
      let s = b[r];
      const base = r * w - r + p;
      for (let c = Math.max(0, r - p); c < r; c++) s -= a[base + c] * x[c];
      x[r] = s;
    }
    for (let r = n - 1; r >= 0; r--) {
      let s = x[r];
      const base = r * w - r + p;
      const c1 = Math.min(n - 1, r + p);
      for (let c = r + 1; c <= c1; c++) s -= a[base + c] * x[c];
      x[r] = s / a[base + r];
    }
  }
}

const STATE_KEYS = ['P', 'E', 'M', 'H', 'theta', 'cf', 'rustCol', 'rustCell'];

export class Ocean {
  constructor() {
    const o = OCEAN;
    const NX = o.NX;
    const NZ = o.NZ;
    this.NX = NX;
    this.NZ = NZ;
    this.N = NX * NZ;
    const N = this.N;
    this.dx = o.width / NX;
    this.margin = o.oceanArea / o.width; // m of margin the slice stands for
    this.scale = 1e-3 * this.margin; // mmol/yr per m of coast → mol/yr worldwide
    this.zi = new Float64Array(NZ + 1);
    for (let k = 0; k <= NZ; k++) this.zi[k] = o.depth * (k / NZ) ** 2;
    this.zc = new Float64Array(NZ);
    this.hk = new Float64Array(NZ);
    for (let k = 0; k < NZ; k++) {
      this.zc[k] = 0.5 * (this.zi[k] + this.zi[k + 1]);
      this.hk[k] = this.zi[k + 1] - this.zi[k];
    }
    this.floor = new Float64Array(NX);
    this.kb = new Int32Array(NX);
    this.water = new Uint8Array(N);
    this.vol = new Float64Array(N);
    for (let i = 0; i < NX; i++) {
      const d = seafloorDepth((i + 0.5) * this.dx);
      this.floor[i] = d;
      let kb = 0;
      for (let k = 0; k < NZ; k++) {
        if (k === 0 || this.zc[k] < d) {
          this.water[this.idx(i, k)] = 1;
          kb = k;
        }
      }
      this.kb[i] = kb;
      for (let k = 0; k <= kb; k++) this.vol[this.idx(i, k)] = this.dx * this.hk[k];
    }
    // light: mean of exp(-z/L) over each layer; plankton live where it is
    // above 1 % of the surface value
    this.light = new Float64Array(NZ);
    for (let k = 0; k < NZ; k++) {
      const L = o.lightDepth;
      this.light[k] = (L / this.hk[k]) * (Math.exp(-this.zi[k] / L) - Math.exp(-this.zi[k + 1] / L));
    }
    this.nPhotic = 0;
    while (this.nPhotic < NZ && this.light[this.nPhotic] > 0.01) this.nPhotic++;
    this.ventCells = [];
    for (let i = 0; i < NX; i++) {
      const x = (i + 0.5) * this.dx;
      if (Math.abs(x - o.ridgeX) < 0.75 * 9e4) this.ventCells.push(this.idx(i, this.kb[i]));
    }
    // rivers spread their load over the shelf in a plume that thins offshore
    this.riverCells = [];
    this.riverShare = [];
    let wsum = 0;
    for (let i = 0; i < NX; i++) {
      const x = (i + 0.5) * this.dx;
      if (x > o.shelfEdge) break;
      const w = Math.exp(-x / o.riverPlume);
      for (let k = 0; k < 2 && k <= this.kb[i]; k++) {
        this.riverCells.push(this.idx(i, k));
        this.riverShare.push(w * this.hk[k]);
        wsum += w * this.hk[k];
      }
    }
    for (let j = 0; j < this.riverShare.length; j++) this.riverShare[j] /= wsum;
    this.buildTransport();
    this.Tdiag = new Float64Array(N);
    for (let n = 0; n < N; n++) this.Tdiag[n] = this.T.a[n * this.T.w + this.T.p];
    this.mP = new Banded(N, NZ);
    this.mM = new Banded(N, NZ);
    this.mH = new Banded(N, NZ);
    this.mE = new Banded(N, NZ);
    // tracers (µM)
    this.P = new Float64Array(N);
    this.E = new Float64Array(N);
    this.M = new Float64Array(N);
    this.H = new Float64Array(N);
    // views for drawing (µM)
    this.O2 = new Float64Array(N);
    this.Fe = new Float64Array(N);
    // switches carried from the previous call
    this.theta = new Float64Array(N); // 1 = oxic
    this.cf = new Float64Array(N); // photoferrotroph carbon fixation, mmol C/yr per m
    this.rustCol = new Float64Array(NX); // rust reaching the seafloor, mmol Fe/yr per m
    // scratch
    this.rhs = new Float64Array(N);
    this.tmp = new Float64Array(N);
    this.resp = new Float64Array(N);
    this.lamC = new Float64Array(N);
    this.lamF = new Float64Array(N);
    this.kapF = new Float64Array(N);
    this.feOld = new Float64Array(N);
    this.fixC = new Float64Array(N);
    this.fes = new Float64Array(N);
    this.exportC = new Float64Array(NX);
    this.burFrac = new Float64Array(NX);
    this.pRet = new Float64Array(NX);
    this.rustCell = new Float64Array(N); // rust formed in each cell, mmol Fe/yr per m
    this.respPot = new Float64Array(N);
    this.eTry = new Float64Array(N);
    this.res2 = new Float64Array(N);
    this.rsc = new Float64Array(N);
    this.lin = new Float64Array(N);
    this.gasK = new Float64Array(N);
    this.dem = new Float64Array(N);
    this.ferroMax = new Float64Array(N);
    this.fesK = new Float64Array(N);
    this.res = new Float64Array(N);
    this.jd = new Float64Array(N);
    this.mOld = new Float64Array(N);
    this.hOld = new Float64Array(N);
    this.fOx = new Float64Array(N);
    this.feX = new Float64Array(N);
    this.srcM = new Float64Array(N);
    this.srcH = new Float64Array(N);
    this.srcFe = new Float64Array(N);
    this.remin = new Float64Array(N); // fraction of a column's export respired in each cell
    this.toFloor = new Float64Array(NX); // fraction reaching the seafloor
    this.openW = new Float64Array(NX); // share of each column's surface free of ice
    this.diag = {
      // per cell, per m³ per year
      prodCyano: new Float64Array(N), // mmol C
      prodFerro: new Float64Array(N), // mmol C
      rust: new Float64Array(N), // mmol Fe turned to rust
      methane: new Float64Array(N), // mmol CH₄ made
      // per column, per m of coast per year
      bifOx: new Float64Array(NX), // rust buried (Fe(III)): oxide banded iron
      bifRed: new Float64Array(NX), // Fe(II) minerals buried: siderite, greenalite, magnetite
      pyrite: new Float64Array(NX),
      orgBur: new Float64Array(NX), // organic carbon buried
      seepCH4: new Float64Array(NX), // methane leaving the seafloor
    };
    this.reset();
  }

  idx(i, k) {
    return i * this.NZ + k;
  }

  reset(fe = 20, p = 1.5) {
    for (let n = 0; n < this.N; n++) {
      const w = this.water[n];
      this.P[n] = w ? p : 0;
      this.E[n] = w ? -fe / 4 : 0;
      this.M[n] = 0;
      this.H[n] = 0;
      this.theta[n] = 0;
      this.cf[n] = 0;
    }
    this.rustCol.fill(0);
    this.rustCell.fill(0);
    this.views();
  }

  // Streamfunction on cell corners → volume fluxes through every face
  // (m³/yr per m of coast), so the flow is exactly divergence-free; then the
  // transport operator (upwind advection + diffusion) as a band matrix.
  buildTransport() {
    const o = OCEAN;
    const { NX, NZ, N, dx, zi } = this;
    const W = o.width;
    const colDepth = (i) => zi[this.kb[i] + 1];
    const psi = new Float64Array((NX + 1) * (NZ + 1));
    const P = (ic, kc) => ic * (NZ + 1) + kc;
    const wet = (i, k) => i >= 0 && i < NX && k >= 0 && k < NZ && this.water[this.idx(i, k)] === 1;
    for (let ic = 1; ic < NX; ic++) {
      for (let kc = 1; kc < NZ; kc++) {
        if (!(wet(ic - 1, kc - 1) && wet(ic, kc - 1) && wet(ic - 1, kc) && wet(ic, kc))) continue;
        const x = ic * dx;
        const z = zi[kc];
        const d = Math.min(colDepth(ic - 1), colDepth(ic));
        const d1 = Math.min(d, 300);
        const f1 = smoothstep(0, o.shelfEdge, x) * Math.exp(-Math.max(0, x - o.shelfEdge) / 1.2e5);
        const g1 = z < d1 ? Math.sin((Math.PI * z) / d1) : 0;
        const xr = 1.0e5;
        const f2 = x < W - xr ? Math.min(1, Math.max(0, (x - 1e5) / (W - xr - 1e5))) : Math.max(0, (W - x) / xr);
        const g2 = Math.sin((Math.PI * z) / d);
        psi[P(ic, kc)] = -(o.upwelling * f1 * g1 + o.overturning * f2 * g2) * SEC_YR;
      }
    }
    // eastward flux through the east face of (i,k); downward flux through
    // its bottom face
    this.qx = new Float64Array(N);
    this.qz = new Float64Array(N);
    this.dE = new Float64Array(N);
    this.dD = new Float64Array(N);
    for (let i = 0; i < NX; i++) {
      const shelf = this.floor[i] < 200;
      for (let k = 0; k < NZ; k++) {
        const n = this.idx(i, k);
        if (!this.water[n]) continue;
        if (wet(i + 1, k)) {
          this.qx[n] = psi[P(i + 1, k)] - psi[P(i + 1, k + 1)];
          const kh = this.floor[i] < 200 ? o.khShelf : o.kh;
          this.dE[n] = ((kh * this.hk[k]) / dx) * SEC_YR;
        }
        if (wet(i, k + 1)) {
          this.qz[n] = psi[P(i + 1, k + 1)] - psi[P(i, k + 1)];
          const kv = zi[k + 1] < o.mixedDepth ? o.kvMixed : shelf ? o.kvShelf : o.kvDeep;
          this.dD[n] = ((kv * dx) / (this.zc[k + 1] - this.zc[k])) * SEC_YR;
        }
      }
    }
    const T = new Banded(N, NZ);
    for (let n = 0; n < N; n++) if (!this.water[n]) T.add(n, n, 1);
    const link = (n, m, d, q) => {
      T.add(n, n, d);
      T.add(n, m, -d);
      T.add(m, m, d);
      T.add(m, n, -d);
      if (q > 0) {
        T.add(n, n, q);
        T.add(m, n, -q);
      } else if (q < 0) {
        T.add(m, m, -q);
        T.add(n, m, q);
      }
    };
    for (let n = 0; n < N; n++) {
      if (!this.water[n]) continue;
      if (this.dE[n] > 0) link(n, n + NZ, this.dE[n], this.qx[n]);
      if (this.dD[n] > 0) link(n, n + 1, this.dD[n], this.qz[n]);
    }
    this.T = T; // never factorised: the base every tracer's matrix starts from
  }

  // (T c)_n: what transport carries out of each cell per year (mmol/yr per m).
  transportOut(c, out) {
    const { N, NZ } = this;
    const { a, w, p } = this.T;
    for (let r = 0; r < N; r++) {
      if (!this.water[r]) {
        out[r] = 0;
        continue;
      }
      const base = r * w - r + p;
      let s = 0;
      const c0 = Math.max(0, r - NZ);
      const c1 = Math.min(N - 1, r + NZ);
      for (let cc = c0; cc <= c1; cc++) s += a[base + cc] * c[cc];
      out[r] = s;
    }
  }

  // Oxygen and iron from E. Within a hair of E = 0 both are present in
  // traces; elsewhere one of them is effectively zero.
  views() {
    for (let n = 0; n < this.N; n++) {
      if (!this.water[n]) {
        this.O2[n] = 0;
        this.Fe[n] = 0;
        continue;
      }
      const e = this.E[n];
      const s = Math.sqrt(e * e + OCEAN_EPS * OCEAN_EPS);
      this.O2[n] = 0.5 * (e + s);
      this.Fe[n] = 2 * (s - e);
    }
  }

  // Bring the ocean to its near-steady state for these boundary conditions.
  //   env.pO2, env.pCH4   partial pressures in the air (bar)
  //   env.SO4             sulfate (µM), well mixed
  //   env.ventFe, env.ventCH4, env.riverP, env.riverFe   worldwide, mol/yr
  //   env.iceFrac         share of the sea frozen over
  //   env.tempFactor      speeds biology up or down (1 at 15 °C)
  //   env.lightFactor     sunlight reaching the sea surface (1 = clear)
  //   env.cyano           cyanobacteria present (0 … 1)
  //   env.ferro           photoferrotrophs present (0 … 1)
  // dt (years) is the time since the last call; long steps simply land
  // closer to the steady state. Returns worldwide fluxes in mol/yr.
  solve(env, dt) {
    const o = OCEAN;
    const { NX, NZ, N, vol, water, P, E, M, H, theta, cf } = this;
    const scale = this.scale;
    const D = this.diag;
    // Sea ice spreads from the open-ocean end towards the coast; the column
    // at its edge is partly covered, so a little more ice means a little
    // less light and gas exchange rather than a whole column at once.
    const openF = Math.min(NX, Math.max(0, (1 - env.iceFrac) * NX));
    this.iceCols = NX - openF;
    const nOpen = Math.ceil(openF);
    const openW = this.openW;
    for (let i = 0; i < NX; i++) openW[i] = Math.min(1, Math.max(0, openF - i));
    const kw = o.pistonVelocity * this.dx;
    const satO = o.henryO2 * env.pO2;
    const satM = o.henryCH4 * env.pCH4;
    const tf = env.tempFactor;
    const SO4 = Math.max(0, env.SO4);
    const srShare = SO4 / (SO4 + o.kSO4);
    const aomK = o.aomRate * (SO4 / (SO4 + 200));
    const toCell = 1 / scale; // mol/yr worldwide → mmol/yr per m of coast
    const nPh = this.nPhotic;
    const rhs = this.rhs;
    const col = (n) => (n / NZ) | 0;
    const Mold = this.mOld;
    const Hold = this.hOld;
    Mold.set(M);
    Hold.set(H);
    const FeOld = this.feOld;
    for (let n = 0; n < N; n++) FeOld[n] = this.Fe[n];

    // ---- where sinking organic matter is respired, from the last answer
    const remin = this.remin;
    remin.fill(0);
    const burFrac = this.burFrac;
    const pRet = this.pRet;
    for (let i = 0; i < NX; i++) {
      let F = 1;
      for (let k = nPh; k <= this.kb[i]; k++) {
        const n = this.idx(i, k);
        const b = o.martinAnoxic + (o.martinOxic - o.martinAnoxic) * theta[n];
        const r = F * (1 - (this.zi[k] / this.zi[k + 1]) ** b);
        remin[n] = r;
        F -= r;
      }
      this.toFloor[i] = F;
      const tb = theta[this.idx(i, this.kb[i])];
      burFrac[i] = o.burialAnoxic + (o.burialOxic - o.burialAnoxic) * tb;
      pRet[i] = o.pRetainAnoxic + (1 - o.pRetainAnoxic) * tb;
    }

    // ---- phosphate: taken up in the sunlit layers by cyanobacteria (as
    // fast as light allows) and by photoferrotrophs (as much as the carbon
    // they fixed last time needs), carried down and released again as the
    // organic matter rots, buried, or caught by rust
    const lamC = this.lamC;
    const lamF = this.lamF;
    lamC.fill(0);
    lamF.fill(0);
    const mP = this.mP;
    mP.load(this.T.a);
    for (let n = 0; n < N; n++) {
      rhs[n] = 0;
      if (!water[n]) continue;
      mP.add(n, n, vol[n] / dt + o.kdP * this.rustCell[n]);
      rhs[n] = (vol[n] / dt) * P[n];
    }
    this.riverCells.forEach((n, j) => (rhs[n] += env.riverP * toCell * this.riverShare[j]));
    for (let i = 0; i < nOpen; i++) {
      const kb = this.kb[i];
      const nb = this.idx(i, kb);
      const back = this.toFloor[i] * (1 - burFrac[i] * pRet[i]);
      for (let k = 0; k < nPh && k <= kb; k++) {
        const n = this.idx(i, k);
        const L = this.light[k] * env.lightFactor * openW[i];
        lamC[n] = (o.muCyano * env.cyano * L * tf) / (o.CP * (P[n] + o.kP));
        lamF[n] = cf[n] / (o.CP * vol[n] * Math.max(P[n], 1e-3));
        const u = (lamC[n] + lamF[n]) * vol[n];
        if (u === 0) continue;
        mP.add(n, n, u);
        for (let kk = nPh; kk <= kb; kk++) mP.add(this.idx(i, kk), n, -u * remin[this.idx(i, kk)]);
        mP.add(nb, n, -u * back);
      }
    }
    mP.factor();
    mP.solve(rhs, P);
    for (let n = 0; n < N; n++) if (P[n] < 0 || !water[n]) P[n] = 0;

    // ---- carbon fixed and exported from each column
    const fixC = this.fixC; // mmol C/yr per m, cyanobacteria
    fixC.fill(0);
    let sumCyano = 0;
    let pBur = 0;
    let pScav = 0;
    for (let n = 0; n < N; n++) if (water[n]) pScav += o.kdP * this.rustCell[n] * P[n];
    const resp = this.respPot; // organic carbon that could be respired in each cell
    resp.fill(0);
    const srcFe = this.srcFe;
    srcFe.fill(0);
    let sumOrgBur = 0;
    let sumDIR = 0;
    let sumDirKeep = 0;
    let sumBifOx = 0;
    let sumExport = 0;
    for (let i = 0; i < NX; i++) {
      let ex = 0;
      let exP = 0;
      const kb = this.kb[i];
      for (let k = 0; k < nPh && k <= kb; k++) {
        const n = this.idx(i, k);
        const c = o.CP * lamC[n] * vol[n] * P[n];
        fixC[n] = c;
        ex += c + cf[n];
        exP += (lamC[n] + lamF[n]) * vol[n] * P[n];
        sumCyano += c;
      }
      sumExport += ex;
      pBur += exP * this.toFloor[i] * burFrac[i] * pRet[i];
      for (let k = nPh; k <= kb; k++) {
        const n = this.idx(i, k);
        resp[n] += ex * remin[n];
      }
      const nb = this.idx(i, kb);
      const Ff = ex * this.toFloor[i];
      const bur = Ff * burFrac[i];
      let Rf = Ff - bur;
      // iron-reducing microbes in the mud breathe the fresh rust; some of
      // the iron goes back into the water, the rest stays as magnetite
      const w = Math.min(Rf, (this.rustCol[i] * o.dirShare) / 4);
      Rf -= w;
      srcFe[nb] += 4 * w * o.dirRelease;
      D.bifRed[i] = 4 * w * (1 - o.dirRelease);
      D.bifOx[i] = Math.max(0, this.rustCol[i] - 4 * w);
      sumDirKeep += D.bifRed[i];
      sumBifOx += D.bifOx[i];
      sumDIR += 4 * w;
      resp[nb] += Rf;
      D.orgBur[i] = bur;
      sumOrgBur += bur;
    }
    pBur += pScav;
    const nVent = Math.max(1, this.ventCells.length);
    for (const n of this.ventCells) srcFe[n] += (env.ventFe * toCell) / nVent;
    this.riverCells.forEach((n, j) => (srcFe[n] += env.riverFe * toCell * this.riverShare[j]));

    // ---- oxygen and iron, as E = O₂ − Fe²⁺/4, by Newton's method. The
    // fast reactions are smooth functions of E, so a cell can be oxic,
    // ferruginous or (within a hair of zero) both; no switch has to be
    // guessed in advance.
    const lin = this.lin; // fixed right-hand side
    const gasK = this.gasK;
    const dem = this.dem; // O₂ demand at full oxygen (mmol O₂/yr per m)
    const ferroMax = this.ferroMax; // photoferrotroph carbon fixation at plenty of Fe²⁺
    const fesK = this.fesK; // Fe²⁺ caught by last call's sulfide
    gasK.fill(0);
    ferroMax.fill(0);
    for (let n = 0; n < N; n++) {
      lin[n] = 0;
      dem[n] = 0;
      fesK[n] = 0;
      if (!water[n]) continue;
      const V = vol[n];
      lin[n] = (V / dt) * E[n] + fixC[n] - srcFe[n] / 4;
      dem[n] = resp[n] + 2 * o.moxRate * Mold[n] * V + 2 * o.hsOxRate * Hold[n] * V;
      fesK[n] = o.fesRate * Hold[n] * V;
    }
    for (let i = 0; i < nOpen; i++) {
      const n = this.idx(i, 0);
      gasK[n] = kw * openW[i];
      lin[n] += kw * openW[i] * satO;
      for (let k = 0; k < nPh && k <= this.kb[i]; k++) {
        const m = this.idx(i, k);
        const L = this.light[k] * env.lightFactor * openW[i];
        ferroMax[m] = o.muFerro * env.ferro * L * tf * (P[m] / (P[m] + o.kP)) * vol[m];
      }
    }
    const mE = this.mE;
    const res = this.res;
    const jd = this.jd;
    const kO2 = o.kO2;
    const eps = OCEAN_EPS;
    const Tdiag = this.Tdiag;
    // F(E) = (V/dt + T) E + G(E) − lin, and dG/dE on the diagonal; returns
    // the sum of squares of F scaled to µM by the diagonal
    const resid = (Ein, out, wantJ) => {
      this.transportOut(Ein, out);
      let ss = 0;
      for (let n = 0; n < N; n++) {
        if (!water[n]) {
          out[n] = 0;
          if (wantJ) jd[n] = 0;
          continue;
        }
        const e = Ein[n];
        const s = Math.sqrt(e * e + eps * eps);
        const ox = 0.5 * (e + s);
        const fe = 2 * (s - e);
        const oxx = excess(ox);
        const fex = excess(fe);
        const fO = oxx / (oxx + kO2);
        const hF = fex / (fex + o.kFe);
        const gS = fex / (fex + 0.5);
        const xs = fe - o.feSat;
        const sq = Math.sqrt(xs * xs + 1);
        const q = 0.5 * (xs + sq);
        const V = vol[n];
        const prec = (o.feSatRate * V) / 4;
        const G = gasK[n] * ox + dem[n] * fO - ferroMax[n] * hF - (fesK[n] / 4) * gS - prec * q;
        out[n] += (V / dt) * e + G - lin[n];
        if (wantJ) {
          const a = 0.5 * (1 + e / s); // dO₂/dE
          const dfe = -4 * (1 - a); // dFe/dE
          const doxx = excessSlope(ox) * a;
          const dfex = excessSlope(fe) * dfe;
          jd[n] =
            gasK[n] * a +
            ((dem[n] * kO2) / ((oxx + kO2) * (oxx + kO2))) * doxx -
            ((ferroMax[n] * o.kFe) / ((fex + o.kFe) * (fex + o.kFe))) * dfex -
            (fesK[n] / 4) * (0.5 / ((fex + 0.5) * (fex + 0.5))) * dfex -
            prec * 0.5 * (1 + xs / sq) * dfe;
          this.rsc[n] = 1 / (Tdiag[n] + V / dt + jd[n]);
        }
        const r = out[n] * this.rsc[n];
        ss += r * r;
      }
      return ss;
    };
    const dE = this.tmp;
    const eTry = this.eTry;
    const res2 = this.res2;
    let iters = 0;
    let ss0 = resid(E, res, true);
    for (let it = 0; it < 12; it++) {
      iters = it + 1;
      mE.load(this.T.a);
      for (let n = 0; n < N; n++) {
        if (!water[n]) continue;
        mE.add(n, n, vol[n] / dt + jd[n]);
        res[n] = -res[n];
      }
      mE.factor();
      mE.solve(res, dE);
      // backtrack until the residual shrinks: near a cell's switch between
      // oxygen and iron a full Newton step can jump back and forth
      let alpha = 1;
      let ss1 = 0;
      for (let ls = 0; ls < 8; ls++) {
        for (let n = 0; n < N; n++) eTry[n] = water[n] ? E[n] + alpha * dE[n] : 0;
        ss1 = resid(eTry, res2, false);
        if (ss1 < (1 - 1e-4 * alpha) * ss0) break;
        alpha *= 0.5;
      }
      let worst = 0;
      for (let n = 0; n < N; n++) {
        if (!water[n]) continue;
        const step = eTry[n] - E[n];
        const rel = Math.abs(step) / (Math.abs(eTry[n]) + 1e-3);
        if (rel > worst) worst = rel;
        E[n] = eTry[n];
      }
      if (worst < 1e-6 || ss1 < 1e-20 * N) break;
      ss0 = resid(E, res, true);
    }
    this.newtonIters = iters;
    for (let n = 0; n < N; n++) if (!water[n]) E[n] = 0;
    this.views();
    const O2 = this.O2;
    const Fe = this.Fe;
    // how the flux to the air falls as oxygen in the air rises
    rhs.fill(0);
    for (let i = 0; i < nOpen; i++) rhs[this.idx(i, 0)] = kw * openW[i];
    const R = this.tmp;
    mE.solve(rhs, R);
    let o2Slope = 0;
    let o2Out = 0;
    for (let i = 0; i < nOpen; i++) {
      const n = this.idx(i, 0);
      const s = Math.sqrt(E[n] * E[n] + eps * eps);
      const a = 0.5 * (1 + E[n] / s);
      o2Slope += kw * openW[i] * Math.max(0, 1 - a * R[n]);
      o2Out += kw * openW[i] * (O2[n] - satO);
    }

    // ---- what happened in each cell: respiration with O₂ or without,
    // rust, iron minerals; and what the methane and sulfide solves need
    const srcM = this.srcM;
    const srcH = this.srcH;
    srcM.fill(0);
    srcH.fill(0);
    D.methane.fill(0);
    D.seepCH4.fill(0);
    const fOx = this.fOx;
    let sumAer = 0;
    let sumSR = 0;
    let sumMeth = 0;
    let sumFerro = 0;
    let sumPrec = 0;
    for (let n = 0; n < N; n++) {
      fOx[n] = 0;
      if (!water[n]) continue;
      const oxx = excess(O2[n]);
      const f = oxx / (oxx + kO2);
      fOx[n] = f;
      const aer = resp[n] * f;
      const an = resp[n] - aer;
      const sr = an * srShare;
      const me = an - sr;
      srcH[n] += sr / 2;
      srcM[n] += me / 2;
      D.methane[n] = me / 2 / vol[n];
      const i = col(n);
      if (n === this.idx(i, this.kb[i])) D.seepCH4[i] = me / 2;
      sumAer += aer;
      sumSR += sr / 2;
      sumMeth += me / 2;
      const fex = excess(Fe[n]);
      this.feX[n] = fex;
      const cNew = ferroMax[n] * (fex / (fex + o.kFe));
      sumFerro += cNew;
      cf[n] += 0.5 * (cNew - cf[n]);
      D.prodFerro[n] = cNew / vol[n];
      D.prodCyano[n] = fixC[n] / vol[n];
      const xs = Fe[n] - o.feSat;
      const prec = ((o.feSatRate * vol[n]) / 4) * 4 * 0.5 * (xs + Math.sqrt(xs * xs + 1));
      sumPrec += prec;
      D.bifRed[i] += prec;
      theta[n] += 0.5 * (f - theta[n]);
    }
    for (const n of this.ventCells) srcM[n] += (env.ventCH4 * toCell) / nVent;

    // ---- iron budget: iron that vanished without another sink was rusted
    // by oxygen
    const tout = this.res;
    this.transportOut(Fe, tout);
    let feOx = 0;
    let artefact = 0;
    const rustCol = this.rustCol;
    rustCol.fill(0);
    for (let n = 0; n < N; n++) {
      this.rustCell[n] = 0;
      D.rust[n] = 0;
      if (!water[n]) continue;
      const V = vol[n];
      const fex = this.feX[n];
      const ferroFe = 4 * ferroMax[n] * (fex / (fex + o.kFe));
      const xs = Fe[n] - o.feSat;
      const prec = o.feSatRate * V * 0.5 * (xs + Math.sqrt(xs * xs + 1));
      const fesE = fesK[n] * (fex / (fex + 0.5));
      let ox = srcFe[n] - tout[n] - (V / dt) * (Fe[n] - FeOld[n]) - ferroFe - prec - fesE;
      if (ox < 0) {
        artefact -= ox;
        ox = 0;
      }
      feOx += ox;
      const rust = ox + ferroFe;
      this.rustCell[n] = rust;
      D.rust[n] = rust / V;
      rustCol[col(n)] += rust;
    }

    // ---- methane: out to the air, eaten where there is oxygen, or eaten
    // with sulfate where there is not
    const mM = this.mM;
    mM.load(this.T.a);
    for (let n = 0; n < N; n++) {
      rhs[n] = 0;
      if (!water[n]) continue;
      const V = vol[n];
      mM.add(n, n, V / dt + (fOx[n] * o.moxRate + (1 - fOx[n]) * aomK) * V);
      rhs[n] = (V / dt) * M[n] + srcM[n];
    }
    for (let i = 0; i < nOpen; i++) {
      const n = this.idx(i, 0);
      mM.add(n, n, kw * openW[i]);
      rhs[n] += kw * openW[i] * satM;
    }
    mM.factor();
    mM.solve(rhs, M);
    let sumMox = 0;
    let sumAOM = 0;
    let lagMox = 0;
    for (let n = 0; n < N; n++) {
      if (!water[n] || M[n] < 0) M[n] = 0;
      if (!water[n]) continue;
      const mox = fOx[n] * o.moxRate * M[n] * vol[n];
      const aom = (1 - fOx[n]) * aomK * M[n] * vol[n];
      srcH[n] += aom;
      sumMox += mox;
      sumAOM += aom;
      lagMox += 2 * fOx[n] * o.moxRate * (Mold[n] - M[n]) * vol[n];
    }
    let ch4Out = 0;
    for (let i = 0; i < nOpen; i++) ch4Out += kw * openW[i] * (M[this.idx(i, 0)] - satM);
    rhs.fill(0);
    for (let i = 0; i < nOpen; i++) rhs[this.idx(i, 0)] = kw * openW[i];
    mM.solve(rhs, R);
    let ch4Slope = 0;
    for (let i = 0; i < nOpen; i++) ch4Slope += kw * openW[i] * Math.max(0, 1 - R[this.idx(i, 0)]);

    // ---- sulfide: oxidised where there is oxygen, caught by iron as iron
    // sulfide where there is Fe²⁺, otherwise it builds up (euxinia)
    const mH = this.mH;
    mH.load(this.T.a);
    for (let n = 0; n < N; n++) {
      rhs[n] = 0;
      if (!water[n]) continue;
      const V = vol[n];
      const gS = this.feX[n] / (this.feX[n] + 0.5);
      mH.add(n, n, V / dt + (fOx[n] * o.hsOxRate + gS * o.fesRate) * V);
      rhs[n] = (V / dt) * H[n] + srcH[n];
    }
    mH.factor();
    mH.solve(rhs, H);
    let sumHSox = 0;
    let sumFeS = 0;
    let lagHS = 0;
    D.pyrite.fill(0);
    for (let n = 0; n < N; n++) {
      if (!water[n] || H[n] < 0) H[n] = 0;
      if (!water[n]) continue;
      const gS = this.feX[n] / (this.feX[n] + 0.5);
      const ox = fOx[n] * o.hsOxRate * H[n] * vol[n];
      const fs = gS * o.fesRate * H[n] * vol[n];
      D.pyrite[col(n)] += fs;
      sumHSox += ox;
      sumFeS += fs;
      lagHS += Math.abs(fOx[n] * o.hsOxRate * (Hold[n] - H[n]) * vol[n]) + Math.abs(gS * o.fesRate * (Hold[n] - H[n]) * vol[n]);
    }
    return {
      o2ToAir: o2Out * scale,
      o2Slope: o2Slope * o.henryO2 * scale, // mol/yr per bar
      ch4ToAir: ch4Out * scale,
      ch4Slope: ch4Slope * o.henryCH4 * scale,
      prodCyano: sumCyano * scale, // mol C/yr
      prodFerro: sumFerro * scale,
      exportC: sumExport * scale,
      orgBur: sumOrgBur * scale,
      aerobic: sumAer * scale,
      sulfRed: sumSR * scale, // mol sulfide/yr made
      methProd: sumMeth * scale, // mol CH₄/yr made
      mox: sumMox * scale,
      aom: sumAOM * scale,
      sulfOx: sumHSox * scale,
      pyrite: sumFeS * scale, // mol FeS/yr buried
      feOx: feOx * scale, // mol Fe/yr rusted by O₂
      bifOx: sumBifOx * scale, // mol Fe/yr buried as rust
      bifRed: (sumPrec + sumDirKeep) * scale, // mol Fe/yr buried as Fe(II) minerals
      dir: sumDIR * scale,
      pBur: pBur * scale, // mol P/yr
      pScav: pScav * scale,
      artefact: artefact * scale,
      lag: (Math.abs(lagMox) + lagHS) * scale,
      iters,
    };
  }

  // Mean of a field over the water deeper than zmin (µM).
  meanBelow(c, zmin) {
    let s = 0;
    let v = 0;
    for (let i = 0; i < this.NX; i++) {
      for (let k = 0; k <= this.kb[i]; k++) {
        if (this.zc[k] < zmin) continue;
        const n = this.idx(i, k);
        s += c[n] * this.vol[n];
        v += this.vol[n];
      }
    }
    return v > 0 ? s / v : 0;
  }

  // Highest value of a field in the top two layers of columns 0 … iMax-1.
  maxSurface(c, iMax = this.NX) {
    let m = 0;
    for (let i = 0; i < iMax; i++) m = Math.max(m, c[this.idx(i, 0)], c[this.idx(i, 1)]);
    return m;
  }

  // Fast copy of the state into (or out of) a reusable buffer, for solving
  // the same step again with different air.
  saveState(buf = {}) {
    for (const key of STATE_KEYS) {
      if (!buf[key] || buf[key].length !== this[key].length) buf[key] = new Float64Array(this[key].length);
      buf[key].set(this[key]);
    }
    return buf;
  }

  loadState(buf) {
    for (const key of STATE_KEYS) this[key].set(buf[key]);
    this.views();
  }

  snapshot() {
    return {
      P: Array.from(this.P),
      E: Array.from(this.E),
      M: Array.from(this.M),
      H: Array.from(this.H),
      theta: Array.from(this.theta),
      cf: Array.from(this.cf),
      rustCol: Array.from(this.rustCol),
      rustCell: Array.from(this.rustCell),
    };
  }

  restore(s) {
    for (const key of STATE_KEYS) this[key].set(s[key]);
    this.views();
  }
}
