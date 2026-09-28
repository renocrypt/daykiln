// PLUMB's kept result, the funicular record (LOOK.md, kept results). Gaudí photographed his hanging
// models from below, turned the photographs upside down, and drew the church over them; this is
// that record: the net photographed as it hung, at rest, turned over, its strings traced over the
// photograph from the ground up; its plan, with the lead hung on it; and the weights table, from
// which the form re-runs. An A3 page in millimeters, vector but for the photograph.

import type { Net } from './net.ts';

const INK = '#2b2723', FAINT = '#c9c1b3', PAPER = '#f1ece2', SEAL = '#b3322a';
const f = (n: number) => n.toFixed(2);
const text = (x: number, y: number, s: string, size = 3.4, extra = '') => `<text x="${f(x)}" y="${f(y)}" font-family="Martian Mono, monospace" font-size="${size}" fill="${INK}" ${extra}>${s}</text>`;

/** A knot's name: its column a letter, its row a number, as on a board. */
export const knotName = (net: Net, k: number) => `${'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[k % net.knots]}${Math.floor(k / net.knots) + 1}`;

export type Photograph = { url: string; at: Float32Array }; // each knot's place on it, 0 … 1 across and down

export function funicularRecord(net: Net, o: { caption: string; note: string; photo: Photograph }): string {
  const W = 297, H = 420;
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}mm" height="${H}mm">`);
  out.push(`<rect width="${W}" height="${H}" fill="${PAPER}"/>`);
  const P = net.position, n = net.count;

  // The photograph, turned over, and the strings traced over it, from the ground up: each carries
  // its height standing, which is its depth hanging.
  const box = { x: 30, y: 36, w: W - 60, h: ((W - 60) * 3) / 4 };
  out.push(`<defs><clipPath id="photo"><rect x="${box.x}" y="${box.y}" width="${f(box.w)}" height="${f(box.h)}"/></clipPath></defs>`);
  out.push(`<image href="${o.photo.url}" x="${box.x}" y="${box.y}" width="${f(box.w)}" height="${f(box.h)}" preserveAspectRatio="none"/>`);
  const px = (k: number) => box.x + o.photo.at[k * 2] * box.w, py = (k: number) => box.y + o.photo.at[k * 2 + 1] * box.h;
  const strings: { d: string; h: number }[] = [];
  for (let e = 0; e < net.strings.length; e += 2) {
    const a = net.strings[e], b = net.strings[e + 1];
    strings.push({ d: `M${f(px(a))} ${f(py(a))}L${f(px(b))} ${f(py(b))}`, h: -(P[a * 3 + 1] + P[b * 3 + 1]) / 2 });
  }
  strings.sort((a, b) => a.h - b.h);
  out.push(`<g clip-path="url(#photo)" fill="none" stroke="${PAPER}" stroke-width="0.3" stroke-linecap="round" opacity="0.9">`);
  strings.forEach((sg, i) => out.push(`<path data-draw="${i}" d="${sg.d}"/>`));
  out.push('</g>');
  const rise = Math.max(...Array.from({ length: n }, (_, k) => -P[k * 3 + 1]));
  out.push(text(box.x, box.y - 6, `Photographed from below as it hung, and turned over, as Gaudí turned his · rise ${Math.round(rise * 1000)} mm on a span of ${Math.round(net.options.span * 1000)} mm`, 2.8, 'opacity="0.7"'));

  // The plan, and the lead hung on it.
  const plan = { x: 30, y: 246, size: 110 };
  const half = Math.max(...Array.from({ length: n }, (_, k) => Math.max(Math.abs(P[k * 3]), Math.abs(P[k * 3 + 2]))));
  const s2 = plan.size / (2 * half);
  const qx = (k: number) => plan.x + plan.size / 2 + P[k * 3] * s2, pz = (k: number) => plan.y + plan.size / 2 + P[k * 3 + 2] * s2;
  out.push(`<g fill="none" stroke="${FAINT}" stroke-width="0.2">`);
  for (let e = 0; e < net.strings.length; e += 2) out.push(`<line x1="${f(qx(net.strings[e]))}" y1="${f(pz(net.strings[e]))}" x2="${f(qx(net.strings[e + 1]))}" y2="${f(pz(net.strings[e + 1]))}"/>`);
  out.push('</g>');
  for (const k of net.supports) out.push(`<rect x="${f(qx(k) - 1.4)}" y="${f(pz(k) - 1.4)}" width="2.8" height="2.8" fill="${INK}"/>`);
  const hung = Array.from({ length: n }, (_, k) => k).filter((k) => net.load[k] > 0);
  for (const k of hung) {
    const r = 1.2 * Math.cbrt(net.load[k] / 0.02);
    out.push(`<circle cx="${f(qx(k))}" cy="${f(pz(k))}" r="${f(r)}" fill="${INK}"/>`);
    out.push(text(qx(k) + r + 0.8, pz(k) - r - 0.4, knotName(net, k), 2.2, 'opacity="0.8"'));
  }
  out.push(text(plan.x, plan.y - 6, `Plan · ${net.knots} × ${net.knots} knots, strings ${Math.round(net.options.string * 1000)} mm, four supports`, 2.8, 'opacity="0.7"'));

  // The weights table.
  const tx = 170, ty = 246;
  out.push(text(tx, ty - 6, 'Weights', 2.8, 'opacity="0.7"'));
  out.push(text(tx, ty, 'knot', 2.6, 'opacity="0.6"') + text(tx + 22, ty, 'x mm', 2.6, 'opacity="0.6"') + text(tx + 44, ty, 'z mm', 2.6, 'opacity="0.6"') + text(tx + 72, ty, 'g', 2.6, 'opacity="0.6" text-anchor="end"'));
  const rows = hung.slice(0, 26);
  rows.forEach((k, i) => {
    const y = ty + 6 + i * 4.4;
    out.push(text(tx, y, knotName(net, k), 2.6) + text(tx + 22, y, Math.round(P[k * 3] * 1000).toString(), 2.6) + text(tx + 44, y, Math.round(P[k * 3 + 2] * 1000).toString(), 2.6) + text(tx + 72, y, Math.round(net.load[k] * 1000).toString(), 2.6, 'text-anchor="end"'));
  });
  if (hung.length > rows.length) out.push(text(tx, ty + 6 + rows.length * 4.4, `and ${hung.length - rows.length} more`, 2.6, 'opacity="0.6"'));
  if (!hung.length) out.push(text(tx, ty + 6, 'none: the net under its knots\' 2 g', 2.6, 'opacity="0.6"'));

  out.push(text(22, 380, o.caption));
  out.push(text(22, 387, o.note, 3.4, 'opacity="0.7"'));
  out.push(text(22, 395, 'Drawn by gravity. Loads set by the visitor. Form found by position-based dynamics: PA.', 3.4, 'opacity="0.7"'));
  out.push(`<rect x="${W - 22 - 13}" y="379" width="13" height="13" fill="${SEAL}"/>`);
  out.push(`<text x="${W - 22 - 6.5}" y="388.2" font-family="serif" font-size="5.2" fill="${PAPER}" text-anchor="middle">窑变</text>`);
  out.push('</svg>');
  return out.join('');
}
