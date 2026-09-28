// The Two Sisters' muqarnas dome, raised from its plan: pieces traced from Jones and Goury's
// Plate X (1842) by tools/muqarnas-plan.ts and tools/muqarnas-pieces.ts, and given their faces by
// the rule of the pendentives on the same plate (muqarnas.ts).
//
// The plan is drawn on lines at multiples of 45°, as Jones's three primary figures are; a traced
// outline is first drawn back onto them. Every piece is a plaster prism, and its face is Jones's:
// "the curves of the several pieces are similar," so a face is the one curve, a quarter circle,
// run square to the piece's front, where the tier above begins: level there, vertical at the back,
// where it closes on the tier below. A piece whose front turns carries the curve square to each
// part, and the higher holds, so it is a niche; where two pieces' curves run differently they meet
// in a crease, and the creases are the ribs and arches the eye reads. The pieces the engraving
// draws white are the steep walls of cavities, so what they enclose sits several tiers deeper. A
// piece with no tier above is a cap, rising to its middle. Its sides are vertical, up past the
// tier above. Pieces are separate surfaces, so each can be set on its own; the line between two is
// a joint. Two other faces remain as options: arches and hanging stems along each front, and the
// first version's quarter circle across the tier.
//
// Plan pixels map to meters by the octagon's width across its flats. Tiers map to meters by a
// profile: Jones's section is a stepped cone, the "pine cone" his text names, so the tiers rise
// evenly. The profile is a model.

import * as THREE from 'three/webgpu';
import { hood, type Niche } from './muqarnas.ts';

type P = [number, number];
type V2 = THREE.Vector2;
export type PiecePlan = {
  width: number;
  height: number;
  center: P;
  acrossFlats: number; // px
  maxTier: number; // with the cavities' depth
  baseMaxTier: number; // from the rim, ignoring depth: the dome's profile
  pieces: { id: number; tier: number; loops: P[][]; kinds: string[][] }[];
};

export type DomeOptions = {
  acrossFlats: number; // m
  spring: number; // m
  rise: number; // m
  cell: number; // m: the finest a face is divided
  span: number; // m, an arch's span along a front, about
  hang: number; // how far a stem hangs below its tier's line, in tiers
  face: 'quarter' | 'niches' | 'prism'; // a level front on a quarter circle; arches and niches along it; or Jones's prisms, one curve run square to each front
  regular: boolean; // draw the traced outlines back onto the plan's lines
  cup: number; // in tiers: how far a piece's face rises into it from its outline
};

export type Dome = { geometry: THREE.BufferGeometry; pieces: number; maxTier: number; metersPerPixel: number; plan: PiecePlan };

export async function loadPieces(url: string): Promise<PiecePlan> {
  return (await fetch(url)).json();
}

/**
 * A traced loop drawn back onto the plan's lines: each run of edges within a few degrees of one
 * direction, at a multiple of 45° (or of 22.5°, for the stars), becomes one side along it through
 * the run's middle, and the corners are where consecutive sides cross. Short edges off every
 * direction are the tracing's noise and are dropped. A loop the snap would distort is kept as
 * traced.
 */
