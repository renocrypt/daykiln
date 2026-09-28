// Free vibration of a solid of revolution, by finite elements: the tool behind KILN's bowl modes
// (tools/bowl-modes.ts). Offline only.
//
// The section in (r, z) is a pixel mesh of square bilinear elements; the displacement around the
// axis is one circumferential harmonic n at a time,
//   u_r = U(r, z) cos nθ,  u_θ = V(r, z) sin nθ,  u_z = W(r, z) cos nθ,
// with strains
//   ε_rr = U,r   ε_zz = W,z   ε_θθ = (U + nV)/r   γ_rz = U,z + W,r
//   γ_rθ = V,r − V/r − nU/r   γ_zθ = V,z − nW/r.
// For n ≥ 1 every term integrates around the axis to π, so the common factor drops from the
// frequencies; for n = 0 the problem splits in two, and only the family in (U, W) is kept: torsion
// moves nothing normal to the surface, and radiates nothing. On the axis the field must be single
// valued: n = 0, U = 0; n = 1, W = 0 and V = −U; n ≥ 2, U = V = W = 0.
//
// The stiffness K − σM (σ below zero, since a free body's rigid modes have ω = 0) is factored
// once as LDLᵀ in skyline storage after a reverse Cuthill–McKee ordering of the nodes; the lowest
// modes are found by subspace iteration (Bathe), the small projected problem by Jacobi rotations.
// Mode shapes come back mass-normalized in the three-dimensional sense: the θ integral included.

export type Material = { E: number; nu: number; rho: number }; // Pa, –, kg/m³
export type Grid = {
  /** Pixel size, m; node (i, j) stands at r = i·h, z = z0 + j·h. */
  h: number;
  z0: number;
  ni: number; // pixels across in r
  nj: number; // pixels up in z
  /** Material index per pixel (j·ni + i), or −1 where there is none. */
  cell: Int16Array;
  materials: Material[];
};
export type Mode = { n: number; k: number; f: number; U: Float64Array; V: Float64Array; W: Float64Array };

const GAUSS = [-1 / Math.sqrt(3), 1 / Math.sqrt(3)];

/** Nodes in use, their positions, and elements as node quadruples. */
function topology(g: Grid) {
  const id = new Int32Array((g.ni + 1) * (g.nj + 1)).fill(-1);
  const nodes: number[] = []; // flat node index (j·(ni+1) + i)
  const elements: { i: number; j: number; nodes: [number, number, number, number]; m: Material }[] = [];
  const node = (i: number, j: number) => {
    const at = j * (g.ni + 1) + i;
    if (id[at] < 0) { id[at] = nodes.length; nodes.push(at); }
    return id[at];
  };
  for (let j = 0; j < g.nj; j++) for (let i = 0; i < g.ni; i++) {
    const c = g.cell[j * g.ni + i];
    if (c < 0) continue;
    elements.push({ i, j, nodes: [node(i, j), node(i + 1, j), node(i + 1, j + 1), node(i, j + 1)], m: g.materials[c] });
  }
  const pos = nodes.map((at) => ({ i: at % (g.ni + 1), j: Math.floor(at / (g.ni + 1)) }));
  return { elements, pos, count: nodes.length };
}

/** Reverse Cuthill–McKee: a node order that keeps the matrix's profile narrow. */
function rcm(count: number, elements: { nodes: number[] }[]): Int32Array {
  const adj: Set<number>[] = Array.from({ length: count }, () => new Set());
  for (const e of elements) for (const a of e.nodes) for (const b of e.nodes) if (a !== b) adj[a].add(b);
  const degree = adj.map((s) => s.size);
  const seen = new Uint8Array(count), order: number[] = [];
  while (order.length < count) {
    let start = -1;
    for (let v = 0; v < count; v++) if (!seen[v] && (start < 0 || degree[v] < degree[start])) start = v;
    const queue = [start];
    seen[start] = 1;
    for (let q = 0; q < queue.length; q++) {
      const v = queue[q];
      order.push(v);
      for (const w of [...adj[v]].filter((w) => !seen[w]).sort((a, b) => degree[a] - degree[b])) { seen[w] = 1; queue.push(w); }
    }
  }
  order.reverse();
  const rank = new Int32Array(count);
  order.forEach((v, r) => { rank[v] = r; });
  return rank;
}

