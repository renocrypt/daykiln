// RULE's kept result, the rule sheet (LOOK.md, kept results): the construction drawn once at the
// top, one tile with its contact angle; below it, the field the rule generates, over the tiling as a
// faint underlay. Vector, an A3 page in millimeters. Every line on it is the pattern's own.

import type { Pattern } from './hankin.ts';
import type { Vec } from './tiling.ts';

const INK = '#2b2723', FAINT = '#c9c1b3', PAPER = '#f1ece2', SEAL = '#b3322a';
const f = (n: number) => n.toFixed(2);

export function ruleSheet(pattern: Pattern, caption: string): string {
  const { tiling, segments } = pattern;
  const W = 297, H = 420;
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}mm" height="${H}mm">`);
  out.push(`<rect width="${W}" height="${H}" fill="${PAPER}"/>`);

  // The construction: the largest tile, its edges' midpoints, the lines crossing each at θ.
  {
    const tile = tiling.tiles[0];
    const cx = tile.reduce((s, p) => s + p[0], 0) / tile.length, cy = tile.reduce((s, p) => s + p[1], 0) / tile.length;
    const r = Math.max(...tile.map((p) => Math.hypot(p[0] - cx, p[1] - cy)));
    const s = 62 / r, ox = W / 2, oy = 108;
    const at = (p: Vec): Vec => [ox + (p[0] - cx) * s, oy - (p[1] - cy) * s];
    out.push(`<polygon points="${tile.map((p) => at(p).map(f).join(',')).join(' ')}" fill="none" stroke="${INK}" stroke-width="0.25"/>`);
    for (const seg of segments.filter((sg) => sg.tile === 0)) {
      const [a, b] = [at(seg.a), at(seg.b)];
      out.push(`<line data-draw="0" x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}" stroke="${INK}" stroke-width="0.7" stroke-linecap="round"/>`);
      out.push(`<circle cx="${f(a[0])}" cy="${f(a[1])}" r="0.9" fill="${INK}"/>`);
    }
    // The contact angle, drawn once, at the first edge's midpoint.
    const e0 = at(tile[0]), e1 = at(tile[1]);
    const m: Vec = [(e0[0] + e1[0]) / 2, (e0[1] + e1[1]) / 2];
    const seg = segments.find((sg) => sg.tile === 0 && sg.edge === 0);
    if (seg) {
      const b = at(seg.b);
      const a0 = Math.atan2(e1[1] - e0[1], e1[0] - e0[0]), a1 = Math.atan2(b[1] - m[1], b[0] - m[0]);
      let sweep = a1 - a0;
      while (sweep > Math.PI) sweep -= 2 * Math.PI;
      while (sweep < -Math.PI) sweep += 2 * Math.PI;
      const R = 11; // the arc; its label stands outside the tile, clear of the lines
      const p0: Vec = [m[0] + R * Math.cos(a0), m[1] + R * Math.sin(a0)], p1: Vec = [m[0] + R * Math.cos(a1), m[1] + R * Math.sin(a1)];
      out.push(`<path d="M ${f(p0[0])} ${f(p0[1])} A ${R} ${R} 0 0 ${sweep > 0 ? 1 : 0} ${f(p1[0])} ${f(p1[1])}" fill="none" stroke="${SEAL}" stroke-width="0.35"/>`);
      const θ = ((pattern.angle * 180) / Math.PI).toFixed(1).replace(/\.0$/, '');
      const away = Math.atan2(m[1] - oy, m[0] - ox); // away from the tile's center
      out.push(`<text x="${f(m[0] + 12 * Math.cos(away))}" y="${f(m[1] + 12 * Math.sin(away) + 1.2)}" font-family="Martian Mono, monospace" font-size="3.4" fill="${SEAL}" text-anchor="middle">θ ${θ}°</text>`);
    }
  }

  // The field: the pattern over several repeats, the tiling beneath it, cut to a frame.
  {
    const fx = 22, fy = 196, fw = W - 44, fh = 170;
    const s = fw / (5.5 * tiling.width);
    const at = (p: Vec, i: number, j: number): Vec => [fx + (p[0] + i * tiling.width) * s, fy + fh - (p[1] + j * tiling.height) * s];
    out.push(`<clipPath id="field"><rect x="${fx}" y="${fy}" width="${fw}" height="${fh}"/></clipPath><g clip-path="url(#field)">`);
    const cols = Math.ceil(fw / (tiling.width * s)) + 2, rows = Math.ceil(fh / (tiling.height * s)) + 2;
    for (let j = -1; j < rows; j++) {
      for (let i = -1; i < cols; i++) {
        for (const tile of tiling.tiles) out.push(`<polygon points="${tile.map((p) => at(p, i, j).map(f).join(',')).join(' ')}" fill="none" stroke="${FAINT}" stroke-width="0.2"/>`);
      }
    }
    const d: string[] = [];
    for (let j = -1; j < rows; j++) {
      for (let i = -1; i < cols; i++) {
        for (const seg of segments) { const a = at(seg.a, i, j), b = at(seg.b, i, j); d.push(`M${f(a[0])} ${f(a[1])}L${f(b[0])} ${f(b[1])}`); }
      }
    }
 out.push(`<path data-draw="1" d="${d.join('')}" fill="none" stroke="${INK}" stroke-width="${f(Math.max(0.35, 5 * s))}" stroke-linecap="round" stroke-linejoin="round"/>`);
    out.push(`</g><rect x="${fx}" y="${fy}" width="${fw}" height="${fh}" fill="none" stroke="${INK}" stroke-width="0.25"/>`);
  }

  // The caption, one line; the maker; the seal, the one place hue lives.
  out.push(`<text x="22" y="388" font-family="Martian Mono, monospace" font-size="3.4" fill="${INK}">${caption}</text>`);
  out.push(`<text x="22" y="395" font-family="Martian Mono, monospace" font-size="3.4" fill="${INK}" opacity="0.7">Drawn by the rule. Conditions set by the visitor.</text>`);
  out.push(`<rect x="${W - 22 - 13}" y="379" width="13" height="13" fill="${SEAL}"/>`);
  out.push(`<text x="${W - 22 - 6.5}" y="388.2" font-family="serif" font-size="5.2" fill="${PAPER}" text-anchor="middle">窑变</text>`);
  out.push('</svg>');
  return out.join('');
}