function regularize(loop: V2[], kinds: string[], px: number): { loop: V2[]; kinds: string[] } {
  const n = loop.length;
  const snap = (d: V2): V2 | null => {
    const a = Math.atan2(d.y, d.x);
    for (const [step, tol] of [[Math.PI / 4, 0.2], [Math.PI / 8, 0.1]]) {
      const k = Math.round(a / step);
      if (Math.abs(a - k * step) < tol) return new THREE.Vector2(Math.cos(k * step), Math.sin(k * step));
    }
    return null;
  };
  type Edge = { a: V2; b: V2; kind: string; dir: V2 | null; len: number };
  let edges: Edge[] = loop.map((a, i) => {
    const b = loop[(i + 1) % n];
    const d = b.clone().sub(a);
    return { a, b, kind: kinds[i], dir: snap(d), len: d.length() };
  });
  edges = edges.filter((e) => e.dir || e.len > 4 * px);
  if (edges.length < 3) return { loop, kinds };
  const same = (e: Edge, f: Edge) => e.kind === f.kind && !!e.dir && !!f.dir && e.dir.dot(f.dir) > 0.999;
  let start = edges.findIndex((e, i) => !same(edges[(i - 1 + edges.length) % edges.length], e));
  if (start < 0) return { loop, kinds };
  type Side = { point: V2; dir: V2; kind: string; from: V2; to: V2 };
  const sides: Side[] = [];
  for (let k = 0; k < edges.length; k++) {
    const e = edges[(start + k) % edges.length];
    const last = sides[sides.length - 1];
    if (last && k > 0 && same(edges[(start + k - 1) % edges.length], e)) {
      last.to = e.b;
      last.point.add(e.a.clone().add(e.b).multiplyScalar(0.5 * e.len));
      (last as Side & { weight: number }).weight += e.len;
    } else {
      const side = { point: e.a.clone().add(e.b).multiplyScalar(0.5 * e.len), dir: e.dir ?? e.b.clone().sub(e.a).normalize(), kind: e.kind, from: e.a, to: e.b, weight: e.len };
      sides.push(side);
    }
  }
  for (const side of sides as (Side & { weight: number })[]) side.point.divideScalar(side.weight);
  if (sides.length < 3) return { loop, kinds };
  const out: V2[] = [], outKinds: string[] = [];
  for (let i = 0; i < sides.length; i++) {
    const s0 = sides[(i - 1 + sides.length) % sides.length], s1 = sides[i];
    const joint = s0.to.clone().add(s1.from).multiplyScalar(0.5); // where the traced sides met
    const cross = s0.dir.x * s1.dir.y - s0.dir.y * s1.dir.x;
    let corner: V2;
    if (Math.abs(cross) < 1e-3) {
      const on = (s: Side) => s.point.clone().addScaledVector(s.dir, joint.clone().sub(s.point).dot(s.dir));
      corner = on(s0).add(on(s1)).multiplyScalar(0.5);
    } else {
      const d = s1.point.clone().sub(s0.point);
      const t = (d.x * s1.dir.y - d.y * s1.dir.x) / cross;
      corner = s0.point.clone().addScaledVector(s0.dir, t);
    }
    if (corner.distanceTo(joint) > 6 * px) corner = joint;
    out.push(corner);
    outKinds.push(s1.kind);
  }
  const before = Math.abs(THREE.ShapeUtils.area(loop)), after = Math.abs(THREE.ShapeUtils.area(out));
  if (!(after > 0.8 * before && after < 1.25 * before)) return { loop, kinds };
  return { loop: out, kinds: outKinds };
}

/** Is p inside a piece: inside its outer loop and outside its holes. */
function inside(p: V2, loops: V2[][]): boolean {
  let c = false;
  for (const lp of loops) {
    for (let i = 0, j = lp.length - 1; i < lp.length; j = i++) {
      if ((lp[i].y > p.y) !== (lp[j].y > p.y) && p.x < ((lp[j].x - lp[i].x) * (p.y - lp[i].y)) / (lp[j].y - lp[i].y) + lp[i].x) c = !c;
    }
  }
  return c;
}

const segmentDistance = (p: V2, a: V2, b: V2) => {
  const abx = b.x - a.x, aby = b.y - a.y, apx = p.x - a.x, apy = p.y - a.y;
  const t = Math.min(1, Math.max(0, (apx * abx + apy * aby) / (abx * abx + aby * aby || 1e-12)));
  return Math.hypot(apx - abx * t, apy - aby * t);
};

