// Muqarnas as Jones drew its rule: tiers of niches, each tier stepping out over the one below.
//
// Plate X of Jones and Goury (1842) draws the pendentives of the Sala de la Barca as "numerous
// prisms of plaster ... of seven different forms, proceeding from three primary figures on plan":
// the right-angled triangle, the rectangle, and the isosceles triangle of 45°. "The curves of the
// several pieces are similar", so any piece joins any other by any side. Its elevation is rows of
// stilted arches; between two arches the plaster hangs in a stem that flares, along the curve Jones
// marks x, into the arches on either side; each row's arches stand over the stems of the row below.
//
// Here the same thing is said as geometry. A corbel is a stack of tiers. The front of each tier,
// in plan, carries a row of niches. A niche is a hood: highest at its arch, on the front, it
// reaches back into the tier and comes down vertically to the tier's floor. The underside of a
// tier is the highest of its niches' hoods, or its floor where none reaches; so two niches that
// meet cross in a rib, and between two arches the plaster reaches down to the floor in a stem,
// narrow at the bottom and widening as the arches rise: Jones's x, which is where two niches meet.
// The pieces are the plan's figures, and the lines between them are joints.
//
// Plan coordinates are meters, (x, y); a corbel's geometry is built with plan y as world z and
// height as world y, so a mesh places it by its transform.

import * as THREE from 'three/webgpu';

type V2 = THREE.Vector2;
const v2 = (x: number, y: number) => new THREE.Vector2(x, y);

export type Niche = {
  c: V2; // the middle of the arch, on the tier's front
  along: V2; // unit, along the front
  back: V2; // unit, from the front into the tier
  a: number; // half the arch's span, m
  b: number; // how far back the hood reaches, m
  point: number; // 0 a round arch; more, a pointed one: the arcs' centers stand this far past the middle, in half-spans
  stilt: number; // 2 an ellipse; more, a stilted arch, rising straight before it turns
};

/**
 * A piece: its outline in plan, its tier, the niches whose hoods may reach it, and how far its floor
 * hangs below the tier's line at a plan point: where no niche reaches, the plaster hangs that far
 * in a stem, a pendant.
 */
export type Piece = {
  outline: V2[]; tier: number; niches: Niche[];
  drop?: (p: V2) => number;
  /** A height the underside rises to where it is lower: a cavity's hood, reaching up through several tiers. */
  lift?: (p: V2) => number;
};
/** A corbel: pieces in tiers; tier t spans heights level(t) … level(t + 1). */
export type Corbel = { pieces: Piece[]; tiers: number; level: (t: number) => number };

/** A niche's hood over a plan point: 0 at the tier's floor … 1 at its top. */
export function hood(n: Niche, p: V2): number {
  const dx = p.x - n.c.x, dy = p.y - n.c.y;
  const u = Math.abs(dx * n.along.x + dy * n.along.y) / n.a;
  const v = Math.max(0, dx * n.back.x + dy * n.back.y) / n.b;
  const r2 = u * u + v * v;
  if (r2 >= 1) return 0;
  const r = Math.pow(r2, n.stilt / 4); // r² = ρ^stilt
  const e = n.point;
  return Math.sqrt(Math.max(0, (1 + e) ** 2 - (r + e) ** 2)) / Math.sqrt((1 + e) ** 2 - e * e);
}

export type CorbelOptions = {
  cell: number; // m, the finest a face is divided
  joint: number; // m, the width of a joint between pieces
  reach?: number; // m, how far a piece's sides rise past the tier above; more where a neighbour can stand higher
};

export type CorbelGeometry = THREE.BufferGeometry;

const rand = (n: number) => { const x = Math.sin(n * 12.9898 + 4.1) * 43758.5453; return x - Math.floor(x); };

/**
 * Pieces as meshes, in one geometry: each piece's underside, and its sides up past the tier above,
 * so wherever a tier steps out, the step is closed. Attribute `shade`: each piece cast a little
 * differently.
 */
