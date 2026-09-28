// Crackle: sequential channel cracking of a glaze film in tension, as it cools on a body that
// contracts less. A model, and labeled as one wherever it is shown.
//
// The mechanics of cracking thin films on stiff substrates (Thouless 1990; Hutchinson and Suo
// 1992), kept to what decides the look:
//   - Cooling puts the glaze in equibiaxial tension that rises as the temperature falls.
//   - A channel crack runs when G = (π/2) Z σ² h / E' reaches the toughness, so the stress it needs
//     falls as 1/√h: thick glaze cracks first.
//   - A crack relieves the stress across itself within a shear-lag length proportional to h. New
//     cracks cannot open close to and parallel with old ones, so the final spacing grows with h.
//   - A crack runs perpendicular to the largest remaining principal stress. Near an old crack that
//     stress lies along the old crack, so a new crack turns to meet it square and stops there: the
//     T-junction.
// Simplifications: each crack relieves the stress across its nearest point as exp(-d/ℓ); a crack
// runs to arrest instantly relative to the cooling; the inside and the outside crack separately,
// and the rim is a free edge.
//
// Everything runs in a surface's chart (bowl.ts), in millimeters, with the chart's metric: exact
// along the profile, and r / s around it.

import { gaussian, rng, weibull } from '../core/rng.ts';

export type FractureParams = {
  seed: number;
  /** 0 slow … 1 fast. A fast cool adds transient tension, and so more generations of cracks. */
  cooling: number;
  /** Flaws per mm² of glaze. */
  flawDensity: number;
  /** Weibull modulus of the flaws' strength: higher is more uniform. */
  modulus: number;
  /** ℓ = shearLag · h: how far across itself a crack relieves the tension. */
  shearLag: number;
  /** Final tension after a slow cool, in units of the tension that cracks 1 mm of glaze. */
  load: number;
  /** Tension added by the fastest cool. */
  coolingLoad: number;
  /** A running crack continues while its opening stress exceeds `arrest` × the critical stress. */
  arrest: number;
  /** Propagation step, mm. */
  step: number;
  /** Random turning of a running tip, radians per √mm: the glaze is not a perfect continuum. */
  wander: number;
  /** How strongly the stress field steers a tip, per shear-lag length travelled. */
  steer: number;
};

export const FRACTURE_DEFAULTS: FractureParams = {
  seed: 1,
  cooling: 0.5,
  flawDensity: 0.6,
  modulus: 6,
  shearLag: 2.6,
  load: 1.9,
  coolingLoad: 0.6,
  arrest: 0.55,
  step: 0.1,
  wander: 0.15,
  steer: 0.8,
};

export type End = 'crack' | 'edge' | 'arrest' | 'bare';

export type Crack = {
  /** Chart coordinates in mm, x y pairs, from one end to the other. */
  points: Float32Array;
  /** The tension at which each point cracked, as a fraction of the final tension: its time in the
   * cooling. A tip that arrests in thinner glaze runs on when the tension has grown enough. */
  pointLoads: Float32Array;
  /** The tension at which it opened, as a fraction of the final tension. */
  load: number;
  /** Whether it opened in open glaze (first generation) or beside an older crack. */
  open: boolean;
  ends: [End, End];
  /** True length, mm. */
  length: number;
};

export type FractureStats = {
  cracks: number;
  length: number; // mm, true
  area: number; // mm², true, of glaze that can crack
  spacing: number; // mm: 2 · area / length, the spacing of an equivalent square network
  ends: Record<End, number>;
  firstLoad: number;
  milliseconds: number;
};

export type FractureSurface = {
  /** Chart radius, mm: s at the apex, the free edge. */
  radius: number;
  /** Lathe radius at arc length s, mm. */
  radiusAt(s: number): number;
  /** Glaze thickness at a chart point, mm; zero where the body is bare. */
  glaze(u: number, v: number): number;
};

const BARE = 0.03; // mm: thinner than this, there is no film to crack
const EDGE = 0.15; // mm inside the apex, where the free edge stops a crack

