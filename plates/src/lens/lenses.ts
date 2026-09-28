// The lenses the exhibition is seen through: each plate its own, as a camera's would be. Their
// prescriptions are classical types, scaled to the plate's focal length; their clear apertures are
// the heights their rays actually reach, found by tracing.
//
// Pure arithmetic, no three.js.

import { CROWN, FLINT, LINES, focalLengthOf, trace } from './optics.ts';
import type { Glass, Surface } from './optics.ts';

/** Schott N-SK16, a dense crown. n_d 1.62041, V_d 60.32. */
export const SK16: Glass = { name: 'N-SK16', B: [1.34317774, 0.241144399, 0.994317969], C: [0.00704687339, 0.0229005, 92.7508526] };
/** Schott N-LAK9, a lanthanum crown. n_d 1.69100, V_d 54.71. */
export const LAK9: Glass = { name: 'N-LAK9', B: [1.46231905, 0.344399589, 1.15508372], C: [0.00724270156, 0.0243353131, 85.4686868] };
/** Schott N-SF6, a dense flint. n_d 1.80518, V_d 25.36. */
export const SF6: Glass = { name: 'N-SF6', B: [1.77931763, 0.338149866, 2.08734474], C: [0.0133714182, 0.0617533621, 174.01759] };

/** A row of a prescription: a surface's radius, the thickness after it, and the glass after it; mm. A stop row is the iris, a plane in air, and the air after it. */
export type Row = [radius: number, thickness: number, after: Glass | null] | ['stop', number];

/** A lens, ready to trace: its surfaces from front to back, the iris's index among them, and its measures, m. */
export type Lens = {
  name: string;
  focalLength: number; // effective, at d
  fNumber: number;
  surfaces: Surface[];
  stop: number; // index of the iris's surface
  imagePlane: number; // z of the paraxial focus at d
  blades: number; // the iris's blades
};

/**
 * Builds a lens from a prescription: scaled to its focal length, with the iris sized for its f-number
 * and every surface's clear aperture set by the rays of its field, with a margin.
 */
export function build(name: string, rows: Row[], focalLength: number, fNumber: number, halfField: number, blades: number): Lens {
  // Surfaces at their vertices, in mm; the stop is a plane in air.
  let z = 0;
  const raw: { z: number; radius: number; after: Glass | null; stop: boolean }[] = [];
  let lastGlass: Glass | null = null;
  for (const row of rows) {
    if (row[0] === 'stop') { raw.push({ z, radius: Infinity, after: lastGlass, stop: true }); z += row[1]; continue; }
    const [radius, thickness, after] = row;
    raw.push({ z, radius, after, stop: false });
    lastGlass = after;
    z += thickness;
  }
  const big = 1e3; // a generous aperture while measuring, m
  const scaled = (k: number): Surface[] => raw.map((s) => ({ z: (s.z * k) / 1000, radius: (s.radius * k) / 1000, aperture: big, after: s.after }));
  const k = focalLength / focalLengthOf(scaled(1), LINES.d);
  const surfaces = scaled(k);
  const stop = raw.findIndex((s) => s.stop);
  // The iris: the axial ray at the edge of the entrance pupil crosses it at its rim.
  const pupil = focalLength / fNumber / 2;
  const axial = trace(surfaces, { p: [0, pupil, surfaces[0].z - 0.1], d: [0, 0, 1] }, LINES.d);
  if (!axial) throw new Error(`${name}: the axial ray fails`);
  const heights = surfaces.map((_, i) => Math.abs(axial.points[i][1]));
  // The field: every ray that passes the iris, at angles across the field and heights across the
  // front, scanned; each surface must pass them all.
  const front = surfaces[0].z;
  for (let a = 0; a <= 10; a++) {
    const angle = (a / 10) * halfField;
    for (let h = -400; h <= 400; h++) {
      const y = (h / 400) * 0.06;
      const r = trace(surfaces, { p: [0, y - Math.tan(angle) * 0.1, front - 0.1], d: [0, Math.sin(angle), Math.cos(angle)] }, LINES.d);
      if (!r || Math.abs(r.points[stop][1]) > heights[stop]) continue;
      r.points.forEach((point, i) => { heights[i] = Math.max(heights[i], Math.abs(point[1])); });
    }
  }
  surfaces.forEach((s, i) => { s.aperture = i === stop ? heights[i] : heights[i] * 1.04 + 0.0005; });
  // The image plane: where a paraxial ray at d crosses the axis.
  const paraxial = trace(surfaces, { p: [0, 1e-5, surfaces[0].z - 0.1], d: [0, 0, 1] }, LINES.d)!;
  const imagePlane = paraxial.out.p[2] - paraxial.out.p[1] * (paraxial.out.d[2] / paraxial.out.d[1]);
  return { name, focalLength, fNumber, surfaces, stop, imagePlane, blades };
}

/**
 * UNFOLD's lens: 105 mm f/2.8, a double Gauss, the classical type of the portrait lens. After a
 * textbook design, with N-SK16 for its crowns and N-F2 for its flints; it passes a full bundle to
 * about f/2.6, so it is stopped at f/2.8.
 */
export const LENS_105 = build('105 mm f/2.8', [
  [58.95, 7.52, SK16], [169.66, 0.24, null],
  [38.55, 8.05, SK16], [81.54, 6.55, FLINT], [25.5, 11.41, null],
  ['stop', 9.0],
  [-28.99, 2.36, FLINT], [81.54, 12.13, SK16], [-40.77, 0.38, null],
  [874.13, 6.44, SK16], [-79.46, 0, null],
], 0.105, 2.8, (11.6 * Math.PI) / 180, 9);

/**
 * WAKE's lens: 22 mm f/2.8, a retrofocus wide angle. Two large negative menisci in front bend the
 * wide field in, so the lens sits far enough from the film for a mirror; a positive group behind
 * the iris forms the image.
 */
export const LENS_22 = build('22 mm f/2.8', [
  [48, 2.2, CROWN], [19, 9, null],
  [70, 1.8, CROWN], [24, 6.5, null],
  [34, 9, SF6], [-90, 5.5, null],
  ['stop', 3],
  [-30, 1.2, SF6], [24, 6, LAK9], [-20, 0.3, null],
  [60, 4.5, LAK9], [-45, 0, null],
], 0.022, 2.8, (44 * Math.PI) / 180, 7);

/**
 * SAME SKY's lens: 14 mm f/2.8, an ultra-wide retrofocus. Three negative menisci in front, the
 * first large and bulging, bend a field of 113° in; a thick flint positive, the iris, a cemented
 * doublet, and a last positive form the image. It passes rays to 69° off the axis.
 */
export const LENS_14 = build('14 mm f/2.8', [
  [70, 2.6, CROWN], [24, 12, null],
  [60, 2.0, CROWN], [22, 7, null],
  [90, 1.8, CROWN], [30, 5, null],
  [36, 10, SF6], [-70, 5, null],
  ['stop', 3],
  [-28, 1.2, SF6], [22, 6.5, LAK9], [-19, 0.3, null],
  [55, 5, LAK9], [-40, 0, null],
], 0.014, 2.8, (57 * Math.PI) / 180, 6);