export function corbelGeometry(corbel: Corbel, o: CorbelOptions): CorbelGeometry {
  const positions: number[] = [], shades: number[] = [];
  const index: number[] = [];
  corbel.pieces.forEach((piece, id) => {
    const t = piece.tier;
    const z0 = corbel.level(t), z1 = corbel.level(t + 1);
    const shade = rand(id * 1.7 + 3) - 0.5;
    // A joint: the outline drawn in by half a joint, about its incenter, which for the plan's
    // figures (all tangential) moves every side in by the same distance.
    const outline = inset(piece.outline, o.joint / 2);
    const heightAt = (p: V2) => {
      let g = 0;
      for (const n of piece.niches) g = Math.max(g, hood(n, p));
      const floor = z0 - (piece.drop ? piece.drop(p) : 0);
      const z = floor + (z1 - floor) * g;
      return piece.lift ? Math.max(z, piece.lift(p)) : z;
    };
    const push = (x: number, y: number, z: number) => {
      positions.push(x, y, z); shades.push(shade);
      return positions.length / 3 - 1;
    };
    const keyed = new Map<string, number>();
    const vertex = (p: V2) => {
      const k = `${Math.round(p.x * 1e5)},${Math.round(p.y * 1e5)}`;
      let id = keyed.get(k);
      if (id === undefined) { id = push(p.x, heightAt(p), p.y); keyed.set(k, id); }
      return id;
    };
    const faceStart = index.length;
    for (const [ia, ib, ic] of THREE.ShapeUtils.triangulateShape(outline, [])) {
      const [a, b, c] = [outline[ia], outline[ib], outline[ic]];
      const m = Math.max(1, Math.ceil(Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a)) / o.cell));
      const at = (i: number, j: number) => vertex(a.clone().multiplyScalar(1 - (i + j) / m).add(b.clone().multiplyScalar(i / m)).add(c.clone().multiplyScalar(j / m)));
      for (let j = 0; j < m; j++) {
        for (let i = 0; i < m - j; i++) {
          index.push(at(i, j), at(i + 1, j), at(i, j + 1));
          if (i + j < m - 1) index.push(at(i + 1, j), at(i + 1, j + 1), at(i, j + 1));
        }
      }
    }
    windDown(positions, index, faceStart);
    // The sides: from the underside's edge up past the tier above, divided as finely as the face so
    // they follow its curve.
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i], b = outline[(i + 1) % outline.length];
      const m = Math.max(1, Math.ceil(a.distanceTo(b) / o.cell));
      const s = positions.length / 3;
      for (let k = 0; k <= m; k++) {
        const p = a.clone().lerp(b, k / m);
        const y = heightAt(p);
        const top = Math.max(z1, y) + (o.reach ?? 0.02);
        push(p.x, y, p.y);
        push(p.x, top, p.y);
      }
      for (let k = 0; k < m; k++) {
        const q = s + 2 * k;
        index.push(q, q + 1, q + 2, q + 2, q + 1, q + 3);
      }
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('shade', new THREE.Float32BufferAttribute(shades, 1));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Wind a face's triangles to look down, into the room, by its first triangle of any size. */
function windDown(positions: number[], index: number[], from: number): void {
  const p = (k: number) => new THREE.Vector3(positions[k * 3], positions[k * 3 + 1], positions[k * 3 + 2]);
  for (let t = from; t < index.length; t += 3) {
    const n = new THREE.Vector3().crossVectors(p(index[t + 1]).sub(p(index[t])), p(index[t + 2]).sub(p(index[t])));
    if (n.lengthSq() < 1e-16) continue;
    if (n.y > 0) for (let k = from; k < index.length; k += 3) [index[k + 1], index[k + 2]] = [index[k + 2], index[k + 1]];
    return;
  }
}

/** A tangential polygon drawn in by d about its incenter. */
function inset(poly: V2[], d: number): V2[] {
  if (d <= 0) return poly;
  // Incenter: the sides' lengths weight the opposite vertices for a triangle; for any tangential
  // polygon, the point equidistant from all sides, found here as the triangle's or the centroid.
  let c: V2, r: number;
  if (poly.length === 3) {
    const [A, B, C] = poly;
    const a = B.distanceTo(C), b = C.distanceTo(A), cc = A.distanceTo(B);
    c = A.clone().multiplyScalar(a).add(B.clone().multiplyScalar(b)).add(C.clone().multiplyScalar(cc)).divideScalar(a + b + cc);
    r = Math.abs(THREE.ShapeUtils.area(poly)) * 2 / (a + b + cc);
  } else {
    c = poly.reduce((s, p) => s.add(p), v2(0, 0)).divideScalar(poly.length);
    r = Infinity;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const ab = b.clone().sub(a), ac = c.clone().sub(a);
      r = Math.min(r, Math.abs(ab.x * ac.y - ab.y * ac.x) / ab.length());
    }
  }
  const k = Math.max(0, 1 - d / r);
  return poly.map((p) => c.clone().add(p.clone().sub(c).multiplyScalar(k)));
}