/** A symmetric matrix in skyline storage: column j holds rows first[j]…j. */
class Skyline {
  readonly first: Int32Array;
  readonly start: Int32Array; // offset of (first[j], j) in values
  readonly values: Float64Array;
  readonly size: number;
  constructor(size: number, first: Int32Array) {
    this.size = size;
    this.first = first;
    this.start = new Int32Array(size + 1);
    for (let j = 0; j < size; j++) this.start[j + 1] = this.start[j] + (j - first[j] + 1);
    this.values = new Float64Array(this.start[size]);
  }
  add(i: number, j: number, v: number): void {
    if (i > j) [i, j] = [j, i];
    this.values[this.start[j] + i - this.first[j]] += v;
  }
  get(i: number, j: number): number {
    if (i > j) [i, j] = [j, i];
    return i < this.first[j] ? 0 : this.values[this.start[j] + i - this.first[j]];
  }
  /** y = A x. */
  times(x: Float64Array, y: Float64Array): Float64Array {
    y.fill(0);
    for (let j = 0; j < this.size; j++) {
      const s = this.start[j], f = this.first[j];
      let acc = 0;
      for (let i = f; i < j; i++) { const a = this.values[s + i - f]; acc += a * x[i]; y[i] += a * x[j]; }
      y[j] += acc + this.values[s + j - f] * x[j];
    }
    return y;
  }
  /** In place: A = L D Lᵀ, L unit lower (stored transposed in the upper profile), D on the diagonal. */
  factor(): void {
    const { values: a, first, start } = this;
    for (let j = 0; j < this.size; j++) {
      const fj = first[j], sj = start[j];
      // g_ij = a_ij − Σ_{k<i} l_ki g_kj, for i from fj to j − 1 (the column's reduced entries)
      for (let i = fj + 1; i < j; i++) {
        const fi = first[i], si = start[i], from = Math.max(fi, fj);
        let acc = 0;
        for (let k = from; k < i; k++) acc += a[si + k - fi] * a[sj + k - fj];
        a[sj + i - fj] -= acc;
      }
      // l_ij = g_ij / d_i, and d_j = a_jj − Σ l_ij g_ij
      let d = a[sj + j - fj];
      for (let i = fj; i < j; i++) {
        const g = a[sj + i - fj], l = g / a[start[i] + i - first[i]];
        d -= l * g;
        a[sj + i - fj] = l;
      }
      if (!(d > 0)) throw new Error(`not positive definite at ${j}: ${d}`);
      a[sj + j - fj] = d;
    }
  }
  /** Solve with the factors, in place. */
  solve(x: Float64Array): Float64Array {
    const { values: a, first, start } = this;
    for (let j = 0; j < this.size; j++) {
      const fj = first[j], sj = start[j];
      let acc = 0;
      for (let i = fj; i < j; i++) acc += a[sj + i - fj] * x[i];
      x[j] -= acc;
    }
    for (let j = 0; j < this.size; j++) x[j] /= a[start[j] + j - first[j]];
    for (let j = this.size - 1; j >= 0; j--) {
      const fj = first[j], sj = start[j], xj = x[j];
      for (let i = fj; i < j; i++) x[i] -= a[sj + i - fj] * xj;
    }
    return x;
  }
}

/** Symmetric eigenproblem by cyclic Jacobi: values, and vectors as columns. */
function jacobi(A: number[][]): { values: number[]; vectors: number[][] } {
  const n = A.length, a = A.map((r) => r.slice()), v: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p][q] ** 2;
    if (off < 1e-30) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(a[p][q]) < 1e-300) continue;
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; }
      for (let k = 0; k < n; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk; }
      for (let k = 0; k < n; k++) { const vkp = v[k][p], vkq = v[k][q]; v[k][p] = c * vkp - s * vkq; v[k][q] = s * vkp + c * vkq; }
    }
  }
  return { values: a.map((r, i) => r[i]), vectors: v };
}

/**
 * The lowest `count` elastic modes of harmonic n, above `floor` Hz. Mass-normalized with the θ
 * integral included, so a mode's displacement at a point is its shape there times cos nθ (U, W) or
 * sin nθ (V).
 */
