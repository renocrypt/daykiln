// The crackle as the glaze shader reads it, per surface, in the surface's chart:
//   - distance: true millimeters to the nearest crack, 8-bit over 0…DMAX, mipmapped;
//   - orientation: the nearest crack's tangent as (cos 2ψ, sin 2ψ) in chart axes, which
//     interpolates across the ψ ↔ ψ + π ambiguity, and the tension at which that stretch of the
//     crack opened, its moment in the cooling, at a quarter of the resolution.
// Distances use the chart's metric, so a crack's line keeps its true width all the way round.

import * as THREE from 'three/webgpu';
import type { Crack } from './fracture.ts';

export const DMAX = 0.18; // mm: beyond this, only "far"; enough for a line and its antialiasing at 4×

export type CrackField = {
  distance: THREE.DataTexture;
  orientation: THREE.DataTexture;
  radius: number; // chart half-extent, mm
};

/** The fields as plain arrays, so a worker can make them and hand them over. */
export type CrackRaster = { distance: Uint8Array; orientation: Uint8Array; size: number; radius: number; milliseconds: number };

export function rasterize(cracks: Crack[], radius: number, radiusAt: (s: number) => number, size: number): CrackRaster {
  const started = performance.now();
  const texel = (2 * radius) / size;
  const distance = new Uint8Array(size * size).fill(255);
  const small = size / 4;
  const smallTexel = (2 * radius) / small;
  const nearest = new Float32Array(small * small).fill(Infinity);
  const orientation = new Uint8Array(small * small * 4);
  const OREACH = 0.5; // mm around a crack where the orientation is kept

  for (const crack of cracks) {
    const pts = crack.points;
    for (let j = 1; j < pts.length / 2; j++) {
      const load = (crack.pointLoads[j - 1] + crack.pointLoads[j]) / 2;
      const ax = pts[(j - 1) * 2], ay = pts[(j - 1) * 2 + 1], bx = pts[j * 2], by = pts[j * 2 + 1];
      const dx = bx - ax, dy = by - ay;
      const len2 = dx * dx + dy * dy || 1e-12;
      // The chart metric at the segment: radial exact, around stretched by k = r / s.
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      const s = Math.hypot(mx, my);
      const er0 = s > 1e-6 ? mx / s : 1, er1 = s > 1e-6 ? my / s : 0;
      const ec0 = -er1, ec1 = er0;
      const k = s > 1e-6 ? Math.min(1, radiusAt(s) / s) : 1;
      // Tangent, true frame, then chart axes: ψ is the direction a crack runs.
      const tr = dx * er0 + dy * er1, tc = (dx * ec0 + dy * ec1) * k;
      const tl = Math.hypot(tr, tc) || 1;
      const cx = (tr * er0 + tc * ec0) / tl, cy = (tr * er1 + tc * ec1) / tl;
      const c2 = cx * cx - cy * cy, s2 = 2 * cx * cy;

      const reach = DMAX / k;
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - reach + radius) / texel));
      const i1 = Math.min(size - 1, Math.ceil((Math.max(ax, bx) + reach + radius) / texel));
      const j0 = Math.max(0, Math.floor((Math.min(ay, by) - reach + radius) / texel));
      const j1 = Math.min(size - 1, Math.ceil((Math.max(ay, by) + reach + radius) / texel));
      for (let yj = j0; yj <= j1; yj++) {
        const py = -radius + (yj + 0.5) * texel;
        const row = yj * size;
        for (let xi = i0; xi <= i1; xi++) {
          const px = -radius + (xi + 0.5) * texel;
          const t = Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / len2));
          const wx = px - ax - t * dx, wy = py - ay - t * dy;
          const d = Math.hypot(wx * er0 + wy * er1, (wx * ec0 + wy * ec1) * k);
          if (d >= DMAX) continue;
          const byte = Math.round((d / DMAX) * 255);
          if (byte < distance[row + xi]) distance[row + xi] = byte;
        }
      }

      const oreach = OREACH / k;
      const u0 = Math.max(0, Math.floor((Math.min(ax, bx) - oreach + radius) / smallTexel));
      const u1 = Math.min(small - 1, Math.ceil((Math.max(ax, bx) + oreach + radius) / smallTexel));
      const v0 = Math.max(0, Math.floor((Math.min(ay, by) - oreach + radius) / smallTexel));
      const v1 = Math.min(small - 1, Math.ceil((Math.max(ay, by) + oreach + radius) / smallTexel));
      for (let yj = v0; yj <= v1; yj++) {
        const py = -radius + (yj + 0.5) * smallTexel;
        for (let xi = u0; xi <= u1; xi++) {
          const px = -radius + (xi + 0.5) * smallTexel;
          const t = Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / len2));
          const wx = px - ax - t * dx, wy = py - ay - t * dy;
          const d = Math.hypot(wx * er0 + wy * er1, (wx * ec0 + wy * ec1) * k);
          const at = yj * small + xi;
          if (d >= OREACH || d >= nearest[at]) continue;
          nearest[at] = d;
          orientation[at * 4] = Math.round((c2 * 0.5 + 0.5) * 255);
          orientation[at * 4 + 1] = Math.round((s2 * 0.5 + 0.5) * 255);
          orientation[at * 4 + 2] = Math.round(load * 255);
          orientation[at * 4 + 3] = 255;
        }
      }
    }
  }

  return { distance, orientation, size, radius, milliseconds: performance.now() - started };
}

export function crackField({ distance, orientation, size, radius }: CrackRaster): CrackField {
  const small = size / 4;
  const distanceTexture = new THREE.DataTexture(distance, size, size, THREE.RedFormat, THREE.UnsignedByteType);
  distanceTexture.minFilter = THREE.LinearMipmapLinearFilter;
  distanceTexture.magFilter = THREE.LinearFilter;
  distanceTexture.generateMipmaps = true;
  distanceTexture.needsUpdate = true;
  const orientationTexture = new THREE.DataTexture(orientation, small, small, THREE.RGBAFormat, THREE.UnsignedByteType);
  orientationTexture.minFilter = THREE.LinearFilter;
  orientationTexture.magFilter = THREE.LinearFilter;
  orientationTexture.needsUpdate = true;
  return { distance: distanceTexture, orientation: orientationTexture, radius };
}
