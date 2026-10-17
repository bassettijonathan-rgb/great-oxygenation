// The history so far as stacked charts on one shared time axis, with what
// the rocks say drawn behind, and the strip of rock each step laid down.

// A tick label on a log axis, right-aligned at x: plain for 0.01 to 1000,
// otherwise 10 with a raised power.
function logLabel(ctx, v, x, y, size) {
  const p = Math.round(Math.log10(v));
  if (p >= -2 && p <= 3) {
    ctx.fillText(String(v >= 1 ? Math.round(v) : v), x, y);
    return;
  }
  const big = `${size}px "IBM Plex Mono", ui-monospace, monospace`;
  const small = `${size - 2.5}px "IBM Plex Mono", ui-monospace, monospace`;
  const e = String(p).replace('-', '−');
  ctx.font = small;
  const we = ctx.measureText(e).width;
  ctx.fillText(e, x, y - 4);
  ctx.font = big;
  ctx.fillText('10', x - we - 0.5, y);
}

export const PANELS = [
  {
    id: 'o2',
    title: 'Oxygen in the air, × today',
    log: true,
    min: 1e-14,
    max: 1,
    ticks: [1e-12, 1e-8, 1e-4, 1],
    series: [{ key: 'pal', color: 'sky', width: 2 }],
    hline: { y: 1e-5, label: 'sulfur signal ends above this' },
    refs: [{ from: 2.46, to: 2.43, label: 'rise in rocks' }],
  },
  {
    id: 'gh',
    title: 'Greenhouse gases, ppm',
    log: true,
    min: 0.01,
    max: 1e6,
    ticks: [0.01, 1, 100, 1e4, 1e6],
    series: [
      { key: 'ch4', color: 'amber', label: 'methane', width: 2 },
      { key: 'co2', color: 'ink2', label: 'CO₂', scale: 1e6, width: 1.6 },
    ],
  },
  {
    id: 'temp',
    title: 'Average temperature, °C',
    min: -40,
    max: 30,
    ticks: [-30, -15, 0, 15],
    series: [{ key: 'T', color: 'rust', width: 2 }],
    glacial: true,
    refs: [{ from: 2.43, to: 2.29, label: 'glacial deposits' }],
  },
  {
    id: 's',
    title: 'Sulfur isotopes Δ³³S, ‰',
    min: -5,
    max: 12,
    ticks: [0, 5, 10],
    series: [{ key: 'd33S', color: 'ink', dots: true }],
    refs: [{ from: 2.33, to: 2.22, label: 'signal ends in rocks' }],
  },
  {
    id: 'c',
    title: 'Carbon isotopes δ¹³C, ‰',
    min: -8,
    max: 14,
    ticks: [-5, 0, 5, 10],
    series: [{ key: 'd13C', color: 'teal', width: 1.4 }],
    refs: [{ from: 2.22, to: 2.06, label: 'Lomagundi' }],
  },
  {
    id: 'bif',
    title: 'Banded iron laid down, 10¹² mol/yr',
    min: 0,
    max: 10,
    ticks: [0, 5, 10],
    series: [{ key: 'bifOx', color: 'rust', scale: 1e-12, fill: true, width: 1.4 }],
    refs: [
      { from: 2.6, to: 2.45, label: 'great BIFs' },
      { from: 1.89, to: 1.87, label: '' },
    ],
  },
];

const PAD = { left: 40, right: 10, title: 17, gap: 8, strip: 16, axis: 22 };