export function modes(g: Grid, n: number, count: number, o: { floor?: number; tolerance?: number; shift?: number } = {}): Mode[] {
  const floor = o.floor ?? 20;
  const { elements, pos, count: nodeCount } = topology(g);
  const rank = rcm(nodeCount, elements);
  const perNode = n === 0 ? 2 : 3; // (U, W) or (U, V, W)
  // Each node's dofs in order of its rank; on the axis, the conditions above.
  const dof: { index: number; sign: number }[][] = new Array(nodeCount);
  const byRank = new Int32Array(nodeCount);
  for (let v = 0; v < nodeCount; v++) byRank[rank[v]] = v;
  let size = 0;
  for (const v of byRank) {
    const onAxis = pos[v].i === 0;
    const none = { index: -1, sign: 0 };
    if (n === 0) {
      dof[v] = onAxis ? [none, { index: size++, sign: 1 }] : [{ index: size++, sign: 1 }, { index: size++, sign: 1 }];
    } else if (n === 1 && onAxis) {
      const u = size++;
      dof[v] = [{ index: u, sign: 1 }, { index: u, sign: -1 }, none];
    } else if (onAxis) {
      dof[v] = [none, none, none];
    } else {
      dof[v] = [{ index: size++, sign: 1 }, { index: size++, sign: 1 }, { index: size++, sign: 1 }];
    }
  }
  // The profile: each column reaches up to the lowest index it couples to.
  const first = Int32Array.from({ length: size }, (_, j) => j);
  for (const e of elements) {
    let lo = Infinity;
    for (const v of e.nodes) for (const d of dof[v]) if (d.index >= 0) lo = Math.min(lo, d.index);
    for (const v of e.nodes) for (const d of dof[v]) if (d.index >= 0 && lo < first[d.index]) first[d.index] = lo;
  }
  const K = new Skyline(size, first), M = new Skyline(size, first.slice());
  const h = g.h, jac = (h / 2) * (h / 2);
  const B = Array.from({ length: 6 }, () => new Float64Array(4 * perNode));
  const Nv = new Float64Array(4);
  for (const e of elements) {
    const { E, nu, rho } = e.m;
    const lam = (E * nu) / ((1 + nu) * (1 - 2 * nu)), mu = E / (2 * (1 + nu));
    const ke = Array.from({ length: 4 * perNode }, () => new Float64Array(4 * perNode));
    const me = Array.from({ length: 4 * perNode }, () => new Float64Array(4 * perNode));
    for (const xi of GAUSS) for (const eta of GAUSS) {
      const r = (e.i + (1 + xi) / 2) * h;
      const sx = [-1, 1, 1, -1], sy = [-1, -1, 1, 1];
      for (let a = 0; a < 4; a++) Nv[a] = ((1 + sx[a] * xi) * (1 + sy[a] * eta)) / 4;
      for (const row of B) row.fill(0);
      for (let a = 0; a < 4; a++) {
        const dr = (sx[a] * (1 + sy[a] * eta)) / 4 * (2 / h), dz = (sy[a] * (1 + sx[a] * xi)) / 4 * (2 / h), N = Nv[a], o = a * perNode;
        if (n === 0) {
          B[0][o] = dr; B[1][o + 1] = dz; B[2][o] = N / r; B[3][o] = dz; B[3][o + 1] = dr;
        } else {
          B[0][o] = dr; B[1][o + 2] = dz;
          B[2][o] = N / r; B[2][o + 1] = (n * N) / r;
          B[3][o] = dz; B[3][o + 2] = dr;
          B[4][o] = (-n * N) / r; B[4][o + 1] = dr - N / r;
          B[5][o + 1] = dz; B[5][o + 2] = (-n * N) / r;
        }
      }
      const w = r * jac;
      const rows = n === 0 ? 4 : 6;
      // D B, column by column, then Bᵀ D B.
      for (let p = 0; p < 4 * perNode; p++) {
        const e0 = B[0][p], e1 = B[1][p], e2 = B[2][p];
        const db = [lam * (e0 + e1 + e2) + 2 * mu * e0, lam * (e0 + e1 + e2) + 2 * mu * e1, lam * (e0 + e1 + e2) + 2 * mu * e2, mu * B[3][p], mu * B[4][p], mu * B[5][p]];
        for (let q = 0; q < 4 * perNode; q++) {
          let s = 0;
          for (let k = 0; k < rows; k++) s += B[k][q] * db[k];
          ke[q][p] += s * w;
        }
      }
      for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) {
        const m = rho * Nv[a] * Nv[b] * w;
        for (let c = 0; c < perNode; c++) me[a * perNode + c][b * perNode + c] += m;
      }
    }
    // Assembly, through each dof's index and sign.
    const map: { index: number; sign: number }[] = [];
    for (const v of e.nodes) for (let c = 0; c < perNode; c++) map.push(dof[v][c]);
    for (let p = 0; p < map.length; p++) {
      if (map[p].index < 0) continue;
      for (let q = 0; q < map.length; q++) {
        if (map[q].index < 0 || map[q].index > map[p].index) continue;
        // On the axis for n = 1 a node's U and V are one unknown, V = −U: their entries add into one.
        const s = map[p].sign * map[q].sign;
        K.add(map[q].index, map[p].index, ke[p][q] * s);
        M.add(map[q].index, map[p].index, me[p][q] * s);
      }
    }
  }
  // A = K − σM, factored. The shift is a few hundred hertz below zero, not a hair: a free body's
  // rigid motions have ω = 0, and a factor that is nearly singular along them lets one pass of the
  // iteration swamp every trial vector with them, and the projection loses its rank to round-off.
  const sigma = -((2 * Math.PI * (o.shift ?? 300)) ** 2);
  const A = new Skyline(size, first.slice());
  for (let t = 0; t < A.values.length; t++) A.values[t] = K.values[t] - sigma * M.values[t];
  A.factor();
  // Subspace iteration.
  const p = Math.min(size, count + Math.max(8, count));
  let X = Array.from({ length: p }, (_, c) => {
    const x = new Float64Array(size);
    for (let i = 0; i < size; i++) x[i] = Math.sin(1.7 * (i + 1) * (c + 1) + c) + (i % (c + 2) === 0 ? 1 : 0);
    return x;
  });
  let values: number[] = [], last: number[] = [];
  const kx = new Float64Array(size);
  const dot = (a: Float64Array, b: Float64Array) => { let s = 0; for (let t = 0; t < size; t++) s += a[t] * b[t]; return s; };
  let seed = 1;
  const fresh = () => { const x = new Float64Array(size); for (let t = 0; t < size; t++) { seed = (seed * 16807) % 2147483647; x[t] = seed / 2147483647 - 0.5; } return x; };
  for (let it = 0; it < 120; it++) {
    // One step of inverse iteration, then the iterates made M-orthonormal by Gram–Schmidt, twice
    // over; one that collapses into the others (rigid motions dominate at first) is replaced.
    const Q: Float64Array[] = [], MQ: Float64Array[] = [];
    for (const x of X) {
      let q = A.solve(M.times(x, new Float64Array(size)));
      for (let attempt = 0; attempt < 4; attempt++) {
        let mq = M.times(q, new Float64Array(size));
        const before = Math.sqrt(dot(q, mq));
        // Against each accepted vector b: c = bᵀMq = (Mb)ᵀq, and Mq follows q without another product.
        for (let pass = 0; pass < 2; pass++) for (let i = 0; i < Q.length; i++) {
          const c = dot(MQ[i], q), b = Q[i], mb = MQ[i];
          for (let t = 0; t < size; t++) { q[t] -= c * b[t]; mq[t] -= c * mb[t]; }
        }
        const norm = Math.sqrt(dot(q, mq));
        if (norm > 1e-8 * before) {
          for (let t = 0; t < size; t++) { q[t] /= norm; mq[t] /= norm; }
          Q.push(q); MQ.push(mq);
          break;
        }
        q = A.solve(M.times(fresh(), new Float64Array(size)));
      }
    }
    // The projection of A onto them, a small symmetric matrix, and its eigenvectors.
    const AQ = Q.map((q, i) => { K.times(q, kx); const y = new Float64Array(size), mq = MQ[i]; for (let t = 0; t < size; t++) y[t] = kx[t] - sigma * mq[t]; return y; });
    const C = Q.map((qi) => AQ.map((y) => dot(qi, y)));
    for (let i = 0; i < p; i++) for (let j = 0; j < i; j++) C[i][j] = C[j][i] = (C[i][j] + C[j][i]) / 2;
    const { values: ev, vectors } = jacobi(C);
    const order = ev.map((_v, i) => i).sort((a, b) => ev[a] - ev[b]);
    values = order.map((i) => ev[i]);
    X = order.map((i) => { const x = new Float64Array(size); for (let j = 0; j < p; j++) { const c = vectors[j][i]; if (c) for (let t = 0; t < size; t++) x[t] += c * Q[j][t]; } return x; });
    const done = last.length > 0 && values.slice(0, count + 2).every((v, i) => Math.abs(v - last[i]) <= (o.tolerance ?? 1e-10) * Math.abs(v));
    last = values;
    if (done) break;
  }
  const tmp = new Float64Array(size);
  // λ = ω² − σ for A; back to ω², drop rigid and sub-floor modes, and expand to U, V, W per node.
  const factor = n === 0 ? 2 * Math.PI : Math.PI;
  const out: Mode[] = [];
  for (let c = 0; c < p && out.length < count; c++) {
    const omega2 = values[c] + sigma;
    const f = Math.sqrt(Math.max(omega2, 0)) / (2 * Math.PI);
    if (f < floor) continue;
    const x = X[c];
    let mass = 0;
    M.times(x, tmp);
    for (let t = 0; t < size; t++) mass += x[t] * tmp[t];
    const scale = 1 / Math.sqrt(mass * factor);
    const U = new Float64Array((g.ni + 1) * (g.nj + 1)), V = new Float64Array(U.length), W = new Float64Array(U.length);
    for (let v = 0; v < nodeCount; v++) {
      const at = pos[v].j * (g.ni + 1) + pos[v].i, d = dof[v];
      const get = (c2: number) => (d[c2] && d[c2].index >= 0 ? d[c2].sign * x[d[c2].index] * scale : 0);
      if (n === 0) { U[at] = get(0); W[at] = get(1); } else { U[at] = get(0); V[at] = get(1); W[at] = get(2); }
    }
    out.push({ n, k: out.length, f, U, V, W });
  }
  return out;
}

