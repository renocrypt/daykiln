// Periodic polygon tilings, the ground a rule is drawn on. Each tiling is given by one rectangular
// repeat: its tiles are convex polygons, counterclockwise, in millimeters, and the plane is the
// repeat translated by whole multiples of its width and height. A tile may cross the repeat's
// boundary; its translated copies complete it.

export type Vec = [number, number];

export type Tiling = {
  /** The Archimedean name, vertex configuration by vertex configuration. */
  name: string;
  /** Rotational symmetry of the largest tile: the fold the pattern shows. */
  fold: number;
  width: number;
  height: number;
  tiles: Vec[][];
};

/** A regular n-gon centered at c with circumradius r, first vertex at angle a0, counterclockwise. */
export function regular(n: number, c: Vec, r: number, a0: number): Vec[] {
  return Array.from({ length: n }, (_, k) => {
    const a = a0 + (2 * Math.PI * k) / n;
    return [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)] as Vec;
  });
}

/**
 * 4.8.8, octagons and squares: the ground of the eightfold star and cross. Octagons meet on their
 * axis-aligned edges; squares, turned 45°, fill the corners. `across` is the octagon's width
 * across its flats, which is also the repeat.
 */
export function tiling488(across: number): Tiling {
  const L = across;
  const octagon = regular(8, [L / 2, L / 2], L / 2 / Math.cos(Math.PI / 8), Math.PI / 8);
  const half = (L * Math.tan(Math.PI / 8)) / Math.SQRT2; // the square's center to its vertices
  const square = regular(4, [0, 0], half, 0);
  return { name: '4.8.8', fold: 8, width: L, height: L, tiles: [octagon, square] };
}

/**
 * 6.6.6, hexagons: the ground of the sixfold star. Hexagons meet on edges facing 0°, 60°, …;
 * `across` is a hexagon's width across its flats. The rectangular repeat holds two hexagons.
 */
export function tiling666(across: number): Tiling {
  const a = across / 2; // apothem, so centers sit 2a apart
  const r = a / Math.cos(Math.PI / 6);
  const tiles = [regular(6, [0, 0], r, Math.PI / 6), regular(6, [a, a * Math.sqrt(3)], r, Math.PI / 6)];
  return { name: '6.6.6', fold: 6, width: 2 * a, height: 2 * a * Math.sqrt(3), tiles };
}

/**
 * 3.12.12, dodecagons and triangles: the ground of the twelvefold rosette. Dodecagons sit on a
 * triangular lattice, meeting on their edges; each gap between three is a triangle, whose edges
 * face the three. `across` is the dodecagon's width across its flats. The rectangular repeat holds
 * two dodecagons and four triangles.
 */
export function tiling31212(across: number): Tiling {
  const a = across / 2; // apothem, so centers sit 2a apart
  const r = a / Math.cos(Math.PI / 12);
  const s = 2 * a * Math.tan(Math.PI / 12); // edge length, shared with the triangles
  const t = s / Math.sqrt(3); // the triangle's circumradius
  const h = a * Math.sqrt(3);
  const down = -Math.PI / 2, up = Math.PI / 2; // apex down in an upward gap, and the reverse
  const tiles = [
    regular(12, [0, 0], r, Math.PI / 12),
    regular(12, [a, h], r, Math.PI / 12),
    regular(3, [a, h / 3], t, down),
    regular(3, [0, (4 * h) / 3], t, down),
    regular(3, [0, (2 * h) / 3], t, up),
    regular(3, [a, (5 * h) / 3], t, up),
  ];
  return { name: '3.12.12', fold: 12, width: 2 * a, height: 2 * h, tiles };
}

/** The tilings by name, each made from the width across its largest tile's flats, mm. */
export const TILINGS = { '4.8.8': tiling488, '6.6.6': tiling666, '3.12.12': tiling31212 } as const;
export type TilingName = keyof typeof TILINGS;
