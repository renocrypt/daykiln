// Where a point of a gore lies in its print.
//
// A gore's print is bounded by four printed borders, traced by tools/prepare-gores.ts: the ends
// are parallels and the sides are meridians. A Coons patch blends the four into a map from the
// gore's own coordinates to the print, exact on every border: s runs across the gore from its west
// side (0) to its east (1), and t down it from the top border (0) to the bottom (1). No three.js,
// so the tools can use it too.

export type Point = [number, number];
export type Borders = { top: Point[]; bottom: Point[]; left: Point[]; right: Point[] };

/** A point along a polyline sampled at equal steps of its parameter, for a parameter in [0, 1]. */
function along(points: Point[], p: number): Point {
  const f = Math.min(Math.max(p, 0), 1) * (points.length - 1);
  const i = Math.min(Math.floor(f), points.length - 2);
  const w = f - i;
  return [points[i][0] + (points[i + 1][0] - points[i][0]) * w, points[i][1] + (points[i + 1][1] - points[i][1]) * w];
}

/** The print coordinate, as texture fractions with v down from the top, of gore coordinate (s, t). */
export function coons(border: Borders, s: number, t: number): Point {
  const top = along(border.top, s), bottom = along(border.bottom, s);
  const left = along(border.left, t), right = along(border.right, t);
  const tl = border.top[0], tr = border.top[border.top.length - 1];
  const bl = border.bottom[0], br = border.bottom[border.bottom.length - 1];
  const blend = (k: 0 | 1) =>
    (1 - t) * top[k] + t * bottom[k] + (1 - s) * left[k] + s * right[k]
    - ((1 - s) * (1 - t) * tl[k] + s * (1 - t) * tr[k] + (1 - s) * t * bl[k] + s * t * br[k]);
  return [blend(0), blend(1)];
}
