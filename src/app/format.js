// Numbers for people: superscript powers of ten, thousands separators, a
// real minus sign.

const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
export const sup = (n) => String(n).replace(/./g, (c) => SUP[c] ?? c);
const minus = (s) => s.replace(/^-/, '−');

export function sci(x, digits = 1, html = false) {
  if (!Number.isFinite(x)) return '–';
  if (x === 0) return '0';
  let p = Math.floor(Math.log10(Math.abs(x)));
  let m = (x / 10 ** p).toFixed(digits);
  if (Math.abs(Number(m)) >= 10) {
    p += 1;
    m = (x / 10 ** p).toFixed(digits);
  }
  m = m.replace(/\.0+$/, '');
  return minus(html ? `${m}×10<sup>${minus(String(p))}</sup>` : `${m}×10${sup(p)}`);
}

// Two significant figures by default, scientific notation when tiny or huge.
// With `html`, powers of ten are written with <sup> rather than with
// superscript characters, which many fonts draw badly.
export function num(x, sig = 2, html = false) {
  if (!Number.isFinite(x)) return '–';
  if (x === 0) return '0';
  const a = Math.abs(x);
  if (a >= 1e7 || a < 1e-3) return sci(x, 1, html);
  const p = Math.floor(Math.log10(a));
  const r = Number(x.toPrecision(sig));
  return minus(r.toLocaleString('en-US', { maximumFractionDigits: Math.max(0, sig - 1 - p) }));
}

// Oxygen as a share of today's: a percentage once it is large enough to
// read that way, a power of ten before.
export function pal(x, html = false) {
  if (x >= 1e-3) return `${num(x * 100)} %`;
  return sci(x, 0, html).replace(/^1×/, '');
}

export const ppm = (x, html = false) => `${num(x, 2, html)} ppm`;
export const temp = (t) => `${minus((Math.abs(t) < 0.05 ? 0 : t).toFixed(1))} °C`;
export const age = (a) => a.toFixed(3);
export const fixed = (x, d = 1) => minus(x.toFixed(d));

export function iceText(lat) {
  if (lat < 2) return 'to the equator';
  if (lat >= 89.5) return 'none';
  return `from ${Math.round(lat)}°`;
}

export function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}
