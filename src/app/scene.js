// The picture: sky, a sliver of land with a volcano, the ocean slice
// coloured by what is dissolved in it, the sea floor, ice, a small globe,
// and moving specks for what is happening (plankton at work, rust sinking,
// gases leaving the sea, iron rising from the vents).
//
// Depth is drawn on a square-root scale: every layer of the model gets the
// same height on screen, so the thin sunlit top is as easy to see as the
// deep sea.

const DEPTH = 4000;
const WATER = [14, 32, 44];
const COL = {
  oxy: [92, 200, 240],
  iron: [138, 150, 62],
  sulfide: [156, 100, 206],
  cyano: [60, 222, 168],
  ferro: [222, 196, 70],
  rust: [222, 92, 58],
  phos: [170, 176, 255],
  meth: [242, 170, 56],
};
export const LAYER_COLORS = COL;

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const logT = (x, lo, hi) => clamp((Math.log10(Math.max(x, 1e-12)) - lo) / (hi - lo), 0, 1);
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const smooth = (x) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};

export class Scene {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.geo = null;
    this.frame = null;
    this.point = null;
    this.layer = 'redox';
    this.lith = {};
    this.parts = [];
    this.spawn = { cyano: null, rust: null };
    this.carry = {};
    this.last = 0;
    this.W = 0;
    this.H = 0;
  }

  setGeometry(g, lith) {
    this.geo = g;
    this.lith = lith ?? this.lith;
    this.off = document.createElement('canvas');
    this.off.width = g.NX;
    this.off.height = g.NZ;
    this.offCtx = this.off.getContext('2d');
    this.img = this.offCtx.createImageData(g.NX, g.NZ);
    // the ridge: shallowest floor out in the deep basin
    let best = -1;
    for (let i = Math.floor(g.NX / 2); i < g.NX; i++) if (best < 0 || g.floor[i] < g.floor[best]) best = i;
    this.ridge = best;
    this.parts = [];
    this.layout();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.W = Math.max(1, r.width);
    this.H = Math.max(1, r.height);
    this.canvas.width = Math.round(this.W * dpr);
    this.canvas.height = Math.round(this.H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.parts = [];
    this.layout();
  }

  layout() {
    const g = this.geo;
    if (!g || !this.W) return;
    this.skyH = Math.round(this.H * 0.27);
    this.landW = Math.max(44, Math.round(this.W * 0.1));
    this.oceanH = this.H - this.skyH;
    this.colW = (this.W - this.landW) / g.NX;
    this.rowH = this.oceanH / g.NZ;
    this.floorY = g.floor.map((d) => this.depthY(d));
  }

  depthY(z) {
    return this.skyH + this.oceanH * Math.sqrt(Math.max(0, z) / DEPTH);
  }

  floorAt(x) {
    const g = this.geo;
    const f = (x - this.landW) / this.colW - 0.5;
    const i = clamp(Math.floor(f), 0, g.NX - 2);
    const t = clamp(f - i, 0, 1);
    return this.floorY[i] * (1 - t) + this.floorY[i + 1] * t;
  }

  setLayer(key) {
    this.layer = key;
    this.paint();
  }

  setFrame(frame, point) {
    this.frame = frame;
    this.point = point;
    this.paint();
    this.prepareSpawns();
  }

  // Colour each cell of the slice into a tiny image; it is drawn stretched
  // and smoothed.
  paint() {
    const g = this.geo;
    const f = this.frame;
    if (!g || !f) return;
    const { NX, NZ } = g;
    const d = this.img.data;
    for (let i = 0; i < NX; i++) {
      for (let k = 0; k < NZ; k++) {
        const n = i * NZ + k;
        const src = g.water[n] ? n : i * NZ + g.kb[i]; // below the floor: copy the last water cell
        const c = this.cellColor(f, src);
        const p = (k * NX + i) * 4;
        d[p] = c[0];
        d[p + 1] = c[1];
        d[p + 2] = c[2];
        d[p + 3] = 255;
      }
    }
    this.offCtx.putImageData(this.img, 0, 0);
  }

  cellColor(f, n) {
    let c = WATER;
    const add = (col, t) => {
      if (t > 0) c = mix(c, col, t);
    };
    switch (this.layer) {
      case 'life':
        add(COL.ferro, logT(f.ferro[n], -2, 1) * 0.9);
        add(COL.cyano, logT(f.prod[n], -1, 2.5));
        add(COL.rust, logT(f.rust[n], -1.5, 1));
        break;
      case 'phosphate':
        add(COL.phos, clamp(f.P[n] / 1, 0, 1) * 0.95);
        break;
      case 'methane':
        add(COL.meth, logT(f.CH4[n], -1, 2) * 0.95);
        break;
      default:
        add(COL.iron, logT(f.Fe[n], -1, 2) * 0.85);
        add(COL.oxy, logT(f.O2[n], -2, 1));
        add(COL.sulfide, logT(f.H2S[n], -1, 1.5));
        break;
    }
    return c;
  }

  // Weighted lists of cells where specks appear.
  prepareSpawns() {
    const g = this.geo;
    const f = this.frame;
    const { NX, NZ } = g;
    const build = (fn) => {
      const cells = [];
      const cum = [];
      let tot = 0;
      for (let i = 0; i < NX; i++) {
        for (let k = 0; k < NZ; k++) {
          const n = i * NZ + k;
          if (!g.water[n]) continue;
          const w = fn(n, i, k);
          if (w <= 0) continue;
          tot += w;
          cells.push(n);
          cum.push(tot);
        }
      }
      return { cells, cum, tot };
    };
    this.spawn.cyano = build((n, i, k) => (k < 4 ? logT(f.prod[n], -0.5, 2.5) ** 2 : 0));
    this.spawn.ferro = build((n, i, k) => (k < 4 ? logT(f.ferro[n], -1.5, 1) ** 2 : 0));
    this.spawn.rust = build((n) => logT(f.rust[n], -1.5, 1) ** 2);
  }

  pick(list) {
    const u = Math.random() * list.tot;
    let lo = 0;
    let hi = list.cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (list.cum[mid] < u) lo = mid + 1;
      else hi = mid;
    }
    return list.cells[lo];
  }

  cellPos(n) {
    const NZ = this.geo.NZ;
    const i = Math.floor(n / NZ);
    const k = n % NZ;
    return [this.landW + (i + Math.random()) * this.colW, this.skyH + (k + Math.random()) * this.rowH, i];
  }

  // How many of a kind to add this frame, at `rate` per second.
  count(kind, rate, dt) {
    const v = (this.carry[kind] ?? 0) + rate * dt;
    const n = Math.floor(v);
    this.carry[kind] = v - n;
    return n;
  }

  step(dt) {
    const h = this.point;
    const f = this.frame;
    if (!h || !f || !this.geo) return;
    const P = this.parts;
    const room = () => P.length < 420;
    const scale = this.W / 700;
    // plankton at work
    for (const [kind, list, rate] of [
      ['cyano', this.spawn.cyano, 70],
      ['ferro', this.spawn.ferro, 30],
    ]) {
      if (!list || !list.tot) continue;
      const n = this.count(kind, rate * scale * Math.min(1, list.tot / 20), dt);
      for (let j = 0; j < n && room(); j++) {
        const [x, y] = this.cellPos(this.pick(list));
        P.push({ kind, x, y, vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 0.5) * 3, age: 0, life: 1.6 + Math.random() * 1.6 });
      }
    }
    // rust grains sink to the floor
    if (this.spawn.rust && this.spawn.rust.tot) {
      const n = this.count('rust', 45 * scale * Math.min(1, this.spawn.rust.tot / 15), dt);
      for (let j = 0; j < n && room(); j++) {
        const [x, y] = this.cellPos(this.pick(this.spawn.rust));
        P.push({ kind: 'rust', x, y, vx: 0, vy: (this.oceanH / 12) * (1 + Math.random()), age: 0, life: 6 });
      }
    }
    // gases leaving the sea through open water
    const openCols = [];
    for (let i = 0; i < this.geo.NX; i++) if (f.open[i] > 0.5) openCols.push(i);
    const gas = (kind, flux, lo, hi, rate) => {
      if (!openCols.length || !(flux > 0)) return;
      const n = this.count(kind, rate * scale * logT(flux, lo, hi), dt);
      for (let j = 0; j < n && room(); j++) {
        const i = openCols[Math.floor(Math.random() * openCols.length)];
        const x = this.landW + (i + Math.random()) * this.colW;
        P.push({ kind, x, y: this.skyH + 2, vx: (Math.random() - 0.5) * 4, vy: -(12 + Math.random() * 10), age: 0, life: 99 });
      }
    };
    gas('o2', h.o2ToAir, 12, 14.3, 10);
    gas('ch4', h.ch4ToAir, 11, 13.5, 7);
    // iron from the vents
    const quiet = 1 - 0.5 * (h.lull ?? 0);
    if (this.ridge >= 0) {
      const n = this.count('vent', 10 * scale * quiet * (1 + 2 * (h.lip ?? 0)), dt);
      for (let j = 0; j < n && room(); j++) {
        const i = this.ridge + Math.round((Math.random() - 0.5) * 3);
        const x = this.landW + (i + Math.random()) * this.colW;
        const y = this.floorAt(x) - 2;
        P.push({ kind: 'vent', x, y, vx: (Math.random() - 0.5) * 4, vy: -(8 + Math.random() * 8), age: 0, life: 2 + Math.random() * 2 });
      }
    }
    // the volcano
    const v = this.volcano();
    const lip = h.lip ? 1 : 0;
    const smokeN = this.count('smoke', (1.2 + 6 * lip) * quiet, dt);
    for (let j = 0; j < smokeN && room(); j++) {
      P.push({ kind: lip ? 'ash' : 'smoke', x: v.x + (Math.random() - 0.5) * 3, y: v.top, vx: 3 + Math.random() * 5, vy: -(6 + Math.random() * 6), age: 0, life: 3 + Math.random() * 2 });
    }
    // move
    let w = 0;
    for (const p of P) {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      let keep = p.age < p.life;
      if (p.kind === 'rust' && p.y >= this.floorAt(p.x) - 1) keep = false;
      if ((p.kind === 'o2' || p.kind === 'ch4') && p.y < this.skyH * 0.25) keep = false;
      if (p.kind === 'vent' && p.y < this.skyH) keep = false;
      if (p.x < 0 || p.x > this.W) keep = false;
      if (keep) P[w++] = p;
    }
    P.length = w;
  }

  volcano() {
    const x = this.landW * 0.42;
    return { x, top: this.skyH * 0.5, half: this.landW * 0.36 };
  }

  draw(now) {
    const ctx = this.ctx;
    if (!this.geo || !this.W) return;
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0;
    this.last = now;
    if (this.frame) this.step(dt);
    const h = this.point;
    const { W, H, skyH, landW } = this;
    ctx.clearRect(0, 0, W, H);
    const haze = h ? h.haze : 0;
    const pal = h ? h.pal : 1e-13;
    const iceLat = h ? h.iceLat : 90;
    const frozen = smooth((10 - iceLat) / 10);

    // sky
    const sky = ctx.createLinearGradient(0, 0, 0, skyH);
    const top = mix(mix([44, 86, 132], [128, 82, 40], haze), [150, 170, 190], frozen * 0.4);
    const hor = mix(mix([168, 198, 220], [228, 168, 92], haze), [214, 226, 236], frozen * 0.5);
    sky.addColorStop(0, rgb(top));
    sky.addColorStop(1, rgb(hor));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, skyH + 1);
    // the Sun
    const sx = landW + Math.min(70, W * 0.12);
    const sy = skyH * 0.32;
    const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, 22);
    glow.addColorStop(0, 'rgba(255,248,226,0.95)');
    glow.addColorStop(0.3, 'rgba(255,236,190,0.55)');
    glow.addColorStop(1, 'rgba(255,236,190,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(sx, sy, 22, 0, Math.PI * 2);
    ctx.fill();

    // ocean
    ctx.imageSmoothingEnabled = true;
    if (this.frame) ctx.drawImage(this.off, 0, 0, this.geo.NX, this.geo.NZ, landW, skyH, W - landW, this.oceanH);
    else {
      ctx.fillStyle = rgb(WATER);
      ctx.fillRect(landW, skyH, W - landW, this.oceanH);
    }
    // sunlit water: a faint sheen in the top layers
    const sheen = ctx.createLinearGradient(0, skyH, 0, this.depthY(160));
    sheen.addColorStop(0, 'rgba(255,255,255,0.10)');
    sheen.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(landW, skyH, W - landW, this.depthY(160) - skyH);

    // the solid Earth: land on the left, then the sea floor out to the ridge
    const g = this.geo;
    const hill = skyH * 0.2;
    const coast = (c, start) => {
      if (start) c.moveTo(0, skyH - hill);
      else c.lineTo(0, skyH - hill);
      c.bezierCurveTo(landW * 0.45, skyH - hill, landW * 0.7, skyH - 3, landW, skyH + 1);
    };
    ctx.beginPath();
    ctx.moveTo(0, H);
    coast(ctx, false);
    for (let i = 0; i < g.NX; i++) ctx.lineTo(landW + (i + 0.5) * this.colW, this.floorY[i]);
    ctx.lineTo(W, this.floorY[g.NX - 1]);
    ctx.lineTo(W, H);
    ctx.closePath();
    const rock = ctx.createLinearGradient(0, skyH - hill, 0, H);
    rock.addColorStop(0, '#5d534b');
    rock.addColorStop(1, '#2c2825');
    ctx.fillStyle = rock;
    ctx.fill();
    // the newest sediment on the floor
    const lith = h && this.lith[h.lith];
    if (lith) {
      ctx.strokeStyle = lith.color;
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(landW + 0.5 * this.colW, this.floorY[0] - 1);
      for (let i = 1; i < g.NX; i++) ctx.lineTo(landW + (i + 0.5) * this.colW, this.floorY[i] - 1);
      ctx.lineTo(W, this.floorY[g.NX - 1] - 1);
      ctx.stroke();
    }
    // vents glow at the ridge
    if (this.ridge >= 0) {
      const vx = landW + (this.ridge + 0.5) * this.colW;
      const vy = this.floorY[this.ridge];
      const vg = ctx.createRadialGradient(vx, vy, 0, vx, vy, 14);
      vg.addColorStop(0, 'rgba(255,170,90,0.75)');
      vg.addColorStop(1, 'rgba(255,170,90,0)');
      ctx.fillStyle = vg;
      ctx.beginPath();
      ctx.arc(vx, vy, 14, 0, Math.PI * 2);
      ctx.fill();
    }

    // the land's surface: grey under air without oxygen, red once oxygen
    // rusts it, white under ice
    const red = smooth((Math.log10(Math.max(pal, 1e-14)) + 5) / 2);
    const snow = smooth((50 - iceLat) / 25);
    let landCol = mix([118, 112, 98], [158, 78, 52], red);
    landCol = mix(landCol, [232, 238, 244], snow * 0.9);
    ctx.save();
    ctx.beginPath();
    coast(ctx, true);
    ctx.strokeStyle = rgb(landCol);
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();
    // volcano
    const v = this.volcano();
    ctx.beginPath();
    ctx.moveTo(v.x - v.half, skyH - hill + 1);
    ctx.lineTo(v.x - 2.5, v.top);
    ctx.lineTo(v.x + 2.5, v.top);
    ctx.lineTo(v.x + v.half, skyH - hill * 0.55);
    ctx.closePath();
    ctx.fillStyle = rgb(mix([88, 78, 70], [232, 238, 244], snow * 0.6));
    ctx.fill();
    if (h && h.lip) {
      const lg = ctx.createRadialGradient(v.x, v.top, 0, v.x, v.top, 12);
      lg.addColorStop(0, 'rgba(255,120,40,0.95)');
      lg.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.arc(v.x, v.top, 12, 0, Math.PI * 2);
      ctx.fill();
    }

    // sea ice, spreading from the far end
    if (this.frame) {
      const f = this.frame;
      ctx.fillStyle = 'rgba(236,244,250,0.95)';
      for (let i = 0; i < g.NX; i++) {
        const ice = 1 - f.open[i];
        if (ice <= 0.02) continue;
        const x = landW + i * this.colW;
        const th = 3 + 5 * ice;
        ctx.fillRect(x - 0.5, skyH - 1, this.colW + 1, th);
      }
    }

    // specks
    for (const p of this.parts) this.drawPart(ctx, p);

    this.drawGlobe(ctx, h);
    this.drawLabels(ctx);
  }

  drawPart(ctx, p) {
    const fade = Math.min(1, p.age * 3, (p.life - p.age) * 2);
    switch (p.kind) {
      case 'cyano':
        ctx.fillStyle = `rgba(110,240,190,${0.9 * fade})`;
        ctx.fillRect(p.x - 1, p.y - 1, 2.2, 2.2);
        break;
      case 'ferro':
        ctx.fillStyle = `rgba(240,214,90,${0.85 * fade})`;
        ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
        break;
      case 'rust':
        ctx.fillStyle = 'rgba(236,98,60,0.9)';
        ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
        break;
      case 'vent':
        ctx.fillStyle = `rgba(180,190,92,${0.8 * fade})`;
        ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
        break;
      case 'o2': {
        const a = p.y < this.skyH ? clamp((p.y - this.skyH * 0.25) / (this.skyH * 0.5), 0, 1) : 1;
        ctx.strokeStyle = `rgba(255,255,255,${0.85 * a})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case 'ch4': {
        const a = p.y < this.skyH ? clamp((p.y - this.skyH * 0.25) / (this.skyH * 0.5), 0, 1) : 1;
        ctx.fillStyle = `rgba(255,190,80,${0.9 * a})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.6, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      default: {
        // smoke and ash
        const r = 2 + p.age * 2.2;
        const ash = p.kind === 'ash';
        ctx.fillStyle = ash ? `rgba(120,70,50,${0.45 * fade})` : `rgba(150,146,140,${0.35 * fade})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  drawGlobe(ctx, h) {
    const r = Math.max(14, Math.min(this.skyH * 0.36, 34));
    const cx = this.W - r - 10;
    const cy = this.skyH * 0.5;
    const haze = h ? h.haze : 0;
    // air around it
    const halo = ctx.createRadialGradient(cx, cy, r, cx, cy, r + 6);
    halo.addColorStop(0, rgb(mix([150, 200, 240], [240, 170, 80], haze), 0.7));
    halo.addColorStop(1, rgb(mix([150, 200, 240], [240, 170, 80], haze), 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    // bands of latitude, coloured by temperature, white where frozen
    const T = this.frame ? this.frame.T : null;
    const n = T ? T.length : 18;
    for (let y = -r; y < r; y++) {
      const s = Math.min(1, Math.abs((y + 0.5) / r));
      const j = Math.min(n - 1, Math.floor(s * n));
      const t = T ? T[j] : 10;
      let col;
      if (t < -10) col = [234, 242, 248];
      else col = mix([40, 84, 130], [34, 128, 140], smooth((t + 10) / 40));
      ctx.fillStyle = rgb(col);
      ctx.fillRect(cx - r, cy + y, 2 * r, 1.2);
    }
    const shade = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
    shade.addColorStop(0, 'rgba(255,255,255,0.18)');
    shade.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = shade;
    ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
    ctx.restore();
  }

  drawLabels(ctx) {
    const { W, skyH, landW } = this;
    const small = W < 520;
    ctx.font = `${small ? 9.5 : 11}px "Atkinson Hyperlegible", system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    const label = (text, x, y, align = 'left') => {
      ctx.textAlign = align;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillText(text, x + 0.6, y + 0.8);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText(text, x, y);
    };
    const g = this.geo;
    const shelfX = landW + 4 * this.colW;
    label('shelf', shelfX, this.depthY(260), 'center');
    label('deep sea', landW + (g.NX * 0.42) * this.colW, this.depthY(2400), 'center');
    if (this.ridge >= 0) label(small ? 'vents' : 'ridge vents', landW + (this.ridge + 0.5) * this.colW, this.depthY(1500), 'center');
    // depth scale on the right
    ctx.textAlign = 'right';
    for (const [z, t] of [
      [100, '100 m'],
      [1000, '1 km'],
      [3000, '3 km'],
    ]) {
      const y = this.depthY(z);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(W - 6, y, 6, 1);
      label(t, W - 9, y, 'right');
    }
    if (!small) label('sky', 8, 12);
  }
}