export function pieceDome(plan: PiecePlan, o: DomeOptions): Dome {
  const mpp = o.acrossFlats / plan.acrossFlats;
  const [cx, cy] = plan.center;
  // The profile spans the tiers from the rim; a cavity's extra depth carries its pieces above it.
  const top = plan.baseMaxTier + 1;
  const level = (tiers: number) => o.spring + (o.rise * Math.min(tiers, top + 4)) / top;
  const H = o.rise / top;
  const rand = (n: number) => { const x = Math.sin(n * 12.9898 + 4.1) * 43758.5453; return x - Math.floor(x); };

  // 1. Outlines on the plan's lines, in meters.
  const shapes = plan.pieces.map((piece) => {
    const loops: V2[][] = [], kinds: string[][] = [];
    piece.loops.forEach((lp, li) => {
      const traced = lp.map(([x, y]) => new THREE.Vector2((x - cx) * mpp, (y - cy) * mpp));
      const r = o.regular ? regularize(traced, piece.kinds[li], mpp) : { loop: traced, kinds: piece.kinds[li] };
      loops.push(r.loop); kinds.push(r.kinds);
    });
    return { piece, loops, kinds };
  });

  // 2. The arches: along every front, one to about every span; behind each, a niche reaching back
  // into the piece. Filed by tier, so a piece's face sees its neighbours' niches too.
  const CELL = 0.12;
  const filed = new Map<string, Niche[]>();
  const file = (tier: number, n: Niche) => {
    const key = `${tier}:${Math.floor(n.c.x / CELL)}:${Math.floor(n.c.y / CELL)}`;
    let list = filed.get(key);
    if (!list) filed.set(key, (list = []));
    list.push(n);
  };
  for (const { piece, loops, kinds } of shapes) {
    loops.forEach((lp, li) => lp.forEach((a, i) => {
      if (kinds[li][i] !== 'high') return;
      const b = lp[(i + 1) % lp.length];
      const L = a.distanceTo(b);
      if (L < 0.25 * o.span) return;
      const along = b.clone().sub(a).normalize();
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const left = new THREE.Vector2(-along.y, along.x);
      const back = inside(mid.clone().addScaledVector(left, 0.004), loops) ? left : left.clone().negate();
      const count = Math.max(1, Math.round(L / o.span));
      const half = L / count / 2;
      for (let k = 0; k < count; k++) {
        const c = a.clone().addScaledVector(along, (2 * k + 1) * half);
        file(piece.tier, { c, along, back, a: 0.9 * half, b: Math.min(2.2 * half, 1.2 * o.span), point: 0, stilt: 2.4 });
      }
    }));
  }
  const nichesNear = (tier: number, box: THREE.Box2) => {
    const out: Niche[] = [];
    const r = 1.3 * o.span;
    for (let i = Math.floor((box.min.x - r) / CELL); i <= Math.floor((box.max.x + r) / CELL); i++) {
      for (let j = Math.floor((box.min.y - r) / CELL); j <= Math.floor((box.max.y + r) / CELL); j++) {
        const list = filed.get(`${tier}:${i}:${j}`);
        if (list) out.push(...list);
      }
    }
    return out;
  };

  // 3. A tier's boundaries, down to the tier below and up to the tier above, filed so a piece's
  // face is found from its whole tier's, not from its own outline alone: neighbours in a tier then
  // agree along the joint between them, and only the tiers step.
  const EDGE = 0.1, SEARCH = 0.3;
  const bounds = new Map<string, { low: [V2, V2][]; high: [V2, V2][] }>();
  for (const { piece, loops, kinds } of shapes) {
    loops.forEach((lp, li) => lp.forEach((a, i) => {
      const kind = kinds[li][i];
      if (kind === 'side') return;
      const b = lp[(i + 1) % lp.length];
      const key = `${piece.tier}:${Math.floor((a.x + b.x) / 2 / EDGE)}:${Math.floor((a.y + b.y) / 2 / EDGE)}`;
      let f = bounds.get(key);
      if (!f) bounds.set(key, (f = { low: [], high: [] }));
      (kind === 'high' ? f.high : f.low).push([a, b]);
    }));
  }
  const boundsNear = (tier: number, box: THREE.Box2) => {
    const low: [V2, V2][] = [], high: [V2, V2][] = [];
    for (let i = Math.floor((box.min.x - SEARCH) / EDGE); i <= Math.floor((box.max.x + SEARCH) / EDGE); i++) {
      for (let j = Math.floor((box.min.y - SEARCH) / EDGE); j <= Math.floor((box.max.y + SEARCH) / EDGE); j++) {
        const f = bounds.get(`${tier}:${i}:${j}`);
        if (f) { low.push(...f.low); high.push(...f.high); }
      }
    }
    return { low, high };
  };

  const positions: number[] = [], shades: number[] = [];
  const index: number[] = [];

  for (const { piece, loops, kinds } of shapes) {
    // Edges that lead down to the tier below (or the rim), and up to the tier above.
    const low: [V2, V2][] = [], high: [V2, V2][] = [], across: [V2, V2][] = [];
    loops.forEach((lp, li) => lp.forEach((a, i) => {
      const b = lp[(i + 1) % lp.length];
      const kind = kinds[li][i];
      if (kind === 'low' || kind === 'rim') low.push([a, b]);
      else if (kind === 'high') high.push([a, b]);
      else across.push([a, b]); // the tier's own neighbours
    }));
    const distance = (p: V2, edges: [V2, V2][]) => {
      let best = Infinity;
      for (const [a, b] of edges) best = Math.min(best, segmentDistance(p, a, b));
      return best;
    };
    const box = new THREE.Box2().setFromPoints(loops[0]);
    const niches = high.length && o.face === 'niches' ? nichesNear(piece.tier, box) : [];
    // The tier's boundaries are needed only by the faces that are found across the tier; a prism
    // piece without a front, a cap, rises from its own edges.
    const prism = o.face === 'prism';
    const tier = prism ? { low, high } : boundsNear(piece.tier, box);
    const z0 = level(piece.tier), z1 = level(piece.tier + 1);
    // A cap's rise to its middle: the largest distance from its low edges, roughly.
    const size = Math.sqrt(Math.abs(THREE.ShapeUtils.area(loops[0])));
    // Jones's prisms: the pieces' one curve, run square to each of the piece's fronts, as a
    // cylinder; where two fronts meet, the higher cylinder holds, so a piece whose front turns is
    // a niche. Level at the front, where the tier above begins; vertical at the back.
    const cylinders = high.filter(([a, b]) => a.distanceTo(b) > 0.2 * size).map(([a, b]) => {
      const along = b.clone().sub(a).normalize();
      let n = new THREE.Vector2(-along.y, along.x);
      const mid = a.clone().add(b).multiplyScalar(0.5);
      if (!inside(mid.clone().addScaledVector(n, 0.003), loops)) n = n.negate();
      let depth = 0;
      for (const v of loops[0]) depth = Math.max(depth, v.clone().sub(a).dot(n));
      return { a, n, depth: Math.max(depth, 1e-4) };
    });
    const heightAt = (p: V2) => {
      if (prism && cylinders.length) {
        let g = 0;
        for (const c of cylinders) {
          const u = Math.min(1, Math.max(0, ((p.x - c.a.x) * c.n.x + (p.y - c.a.y) * c.n.y) / c.depth));
          g = Math.max(g, Math.sqrt(Math.max(0, 1 - u * u)));
        }
        return z0 + (z1 - z0) * g;
      }
      const lo = distance(p, tier.low), hi = distance(p, tier.high);
      if (!Number.isFinite(hi)) {
        // A cap, or a piece walled in by its own tier: the quarter circle toward its middle.
        const t = !Number.isFinite(lo) ? 1 : Math.min(1, lo / (0.5 * size));
        return level(piece.tier + Math.sqrt(Math.max(0, 1 - (1 - t) * (1 - t))));
      }
      const t = !Number.isFinite(lo) ? 1 : lo + hi > 0 ? lo / (lo + hi) : 0.5; // 0 at the back, 1 at the front
      // Vertical where the face leaves the tier below, so it always closes on it.
      const close = Math.sqrt(Math.max(0, 1 - (1 - t) * (1 - t)));
      // A cell: the face also rises into the piece from its whole outline, so each piece reads as
      // a shallow cup with a crisp rim rather than a flat facet.
      const rim = Math.min(lo, hi, distance(p, across));
      const cup = o.cup * Math.sqrt(Math.max(0, 1 - (1 - Math.min(1, rim / (0.3 * size))) ** 2));
      if (o.face === 'quarter') return level(piece.tier + close + cup);
      let g = 0;
      for (const n of niches) g = Math.max(g, hood(n, p));
      const v = 1 - t;
      const floor = z0 - o.hang * H * (1 - v * v);
      return floor + (z1 - floor) * g * close + (z1 - z0) * cup;
    };

    const shade = rand(piece.id * 1.7 + 3) - 0.5;
    const push = (x: number, y: number, z: number) => {
      positions.push(x, y, z);
      shades.push(shade);
      return positions.length / 3 - 1;
    };

    // The face: triangulate the outline, then divide each triangle evenly so the curve is smooth.
    let faces: number[][];
    try { faces = THREE.ShapeUtils.triangulateShape(loops[0], loops.slice(1)); } catch { continue; }
    const all = loops.flat();
    // Points shared between the face's triangles are one vertex: keyed by position at 0.01 mm, as
    // one number, since the plan lies within ±4 m.
    const keyed = new Map<number, number>();
    const q = new THREE.Vector2();
    const vertex = (x: number, y: number) => {
      const k = (Math.round(x * 1e5) + 4e5) * 1e6 + (Math.round(y * 1e5) + 4e5);
      let id = keyed.get(k);
      if (id === undefined) { id = push(x, heightAt(q.set(x, y)), y); keyed.set(k, id); }
      return id;
    };
    const faceStart = index.length;
    for (const [ia, ib, ic] of faces) {
      const [a, b, c] = [all[ia], all[ib], all[ic]];
      const longest = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a));
      const m = Math.max(1, Math.ceil(longest / o.cell));
      const at = (i: number, j: number) => {
        const u = i / m, v = j / m, w = 1 - u - v;
        return vertex(a.x * w + b.x * u + c.x * v, a.y * w + b.y * u + c.y * v);
      };
      for (let j = 0; j < m; j++) {
        for (let i = 0; i < m - j; i++) {
          index.push(at(i, j), at(i + 1, j), at(i, j + 1));
          if (i + j < m - 1) index.push(at(i + 1, j), at(i + 1, j + 1), at(i, j + 1));
        }
      }
    }
    // Wind the face to look down, into the room: check one triangle's normal.
    {
      const p = (k: number) => new THREE.Vector3(positions[k * 3], positions[k * 3 + 1], positions[k * 3 + 2]);
      let flip = 0;
      for (let t = faceStart; t < index.length; t += 3) {
        const n = new THREE.Vector3().crossVectors(p(index[t + 1]).sub(p(index[t])), p(index[t + 2]).sub(p(index[t])));
        if (n.lengthSq() > 1e-14) { flip = n.y > 0 ? 1 : 0; break; }
      }
      if (flip) for (let t = faceStart; t < index.length; t += 3) [index[t + 1], index[t + 2]] = [index[t + 2], index[t + 1]];
    }

    // The sides: from the face's edge, divided as finely as the face so they follow its arches, up
    // past the highest neighbour a cavity can have. Above its own face a side is hidden inside the
    // plaster, except where the piece across is higher: there it is the step, a cavity's wall.
    const topY = level(piece.tier + 8) + 0.01;
    for (const lp of loops) {
      for (let i = 0; i < lp.length; i++) {
        const a = lp[i], b = lp[(i + 1) % lp.length];
        const m = Math.max(1, Math.ceil(a.distanceTo(b) / o.cell));
        const s = positions.length / 3;
        for (let k = 0; k <= m; k++) {
          const p = a.clone().lerp(b, k / m);
          const y = heightAt(p);
          push(p.x, y, p.y);
          push(p.x, topY, p.y);
        }
        for (let k = 0; k < m; k++) {
          const q = s + 2 * k;
          index.push(q, q + 1, q + 2, q + 2, q + 1, q + 3);
        }
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('shade', new THREE.Float32BufferAttribute(shades, 1));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return { geometry, pieces: plan.pieces.length, maxTier: plan.baseMaxTier, metersPerPixel: mpp, plan };
}

/** The plan drawn at full size, joints dark on light, for incising in the floor. */
export function planTexture(plan: PiecePlan, size: number): { canvas: OffscreenCanvas; span: number } {
  const R = plan.acrossFlats / 2 / Math.cos(Math.PI / 8);
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  const s = size / (2 * R);
  const [cx, cy] = plan.center;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = Math.max(1, 3.5 * s);
  ctx.lineJoin = 'round';
  for (const p of plan.pieces) {
    for (const lp of p.loops) {
      ctx.beginPath();
      lp.forEach(([x, y], i) => { const X = (x - cx + R) * s, Y = (y - cy + R) * s; if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); });
      ctx.closePath();
      ctx.stroke();
    }
  }
  return { canvas, span: 2 * R };
}
