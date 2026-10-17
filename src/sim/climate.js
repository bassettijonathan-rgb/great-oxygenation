// A one-dimensional energy balance model (Budyko 1969, Sellers 1969, in the
// diffusive form of North 1975): annual-mean temperature in latitude bands
// from the equator to the pole, with sunlight in, infrared out, heat carried
// poleward by diffusion, and ice wherever the yearly mean is below −10 °C.
// Ice reflects more sunlight, which is what lets a cold planet run away
// into a snowball and a frozen one stay frozen.

export const CLIMATE = {
  bands: 18, // per hemisphere, equal area (evenly spaced in sin latitude)
  S0: 1361, // W/m², today's solar constant
  A: 205, // W/m², outgoing infrared at 0 °C with today's air
  B: 2.09, // W/m² per K (North et al. 1981)
  D: 0.45, // W/m² per K, poleward heat transport (tuned: today 15 °C, ice from 66°)
  albedoFree: 0.3,
  albedoSlope: 0.078, // brighter towards the poles: low sun, more cloud
  albedoIce: 0.62,
  dustDarkening: 0.2, // how far dust and ash can darken the ice of a long snowball
  iceAt: -10, // °C, annual mean
  iceWidth: 3, // K: patchy and seasonal snow blur the ice edge (and keep bands from flipping one by one)
  heatCap: 4, // W/m² per K over one solver pass: only sets how fast it settles
};

const P2 = (x) => 0.5 * (3 * x * x - 1);

// Greenhouse forcing relative to the pre-industrial air (280 ppm CO₂,
// 0.7 ppm CH₄), in W/m².
export function forcingCO2(pCO2) {
  return 5.35 * Math.log(Math.max(1e-7, pCO2) / 2.8e-4);
}

export function forcingCH4(ppm) {
  // Grows like a logarithm at Archean levels instead of the modern
  // square-root fit, which overshoots far beyond today's concentrations.
  const f = (m) => 2 * Math.log(1 + Math.max(0, m) / 0.5);
  return f(ppm) - f(0.7);
}

// Organic haze: once CH₄/CO₂ passes about 0.1 an orange haze forms and
// shades the surface (Haqq-Misra et al. 2008).
export function hazeAmount(pCH4, pCO2) {
  const r = pCH4 / Math.max(1e-9, pCO2);
  const t = Math.min(1, Math.max(0, (r - 0.1) / 0.2));
  return t * t * (3 - 2 * t);
}

export function forcingHaze(pCH4, pCO2) {
  return -6 * hazeAmount(pCH4, pCO2);
}

export function greenhouse(pCO2, ch4ppm, pCH4) {
  return forcingCO2(pCO2) + forcingCH4(ch4ppm) + forcingHaze(pCH4, pCO2);
}

export class Climate {
  constructor() {
    const n = CLIMATE.bands;
    this.n = n;
    this.x = new Float64Array(n);
    this.s = new Float64Array(n);
    this.T = new Float64Array(n).fill(15);
    this.alpha = new Float64Array(n);
    this.cUp = new Float64Array(n); // diffusion coupling to the band poleward
    for (let j = 0; j < n; j++) {
      this.x[j] = (j + 0.5) / n;
      this.s[j] = 1 - 0.482 * P2(this.x[j]);
      const xe = (j + 1) / n;
      this.cUp[j] = j < n - 1 ? (CLIMATE.D * (1 - xe * xe) * n * n) : 0;
    }
    this._a = new Float64Array(n);
    this._b = new Float64Array(n);
    this._c = new Float64Array(n);
    this._d = new Float64Array(n);
    this.meanT = 15;
    this.iceLat = 90;
    this.iceFrac = 0;
    // Dust and volcanic ash that settle on the ice of a planet frozen to the
    // equator; it darkens the ice and is what finally lets a snowball melt
    // (Abbot & Pierrehumbert 2010). 0 = clean ice, 1 = as dirty as it gets.
    this.dust = 0;
  }

