// KILN's kept result, the bowl's record (LOOK.md, kept results): the drawing the fire made, the
// inside's crackle in the bowl's own chart, as if the glaze were lifted off and laid flat; the
// firing curve beneath it; the conditions in one line. Vector, an A3 page in millimeters.
//
// The crackle's lines are the fracture model's own polylines. Each crack is drawn heavier the
// earlier in the cooling it opened: the first cracks have been under strain longest, and open
// widest (glaze.ts).

import type { Crack } from './fracture.ts';

const INK = '#2b2723', FAINT = '#c9c1b3', PAPER = '#f1ece2', SEAL = '#b3322a';
const f = (n: number) => n.toFixed(2);

export type Curve = { t: number; celsius: number }[];

export function bowlRecord(o: { cracks: Crack[]; radius: number; curve: Curve; opened: number; caption: string; note: string }): string {
  const W = 297, H = 420;
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}mm" height="${H}mm">`);
  out.push(`<rect width="${W}" height="${H}" fill="${PAPER}"/>`);

  // The crackle, in the inside's chart: arc length from the well's center, and azimuth.
  const cx = W / 2, cy = 150, R = 118, s = R / o.radius;
  out.push(`<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${FAINT}" stroke-width="0.3"/>`);
  out.push(`<clipPath id="glaze"><circle cx="${cx}" cy="${cy}" r="${R}"/></clipPath><g clip-path="url(#glaze)" fill="none" stroke="${INK}" stroke-linecap="round" stroke-linejoin="round">`);
  // Later cracks first in the file, so the earlier lie on top; each carries its place in the cooling,
  // so the card can draw them in the order they opened.
  const rank = new Map([...o.cracks].sort((a, b) => a.load - b.load).map((c, i) => [c, i]));
  const sorted = [...o.cracks].sort((a, b) => b.load - a.load);
  for (const crack of sorted) {
    const p = crack.points;
    const d: string[] = [];
    for (let j = 0; j < p.length / 2; j++) d.push(`${j ? 'L' : 'M'}${f(cx + p[j * 2] * s)} ${f(cy - p[j * 2 + 1] * s)}`);
    const w = 0.12 + 0.3 * (1 - crack.load);
    out.push(`<path data-draw="${rank.get(crack)}" d="${d.join('')}" stroke-width="${f(w)}" opacity="${f(0.55 + 0.45 * (1 - crack.load))}"/>`);
  }
  out.push('</g>');

  // The firing curve: temperature against time, the kiln's opening marked.
  const gx = 22, gy = 300, gw = W - 44, gh = 52;
  const T = Math.max(...o.curve.map((c) => c.celsius)), tEnd = o.curve[o.curve.length - 1]?.t ?? 1;
  const at = (t: number, c: number) => `${f(gx + (t / tEnd) * gw)},${f(gy + gh - (c / 1300) * gh)}`;
  out.push(`<line x1="${gx}" y1="${gy + gh}" x2="${gx + gw}" y2="${gy + gh}" stroke="${FAINT}" stroke-width="0.25"/>`);
  out.push(`<polyline data-draw="-1" points="${o.curve.map((c) => at(c.t, c.celsius)).join(' ')}" fill="none" stroke="${INK}" stroke-width="0.45"/>`);
  const ox = gx + (o.opened / tEnd) * gw;
  out.push(`<line x1="${f(ox)}" y1="${gy}" x2="${f(ox)}" y2="${gy + gh}" stroke="${INK}" stroke-width="0.2" stroke-dasharray="1 1"/>`);
  out.push(`<text x="${f(ox + 1.5)}" y="${gy + 4}" font-family="Martian Mono, monospace" font-size="2.8" fill="${INK}">kiln opened</text>`);
  out.push(`<text x="${gx}" y="${gy - 3}" font-family="Martian Mono, monospace" font-size="2.8" fill="${INK}" opacity="0.7">${Math.round(T).toLocaleString('en-US')} °C · firing curve, compressed</text>`);

  out.push(`<text x="22" y="380" font-family="Martian Mono, monospace" font-size="3.4" fill="${INK}">${o.caption}</text>`);
  out.push(`<text x="22" y="387" font-family="Martian Mono, monospace" font-size="3.4" fill="${INK}" opacity="0.7">${o.note}</text>`);
  out.push(`<text x="22" y="395" font-family="Martian Mono, monospace" font-size="3.4" fill="${INK}" opacity="0.7">Drawn by the fire. Conditions set by the visitor. Crackle simulated: PA.</text>`);
  out.push(`<rect x="${W - 22 - 13}" y="379" width="13" height="13" fill="${SEAL}"/>`);
  out.push(`<text x="${W - 22 - 6.5}" y="388.2" font-family="serif" font-size="5.2" fill="${PAPER}" text-anchor="middle">窑变</text>`);
  out.push('</svg>');
  return out.join('');
}
