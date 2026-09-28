// Traces every piece of the plan (tools/muqarnas-plan.ts) into polygons, and says of every edge
// what lies across it: the tier below, the tier above, a piece of the same tier, or the rim.
//
//   node yaobian/tools/muqarnas-pieces.ts [plan-dir] [out.json]
//
// A piece is traced by marching squares over its pixels, so a piece with a hole (a frame around a
// star) gets its hole. Each loop is simplified to straight edges, and grown by half a joint so
// neighbouring pieces nearly meet, as plaster pieces do. Coordinates are plan pixels.

import { readFile, writeFile } from 'node:fs/promises';

const dir = process.argv[2] ?? 'yaobian/assets-src/jones/plan';
const outPath = process.argv[3] ?? 'public/yaobian/assets/rule/two-sisters-pieces.json';
const plan = JSON.parse(await readFile(`${dir}/plan.json`, 'utf8'));
const W: number = plan.width, H: number = plan.height;
const buf = async (name: string) => (await readFile(`${dir}/${name}`)).buffer;
const label = new Uint16Array(await buf('label.u16'));
const owner = new Uint16Array(await buf('piece.u16'));
const tierOf = new Uint8Array(await buf('tier.u8'));
const [cx, cy] = plan.center as [number, number];
const apothem = plan.acrossFlats / 2;

type P = [number, number];
const dirs: P[] = [[1, 0], [0, 1], [-1, 0], [0, -1], [Math.SQRT1_2, Math.SQRT1_2], [-Math.SQRT1_2, Math.SQRT1_2], [-Math.SQRT1_2, -Math.SQRT1_2], [Math.SQRT1_2, -Math.SQRT1_2]];
const insideOctagon = (x: number, y: number, margin = 0) => dirs.every(([dx, dy]) => (x - cx) * dx + (y - cy) * dy <= apothem - margin);

// Bounding boxes of the drawn pieces.
const n = label.reduce((m, v) => (v > m ? v : m), 0) + 1;
const box = Array.from({ length: n }, () => [W, H, -1, -1]);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const l = label[y * W + x];
  if (!l) continue;
  const b = box[l];
  if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y;
}

/** Marching squares over the pixels equal to l in its box: closed loops in pixel-corner coordinates. */
function loops(l: number): P[][] {
  const [x0, y0, x1, y1] = box[l];
  const inside = (x: number, y: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1 && label[y * W + x] === l;
  // Edges between an inside pixel and an outside one, oriented with the inside on the left
  // (in image coordinates, y down): a map from start corner to end corner.
  const next = new Map<string, P[]>();
  const add = (a: P, b: P) => { const k = `${a[0]},${a[1]}`; (next.get(k) ?? next.set(k, []).get(k)!).push(b); };
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (!inside(x, y)) continue;
    if (!inside(x, y - 1)) add([x + 1, y], [x, y]); // top edge, going left
    if (!inside(x, y + 1)) add([x, y + 1], [x + 1, y + 1]); // bottom, going right
    if (!inside(x - 1, y)) add([x, y], [x, y + 1]); // left, going down
    if (!inside(x + 1, y)) add([x + 1, y + 1], [x + 1, y]); // right, going up
  }
  const out: P[][] = [];
  while (next.size) {
    const startKey = next.keys().next().value as string;
    const start = startKey.split(',').map(Number) as P;
    const loop: P[] = [start];
    let cur = start;
    for (let guard = 0; guard < 1e6; guard++) {
      const k = `${cur[0]},${cur[1]}`;
      const list = next.get(k);
      if (!list || !list.length) break;
      const nxt = list.pop()!;
      if (!list.length) next.delete(k);
      if (nxt[0] === start[0] && nxt[1] === start[1]) break;
      loop.push(nxt);
      cur = nxt;
    }
    if (loop.length >= 4) out.push(loop);
  }
  return out;
}

/** Douglas–Peucker on a closed loop. */
function simplify(loop: P[], tol: number): P[] {
  // Split at the two farthest-apart points, simplify each half.
  let a = 0, b = 0, best = -1;
  for (let i = 0; i < loop.length; i += Math.max(1, Math.floor(loop.length / 64))) {
    for (let j = 0; j < loop.length; j++) {
      const d = (loop[i][0] - loop[j][0]) ** 2 + (loop[i][1] - loop[j][1]) ** 2;
      if (d > best) { best = d; a = i; b = j; }
    }
  }
  if (a > b) [a, b] = [b, a];
  const dp = (pts: P[]): P[] => {
    if (pts.length < 3) return pts;
    const [p, q] = [pts[0], pts[pts.length - 1]];
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
    let far = 0, idx = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = Math.abs((q[0] - p[0]) * (p[1] - pts[i][1]) - (p[0] - pts[i][0]) * (q[1] - p[1])) / len;
      if (d > far) { far = d; idx = i; }
    }
    if (far <= tol) return [p, q];
    const left = dp(pts.slice(0, idx + 1)), right = dp(pts.slice(idx));
    return left.slice(0, -1).concat(right);
  };
  const first = dp(loop.slice(a, b + 1));
  const second = dp(loop.slice(b).concat(loop.slice(0, a + 1)));
  return first.slice(0, -1).concat(second.slice(0, -1));
}

