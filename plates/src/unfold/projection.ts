// UNFOLD's first slice: one meridian cut, and the pull within the cylindrical family.
//
// The globe is cut along one meridian and relaxes onto a cylindrical projection: x is the
// longitude from the map's central meridian, and y is a northing that the pull moves continuously
// from Mercator's, which preserves angles, to Lambert's cylindrical equal-area, which preserves
// areas. No position is both; between them both distortions appear. Tissot's circles are drawn on
// the paper, so the map draws its own indicatrix: the Jacobian, made visible.
//
// The unfolding runs in two stages: the sphere relaxes onto the cylinder with the projection's
// northing, and the cylinder unbends about the central meridian into the plane, so the cut opens as
// it flattens. The polar calottes, which no cylindrical projection can hold, lift off the poles and
// flatten into the discs they were printed as. These functions mirror the vertex shader in
// lab/unfold-pull, for the CPU's needs: framing, focus, and picking.

export const R = 0.535; // m, Coronelli's globe
export const CALOTTE_LATITUDE = (70 * Math.PI) / 180;

/** Northing in radians of arc: Mercator at pull 0, Lambert cylindrical equal-area at pull 1. */
export function northing(phi: number, pull: number): number {
  const mercator = Math.log(Math.tan(Math.PI / 4 + phi / 2));
  const lambert = Math.sin(phi);
  return mercator + (lambert - mercator) * pull;
}

/** Scale factors of the pulled projection at a latitude: along the meridian (h) and the parallel (k). */
export function scaleFactors(phi: number, pull: number): { h: number; k: number; area: number; shear: number } {
  const h = (1 - pull) / Math.cos(phi) + pull * Math.cos(phi);
  const k = 1 / Math.cos(phi);
  return { h, k, area: h * k, shear: Math.max(h, k) / Math.min(h, k) };
}

export const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

export type Frame = { lambda0: number; p0: number[]; t0: number[]; n0: number[] };

/** The map's frame: tangent to the globe at the central meridian on the equator. */
export function mapFrame(lambda0: number): Frame {
  return {
    lambda0,
    p0: [R * Math.sin(lambda0), 0, R * Math.cos(lambda0)],
    t0: [Math.cos(lambda0), 0, -Math.sin(lambda0)],
    n0: [Math.sin(lambda0), 0, Math.cos(lambda0)],
  };
}

/** Longitude from the central meridian, wrapped to (−π, π]; the cut lies at ±π. */
export function relative(lambda: number, lambda0: number): number {
  let a = lambda - lambda0;
  while (a <= -Math.PI) a += 2 * Math.PI;
  while (a > Math.PI) a -= 2 * Math.PI;
  return a;
}

/** A point of a gore at longitude λ and latitude φ, for an unfolding in [0, 1] and a pull in [0, 1]. */
export function gorePoint(lambda: number, phi: number, unfold: number, pull: number, frame: Frame): number[] {
  const sphere = [R * Math.cos(phi) * Math.sin(lambda), R * Math.sin(phi), R * Math.cos(phi) * Math.cos(lambda)];
  const s1 = smoothstep(0, 0.5, unfold), s2 = smoothstep(0.5, 1, unfold);
  const kappa = Math.max((1 - s2) / R, 1e-4);
  const b = R * relative(lambda, frame.lambda0);
  const along = Math.sin(kappa * b) / kappa, inward = (1 - Math.cos(kappa * b)) / kappa;
  const y = R * northing(phi, pull);
  const cylinder = [
    frame.p0[0] + frame.t0[0] * along - frame.n0[0] * inward,
    y,
    frame.p0[2] + frame.t0[2] * along - frame.n0[2] * inward,
  ];
  return sphere.map((s, i) => s + (cylinder[i] - s) * s1);
}

/** Where a calotte's centre goes: lifted along the axis, then set above or below the map. */
export function calotteCentre(north: boolean, unfold: number, pull: number, frame: Frame): number[] {
  const sign = north ? 1 : -1;
  const s1 = smoothstep(0, 0.5, unfold), s2 = smoothstep(0.5, 1, unfold);
  const edge = R * northing(CALOTTE_LATITUDE, pull); // the map's top or bottom edge
  const discRadius = R * (Math.PI / 2 - CALOTTE_LATITUDE);
  const gap = 0.12;
  const lifted = [0, sign * (R + gap + 0.15 * s1), 0];
  const beside = [frame.p0[0], sign * (edge + gap + discRadius), frame.p0[2]];
  return lifted.map((l, i) => l + (beside[i] - l) * s2);
}
