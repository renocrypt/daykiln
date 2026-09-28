// Ambient occlusion from the bowl's own geometry, for the fill: how much of the soft room each
// point sees past the bowl. The table under the flare and the well inside the bowl see much less
// of it than a screen-space pass can know; that difference is what sets a bowl down on a table.
//
// The bowl is a solid of revolution, so occlusion depends only on the radius for the table and
// only on the arc length for each glaze surface. It is computed once, by marching cosine-weighted
// rays through a raster of the bowl's cross-section.

import { thickness, type Profile } from './bowl.ts';

const CELL = 0.25; // mm
const R_MAX = 92, Y_MIN = -2, Y_MAX = 62; // mm, the raster's extent

export type Section = { inside(r: number, y: number): boolean };

/** Rasterize the bowl's cross-section, glaze included, as seen at azimuth 0. */
export function section(inside: Profile, outside: Profile): Section {
  // The closed outline: the outside from the base's center to the apex, the inside back down to
  // the well's center, and the axis between them.
  const outline: [number, number][] = [];
  const offset = (p: Profile, i: number): [number, number] => {
    const h = thickness(p, p.s[i], 0);
    return [p.r[i] + p.nr[i] * h, p.y[i] + p.ny[i] * h];
  };
  for (let i = 0; i < outside.s.length; i++) outline.push(offset(outside, i));
  for (let i = inside.s.length - 1; i >= 0; i--) outline.push(offset(inside, i));

  const nr = Math.ceil(R_MAX / CELL), ny = Math.ceil((Y_MAX - Y_MIN) / CELL);
  const grid = new Uint8Array(nr * ny);
  // Scanlines in y: each row's crossings with the outline, filled pairwise.
  for (let j = 0; j < ny; j++) {
    const y = Y_MIN + (j + 0.5) * CELL;
    const xs: number[] = [];
    for (let k = 0; k < outline.length; k++) {
      const [r0, y0] = outline[k], [r1, y1] = outline[(k + 1) % outline.length];
      if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) xs.push(r0 + ((y - y0) / (y1 - y0)) * (r1 - r0));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let i = Math.max(0, Math.floor(xs[k] / CELL)); i < Math.min(nr, Math.ceil(xs[k + 1] / CELL)); i++) grid[j * nr + i] = 1;
    }
  }
  return {
    inside(r: number, y: number) {
      const i = Math.floor(r / CELL), j = Math.floor((y - Y_MIN) / CELL);
      return i >= 0 && i < nr && j >= 0 && j < ny && grid[j * nr + i] === 1;
    },
  };
}

/**
 * Fraction of the cosine-weighted hemisphere about normal n at point p (mm) that escapes the
 * bowl. Rays that reach the table are not occluded: the fill's lower half is the table's bounce.
 */
function visibility(sec: Section, p: [number, number, number], n: [number, number, number], rays: number): number {
  // An orthonormal frame about n.
  const [nx, ny, nz] = n;
  const a = Math.abs(nx) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  let tx = a[1] * nz - a[2] * ny, ty = a[2] * nx - a[0] * nz, tz = a[0] * ny - a[1] * nx;
  const tl = Math.hypot(tx, ty, tz);
  tx /= tl; ty /= tl; tz /= tl;
  const bx = ny * tz - nz * ty, by = nz * tx - nx * tz, bz = nx * ty - ny * tx;
  let open = 0;
  for (let i = 0; i < rays; i++) {
    // Hammersley points, mapped to the cosine-weighted hemisphere.
    const u = (i + 0.5) / rays;
    let bits = i, v = 0, f = 0.5;
    while (bits) { if (bits & 1) v += f; bits >>= 1; f /= 2; }
    const r = Math.sqrt(u), phi = 2 * Math.PI * v;
    const lx = r * Math.cos(phi), ly = r * Math.sin(phi), lz = Math.sqrt(1 - u);
    const dx = tx * lx + bx * ly + nx * lz, dy = ty * lx + by * ly + ny * lz, dz = tz * lx + bz * ly + nz * lz;
    let blocked = false;
    for (let t = 0.6; t < 260; t += 0.5) {
      const x = p[0] + dx * t, y = p[1] + dy * t, z = p[2] + dz * t;
      if (y < 0 || y > Y_MAX) break;
      const rr = Math.hypot(x, z);
      if (rr > R_MAX && (x * dx + z * dz) > 0) break;
      if (sec.inside(rr, y)) { blocked = true; break; }
    }
    if (!blocked) open++;
  }
  return open / rays;
}

/** Occlusion of the fill per ring of a glaze surface's lathe, 1 open … 0 enclosed. */
export function surfaceOcclusion(sec: Section, p: Profile, rays = 160): Float32Array {
  const out = new Float32Array(p.s.length);
  for (let i = 0; i < p.s.length; i++) {
    const h = thickness(p, p.s[i], 0) + 0.3;
    out[i] = visibility(sec, [p.r[i] + p.nr[i] * h, p.y[i] + p.ny[i] * h, 0], [p.nr[i], p.ny[i], 0], rays);
  }
  return out;
}

/** Occlusion of the fill on the table, by distance from the bowl's axis: 0 … 200 mm in 256 steps. */
export const TABLE_REACH = 200; // mm
export function tableOcclusion(sec: Section, rays = 256): Float32Array {
  const out = new Float32Array(256);
  for (let i = 0; i < out.length; i++) {
    out[i] = visibility(sec, [(i / (out.length - 1)) * TABLE_REACH, 0.05, 0], [0, 1, 0], rays);
  }
  return out;
}