const area = (loop: P[]) => loop.reduce((s, p, i) => { const q = loop[(i + 1) % loop.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;

/**
 * Grow a loop by d along its outward normals. Marching squares keeps the piece on the visual left
 * of every edge (image coordinates, y down), so the outward normal of an edge (dx, dy) is
 * (-dy, dx), on the right; for a hole that points into the hole, so a hole shrinks.
 */
function grow(loop: P[], d: number): P[] {
  return loop.map((p, i) => {
    const a = loop[(i + loop.length - 1) % loop.length], b = loop[(i + 1) % loop.length];
    const e1 = [p[0] - a[0], p[1] - a[1]], e2 = [b[0] - p[0], b[1] - p[1]];
    const l1 = Math.hypot(e1[0], e1[1]) || 1, l2 = Math.hypot(e2[0], e2[1]) || 1;
    const n1 = [-e1[1] / l1, e1[0] / l1], n2 = [-e2[1] / l2, e2[0] / l2];
    let nx = n1[0] + n2[0], ny = n1[1] + n2[1];
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl; ny /= nl;
    const cos = Math.max(0.4, nx * n1[0] + ny * n1[1]);
    return [p[0] + nx * (d / cos), p[1] + ny * (d / cos)] as P;
  });
}

type Piece = { id: number; tier: number; loops: P[][]; kinds: string[][] };
const pieces: Piece[] = [];
let edges = 0;
for (let l = 1; l < n; l++) {
  if (box[l][2] < 0) continue;
  const traced = loops(l).map((lp) => simplify(lp, 1.6)).filter((lp) => lp.length >= 3 && Math.abs(area(lp)) > 20);
  if (!traced.length) continue;
  const tier = tierOf[l];
  const kinds: string[][] = [];
  const grown: P[][] = [];
  for (const lp of traced) {
    // What lies across each edge: look past the joint from the edge's middle.
    const k: string[] = [];
    for (let i = 0; i < lp.length; i++) {
      const a = lp[i], b = lp[(i + 1) % lp.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      // Outward, across the joint: the right of a→b, (-dy, dx).
      const nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len;
      let kind = 'side';
      const votes: Record<string, number> = { low: 0, high: 0, side: 0, rim: 0 };
      for (const f of [0.25, 0.5, 0.75]) {
        const mx = a[0] + (b[0] - a[0]) * f, my = a[1] + (b[1] - a[1]) * f;
        let found = false;
        for (const reach of [4, 7, 10]) {
          const sx = mx + nx * reach, sy = my + ny * reach;
          if (!insideOctagon(sx, sy, 1)) { votes.rim++; found = true; break; }
          const q = owner[Math.round(sy) * W + Math.round(sx)];
          if (!q || q === l) continue;
          const tq = tierOf[q];
          votes[tq < tier ? 'low' : tq > tier ? 'high' : 'side']++;
          found = true;
          break;
        }
        if (!found) votes.side++;
      }
      kind = Object.entries(votes).sort((p, q) => q[1] - p[1])[0][0];
      k.push(kind);
      edges++;
    }
    kinds.push(k);
    grown.push(grow(lp, 2));
  }
  pieces.push({ id: l, tier, loops: grown.map((lp) => lp.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10] as P)), kinds });
}

// Sanity: with the piece on the visual left, an outer loop has negative signed area in image
// coordinates (y down), a hole positive.
const outerNegative = pieces.filter((p) => area(p.loops[0]) < 0).length;
await writeFile(outPath, JSON.stringify({
  source: plan.source, note: 'Pieces traced from the eightfold fold of the plan; tiers by distance from the rim, deeper through the pieces the engraving draws white; heights a model.',
  width: W, height: H, center: plan.center, acrossFlats: plan.acrossFlats, maxTier: plan.maxTier, baseMaxTier: plan.baseMaxTier, pieces,
}));
const kinds = pieces.flatMap((p) => p.kinds.flat());
const count = (k: string) => kinds.filter((x) => x === k).length;
console.log(`${pieces.length} pieces, ${edges} edges: low ${count('low')}, high ${count('high')}, side ${count('side')}, rim ${count('rim')}; outer loops negative ${outerNegative}/${pieces.length}; holes ${pieces.reduce((s, p) => s + p.loops.length - 1, 0)}`);
console.log(`wrote ${outPath}`);