/** A field at a point (r, z), m, by bilinear interpolation over the grid's nodes. */
export function sample(g: Grid, field: Float64Array, r: number, z: number): number {
  const x = r / g.h, y = (z - g.z0) / g.h;
  const i = Math.min(g.ni - 1, Math.max(0, Math.floor(x))), j = Math.min(g.nj - 1, Math.max(0, Math.floor(y)));
  const fx = x - i, fy = y - j, w = g.ni + 1;
  return field[j * w + i] * (1 - fx) * (1 - fy) + field[j * w + i + 1] * fx * (1 - fy) + field[(j + 1) * w + i] * (1 - fx) * fy + field[(j + 1) * w + i + 1] * fx * fy;
}

/** Rasterize polygons (m, (r, z) pairs) into a grid: each pixel takes the last polygon holding its center. */
export function raster(h: number, polygons: { outline: [number, number][]; material: number }[], materials: Material[]): Grid {
  let rMax = 0, zMin = Infinity, zMax = -Infinity;
  for (const p of polygons) for (const [r, z] of p.outline) { rMax = Math.max(rMax, r); zMin = Math.min(zMin, z); zMax = Math.max(zMax, z); }
  const z0 = Math.floor(zMin / h) * h - h, ni = Math.ceil(rMax / h) + 1, nj = Math.ceil((zMax - z0) / h) + 1;
  const cell = new Int16Array(ni * nj).fill(-1);
  for (const p of polygons) {
    for (let j = 0; j < nj; j++) {
      const z = z0 + (j + 0.5) * h, xs: number[] = [];
      const o = p.outline;
      for (let k = 0; k < o.length; k++) {
        const [r0, y0] = o[k], [r1, y1] = o[(k + 1) % o.length];
        if ((y0 <= z && y1 > z) || (y1 <= z && y0 > z)) xs.push(r0 + ((z - y0) / (y1 - y0)) * (r1 - r0));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) for (let i = Math.max(0, Math.round(xs[k] / h)); i < Math.min(ni, Math.round(xs[k + 1] / h)); i++) cell[j * ni + i] = p.material;
    }
  }
  return { h, z0, ni, nj, cell, materials };
}
