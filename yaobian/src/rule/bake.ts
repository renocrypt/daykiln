// A pattern baked into the fields a relief shader reads, over one repeat of the tiling:
//   - the carved height of a stucco wall, mm: straps proud, fields cut down, and at every crossing
//     the under-strap dipping beneath the over-strap;
//   - for a mosaic, the distance to the nearest visible mortar joint, mm;
//   - the distance to the nearest line, mm, and how much of the sky a carved point sees;
//   - which face a point is in, the face's class by area, and its color in the checkerboard;
//   - which segment owns a strap point: its piece, in a mosaic.
// The surfaces themselves are baked, not the distances they are made from, because a surface is
// continuous and a filter can blend it; distances to changing sets of lines are not.
//
// Interlace: along every strand, over and under alternate. For a pattern whose lines cross in
// pairs, that is the same as a checkerboard coloring of its faces, with one rule at every
// crossing: the over-line, turned counterclockwise onto the under-line, sweeps the black faces.
// The coloring is found by breadth-first search over faces that share a strap; a pattern whose
// repeat cannot be colored consistently is reported.

import type { Pattern } from './hankin.ts';
import type { Vec } from './tiling.ts';

export type ReliefOptions = {
  strap: number; // mm, strap width
  texel: number; // mm, target texel size
  reach: number; // mm beyond the strap's edge where distance is still recorded
  depth: number; // mm the fields are cut below the straps
  bevel: number; // mm, the width of a strap's cut side
  dip: number; // mm an under-strap sinks where it passes beneath
  dipLength: number; // mm from the over-strap over which the under-strap sinks
};

export type FaceClass = { area: number; faces: number[] };

export type Relief = {
  width: number; // mm, the repeat
  height: number;
  nx: number; // texels
  ny: number;
  /** Four fields per texel: stucco height (mm), distance to the nearest visible joint (mm),
   * distance to the nearest line (mm), and the sky a carved point sees (0 to 1). */
  fields: Float32Array;
  /** Face class (255 on a strap); face id, or the owning segment on a strap; the piece's home cell
   * relative to the texel's, as (ox + 1) + 3 (oy + 1); checker color (0 or 255). */
  ids: Uint8Array; // 4 per texel
  classes: FaceClass[];
  faces: number;
  conflicts: number;
  milliseconds: number;
};

export const FAR = 60;

