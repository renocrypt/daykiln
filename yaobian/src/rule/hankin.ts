// Hankin's method, polygons in contact (Hankin 1925; Kaplan 2005). At the midpoint of every tile
// edge two lines cross, each at the contact angle θ to the edge. Inside the tile each line runs
// until it meets another; the lines' meeting is decided greedily, shortest pair first, as Kaplan
// does. The pattern is the union of those segments, and nothing else is drawn.
//
// Across a shared edge, the two tiles' lines continue each other exactly: a line leaving one tile
// at θ to the edge enters the next at θ to the same edge. So every midpoint is a crossing.

import type { Tiling, Vec } from './tiling.ts';

export type Segment = {
  /** The contact point: the midpoint of a tile edge, mm. */
  a: Vec;
  /** Where the line met its partner inside the tile, mm: a bend in the strap. */
  b: Vec;
  tile: number;
  edge: number;
  /** The segment that met this one at b. Partners are adjacent: 2k and 2k + 1. */
  partner: number;
};

export type Crossing = {
  at: Vec;
  /** Unit directions of the two lines through the crossing. */
  u: [Vec, Vec];
  /** Segment indices on each line, near the crossing. */
  lines: [number[], number[]];
};

export type Pattern = {
  tiling: Tiling;
  angle: number; // radians
  segments: Segment[];
  crossings: Crossing[];
};

const EPS = 1e-7;
const sub = (p: Vec, q: Vec): Vec => [p[0] - q[0], p[1] - q[1]];
const add = (p: Vec, q: Vec): Vec => [p[0] + q[0], p[1] + q[1]];
const mul = (p: Vec, k: number): Vec => [p[0] * k, p[1] * k];
const cross2 = (p: Vec, q: Vec) => p[0] * q[1] - p[1] * q[0];
const unit = (p: Vec): Vec => mul(p, 1 / Math.hypot(p[0], p[1]));

function inside(poly: Vec[], p: Vec, tolerance: number): boolean {
  for (let i = 0; i < poly.length; i++) {
    const e = sub(poly[(i + 1) % poly.length], poly[i]);
    if (cross2(e, sub(p, poly[i])) / Math.hypot(e[0], e[1]) < -tolerance) return false;
  }
  return true;
}

/** The segments of one tile at contact angle θ. */
function tileSegments(poly: Vec[], tile: number, theta: number): Segment[] {
  type Ray = { o: Vec; d: Vec; edge: number };
  const rays: Ray[] = [];
  for (let i = 0; i < poly.length; i++) {
    const v0 = poly[i], v1 = poly[(i + 1) % poly.length];
    const d = unit(sub(v1, v0));
    const n: Vec = [-d[1], d[0]]; // inward, for a counterclockwise polygon
    const m = mul(add(v0, v1), 0.5);
    rays.push({ o: m, d: add(mul(d, Math.cos(theta)), mul(n, Math.sin(theta))), edge: i });
    rays.push({ o: m, d: add(mul(d, -Math.cos(theta)), mul(n, Math.sin(theta))), edge: i });
  }
  const size = Math.max(...poly.map((p) => Math.hypot(p[0] - poly[0][0], p[1] - poly[0][1])));
  type Pair = { i: number; j: number; t: number; p: Vec };
  const pairs: Pair[] = [];
  for (let i = 0; i < rays.length; i++) {
    for (let j = i + 1; j < rays.length; j++) {
      const r = rays[i], s = rays[j];
      if (r.edge === s.edge) continue;
      const den = cross2(r.d, s.d);
      if (Math.abs(den) < EPS) continue;
      const w = sub(s.o, r.o);
      const ti = cross2(w, s.d) / den, tj = cross2(w, r.d) / den;
      if (ti <= EPS || tj <= EPS) continue;
      const p = add(r.o, mul(r.d, ti));
      if (!inside(poly, p, size * 1e-6)) continue;
      pairs.push({ i, j, t: ti + tj, p });
    }
  }
  pairs.sort((x, y) => x.t - y.t);
  const used = new Uint8Array(rays.length);
  const out: Segment[] = [];
  for (const { i, j, p } of pairs) {
    if (used[i] || used[j]) continue;
    used[i] = used[j] = 1;
    out.push({ a: rays[i].o, b: p, tile, edge: rays[i].edge, partner: -1 }, { a: rays[j].o, b: p, tile, edge: rays[j].edge, partner: -1 });
  }
  return out;
}

/** The rule applied to a tiling: every segment in one repeat, and every crossing. */
export function hankin(tiling: Tiling, theta: number): Pattern {
  const segments = tiling.tiles.flatMap((poly, t) => tileSegments(poly, t, theta));
  segments.forEach((s, i) => { s.partner = i ^ 1; });
  return { tiling, angle: theta, segments, crossings: crossings(tiling, segments) };
}

/** Wrap a point into the repeat [0, W) × [0, H). */
export function wrap(tiling: Tiling, p: Vec): Vec {
  const { width: W, height: H } = tiling;
  return [((p[0] % W) + W) % W, ((p[1] % H) + H) % H];
}

/**
 * Every crossing in one repeat: at each contact point, where two tiles' lines continue each other;
 * and inside tiles, where two segments cross properly.
 */
function crossings(tiling: Tiling, segments: Segment[]): Crossing[] {
  const out: Crossing[] = [];
  const tol = 1e-6 * tiling.width;
  // Contact points: group segment starts by their wrapped position.
  const groups = new Map<string, number[]>();
  const key = (p: Vec) => {
    const q = wrap(tiling, p);
    // Snap so points on the repeat's seam fall into one group.
    const x = Math.round(q[0] / tol) % Math.round(tiling.width / tol);
    const y = Math.round(q[1] / tol) % Math.round(tiling.height / tol);
    return `${x},${y}`;
  };
  segments.forEach((s, i) => {
    const k = key(s.a);
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(i);
  });
  for (const members of groups.values()) {
    if (members.length !== 4) continue; // an edge on the boundary of a finite patch; none in a tiling
    const at = wrap(tiling, segments[members[0]].a);
    // Directions leaving the contact point; pair each with the one pointing the opposite way.
    const dirs = members.map((i) => unit(sub(segments[i].b, segments[i].a)));
    const partner = (k: number) => dirs.findIndex((d, j) => j !== k && d[0] * dirs[k][0] + d[1] * dirs[k][1] < -1 + 1e-6);
    const first = 0, second = partner(0);
    const rest = [0, 1, 2, 3].filter((k) => k !== first && k !== second);
    if (second < 0 || rest.length !== 2) continue;
    out.push({ at, u: [dirs[first], dirs[rest[0]]], lines: [[members[first], members[second]], [members[rest[0]], members[rest[1]]]] });
  }
  // Proper crossings inside a tile.
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const s = segments[i], t = segments[j];
      if (s.tile !== t.tile) continue;
      const r = sub(s.b, s.a), q = sub(t.b, t.a);
      const den = cross2(r, q);
      if (Math.abs(den) < EPS) continue;
      const w = sub(t.a, s.a);
      const u = cross2(w, q) / den, v = cross2(w, r) / den;
      if (u <= 1e-6 || u >= 1 - 1e-6 || v <= 1e-6 || v >= 1 - 1e-6) continue;
      out.push({ at: wrap(tiling, add(s.a, mul(r, u))), u: [unit(r), unit(q)], lines: [[i], [j]] });
    }
  }
  return out;
}