// Rules -------------------------------------------------------------------------------------------

export type SquinchOptions = {
  depth: number; // m, from the corner to the front, where the octagon's side stands
  bands: number; // tiers
  bottom: number; // m, the lowest tier's floor
  height: number; // m, from the lowest tier's floor to the top
  hang: number; // how far a stem hangs below its tier's line, in tiers
};

/**
 * Jones's pendentive, carried on to any number of tiers, in a right-angled corner: the corner at
 * the origin, the walls along +x and +y, the front the line x + y = depth·√2.
 *
 * The plan is the corner's square grid cut by its diagonals: bands parallel to the front, each
 * half a grid square deep. Band j, counted from the corner, is a row of 2j + 1 right-angled
 * triangles, Jones's A: j + 1 standing on the band's front, j on its back. Each triangle on the
 * front is a niche, its arch on its long side; the triangles between are where the niches meet.
 * Band j + 1's niches stand over band j's stems. The corner's single triangle, the lowest piece,
 * hangs below the rest as Jones's A1 does, a pendant.
 */
export function squinch(o: SquinchOptions): Corbel {
  const n = o.bands;
  const g = (o.depth * Math.SQRT2) / n; // the grid, along the walls
  const s = g * Math.SQRT2; // an arch's span
  const h = g / Math.SQRT2; // a band's depth
  const along = v2(1, -1).normalize(), back = v2(-1, -1).normalize();
  const level = (t: number) => o.bottom + (o.height * Math.min(Math.max(t, 0), n)) / n;
  const H = o.height / n;
  const pieces: Piece[] = [];
  for (let j = 0; j < n; j++) {
    // Where the arches stand, along the band's front, in spans from the corner's bisector: one on
    // every span. Rows alternate, counting from the corner's pendant: round arches with short stems,
    // then pointed arches with long ones, pendants, as the Two Sisters' corners hang.
    const stems = j + 2; // lattice points on the front, walls included
    const mid = (j + 1) / 2;
    const paired = j % 2 === 1;
    const arches: { u: number; half: number; point: number }[] = [];
    for (let i = 0; i < stems - 1; i++) arches.push({ u: i + 0.5 - mid, half: 0.5, point: paired ? 0.3 : 0 });
    const niches: Niche[] = arches.map((a) => ({
      c: v2(mid * g, (j + 1 - mid) * g).addScaledVector(along, a.u * s),
      along, back, a: (a.half * 2 - 0.1) * 0.5 * s, b: h, point: a.point, stilt: 3,
    }));
    // A stem hangs furthest at the front, and rises into the tier behind it.
    const front = (j + 1) * g;
    const reach = j === 0 ? 1.8 : paired ? 1.3 : 0.7;
    const drop = (p: V2) => {
      const v = Math.min(1, Math.max(0, (front - p.x - p.y) / Math.SQRT2 / h));
      return o.hang * reach * H * (1 - v * v);
    };
    for (let i = 0; i <= j; i++) pieces.push({ tier: j, niches, drop, outline: [v2(i * g, (j + 1 - i) * g), v2(i * g, (j - i) * g), v2((i + 1) * g, (j - i) * g)] });
    for (let i = 0; i < j; i++) pieces.push({ tier: j, niches, drop, outline: [v2(i * g, (j - i) * g), v2((i + 1) * g, (j - 1 - i) * g), v2((i + 1) * g, (j - i) * g)] });
  }
  return { pieces, tiers: n, level };
}

export type CornerOptions = {
  length: number; // m, the wall's run
  tiers: number;
  step: number; // m, how far each tier stands out
  span: number; // m, an arch's span
  bottom: number;
  height: number;
  hang: number; // in tiers
};

/**
 * A straight muqarnas cornice along a wall, the x axis, standing out toward +y: tiers of rectangles,
 * Jones's B, each tier's arches over the stems of the tier below. Pieces that cross the ends are
 * cut there, so two cornices meet at a mitre.
 */