/** A uniform grid over the chart holding item indices per cell. */
class Grid {
  readonly cells: (number[] | undefined)[];
  readonly n: number;
  readonly radius: number;
  readonly size: number;
  constructor(radius: number, size: number) {
    this.radius = radius;
    this.size = size;
    this.n = Math.ceil((2 * radius) / size) + 1;
    this.cells = new Array(this.n * this.n);
  }
  cell(x: number): number {
    return Math.min(this.n - 1, Math.max(0, Math.floor((x + this.radius) / this.size)));
  }
  add(i: number, x0: number, y0: number, x1: number, y1: number): void {
    for (let cy = this.cell(Math.min(y0, y1)); cy <= this.cell(Math.max(y0, y1)); cy++) {
      for (let cx = this.cell(Math.min(x0, x1)); cx <= this.cell(Math.max(x0, x1)); cx++) {
        (this.cells[cy * this.n + cx] ??= []).push(i);
      }
    }
  }
}

/** Binary min-heap of (key, value). */
class Heap {
  private keys: number[] = [];
  private values: number[] = [];
  get size(): number { return this.keys.length; }
  push(key: number, value: number): void {
    const { keys, values } = this;
    let i = keys.length;
    keys.push(key); values.push(value);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (keys[parent] <= keys[i]) break;
      [keys[parent], keys[i]] = [keys[i], keys[parent]];
      [values[parent], values[i]] = [values[i], values[parent]];
      i = parent;
    }
  }
  pop(): [number, number] {
    const { keys, values } = this;
    const top: [number, number] = [keys[0], values[0]];
    const lastKey = keys.pop()!, lastValue = values.pop()!;
    if (keys.length > 0) {
      keys[0] = lastKey; values[0] = lastValue;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < keys.length && keys[l] < keys[m]) m = l;
        if (r < keys.length && keys[r] < keys[m]) m = r;
        if (m === i) break;
        [keys[m], keys[i]] = [keys[i], keys[m]];
        [values[m], values[i]] = [values[i], values[m]];
        i = m;
      }
    }
    return top;
  }
}

