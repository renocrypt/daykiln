// A Ru-type conical bowl for KILN look development: the body's profile, the glaze thickness on
// it, and the two glaze surfaces lathed from them.
//
// The body is drawn as a potter's template: straight runs joined by fillets, about 17 cm across
// the rim. Two glaze surfaces are lathed from it. The inside runs from the center of the well to
// the apex of the lip; the outside from the center of the base, over the foot, to the same apex.
// Each is parameterized by arc length s from its pole, which also gives it a flat chart,
// chart = s (cos φ, sin φ): exact along the profile, stretched around it by s / r. The crackle is
// simulated and drawn in that chart.
//
// Lengths are millimeters here and meters in the scene. The thickness field is a procedural model
// of where a dipped and fired glaze lies, not a flow simulation; see README.md in the lab.

import * as THREE from 'three/webgpu';

type P2 = [number, number]; // (r, y), mm
type Corner = { p: P2; radius?: number; mark?: string };

export type Side = 'inside' | 'outside';

export type Profile = {
  side: Side;
  s: Float64Array; // arc length from the pole, mm
  r: Float64Array;
  y: Float64Array;
  nr: Float64Array; // outward unit normal of the body, away from the clay
  ny: Float64Array;
  length: number; // s at the apex of the lip
  marks: Record<string, number>; // arc length of each named corner's fillet midpoint
};

// The template, mm. Outside: from the center of the base, over the foot ring, up the wall.
const OUTSIDE: Corner[] = [
  { p: [0, 5.2] },
  { p: [26.6, 5.9], radius: 0.9, mark: 'footInner' },
  { p: [28.4, 0], radius: 0.7, mark: 'footSoleIn' },
  { p: [33.0, 0], radius: 0.9, mark: 'footSoleOut' },
  { p: [34.6, 6.6], radius: 2.5, mark: 'footJoin' },
  { p: [58.0, 27.6], radius: 120, mark: 'belly' },
  { p: [84.9, 53.3], mark: 'lipOut' },
];
// Inside: from the center of the well up the wall.
const INSIDE: Corner[] = [
  { p: [0, 11.2] },
  { p: [33.2, 11.5], radius: 16, mark: 'well' },
  { p: [83.35, 55.0], mark: 'lipIn' },
];
// The lip is a half round joining the two walls; its apex is where the two glaze surfaces meet.
const LIP_CENTER: P2 = [(84.9 + 83.35) / 2, (53.3 + 55.0) / 2];
const LIP_RADIUS = Math.hypot(84.9 - 83.35, 55.0 - 53.3) / 2;
export const RIM_RADIUS = LIP_CENTER[0]; // mm, at the apex, before glaze

/** Sample a polyline whose interior corners are rounded by fillets, about `step` mm apart. */
function roundedPath(corners: Corner[], step: number): { pts: P2[]; marks: Record<string, number> } {
  const pts: P2[] = [];
  const marks: Record<string, number> = {};
  const push = (p: P2) => pts.push(p);
  let from: P2 = corners[0].p;
  push(from);
  for (let i = 1; i < corners.length; i++) {
    const c = corners[i];
    const next = corners[i + 1];
    if (!next || !c.radius) {
      line(from, c.p, step, push);
      if (c.mark) marks[c.mark] = pts.length - 1;
      from = c.p;
      continue;
    }
    const d1 = unit(sub(c.p, corners[i - 1].p));
    const d2 = unit(sub(next.p, c.p));
    const turn = Math.atan2(d1[0] * d2[1] - d1[1] * d2[0], d1[0] * d2[0] + d1[1] * d2[1]);
    const half = Math.abs(turn) / 2;
    const maxTangent = 0.5 * Math.min(dist(c.p, corners[i - 1].p), dist(next.p, c.p));
    const tangent = Math.min(c.radius * Math.tan(half), maxTangent);
    const radius = tangent / Math.tan(half);
    const a: P2 = [c.p[0] - d1[0] * tangent, c.p[1] - d1[1] * tangent];
    const b: P2 = [c.p[0] + d2[0] * tangent, c.p[1] + d2[1] * tangent];
    line(from, a, step, push);
    const left = turn > 0 ? 1 : -1; // the center lies to the left of d1 for a counterclockwise turn
    const center: P2 = [a[0] - d1[1] * radius * left, a[1] + d1[0] * radius * left];
    const a0 = Math.atan2(a[1] - center[1], a[0] - center[0]);
    const n = Math.max(2, Math.ceil((radius * Math.abs(turn)) / step));
    const start = pts.length;
    for (let k = 1; k <= n; k++) {
      const t = a0 + (turn * k) / n;
      push([center[0] + radius * Math.cos(t), center[1] + radius * Math.sin(t)]);
    }
    if (c.mark) marks[c.mark] = start + Math.floor(n / 2);
    from = b;
  }
  return { pts, marks };
}