export function cornice(o: CornerOptions, clip?: (poly: V2[]) => V2[]): Corbel {
  const level = (t: number) => o.bottom + (o.height * Math.min(Math.max(t, 0), o.tiers)) / o.tiers;
  const pieces: Piece[] = [];
  const along = v2(1, 0), back = v2(0, -1);
  for (let t = 0; t < o.tiers; t++) {
    const y0 = t * o.step, y1 = (t + 1) * o.step;
    const shift = (t % 2) * 0.5 * o.span;
    const from = Math.floor((-o.length / 2 - shift) / o.span) - 1, to = Math.ceil((o.length / 2 - shift) / o.span) + 1;
    const niches: Niche[] = [];
    for (let i = from; i <= to; i++) {
      niches.push({ c: v2((i + 0.5) * o.span + shift, y1), along, back, a: 0.42 * o.span, b: o.step, point: t % 2 ? 0.35 : 0, stilt: 3 });
    }
    const H = o.height / o.tiers;
    const drop = (p: V2) => { const v = Math.min(1, Math.max(0, (y1 - p.y) / o.step)); return o.hang * H * (1 - v * v); };
    for (let i = from; i <= to; i++) {
      let outline = [v2(i * o.span + shift, y0), v2((i + 1) * o.span + shift, y0), v2((i + 1) * o.span + shift, y1), v2(i * o.span + shift, y1)];
      if (clip) outline = clip(outline);
      if (outline.length >= 3 && Math.abs(THREE.ShapeUtils.area(outline)) > 1e-6) pieces.push({ tier: t, niches, drop, outline });
    }
  }
  return { pieces, tiers: o.tiers, level };
}

/** Sutherland–Hodgman: a polygon clipped to the half-plane where (p - a)·n >= 0. */
export function clipHalf(poly: V2[], a: V2, n: V2): V2[] {
  const out: V2[] = [];
  const side = (p: V2) => (p.x - a.x) * n.x + (p.y - a.y) * n.y;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const sp = side(p), sq = side(q);
    if (sp >= 0) out.push(p);
    if (sp >= 0 !== sq >= 0) out.push(p.clone().lerp(q, sp / (sp - sq)));
  }
  return out;
}

export type CascadeOptions = {
  width: number; // m, across the top row
  tiers: number;
  step: number; // m, how far each row stands out beyond the one below
  span: number; // m, an arch's span
  bottom: number;
  height: number;
  hang: number; // in tiers
};

/**
 * A cascade on a wall, as over the Two Sisters' windows: rows of niches along the wall, the x axis,
 * standing out toward +y, each row a step further out and reaching further to either side than
 * the row below, so the rows' ends draw an arch and the lowest row is a single pendant. Where a
 * row reaches past the rows beneath it, its pieces run back to the wall.
 */
export function cascade(o: CascadeOptions): Corbel {
  const level = (t: number) => o.bottom + (o.height * Math.min(Math.max(t, 0), o.tiers)) / o.tiers;
  const reach = (t: number) => (o.width / 2) * Math.pow((t + 0.6) / o.tiers, 0.8); // half the row's length
  const along = v2(1, 0), back = v2(0, -1);
  const H = o.height / o.tiers;
  const pieces: Piece[] = [];
  for (let t = 0; t < o.tiers; t++) {
    const y0 = t * o.step, y1 = (t + 1) * o.step;
    const shift = ((t + o.tiers) % 2) * 0.5 * o.span; // the top row is centred on an arch
    const L = reach(t), below = t > 0 ? reach(t - 1) : -1;
    const niches: Niche[] = [];
    const from = Math.floor((-L - shift) / o.span), to = Math.ceil((L - shift) / o.span);
    for (let i = from; i < to; i++) {
      const x0 = i * o.span + shift, x1 = x0 + o.span;
      if (Math.max(Math.abs(x0), Math.abs(x1)) > L + 1e-6) continue;
      niches.push({ c: v2((x0 + x1) / 2, y1), along, back, a: 0.42 * o.span, b: o.step, point: t % 2 ? 0.35 : 0, stilt: 3 });
    }
    const drop = (p: V2) => { const v = Math.min(1, Math.max(0, (y1 - p.y) / o.step)); return o.hang * H * (1 - v * v); };
    for (let i = from; i < to; i++) {
      const x0 = i * o.span + shift, x1 = x0 + o.span;
      if (Math.max(Math.abs(x0), Math.abs(x1)) > L + 1e-6) continue;
      const outside = Math.max(Math.abs(x0), Math.abs(x1)) > below + 1e-6;
      pieces.push({ tier: t, niches, drop, outline: [v2(x0, outside ? 0 : y0), v2(x1, outside ? 0 : y0), v2(x1, y1), v2(x0, y1)] });
    }
  }
  return { pieces, tiers: o.tiers, level };
}