export class Charts {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.points = [];
    this.start = 3;
    this.end = 1.8;
    this.cursor = null;
    this.lith = {};
    this.lips = [];
    this.W = 0;
    this.H = 0;
  }

  setRange(start, end) {
    this.start = start;
    this.end = end;
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.W = Math.max(1, r.width);
    this.H = Math.max(1, r.height);
    this.canvas.width = Math.round(this.W * dpr);
    this.canvas.height = Math.round(this.H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = PANELS.length;
    const row = (this.H - PAD.strip - PAD.axis) / n; // title, plot and gap
    const ph = row - PAD.title - PAD.gap;
    this.boxes = PANELS.map((p, i) => ({ panel: p, y: i * row + PAD.title, h: ph }));
    this.stripY = n * row;
  }

  x(age) {
    return PAD.left + ((this.start - age) / (this.start - this.end)) * (this.W - PAD.left - PAD.right);
  }

  ageAt(x) {
    const t = (x - PAD.left) / (this.W - PAD.left - PAD.right);
    return this.start - Math.min(1, Math.max(0, t)) * (this.start - this.end);
  }

  panelAt(y) {
    return this.boxes?.find((b) => y >= b.y && y <= b.y + b.h)?.panel.id ?? null;
  }

  panelTop(id) {
    return this.boxes?.find((b) => b.panel.id === id)?.y ?? 0;
  }

  // nearest point to an age
  pointAt(age) {
    const P = this.points;
    if (!P.length) return null;
    const i = Math.round((P[0].age - age) / (P[0].age - P[P.length - 1].age || 1) * (P.length - 1));
    return P[Math.min(P.length - 1, Math.max(0, i))];
  }

  draw(colors) {
    const ctx = this.ctx;
    const { W, H } = this;
    if (!this.boxes) return;
    ctx.clearRect(0, 0, W, H);
    const P = this.points;
    const x0 = PAD.left;
    const x1 = W - PAD.right;
    const font = (s, w = 400) => `${w} ${s}px "Atkinson Hyperlegible", system-ui, sans-serif`;
    const mono = (s) => `${s}px "IBM Plex Mono", ui-monospace, monospace`;

    // spans with ice, from the history
    const spans = (test) => {
      const out = [];
      let a = null;
      for (const p of P) {
        if (test(p)) {
          if (a === null) a = p.age + 0.00025;
        } else if (a !== null) {
          out.push([a, p.age + 0.00025]);
          a = null;
        }
      }
      if (a !== null && P.length) out.push([a, P[P.length - 1].age]);
      return out;
    };
    const snow = spans((p) => p.iceLat < 2);
    const glacial = spans((p) => p.iceLat < 40);

    for (const box of this.boxes) {
      const p = box.panel;
      const yOf = (v) => {
        const t = p.log ? (Math.log10(Math.max(v, p.min)) - Math.log10(p.min)) / (Math.log10(p.max) - Math.log10(p.min)) : (v - p.min) / (p.max - p.min);
        return box.y + box.h - Math.min(1, Math.max(0, t)) * box.h;
      };
      // frame and grid
      ctx.fillStyle = colors.plot;
      ctx.fillRect(x0, box.y, x1 - x0, box.h);
      ctx.strokeStyle = colors.line;
      ctx.lineWidth = 1;
      ctx.font = mono(9.5);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (const t of p.ticks) {
        const y = Math.round(yOf(t)) + 0.5;
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(x1, y);
        ctx.stroke();
        ctx.fillStyle = colors.ink3;
        if (p.log) logLabel(ctx, t, x0 - 5, y, 9.5);
        else ctx.fillText(String(t).replace('-', '−'), x0 - 5, y);
      }
      // what the rocks say, behind everything
      for (const r of p.refs ?? []) {
        const a = this.x(r.from);
        const b = Math.max(a + 2, this.x(r.to));
        ctx.fillStyle = colors.ref;
        ctx.fillRect(a, box.y, b - a, box.h);
        if (r.label) {
          ctx.fillStyle = colors.ink3;
          ctx.font = font(9.5);
          ctx.textAlign = 'left';
          ctx.textBaseline = 'bottom';
          ctx.fillText(r.label, a + 3, box.y + box.h - 2);
        }
      }
      for (const [a, b] of p.glacial ? glacial : []) {
        ctx.fillStyle = colors.iceSoft;
        ctx.fillRect(this.x(a), box.y, Math.max(1, this.x(b) - this.x(a)), box.h);
      }
      for (const [a, b] of snow) {
        ctx.fillStyle = colors.ice;
        ctx.fillRect(this.x(a), box.y, Math.max(1, this.x(b) - this.x(a)), box.h);
      }
      if (p.hline) {
        const y = Math.round(yOf(p.hline.y)) + 0.5;
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = colors.ink3;
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(x1, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = colors.ink3;
        ctx.font = font(9.5);
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText(p.hline.label, x1 - 3, y - 2);
      }
      // the data
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, box.y, x1 - x0, box.h);
      ctx.clip();
      for (const s of p.series) {
        const col = colors[s.color];
        const val = (q) => q[s.key] * (s.scale ?? 1);
        if (s.dots) {
          ctx.fillStyle = col;
          for (const q of P) ctx.fillRect(this.x(q.age) - 0.9, yOf(val(q)) - 0.9, 1.8, 1.8);
          continue;
        }
        if (!P.length) continue;
        ctx.beginPath();
        let px = -1;
        P.forEach((q, i) => {
          const X = this.x(q.age);
          if (i > 0 && X - px < 0.5 && i < P.length - 1) return;
          px = X;
          const Y = yOf(val(q));
          if (i === 0) ctx.moveTo(X, Y);
          else ctx.lineTo(X, Y);
        });
        if (s.fill) {
          ctx.lineTo(this.x(P[P.length - 1].age), box.y + box.h);
          ctx.lineTo(this.x(P[0].age), box.y + box.h);
          ctx.closePath();
          ctx.globalAlpha = 0.35;
          ctx.fillStyle = col;
          ctx.fill();
          ctx.globalAlpha = 1;
        } else {
          ctx.strokeStyle = col;
          ctx.lineWidth = s.width ?? 1.6;
          ctx.lineJoin = 'round';
          ctx.stroke();
        }
      }
      ctx.restore();
      // title and key, above the plot
      ctx.font = font(11.5, 700);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      const ty = box.y - 5;
      ctx.fillStyle = colors.ink2;
      ctx.fillText(p.title, x0, ty);
      let tx = x0 + ctx.measureText(p.title).width + 12;
      if (p.series.length > 1) {
        ctx.font = font(11);
        for (const s of p.series) {
          ctx.fillStyle = colors[s.color];
          ctx.fillRect(tx, ty - 4, 10, 2.5);
          ctx.fillText(s.label, tx + 13, ty);
          tx += ctx.measureText(s.label).width + 24;
        }
      }
    }

    // large igneous provinces: marks along the top of the first chart
    const top = this.boxes[0].y;
    ctx.fillStyle = colors.amber;
    let prevLip = 0;
    for (const q of P) {
      if (q.lip && !prevLip) {
        const X = this.x(q.age);
        ctx.beginPath();
        ctx.moveTo(X - 4, top);
        ctx.lineTo(X + 4, top);
        ctx.lineTo(X, top + 6);
        ctx.closePath();
        ctx.fill();
      }
      prevLip = q.lip;
    }

    // the rock strip
    const sy = this.stripY;
    ctx.fillStyle = colors.plot;
    ctx.fillRect(x0, sy, x1 - x0, PAD.strip - 4);
    let runStart = null;
    for (let i = 0; i < P.length; i++) {
      const q = P[i];
      if (runStart === null) runStart = i;
      const next = P[i + 1];
      if (!next || next.lith !== q.lith) {
        const a = this.x(P[runStart].age + 0.0005);
        const b = this.x(q.age);
        ctx.fillStyle = this.lith[q.lith]?.color ?? colors.ink3;
        ctx.fillRect(a, sy, Math.max(1, b - a), PAD.strip - 4);
        runStart = null;
      }
    }
    ctx.fillStyle = colors.ink3;
    ctx.font = font(9.5);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText('rock', x0 - 5, sy + (PAD.strip - 4) / 2);

    // the time axis
    const ay = sy + PAD.strip;
    ctx.strokeStyle = colors.ink3;
    ctx.fillStyle = colors.ink3;
    ctx.font = mono(10);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const every = W < 560 ? 2 : 1; // label every this many tenths of a billion years
    const tenths = Math.round((this.start - this.end) * 10);
    for (let i = 0; i <= tenths; i++) {
      const a = this.start - i / 10;
      const X = Math.round(this.x(a)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(X, ay - 4);
      ctx.lineTo(X, ay);
      ctx.stroke();
      if (i % every === 0) ctx.fillText(a.toFixed(1), X, ay + 2);
    }
    ctx.textAlign = 'left';
    ctx.fillText('Ga', 6, ay + 2);

    // now, and the cursor
    if (P.length) {
      const X = Math.round(this.x(P[P.length - 1].age)) + 0.5;
      ctx.strokeStyle = colors.ink2;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(X, this.boxes[0].y);
      ctx.lineTo(X, sy + PAD.strip - 4);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (this.cursor !== null && P.length) {
      const X = Math.round(this.x(this.cursor)) + 0.5;
      ctx.strokeStyle = colors.ink;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(X, this.boxes[0].y);
      ctx.lineTo(X, sy + PAD.strip - 4);
      ctx.stroke();
    }
  }
}