function line(a: P2, b: P2, step: number, push: (p: P2) => void): void {
  const n = Math.max(1, Math.ceil(dist(a, b) / step));
  for (let k = 1; k <= n; k++) push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
}

function lipArc(from: number, to: number, step: number): P2[] {
  const n = Math.max(2, Math.ceil((LIP_RADIUS * Math.abs(to - from)) / step));
  const out: P2[] = [];
  for (let k = 1; k <= n; k++) {
    const t = from + ((to - from) * k) / n;
    out.push([LIP_CENTER[0] + LIP_RADIUS * Math.cos(t), LIP_CENTER[1] + LIP_RADIUS * Math.sin(t)]);
  }
  return out;
}

const sub = (a: P2, b: P2): P2 => [a[0] - b[0], a[1] - b[1]];
const dist = (a: P2, b: P2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const unit = (a: P2): P2 => {
  const l = Math.hypot(a[0], a[1]);
  return [a[0] / l, a[1] / l];
};

/** The profile of one glaze surface's substrate, pole to apex, resampled `step` mm apart. */
export function profile(side: Side, step = 0.2): Profile {
  const path = roundedPath(side === 'outside' ? OUTSIDE : INSIDE, 0.02);
  const end = path.pts[path.pts.length - 1];
  const endAngle = Math.atan2(end[1] - LIP_CENTER[1], end[0] - LIP_CENTER[0]);
  const dense = path.pts.concat(lipArc(endAngle, Math.PI / 2, 0.02));

  // Cumulative arc length on the dense path, then uniform resampling.
  const cum = new Float64Array(dense.length);
  for (let i = 1; i < dense.length; i++) cum[i] = cum[i - 1] + dist(dense[i], dense[i - 1]);
  const length = cum[cum.length - 1];
  const count = Math.ceil(length / step) + 1;
  const s = new Float64Array(count), r = new Float64Array(count), y = new Float64Array(count);
  const nr = new Float64Array(count), ny = new Float64Array(count);
  let j = 0;
  for (let i = 0; i < count; i++) {
    const target = (length * i) / (count - 1);
    while (j < cum.length - 2 && cum[j + 1] < target) j++;
    const f = (target - cum[j]) / Math.max(cum[j + 1] - cum[j], 1e-12);
    s[i] = target;
    r[i] = dense[j][0] + (dense[j + 1][0] - dense[j][0]) * f;
    y[i] = dense[j][1] + (dense[j + 1][1] - dense[j][1]) * f;
  }
  // Normals from the resampled tangent. The clay lies above the outside's path and below the
  // inside's, so the outward normal turns clockwise from the tangent outside and anticlockwise in.
  const turn = side === 'outside' ? -1 : 1;
  for (let i = 0; i < count; i++) {
    const a = Math.max(i - 1, 0), b = Math.min(i + 1, count - 1);
    const [tr, ty] = unit([r[b] - r[a], y[b] - y[a]]);
    nr[i] = -ty * turn;
    ny[i] = tr * turn;
  }
  nr[0] = 0; ny[0] = side === 'outside' ? -1 : 1; // the poles face straight down and up
  nr[count - 1] = 0; ny[count - 1] = 1; // the apex faces up on both surfaces

  const marks: Record<string, number> = {};
  for (const [name, index] of Object.entries(path.marks)) marks[name] = cum[index];
  return { side, s, r, y, nr, ny, length, marks };
}

/** Linear interpolation of a profile array at arc length s. */
export function at(p: Profile, values: Float64Array, s: number): number {
  const x = Math.min(Math.max(s, 0), p.length);
  const f = (x / p.length) * (p.s.length - 1);
  const i = Math.min(Math.floor(f), p.s.length - 2);
  return values[i] + (values[i + 1] - values[i]) * (f - i);
}

// Glaze thickness -----------------------------------------------------------------------------------

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

/** Low, smooth variation around the bowl: an uneven dip. Periodic in φ, drifting slowly with s. */
function unevenness(phi: number, s: number, seed: number): number {
  let v = 0;
  for (let m = 1; m <= 5; m++) {
    const p = Math.sin(seed * 12.9898 + m * 78.233) * 43758.5453;
    const phase = (p - Math.floor(p)) * Math.PI * 2;
    v += Math.cos(m * phi + phase + (s / 40) * (m % 2 ? 1 : -1)) / m;
  }
  return v / 2.28; // about unit amplitude
}

/** Runs of thicker glaze that slid down the outside wall during firing. */
const DRIPS = [
  { phi: 0.35, width: 0.05, reach: 0.72 },
  { phi: 1.9, width: 0.035, reach: 0.55 },
  { phi: 3.1, width: 0.06, reach: 0.85 },
  { phi: 4.45, width: 0.04, reach: 0.62 },
  { phi: 5.6, width: 0.045, reach: 0.78 },
];

const RIM_THICKNESS = 0.07; // mm at the apex: the glaze draws back from a convex edge

/**
 * Glaze thickness in mm on a surface at arc length s and azimuth φ, before the small bare
 * features (spur marks, the worn sole of the foot), which `bare` adds.
 */
export function thickness(p: Profile, s: number, phi: number): number {
  const m = p.marks;
  const toApex = p.length - s;
  // Every term is smooth in s: a kink in thickness is a crease in the reflection.
  let h: number;
  if (p.side === 'inside') {
    // The floor pools; the fillet pools deepest, where the wall's run-off meets the floor; the
    // wall drains toward it.
    const beyond = Math.max(s - m.well, 0);
    h = 0.5 + 0.8 * Math.exp(-((beyond / 18) ** 2)) + 0.25 * Math.exp(-(((s - m.well) / 6) ** 2));
  } else {
    // A thin coat on the base and inside the foot, thinner on the sole; the glaze collects where
    // the wall meets the foot, thins up the wall toward the rim, and ran in a few places.
    const join = m.footJoin;
    const sole = smooth(m.footSoleIn - 0.6, m.footSoleIn + 0.6, s) * (1 - smooth(m.footSoleOut - 0.6, m.footSoleOut + 0.6, s));
    const wall = 0.48 + 0.3 * smooth(join + 30, join, s);
    h = 0.3 - 0.14 * sole + (wall - 0.3) * smooth(join - 1, join + 3, s);
    h += 0.55 * Math.exp(-(((s - join) / 2.2) ** 2));
    const wallSpan = p.length - join;
    const along = (p.length - s) / wallSpan; // 0 at the rim, 1 at the foot
    for (const d of DRIPS) {
      const dp = Math.atan2(Math.sin(phi - d.phi), Math.cos(phi - d.phi));
      const run = smooth(0.1, 0.3, along) * (1 - smooth(d.reach - 0.02, d.reach + 0.02, along));
      const bead = Math.exp(-(((along - d.reach + 0.03) / 0.03) ** 2)); // the drop at the end
      h += (0.16 * run + 0.22 * bead) * Math.exp(-((dp / d.width) ** 2));
    }
  }
  // Uneven dipping, fading out at the pole, where every azimuth is the same point.
  h *= 1 + 0.07 * smooth(0, 8, s) * unevenness(phi, s, p.side === 'inside' ? 1 : 2);
  // Toward the apex both surfaces blend to the same rim thickness, so the two meet exactly.
  const rim = RIM_THICKNESS * (1 + 0.15 * unevenness(phi, 0, 3));
  return h + (rim - h) * smooth(2.6, 0, toApex);
}

/** Spur marks: where the kiln's spurs held the base, the glaze never covered the body. */
export const SPURS = { count: 5, radius: 21.5, length: 1.9, width: 1.25, phase: 0.4 }; // mm

/**
 * 1 where the body is bare, 0 where glaze covers it, soft over `edge` mm: the spur marks on the
 * base and the worn sole of the foot ring. Mirrored in the shader (glaze.ts).
 */
export function bare(p: Profile, s: number, phi: number, rAt: number, edge = 0.08): number {
  if (p.side !== 'outside') return 0;
  const m = p.marks;
  let b = 0;
  if (s < m.footInner) {
    const step = (Math.PI * 2) / SPURS.count;
    const k = Math.round((phi - SPURS.phase) / step);
    const dphi = phi - SPURS.phase - k * step;
    const along = dphi * rAt, across = rAt - SPURS.radius;
    const e = Math.hypot(along / SPURS.width, across / SPURS.length) - 1;
    b = Math.max(b, 1 - smooth(-edge, edge, e * SPURS.width));
  }
  // The sole, where the bowl has rested for nine centuries: bare in the middle of the band.
  const mid = (m.footSoleIn + m.footSoleOut) / 2;
  const halfBand = 1.2 + 0.25 * Math.sin(phi * 7 + 1.3) + 0.12 * Math.sin(phi * 23 + 0.2);
  b = Math.max(b, 1 - smooth(halfBand - edge, halfBand + edge, Math.abs(s - mid)));
  return b;
}

// Surfaces --------------------------------------------------------------------------------------------

/** A glaze surface as the fracture model sees it: its chart, metric, and thickness. */
export type ChartSurface = {
  /** Chart radius, mm: s at the apex. */
  radius: number;
  /** The lathe radius at arc length s, mm: the chart metric is r / s around, 1 along. */
  radiusAt(s: number): number;
  /** Glaze thickness in mm at a chart point (mm). Zero where bare. */
  glaze(u: number, v: number): number;
};

/** `scale` is the dip: how thick the glaze was laid on, as a multiple of the lab's bowl. */
export function chartSurface(p: Profile, scale = 1): ChartSurface {
  const radiusAt = (s: number) => at(p, p.r, s);
  const glaze = (u: number, v: number) => {
    const s = Math.hypot(u, v);
    let phi = Math.atan2(v, u);
    if (phi < 0) phi += Math.PI * 2;
    return scale * thickness(p, s, phi) * (1 - bare(p, s, phi, radiusAt(s)));
  };
  return { radius: p.length, radiusAt, glaze };
}

export type Surface = ChartSurface & { profile: Profile; geometry: THREE.BufferGeometry };

/**
 * Lathe one glaze surface: the substrate profile offset along its normal by the glaze thickness.
 * Attributes: `chart` (vec2, m), `thick` (float, mm, before the bare features), `tanS` (unit vector
 * along increasing s), `occlusion` (how much of the fill each ring sees; occlusion.ts). Normals are taken from the offset surface itself, so drips and pooling
 * show in reflections.
 */
export function lathe(p: Profile, segments = 1024, occlusion?: Float32Array): Surface {
  const rings = p.s.length;
  const count = rings * segments;
  const position = new Float32Array(count * 3);
  const chart = new Float32Array(count * 2);
  const thick = new Float32Array(count);
  const fillSeen = new Float32Array(count).fill(1);
  const offR = new Float64Array(count), offY = new Float64Array(count);
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segments; j++) {
      const phi = (j / segments) * Math.PI * 2;
      const k = i * segments + j;
      const h = thickness(p, p.s[i], phi);
      thick[k] = h;
      if (occlusion) fillSeen[k] = occlusion[i];
      offR[k] = p.r[i] + p.nr[i] * h;
      offY[k] = p.y[i] + p.ny[i] * h;
      position[k * 3] = (offR[k] * Math.sin(phi)) / 1000;
      position[k * 3 + 1] = offY[k] / 1000;
      position[k * 3 + 2] = (offR[k] * Math.cos(phi)) / 1000;
      chart[k * 2] = (p.s[i] * Math.cos(phi)) / 1000;
      chart[k * 2 + 1] = (p.s[i] * Math.sin(phi)) / 1000;
    }
  }

  // Tangents and normals of the offset surface by central differences in s and φ.
  const normal = new Float32Array(count * 3);
  const tanS = new Float32Array(count * 3);
  const sign = p.side === 'outside' ? -1 : 1; // ∂P/∂s × ∂P/∂φ points up the wall, into the bowl
  const ds = new THREE.Vector3(), dphi = new THREE.Vector3(), n = new THREE.Vector3();
  const P = (k: number, out: THREE.Vector3) => out.fromArray(position, k * 3);
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segments; j++) {
      const k = i * segments + j;
      const i0 = Math.max(i - 1, 0), i1 = Math.min(i + 1, rings - 1);
      ds.subVectors(P(i1 * segments + j, a), P(i0 * segments + j, b));
      const phi = (j / segments) * Math.PI * 2;
      if (p.r[i] < 1e-6) {
        // The pole: the lathe collapses to a point; its tangent is radial in the direction of φ.
        ds.set(Math.sin(phi), 0, Math.cos(phi));
        n.set(0, p.ny[i], 0);
      } else {
        const j0 = (j + segments - 1) % segments, j1 = (j + 1) % segments;
        dphi.subVectors(P(i * segments + j1, a), P(i * segments + j0, b));
        n.crossVectors(ds, dphi).multiplyScalar(sign).normalize();
      }
      ds.normalize();
      n.toArray(normal, k * 3);
      ds.toArray(tanS, k * 3);
    }
  }

  const index: number[] = [];
  for (let i = 0; i < rings - 1; i++) {
    for (let j = 0; j < segments; j++) {
      const j1 = (j + 1) % segments;
      const q00 = i * segments + j, q01 = i * segments + j1;
      const q10 = (i + 1) * segments + j, q11 = (i + 1) * segments + j1;
      // Wind so the front face is the glaze side on both surfaces.
      if (p.side === 'outside') index.push(q00, q01, q10, q01, q11, q10);
      else index.push(q00, q10, q01, q01, q10, q11);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  geometry.setAttribute('chart', new THREE.BufferAttribute(chart, 2));
  geometry.setAttribute('thick', new THREE.BufferAttribute(thick, 1));
  geometry.setAttribute('tanS', new THREE.BufferAttribute(tanS, 3));
  geometry.setAttribute('occlusion', new THREE.BufferAttribute(fillSeen, 1));
  geometry.setIndex(index);
  geometry.computeBoundingSphere();

  return { profile: p, geometry, ...chartSurface(p) };
}