export function crackle(surface: FractureSurface, params: FractureParams = FRACTURE_DEFAULTS): { cracks: Crack[]; stats: FractureStats } {
  const started = performance.now();
  const random = rng(params.seed);
  const R = surface.radius;
  const finalLoad = params.load + params.coolingLoad * params.cooling;
  const critical = (h: number) => 1 / Math.sqrt(h); // tension that runs a crack through h mm

  // The local frame at a chart point: radial and circumferential unit vectors, and the metric
  // factor k, true length per chart length around the bowl.
  let er0 = 1, er1 = 0, k = 1;
  const frameAt = (u: number, v: number) => {
    const s = Math.hypot(u, v);
    if (s < 1e-6) { er0 = 1; er1 = 0; k = 1; return; }
    er0 = u / s; er1 = v / s;
    k = Math.min(1, surface.radiusAt(s) / s);
  };

  // Segments: fine ones for intersection, coarse ones for the stress relief.
  const fine: number[] = []; // x0 y0 x1 y1 per segment
  const fineGrid = new Grid(R, 0.5);
  const coarse: number[] = [];
  const coarseCrack: number[] = [];
  const coarseGrid = new Grid(R, 2);
  const coarseStamp: number[] = [];
  let stamp = 0;
  const best = new Float64Array(1 << 17).fill(Infinity);
  const bestStamp = new Int32Array(1 << 17);
  const bestN0 = new Float64Array(1 << 17), bestN1 = new Float64Array(1 << 17);
  const touched: number[] = [];

  // Relief tensor M at a point, in the local true frame (radial, around). S = I − M.
  let Mrr = 0, Mrc = 0, Mcc = 0;
  const relief = (u: number, v: number, ell: number, exclude: number) => {
    Mrr = Mrc = Mcc = 0;
    frameAt(u, v);
    const ec0 = -er1, ec1 = er0;
    const band = 3 * ell;
    const reach = (band / k) * 1.1;
    stamp++;
    touched.length = 0;
    const x0 = coarseGrid.cell(u - reach), x1 = coarseGrid.cell(u + reach);
    const y0 = coarseGrid.cell(v - reach), y1 = coarseGrid.cell(v + reach);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const list = coarseGrid.cells[cy * coarseGrid.n + cx];
        if (!list) continue;
        for (const i of list) {
          if (coarseStamp[i] === stamp) continue;
          coarseStamp[i] = stamp;
          const c = coarseCrack[i];
          if (c === exclude) continue;
          const ax = coarse[i * 4], ay = coarse[i * 4 + 1], bx = coarse[i * 4 + 2], by = coarse[i * 4 + 3];
          const dx = bx - ax, dy = by - ay;
          const t = Math.min(1, Math.max(0, ((u - ax) * dx + (v - ay) * dy) / (dx * dx + dy * dy || 1)));
          const wx = u - (ax + t * dx), wy = v - (ay + t * dy);
          const wr = wx * er0 + wy * er1, wc = (wx * ec0 + wy * ec1) * k;
          const d = Math.hypot(wr, wc);
          if (d >= band) continue;
          if (bestStamp[c] !== stamp) { bestStamp[c] = stamp; best[c] = Infinity; touched.push(c); }
          if (d < best[c]) {
            best[c] = d;
            const tr = dx * er0 + dy * er1, tc = (dx * ec0 + dy * ec1) * k;
            const tl = Math.hypot(tr, tc) || 1;
            bestN0[c] = -tc / tl; bestN1[c] = tr / tl; // the crack's normal, true frame
          }
        }
      }
    }
    for (const c of touched) {
      const w = Math.exp(-best[c] / ell);
      Mrr += w * bestN0[c] * bestN0[c];
      Mrc += w * bestN0[c] * bestN1[c];
      Mcc += w * bestN1[c] * bestN1[c];
    }
  };

  // Principal stress of S = I − M: the larger eigenvalue, its direction, and the anisotropy.
  let lambda1 = 1, anis = 0, e0 = 1, e1 = 0;
  const principal = () => {
    const mean = 1 - (Mrr + Mcc) / 2;
    const diff = Math.hypot((Mrr - Mcc) / 2, Mrc);
    lambda1 = Math.min(1, Math.max(0, mean + diff));
    anis = Math.min(1, 2 * diff);
    const theta = 0.5 * Math.atan2(-2 * Mrc, Mcc - Mrr);
    e0 = Math.cos(theta); e1 = Math.sin(theta);
  };

  // Opening stress across a crack running along chart direction (dx, dy), from the current M.
  let tr = 0, tc = 0;
  const trueDirection = (dx: number, dy: number) => {
    const ec0 = -er1, ec1 = er0;
    tr = dx * er0 + dy * er1; tc = (dx * ec0 + dy * ec1) * k;
    const l = Math.hypot(tr, tc) || 1;
    tr /= l; tc /= l;
  };
  const opening = () => {
    const nr = -tc, nc = tr;
    return 1 - (nr * nr * Mrr + 2 * nr * nc * Mrc + nc * nc * Mcc);
  };

  // Flaws, uniform in true area: sample the chart disc and keep each point with probability k.
  const trials = Math.round(params.flawDensity * Math.PI * R * R);
  const flawX: number[] = [], flawY: number[] = [], flawH: number[] = [], flawStrength: number[] = [];
  const flawGrid = new Grid(R, 1);
  const heap = new Heap(); // value ≥ 0: a flaw; value < 0: tip −(value + 1), waiting to run on
  for (let i = 0; i < trials; i++) {
    const s = R * Math.sqrt(random()), a = random() * Math.PI * 2;
    const u = s * Math.cos(a), v = s * Math.sin(a);
    frameAt(u, v);
    const h = surface.glaze(u, v);
    if (random() > k || h < BARE || s > R - EDGE) continue;
    const f = flawX.length;
    flawX.push(u); flawY.push(v); flawH.push(h);
    flawStrength.push(weibull(random, params.modulus));
    flawGrid.add(f, u, v, u, v);
    heap.push(critical(h) * flawStrength[f], f);
  }
  const consumed = new Uint8Array(flawX.length);
  const area = flawX.length / params.flawDensity;

  // Does the step p→q cross an existing segment? The fraction along the step, or -1. The step
  // starts where the tip's last segment ends; touching it there is not a crossing.
  const hit = (px: number, py: number, qx: number, qy: number) => {
    let first = -1;
    const x0 = fineGrid.cell(Math.min(px, qx)), x1 = fineGrid.cell(Math.max(px, qx));
    const y0 = fineGrid.cell(Math.min(py, qy)), y1 = fineGrid.cell(Math.max(py, qy));
    const rx = qx - px, ry = qy - py;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const list = fineGrid.cells[cy * fineGrid.n + cx];
        if (!list) continue;
        for (const i of list) {
          const ax = fine[i * 4], ay = fine[i * 4 + 1];
          const sx = fine[i * 4 + 2] - ax, sy = fine[i * 4 + 3] - ay;
          const den = rx * sy - ry * sx;
          if (Math.abs(den) < 1e-14) continue;
          const t = ((ax - px) * sy - (ay - py) * sx) / den;
          const w = ((ax - px) * ry - (ay - py) * rx) / den;
          if (t > 1e-6 && t <= 1 && w >= 0 && w <= 1 && (first < 0 || t < first)) first = t;
        }
      }
    }
    return first;
  };

  // A crack grows tip by tip. Each tip keeps its points as (x, y, load) and, when it arrests, the
  // tension at which it would run on.
  type Tip = { crack: number; pts: number[]; x: number; y: number; dx: number; dy: number; end: End | null; coarseFrom: number };
  const tips: Tip[] = [];
  const opened: { load: number; open: boolean; h: number }[] = [];

  const flushCoarse = (tip: Tip) => {
    const last = tip.pts.length / 3 - 1;
    if (last <= tip.coarseFrom) return;
    const a = tip.coarseFrom * 3, b = last * 3;
    const index = coarse.length / 4;
    coarse.push(tip.pts[a], tip.pts[a + 1], tip.pts[b], tip.pts[b + 1]);
    coarseCrack.push(tip.crack);
    coarseGrid.add(index, tip.pts[a], tip.pts[a + 1], tip.pts[b], tip.pts[b + 1]);
    tip.coarseFrom = last;
  };

  const advance = (tip: Tip, qx: number, qy: number, load: number) => {
    const index = fine.length / 4;
    fine.push(tip.x, tip.y, qx, qy);
    fineGrid.add(index, tip.x, tip.y, qx, qy);
    tip.pts.push(qx, qy, load / finalLoad);
    tip.dx = qx - tip.x; tip.dy = qy - tip.y;
    tip.x = qx; tip.y = qy;
    if (tip.pts.length / 3 - 1 - tip.coarseFrom >= 5) flushCoarse(tip);
    // A crack passing through a flaw uses it up.
    for (let cy = flawGrid.cell(qy - 0.2); cy <= flawGrid.cell(qy + 0.2); cy++) {
      for (let cx = flawGrid.cell(qx - 0.2); cx <= flawGrid.cell(qx + 0.2); cx++) {
        for (const f of flawGrid.cells[cy * flawGrid.n + cx] ?? []) {
          if (Math.hypot(flawX[f] - qx, flawY[f] - qy) < 0.2) consumed[f] = 1;
        }
      }
    }
  };

  /** Run a tip at the given tension until it stops. Returns the tension it needs to run on. */
  const grow = (tip: Tip, load: number): number => {
    for (let steps = 0; steps < 6000; steps++) {
      const h = surface.glaze(tip.x, tip.y);
      if (h < BARE) { tip.end = 'bare'; flushCoarse(tip); return Infinity; }
      const ell = params.shearLag * h;
      relief(tip.x, tip.y, ell, tip.crack);
      principal();
      trueDirection(tip.dx, tip.dy);
      // Steer toward the preferred direction, perpendicular to the largest principal stress.
      let pr = -e1, pc = e0;
      if (pr * tr + pc * tc < 0) { pr = -pr; pc = -pc; }
      const gain = Math.min(1, params.steer * anis * (params.step / ell));
      const turn = params.wander * Math.sqrt(params.step) * gaussian(random);
      const r0 = tr + gain * (pr - tr) - turn * tc;
      const c0 = tc + gain * (pc - tc) + turn * tr;
      const l = Math.hypot(r0, c0);
      tr = r0 / l; tc = c0 / l;
      const open = opening();
      if (load * open < params.arrest * critical(h)) {
        tip.end = 'arrest';
        flushCoarse(tip);
        const resume = (params.arrest * critical(h)) / Math.max(open, 1e-3);
        return steps === 0 ? Math.max(resume, load + 1e-3 * finalLoad) : resume;
      }
      // Step in chart space: around the bowl, a true length is 1 / k chart lengths.
      const ec0 = -er1, ec1 = er0;
      let qx = tip.x + params.step * (tr * er0 + (tc / k) * ec0);
      let qy = tip.y + params.step * (tr * er1 + (tc / k) * ec1);
      let end: End | null = null;
      const sq = Math.hypot(qx, qy);
      if (sq > R - EDGE) {
        const f = (R - EDGE) / sq;
        qx *= f; qy *= f;
        end = 'edge';
      }
      const t = hit(tip.x, tip.y, qx, qy);
      if (t >= 0) {
        qx = tip.x + (qx - tip.x) * t; qy = tip.y + (qy - tip.y) * t;
        end = 'crack';
      }
      advance(tip, qx, qy, load);
      if (end) { tip.end = end; flushCoarse(tip); return Infinity; }
    }
    tip.end = 'arrest';
    flushCoarse(tip);
    return Infinity;
  };

  let load = 0;
  let firstLoad = 0;
  while (heap.size > 0) {
    const [key, value] = heap.pop();
    if (key > finalLoad) break;

    if (value < 0) {
      // An arrested tip: the tension has grown; does it run on now?
      const tip = tips[-value - 1];
      const h = surface.glaze(tip.x, tip.y);
      relief(tip.x, tip.y, params.shearLag * h, tip.crack);
      trueDirection(tip.dx, tip.dy);
      const required = (params.arrest * critical(h)) / Math.max(opening(), 1e-3);
      if (required > key * (1 + 1e-9)) { heap.push(required, value); continue; }
      load = Math.max(load, key);
      tip.end = null;
      const resume = grow(tip, load);
      if (resume <= finalLoad) heap.push(resume, value);
      continue;
    }

    const i = value;
    if (consumed[i]) continue;
    const u = flawX[i], v = flawY[i], h = flawH[i];
    relief(u, v, params.shearLag * h, -1);
    principal();
    const required = (critical(h) * flawStrength[i]) / Math.max(lambda1, 1e-6);
    if (required > key * (1 + 1e-9)) { heap.push(required, i); continue; }
    consumed[i] = 1;
    load = Math.max(load, key);
    if (!firstLoad) firstLoad = key / finalLoad;

    // Open perpendicular to the largest principal stress; in open glaze, any direction.
    let dr: number, dc: number;
    const open = anis <= 0.1;
    if (!open) { dr = -e1; dc = e0; }
    else { const a = random() * Math.PI * 2; dr = Math.cos(a); dc = Math.sin(a); }
    frameAt(u, v);
    const ec0 = -er1, ec1 = er0;
    const dx = dr * er0 + (dc / k) * ec0, dy = dr * er1 + (dc / k) * ec1;
    const crack = opened.length;
    opened.push({ load: key / finalLoad, open, h });
    for (const sign of [1, -1]) {
      const tip: Tip = { crack, pts: [u, v, key / finalLoad], x: u, y: v, dx: sign * dx, dy: sign * dy, end: null, coarseFrom: 0 };
      tips.push(tip);
      const resume = grow(tip, load);
      if (resume <= finalLoad) heap.push(resume, -tips.length);
    }
  }

  // Join each crack's two tips into one polyline, end to end.
  const cracks: Crack[] = [];
  const ends: Record<End, number> = { crack: 0, edge: 0, arrest: 0, bare: 0 };
  for (let c = 0; c < opened.length; c++) {
    const a = tips[c * 2], b = tips[c * 2 + 1];
    const na = a.pts.length / 3, nb = b.pts.length / 3;
    const n = na + nb - 1;
    const points = new Float32Array(n * 2);
    const pointLoads = new Float32Array(n);
    for (let j = 0; j < na; j++) {
      const from = (na - 1 - j) * 3;
      points[j * 2] = a.pts[from]; points[j * 2 + 1] = a.pts[from + 1];
      pointLoads[j] = a.pts[from + 2];
    }
    for (let j = 1; j < nb; j++) {
      const to = na - 1 + j;
      points[to * 2] = b.pts[j * 3]; points[to * 2 + 1] = b.pts[j * 3 + 1];
      pointLoads[to] = b.pts[j * 3 + 2];
    }
    let length = 0;
    for (let j = 1; j < n; j++) {
      const x0 = points[(j - 1) * 2], y0 = points[(j - 1) * 2 + 1], x1 = points[j * 2], y1 = points[j * 2 + 1];
      frameAt((x0 + x1) / 2, (y0 + y1) / 2);
      const wx = x1 - x0, wy = y1 - y0;
      length += Math.hypot(wx * er0 + wy * er1, (wx * -er1 + wy * er0) * k);
    }
    const endA = a.end ?? 'arrest', endB = b.end ?? 'arrest';
    // A flaw that popped and stopped within about one relief length never became a channel crack.
    if (length < 0.3 || (endA === 'arrest' && endB === 'arrest' && length < 1.2 * params.shearLag * opened[c].h)) continue;
    cracks.push({ points, pointLoads, load: opened[c].load, open: opened[c].open, ends: [endA, endB], length });
    ends[endA]++;
    ends[endB]++;
  }

  const length = cracks.reduce((sum, c) => sum + c.length, 0);
  return {
    cracks,
    stats: {
      cracks: cracks.length,
      length,
      area,
      spacing: length > 0 ? (2 * area) / length : Infinity,
      ends,
      firstLoad,
      milliseconds: performance.now() - started,
    },
  };
}