  albedoAt(j, T) {
    const c = CLIMATE;
    const free = c.albedoFree + c.albedoSlope * P2(this.x[j]);
    const iceAlb = c.albedoIce - c.dustDarkening * this.dust;
    const ice = 0.5 * (1 - Math.tanh((T - c.iceAt) / c.iceWidth));
    return free + (iceAlb - free) * ice;
  }

  // Dust builds up while the whole planet is frozen (time in years) and is
  // buried or washed away quickly once the ice breaks up.
  weather(dtYears) {
    if (this.iceLat < 2) this.dust = Math.min(1, this.dust + dtYears / 20e6);
    else this.dust = Math.max(0, this.dust - dtYears / 1e6);
  }

  // Relax towards balance for the given sunlight (fraction of today's) and
  // greenhouse forcing. Starts from the current state, so a frozen planet
  // stays frozen until the forcing is strong enough to melt it.
  settle(lum, F, passes = 40) {
    const c = CLIMATE;
    const n = this.n;
    const Q = (c.S0 / 4) * lum;
    const { T, s, alpha, cUp, _a: a, _b: b, _c: cc, _d: d } = this;
    for (let it = 0; it < passes; it++) {
      for (let j = 0; j < n; j++) alpha[j] = this.albedoAt(j, T[j]);
      // (C + B + diffusion) T = C T_old + Q s (1 − α) − A + F
      for (let j = 0; j < n; j++) {
        const lo = j > 0 ? cUp[j - 1] : 0;
        const hi = cUp[j];
        a[j] = -lo;
        cc[j] = -hi;
        b[j] = c.heatCap + c.B + lo + hi;
        d[j] = c.heatCap * T[j] + Q * s[j] * (1 - alpha[j]) - c.A + F;
      }
      // Thomas algorithm
      for (let j = 1; j < n; j++) {
        const m = a[j] / b[j - 1];
        b[j] -= m * cc[j - 1];
        d[j] -= m * d[j - 1];
      }
      let maxd = 0;
      let next = d[n - 1] / b[n - 1];
      maxd = Math.max(maxd, Math.abs(next - T[n - 1]));
      T[n - 1] = next;
      for (let j = n - 2; j >= 0; j--) {
        next = (d[j] - cc[j] * T[j + 1]) / b[j];
        maxd = Math.max(maxd, Math.abs(next - T[j]));
        T[j] = next;
      }
      if (maxd < 0.002 && it > 2) break;
    }
    this.summarise();
  }

  summarise() {
    const n = this.n;
    let sum = 0;
    for (let j = 0; j < n; j++) sum += this.T[j];
    this.meanT = sum / n;
    // Ice line: first band from the equator whose mean is below the ice
    // temperature, interpolated between band centres.
    const iceAt = CLIMATE.iceAt;
    let xIce = 1;
    if (this.T[0] < iceAt) xIce = 0;
    else {
      for (let j = 1; j < n; j++) {
        if (this.T[j] < iceAt) {
          const t = (this.T[j - 1] - iceAt) / (this.T[j - 1] - this.T[j]);
          xIce = this.x[j - 1] + t * (this.x[j] - this.x[j - 1]);
          break;
        }
      }
    }
    this.iceFrac = 1 - xIce;
    this.iceLat = (Math.asin(Math.min(1, xIce)) * 180) / Math.PI;
  }

  // Temperature at a given latitude (degrees), interpolated.
  tempAt(latDeg) {
    const x = Math.sin((Math.abs(latDeg) * Math.PI) / 180);
    const f = x * this.n - 0.5;
    const j = Math.max(0, Math.min(this.n - 2, Math.floor(f)));
    const t = Math.max(0, Math.min(1, f - j));
    return this.T[j] * (1 - t) + this.T[j + 1] * t;
  }

  snapshot() {
    return Array.from(this.T);
  }

  restore(T) {
    for (let j = 0; j < this.n; j++) this.T[j] = T[j];
    this.summarise();
  }
}