export function bake(pattern: Pattern, options: ReliefOptions): Relief {
  const started = performance.now();
  const { tiling, segments } = pattern;
  const W = tiling.width, H = tiling.height;
  const nx = Math.round(W / options.texel), ny = Math.round(H / options.texel);
  const tx = W / nx, ty = H / ny;
  const half = options.strap / 2;
  const reach = half + options.reach;
  const n = nx * ny;

  // Texel centers in mm, and a wrapped texel index.
  const cx = (i: number) => (i + 0.5) * tx;
  const cy = (j: number) => (j + 0.5) * ty;
  const at = (i: number, j: number) => (((j % ny) + ny) % ny) * nx + (((i % nx) + nx) % nx);
  const texelOf = (p: Vec) => at(Math.floor(p[0] / tx), Math.floor(p[1] / ty));

  const shifts: Vec[] = [];
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) shifts.push([i * W, j * H]);

  // Straps meet at bends with mitered corners, as a carver or a tile cutter makes them: past the
  // bisector of the bend, a point belongs to the partner. At the contact end a strap runs on into
  // the next tile, so a round end there is always covered.
  type Strap = { ax: number; ay: number; dx: number; dy: number; len: number; bx: number; by: number; mx: number; my: number; spread: number };
  const straps: Strap[] = segments.map((s) => {
    const t = segments[s.partner];
    const dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1], len = Math.hypot(dx, dy);
    const e1: Vec = [dx / len, dy / len];
    const ol = Math.hypot(t.a[0] - t.b[0], t.a[1] - t.b[1]);
    const e2: Vec = [(t.a[0] - t.b[0]) / ol, (t.a[1] - t.b[1]) / ol];
    const cosBend = -(e1[0] * e2[0] + e1[1] * e2[1]); // the angle inside the bend
    return {
      ax: s.a[0], ay: s.a[1], dx, dy, len, bx: s.b[0], by: s.b[1], mx: e1[0] + e2[0], my: e1[1] + e2[1],
      // How far past its end a mitered strap can reach, per unit of distance: 1 / sin(half the bend),
      // capped, since a miter sharper than that is lost inside its partner's strap anyway.
      spread: 1 / Math.max(0.35, Math.sqrt((1 - cosBend) / 2)),
    };
  });
  /** Distance from (px, py) to strap s translated by (sx, sy), or FAR past its miter. */
  const strapDistance = (s: number, px: number, py: number, sx: number, sy: number) => {
    const g = straps[s];
    const qx = px - g.ax - sx, qy = py - g.ay - sy;
    if ((px - g.bx - sx) * g.mx + (py - g.by - sy) * g.my > 0) return FAR;
    const t = (qx * g.dx + qy * g.dy) / (g.len * g.len);
    if (t < 0) return Math.hypot(qx, qy);
    return Math.abs(qx * g.dy - qy * g.dx) / g.len;
  };

  /** Visit every texel within `r` of strap s (and its translated copies), with its distance. */
  const around = (s: number, r: number, visit: (k: number, d: number, shift: number) => void) => {
    const g = straps[s];
    const pad = r * g.spread;
    for (let shift = 0; shift < shifts.length; shift++) {
      const [sx, sy] = shifts[shift];
      const ax = g.ax + sx, ay = g.ay + sy, bx = g.bx + sx, by = g.by + sy;
      const x0 = Math.min(ax, bx) - pad, x1 = Math.max(ax, bx) + pad;
      const y0 = Math.min(ay, by) - pad, y1 = Math.max(ay, by) + pad;
      if (x1 < 0 || y1 < 0 || x0 > W || y0 > H) continue;
      const i0 = Math.max(0, Math.floor(x0 / tx)), i1 = Math.min(nx - 1, Math.ceil(x1 / tx));
      const j0 = Math.max(0, Math.floor(y0 / ty)), j1 = Math.min(ny - 1, Math.ceil(y1 / ty));
      for (let j = j0; j <= j1; j++) {
        const py = cy(j);
        for (let i = i0; i <= i1; i++) {
          const d = strapDistance(s, cx(i), py, sx, sy);
          if (d < r) visit(j * nx + i, d, shift);
        }
      }
    }
  };

  // 1. Distance to the nearest line, and the nearest segment.
  // A piece's home: the translation that carries the piece's canonical copy onto this texel. The
  // shader adds it to the texel's cell, so one piece has one identity across the repeat's seams.
  const d1 = new Float32Array(n).fill(FAR);
  const owner = new Int32Array(n).fill(-1);
  const home = new Uint8Array(n).fill(4); // shift index: 4 is (0, 0)
  segments.forEach((_, index) => {
    around(index, reach, (k, d, shift) => {
      if (d < d1[k]) { d1[k] = d; owner[k] = index; home[k] = shift; }
    });
  });

  // 2. Faces: connected regions off the straps, on the torus. Crossing the repeat's seam steps the
  // face's home by one repeat, so a face that straddles the seam keeps one identity.
  const face = new Int32Array(n).fill(-1);
  const areas: number[] = [];
  const queue = new Int32Array(n);
  const hx = new Int8Array(n), hy = new Int8Array(n);
  for (let start = 0; start < n; start++) {
    if (face[start] >= 0 || d1[start] <= half) continue;
    const id = areas.length;
    let head = 0, tail = 0, count = 0;
    queue[tail++] = start;
    face[start] = id;
    hx[start] = hy[start] = 0;
    while (head < tail) {
      const k = queue[head++];
      count++;
      const i = k % nx, j = (k - i) / nx;
      const steps: [number, number, number][] = [
        [at(i + 1, j), i === nx - 1 ? -1 : 0, 0], [at(i - 1, j), i === 0 ? 1 : 0, 0],
        [at(i, j + 1), 0, j === ny - 1 ? -1 : 0], [at(i, j - 1), 0, j === 0 ? 1 : 0],
      ];
      for (const [m, ox, oy] of steps) {
        if (face[m] < 0 && d1[m] > half) {
          face[m] = id; hx[m] = hx[k] + ox; hy[m] = hy[k] + oy; queue[tail++] = m;
        }
      }
    }
    areas.push(count * tx * ty);
  }

  // Slivers where straps nearly close a face are filled: the carver would not cut them.
  const sliver = Math.max(4 * options.texel * options.texel + 2, 0.06 * options.strap * options.strap); // mm²
  for (let k = 0; k < n; k++) {
    const f = face[k];
    if (f >= 0 && areas[f] < sliver) { face[k] = -1; d1[k] = half * 0.999; }
  }

  // 3. Classes by area: faces of one shape have one area, within rasterization.
  const order = areas.map((_, i) => i).filter((f) => areas[f] >= sliver).sort((p, q) => areas[q] - areas[p]);
  const classes: FaceClass[] = [];
  for (const f of order) {
    const c = classes.find((k) => Math.abs(k.area - areas[f]) < 0.02 * k.area);
    if (c) c.faces.push(f); else classes.push({ area: areas[f], faces: [f] });
  }
  const classOf = new Uint8Array(areas.length);
  classes.forEach((c, k) => c.faces.forEach((f) => { classOf[f] = k; }));

  // 4. Checkerboard: faces either side of every segment differ.
  const wrapped = (p: Vec): Vec => [((p[0] % W) + W) % W, ((p[1] % H) + H) % H];
  const faceAt = (p: Vec) => face[texelOf(wrapped(p))];
  const neighbors: number[][] = areas.map(() => []);
  for (const s of segments) {
    const m: Vec = [(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2];
    const l = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
    const nrm: Vec = [-(s.b[1] - s.a[1]) / l, (s.b[0] - s.a[0]) / l];
    const off = half + Math.max(1.5, 3 * Math.max(tx, ty));
    const f = faceAt([m[0] + nrm[0] * off, m[1] + nrm[1] * off]);
    const g = faceAt([m[0] - nrm[0] * off, m[1] - nrm[1] * off]);
    if (f >= 0 && g >= 0 && f !== g) { neighbors[f].push(g); neighbors[g].push(f); }
  }
  const color = new Int8Array(areas.length).fill(-1);
  let conflicts = 0;
  for (let f0 = 0; f0 < areas.length; f0++) {
    if (color[f0] >= 0) continue;
    color[f0] = 0;
    const stack = [f0];
    while (stack.length) {
      const f = stack.pop()!;
      for (const g of neighbors[f]) {
        if (color[g] < 0) { color[g] = 1 - color[f]; stack.push(g); }
        else if (color[g] === color[f]) conflicts++;
      }
    }
  }

  // The carved section across a strap at distance d from its line: 0 on top, −depth in the field,
  // a slightly rounded chamfer between.
  const { depth, bevel, dip, dipLength } = options;
  const carved = (d: number) => {
    const t = Math.min(1, Math.max(0, (d - (half - bevel)) / bevel));
    return -depth * (0.6 * t + 0.4 * t * t * (3 - 2 * t));
  };
  const smooth = (a: number, b: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const skyOf = (d: number) => (d > half ? 0.52 + 0.48 * smooth(0, depth * 1.8, d - half) : 1);

  // The plain surfaces, then each crossing's changes over the under-strap's run past it.
  const height = new Float32Array(n), joint = new Float32Array(n), sky = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    height[k] = carved(d1[k]);
    joint[k] = Math.abs(d1[k] - half);
    sky[k] = skyOf(d1[k]);
  }

  // 5. Over and under at every crossing. Where the under-strap passes beside and beneath the
  // over-strap, the surface is the over-strap's section or the under-strap's sunk one, whichever
  // stands higher; its joints run along the over-strap, not across it.
  const felt = half + dipLength; // beyond this from the over-line, a crossing changes nothing
  for (const c of pattern.crossings) {
    const [u0, u1] = c.u;
    let phi = Math.atan2(u0[0] * u1[1] - u0[1] * u1[0], u0[0] * u1[0] + u0[1] * u1[1]);
    if (phi < 0) phi += Math.PI; // the counterclockwise turn from line 0 onto line 1
    const a0 = Math.atan2(u0[1], u0[0]);
    const b: Vec = [Math.cos(a0 + phi / 2), Math.sin(a0 + phi / 2)];
    const r = (half + 2) / Math.sin(phi / 2) + 1;
    const f = faceAt([c.at[0] + b[0] * r, c.at[1] + b[1] * r]);
    const over = f >= 0 && color[f] === 0 ? 0 : 1;
    const overSegs = new Set(c.lines[over]);
    const sin = Math.max(Math.sin(Math.min(phi, Math.PI - phi)), 0.2);
    const radius = felt / sin + half + 1; // along the under-line, where the over-line is still felt
    // The lines' copies near the crossing, and the other segments' copies within reach.
    const near = (s: number, sx: number, sy: number, reach: number) =>
      Math.hypot(segments[s].a[0] + sx - c.at[0], segments[s].a[1] + sy - c.at[1]) < reach + straps[s].len
      && strapDistance(s, c.at[0], c.at[1], sx, sy) < reach;
    const overCopies: [number, number, number, number][] = [];
    const underCopies: [number, number, number][] = [];
    const others: [number, number, number][] = [];
    for (let s = 0; s < segments.length; s++) {
      shifts.forEach(([sx, sy], shift) => {
        if (overSegs.has(s)) { if (near(s, sx, sy, 1)) overCopies.push([s, sx, sy, shift]); }
        else {
          if (c.lines[1 - over].includes(s) && near(s, sx, sy, 1)) underCopies.push([s, sx, sy]);
          if (near(s, sx, sy, radius + felt)) others.push([s, sx, sy]);
        }
      });
    }
    // Visit the under-strap's run: texels within its half-width and bevel of the under-line.
    const band = half + 1;
    const seen = new Set<number>();
    for (const [s, sx, sy] of underCopies) {
      const g = straps[s];
      const ax = g.ax + sx, ay = g.ay + sy, bx = g.bx + sx, by = g.by + sy;
      const i0 = Math.floor((Math.min(ax, bx) - band) / tx), i1 = Math.ceil((Math.max(ax, bx) + band) / tx);
      const j0 = Math.floor((Math.min(ay, by) - band) / ty), j1 = Math.ceil((Math.max(ay, by) + band) / ty);
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const px = cx(i), py = cy(j);
          if (Math.hypot(px - c.at[0], py - c.at[1]) > radius) continue;
          if (strapDistance(s, px, py, sx, sy) >= band) continue;
          const k = at(i, j);
          if (seen.has(k)) continue;
          seen.add(k);
          let o = FAR, os = -1, oshift = 4;
          for (const [t, ox, oy, shift] of overCopies) {
            const d = strapDistance(t, px, py, ox, oy);
            if (d < o) { o = d; os = t; oshift = shift; }
          }
          if (o >= felt) continue;
          let rest = FAR;
          for (const [t, ox, oy] of others) rest = Math.min(rest, strapDistance(t, px, py, ox, oy));
          const sunk = carved(rest) - dip * (1 - smooth(half, felt, o));
          const h = Math.max(carved(o), sunk);
          if (h < height[k] || o < half) height[k] = h;
          joint[k] = o < half ? Math.abs(o - half) : Math.min(Math.abs(o - half), Math.abs(rest - half));
          if (o < half) { owner[k] = os; home[k] = oshift; sky[k] = 1; }
          else if (rest < half) sky[k] = 0.72 + 0.28 * smooth(0, 5, o - half);
        }
      }
    }
  }

  // 6. Pack.
  const fields = new Float32Array(n * 4);
  const ids = new Uint8Array(n * 4);
  for (let k = 0; k < n; k++) {
    fields[k * 4] = height[k];
    fields[k * 4 + 1] = Math.min(joint[k], FAR);
    fields[k * 4 + 2] = d1[k];
    fields[k * 4 + 3] = sky[k];
    const f = face[k];
    ids[k * 4] = f >= 0 ? classOf[f] : 255;
    ids[k * 4 + 1] = f >= 0 ? f & 255 : owner[k] & 255;
    // The cells to add to this texel's cell to reach its piece's home, as (ox + 1) + 3 (oy + 1).
    // A strap's texel met its segment's copy shifted by (i, j) repeats; in the wall that copy is the
    // canonical segment carried by the texel's cell plus (i, j). Shifts are listed with i outer, so
    // shift = 3 (i + 1) + (j + 1).
    if (f >= 0) ids[k * 4 + 2] = hx[k] + 1 + 3 * (hy[k] + 1);
    else {
      const i = Math.floor(home[k] / 3) - 1, j = (home[k] % 3) - 1;
      ids[k * 4 + 2] = i + 1 + 3 * (j + 1);
    }
    ids[k * 4 + 3] = f >= 0 && color[f] === 1 ? 255 : 0;
  }

  return {
    width: W, height: H, nx, ny, fields, ids, classes, faces: classes.reduce((sum, c) => sum + c.faces.length, 0), conflicts,
    milliseconds: performance.now() - started,
  };
}
