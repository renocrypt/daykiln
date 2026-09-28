// RULE's camera: the three places it stands, and what it looks at from each. It moves only between
// them.
//
// World: meters, y up, the hall's center on the y axis, the floor at y = 0; the court's doorway in the
// middle of the +z wall.

/** Where the camera stands and what it looks at, meters; its vertical field of view, degrees. */
export type View = { px: number; py: number; pz: number; tx: number; ty: number; tz: number; fov: number };
export const VIEWS = {
  wall: { px: 0.4, py: 1.6, pz: -0.4, tx: 1.5, ty: 3.4, tz: 3, fov: 62 }, // a corner of the hall, where the rule is set: two walls and a squinch
  hall: { px: -2.3, py: 1.5, pz: -2.3, tx: 1.2, ty: 4.6, tz: 1.2, fov: 78 }, // from one corner across to the other: two walls, the squinches, the dome
  below: { px: 0.9, py: 1.6, pz: 1.4, tx: -0.35, ty: 8.7, tz: -0.55, fov: 70 }, // a step from the center, looking up into the dome
} satisfies Record<string, View>;
