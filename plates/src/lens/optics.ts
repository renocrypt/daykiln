// Real glass and real lenses, traced one wavelength at a time.
//
// A glass's index at a wavelength comes from its Sellmeier coefficients, as Schott publishes them.
// A lens is a row of spherical surfaces along the axis, z; a ray crossing each is refracted by
// Snell's law in vector form. Lengths are in meters, wavelengths in nanometers.
//
// Pure arithmetic, no three.js: it runs in the page, in a worker, or in Node.

export type Glass = { name: string; B: readonly [number, number, number]; C: readonly [number, number, number] };

/** Schott N-BK7, a crown: low dispersion. n_d 1.5168, V_d 64.17. */
export const CROWN: Glass = { name: 'N-BK7', B: [1.03961212, 0.231792344, 1.01046945], C: [0.00600069867, 0.0200179144, 103.560653] };
/** Schott N-F2, a flint: high dispersion. n_d 1.62004, V_d 36.37. */
export const FLINT: Glass = { name: 'N-F2', B: [1.39757037, 0.159201403, 1.2686543], C: [0.00995906143, 0.0546931752, 119.248346] };

/** The Fraunhofer lines optical designers correct for, nm: F (blue, hydrogen), d (yellow, helium), C (red, hydrogen). */
export const LINES = { F: 486.13, d: 587.56, C: 656.27 };

/** A glass's index at a wavelength; air is taken as 1. */
export function indexOf(glass: Glass | null, nm: number): number {
  if (!glass) return 1;
  const l2 = (nm / 1000) ** 2;
  let n2 = 1;
  for (let i = 0; i < 3; i++) n2 += (glass.B[i] * l2) / (l2 - glass.C[i]);
  return Math.sqrt(n2);
}

/** A glass's Abbe number: how little it disperses, (n_d − 1) / (n_F − n_C). */
export const abbeOf = (glass: Glass) => (indexOf(glass, LINES.d) - 1) / (indexOf(glass, LINES.F) - indexOf(glass, LINES.C));

/**
 * A spherical surface: its vertex on the axis, its radius of curvature (Infinity for a plane;
 * positive when its center lies beyond it, toward +z), its clear semi-aperture, and the glass
 * after it, null for air.
 */
export type Surface = { z: number; radius: number; aperture: number; after: Glass | null };

export type Vec = [number, number, number];
/** A ray: a point and a unit direction. */
export type Ray = { p: Vec; d: Vec };

const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * A ray through a row of surfaces at a wavelength, starting in air: the points where it meets each
 * surface, and the ray leaving the last; null if it misses a surface's aperture or is totally
 * reflected.
 */
export function trace(surfaces: readonly Surface[], ray: Ray, nm: number): { points: Vec[]; out: Ray } | null {
  let p: Vec = [...ray.p], d: Vec = [...ray.d];
  let n1 = 1;
  const points: Vec[] = [];
  for (const s of surfaces) {
    // Where the ray meets the surface.
    let t: number;
    let normal: Vec;
    if (!Number.isFinite(s.radius)) {
      if (Math.abs(d[2]) < 1e-12) return null;
      t = (s.z - p[2]) / d[2];
      normal = [0, 0, -Math.sign(d[2]) || -1];
    } else {
      const c: Vec = [0, 0, s.z + s.radius];
      const oc: Vec = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
      const b = dot(oc, d), cc = dot(oc, oc) - s.radius * s.radius, disc = b * b - cc;
      if (disc < 0) return null;
      // Of the sphere's two crossings, the one on the vertex's side of its center.
      const root = Math.sqrt(disc);
      const t1 = -b - root, t2 = -b + root;
      const zAt = (tt: number) => p[2] + d[2] * tt;
      t = Math.abs(zAt(t1) - s.z) < Math.abs(zAt(t2) - s.z) ? t1 : t2;
      const q: Vec = [p[0] + d[0] * t, p[1] + d[1] * t, p[2] + d[2] * t];
      normal = [(q[0] - c[0]) / s.radius, (q[1] - c[1]) / s.radius, (q[2] - c[2]) / s.radius];
      if (dot(normal, d) > 0) normal = [-normal[0], -normal[1], -normal[2]];
    }
    if (t < -1e-9) return null;
    p = [p[0] + d[0] * t, p[1] + d[1] * t, p[2] + d[2] * t];
    if (Math.hypot(p[0], p[1]) > s.aperture) return null;
    points.push([...p]);
    // Snell's law: the normal faces the incoming ray.
    const n2 = indexOf(s.after, nm), eta = n1 / n2;
    const cosI = -dot(normal, d), k = 1 - eta * eta * (1 - cosI * cosI);
    if (k < 0) return null;
    const f = eta * cosI - Math.sqrt(k);
    d = [eta * d[0] + f * normal[0], eta * d[1] + f * normal[1], eta * d[2] + f * normal[2]];
    n1 = n2;
  }
  return { points, out: { p, d } };
}

/** Where a ray leaving the lens crosses the axis, z; for a ray in the y–z plane. */
export function axisCrossing(ray: Ray): number {
  return ray.p[2] - ray.p[1] * (ray.d[2] / ray.d[1]);
}

/**
 * The focus of a bundle parallel to the axis at a wavelength: where a ray at a fraction of the
 * aperture crosses the axis. Small heights give the paraxial focus; the full height, the marginal.
 */
export function focusOf(surfaces: readonly Surface[], nm: number, height: number): number {
  const r = trace(surfaces, { p: [0, height, surfaces[0].z - 0.05], d: [0, 0, 1] }, nm);
  return r ? axisCrossing(r.out) : NaN;
}

/** The effective focal length at a wavelength, from a paraxial ray: its height over its final slope. */
export function focalLengthOf(surfaces: readonly Surface[], nm: number): number {
  const h = 1e-5;
  const r = trace(surfaces, { p: [0, h, surfaces[0].z - 0.05], d: [0, 0, 1] }, nm);
  return r ? -h / (r.out.d[1] / r.out.d[2]) : NaN;
}
