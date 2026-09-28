// The dome's room, after the Hall of the Two Sisters: a square hall whose four corners are carried
// up to an octagon by muqarnas squinches; above it an octagonal drum, each side pierced by two
// arched windows with lattices; at the top of the drum a muqarnas cornice, from which the dome
// springs. The squinches and the cornice are corbels by Jones's rule (muqarnas.ts).
//
// World: y up, the room's center on the y axis, the floor at y = 0. The octagon's sides face the
// room at its inradius; the square's walls are its four axial sides carried down to the floor.

import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { cascade, clipHalf, cornice, corbelGeometry, squinch, type Corbel } from './muqarnas.ts';

export type RoomOptions = {
  radius: number; // m, the octagon's inradius, the dome's; the square hall is twice this across
  spring: number; // m, where the dome springs
  wall: number; // m, thickness
  octagon: number; // m, the squinches' top
  squinch: { bands: number; height: number; hang: number };
  frieze: number; // m, the band that runs around the octagon at its foot
  windows: { x: number[]; width: number; sill: number; spring: number };
  door: { width: number; spring: number; lobes: number; bulge: number }; // m; an arched doorway in the middle of each of the hall's walls, its arch lobed
  upper: { width: number; sill: number; spring: number; lobes: number; bulge: number }; // m; a window above each doorway, under the cascade, onto the rooms above
  cornice: { tiers: number; step: number; span: number; height: number; hang: number };
  cascade: { width: number; tiers: number; step: number; span: number; height: number; hang: number }; // over each axial wall's middle
  colonnettes: { radius: number }; // between the drum's windows, and at their sides
  cell: number; // m, the finest a muqarnas face is divided
  joint: number; // m
};

export type RoomMaterials = {
  /** A wall's material, given its width and the heights it spans, in its own coordinates: x across, y up from the floor, the room at −z. */
  wall(kind: 'square' | 'drum'): THREE.Material;
  lattice: THREE.Material;
  muqarnas: THREE.Material;
  frieze: THREE.Material;
  marble: THREE.Material;
  beyond: THREE.Material; // what a doorway shows: the court beyond, over-exposed from inside
  wood: THREE.Material; // an upper window's lattice
};

/**
 * A Nasrid colonnette, engaged: a ringed base, a slender shaft, necking rings, a capital whose
 * round lower half carries a cube, and an impost block over it. y from 0 at the foot.
 */
export function colonnette(height: number, r: number): THREE.BufferGeometry {
  const cap = 3.4 * r, impost = 0.9 * r; // the cube capital's height and the impost's
  const shaftTop = height - cap - impost;
  const profile: [number, number][] = [
    [0, 0], [1.55 * r, 0], [1.55 * r, 0.35 * r], [1.25 * r, 0.55 * r], [1.4 * r, 0.8 * r], [1.1 * r, 1.1 * r], [r, 1.4 * r],
    [r, shaftTop - 1.2 * r], [1.2 * r, shaftTop - 1.0 * r], [1.2 * r, shaftTop - 0.75 * r], [r, shaftTop - 0.6 * r],
    [1.2 * r, shaftTop - 0.4 * r], [1.2 * r, shaftTop - 0.15 * r], [1.05 * r, shaftTop],
    [1.05 * r, shaftTop + 1.4 * r], [1.25 * r, shaftTop + 1.6 * r], [0, shaftTop + 1.6 * r],
  ];
  const lathe = new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), 28);
  const cube = new THREE.BoxGeometry(2.6 * r, cap - 1.6 * r, 2.6 * r).translate(0, shaftTop + 1.6 * r + (cap - 1.6 * r) / 2, 0);
  const block = new THREE.BoxGeometry(3.2 * r, impost, 3.2 * r).translate(0, height - impost / 2, 0);
  return mergeGeometries([lathe.toNonIndexed(), cube.toNonIndexed(), block.toNonIndexed()])!;
}

export type WindowOpening = { center: THREE.Vector3; inward: THREE.Vector3; across: THREE.Vector3; width: number; height: number };
export type Room = { group: THREE.Group; windows: WindowOpening[]; doors: WindowOpening[]; uppers: WindowOpening[]; side: number; pieces: number };

/** An arched opening in a wall's coordinates: x across, y up. */
export function windowPath(x: number, width: number, sill: number, spring: number): THREE.Path {
  const path = new THREE.Path();
  path.moveTo(x - width / 2, sill);
  path.lineTo(x + width / 2, sill);
  path.lineTo(x + width / 2, spring);
  path.absarc(x, spring, width / 2, 0, Math.PI, false);
  path.lineTo(x - width / 2, sill);
  return path;
}

/**
 * A lobed arch, from its left springer over to its right: the arch's circle cut into `lobes` equal
 * chords, and over each chord an arc bulging outward by `bulge`. The cusps between lobes lie on the
 * circle.
 */
export function lobedArch(path: THREE.Path, cx: number, cy: number, r: number, lobes: number, bulge: number): void {
  for (let i = lobes - 1; i >= 0; i--) {
    const a0 = (Math.PI * (i + 1)) / lobes, a1 = (Math.PI * i) / lobes; // from the left
    const p0 = new THREE.Vector2(cx + r * Math.cos(a0), cy + r * Math.sin(a0));
    const p1 = new THREE.Vector2(cx + r * Math.cos(a1), cy + r * Math.sin(a1));
    const half = p0.distanceTo(p1) / 2;
    const radius = (half * half + bulge * bulge) / (2 * bulge);
    const mid = p0.clone().add(p1).multiplyScalar(0.5);
    const outward = mid.clone().sub(new THREE.Vector2(cx, cy)).normalize();
    const c = mid.clone().addScaledVector(outward, bulge - radius);
    path.absarc(c.x, c.y, radius, Math.atan2(p0.y - c.y, p0.x - c.x), Math.atan2(p1.y - c.y, p1.x - c.x), true);
  }
}

/**
 * The stepped head over a window, as the Two Sisters' drum windows have: from each side the
 * opening rises in steps toward its middle, each step's corner rounded into a small lobe. The
 * path runs from the left side at `spring`, over, to the right side.
 */
export function steppedHead(path: THREE.Path, cx: number, spring: number, half: number, steps: number, rise: number): void {
  const run = half / (steps + 0.6); // the last step's top is a flat at the middle
  const up = rise / steps;
  const lobe = Math.min(run, up) * 0.45;
  // Left half, stepping in and up.
  let x = cx - half, y = spring;
  for (let i = 0; i < steps; i++) {
    path.lineTo(x, y + up - lobe);
    path.absarc(x + lobe, y + up - lobe, lobe, Math.PI, Math.PI / 2, true);
    x += run; y += up;
    path.lineTo(x, y);
  }
  // Right half, the mirror: along each step's top, round its corner, and down.
  let xr = cx + (cx - x);
  for (let i = 0; i < steps; i++) {
    const xc = xr + run;
    path.lineTo(xc - lobe, y);
    path.absarc(xc - lobe, y - lobe, lobe, Math.PI / 2, 0, true);
    path.lineTo(xc, y - up);
    xr = xc; y -= up;
  }
  path.lineTo(cx + half, spring);
}

export function buildRoom(o: RoomOptions, m: RoomMaterials): Room {
  const group = new THREE.Group();
  const R = o.radius, T = o.wall;
  const side = 2 * R * Math.tan(Math.PI / 8);
  const W = o.windows;
  const windows: WindowOpening[] = [], doors: WindowOpening[] = [], uppers: WindowOpening[] = [];
  const U = o.upper;
  const upperPath = () => {
    const path = new THREE.Path(), r = U.width / 2;
    path.moveTo(-r, U.sill); path.lineTo(-r, U.spring);
    lobedArch(path, 0, U.spring, r, U.lobes, U.bulge);
    path.lineTo(r, U.sill); path.lineTo(-r, U.sill);
    return path;
  };
  let pieces = 0;
  const axes = (a: number) => ({
    out: new THREE.Vector3(Math.sin(a), 0, Math.cos(a)),
    across: new THREE.Vector3(Math.cos(a), 0, -Math.sin(a)),
  });

  const wallPanel = (a: number, x0: number, x1: number, y0: number, kind: 'square' | 'drum') => {
    const shape = new THREE.Shape();
    shape.moveTo(x0, y0);
    if (kind === 'square') {
      // The doorway: the outline runs up its jambs and over its arch.
      const r = o.door.width / 2;
      shape.lineTo(-r, y0); shape.lineTo(-r, o.door.spring);
      lobedArch(shape, 0, o.door.spring, r, o.door.lobes, o.door.bulge);
      shape.lineTo(r, y0);
    }
    shape.lineTo(x1, y0); shape.lineTo(x1, o.spring); shape.lineTo(x0, o.spring); shape.lineTo(x0, y0);
    for (const x of W.x) shape.holes.push(windowPath(x, W.width, W.sill, W.spring));
    if (kind === 'square') shape.holes.push(upperPath());
    const panel = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: false, curveSegments: 32 }), m.wall(kind));
    panel.position.copy(axes(a).out.multiplyScalar(R));
    panel.rotation.y = a; // local +z, the extrusion, points outward: the inner face is at the octagon
    panel.castShadow = panel.receiveShadow = true;
    group.add(panel);
    if (kind === 'square') {
      // Through the doorway, the court: a bright ground a little way beyond the wall.
      const { out, across } = axes(a);
      const w = o.door.width + 1.6, h = o.door.spring + o.door.width;
      panel.add(new THREE.Mesh(new THREE.PlaneGeometry(w, h).rotateY(Math.PI).translate(0, h / 2, T + 1.4), m.beyond));
      // The upper window's lattice, and the dim room beyond it.
      const screen = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(upperPath().getPoints(12)), 12).translate(0, 0, T * 0.35), m.wood);
      panel.add(screen);
      const uh = U.spring + U.width / 2 - U.sill;
      uppers.push({ center: out.clone().multiplyScalar(R + 0.1).setY(U.sill + uh / 2), inward: out.clone().negate(), across, width: U.width, height: uh });
      const height = o.door.spring + o.door.width / 2;
      doors.push({ center: out.clone().multiplyScalar(R + 0.05).addScaledVector(across, 0).setY(height / 2), inward: out.clone().negate(), across, width: o.door.width, height });
    }
    // Each window stands in a frame a little proud of the wall, its opening wider than the window
    // and stepped at the head; the wall's own carving runs over it.
    for (const x of W.x) {
      const margin = 0.07, half = W.width / 2 + margin, top = W.spring + W.width / 2 + 0.2;
      const frame = new THREE.Shape();
      frame.moveTo(x - half - 0.09, W.sill - 0.05); frame.lineTo(x + half + 0.09, W.sill - 0.05);
      frame.lineTo(x + half + 0.09, top); frame.lineTo(x - half - 0.09, top); frame.lineTo(x - half - 0.09, W.sill - 0.05);
      const opening = new THREE.Path();
      opening.moveTo(x - half, W.sill - 0.02);
      opening.lineTo(x - half, W.spring);
      steppedHead(opening, x, W.spring, half, 3, W.width / 2 + 0.12);
      opening.lineTo(x + half, W.sill - 0.02);
      opening.lineTo(x - half, W.sill - 0.02);
      frame.holes.push(opening);
      const plate = new THREE.Mesh(new THREE.ExtrudeGeometry(frame, { depth: 0.05, bevelEnabled: false, curveSegments: 8 }).translate(0, 0, -0.05), m.wall(kind));
      plate.castShadow = plate.receiveShadow = true;
      panel.add(plate);
    }
    for (const x of W.x) {
      const screen = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(windowPath(x, W.width, W.sill, W.spring).getPoints(32)), 32).translate(0, 0, T * 0.5), m.lattice);
      screen.castShadow = true;
      panel.add(screen);
      const { out, across } = axes(a);
      const height = W.spring + W.width / 2 - W.sill;
      windows.push({
        center: out.clone().multiplyScalar(R + 0.02).addScaledVector(across, x).setY(W.sill + height / 2),
        inward: out.clone().negate(), across, width: W.width, height,
      });
    }
  };

  // The square hall's walls, floor to spring; the diagonal sides of the drum stand on the squinches.
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    if (k % 2 === 0) wallPanel(a, -R - T, R + T, 0, 'square');
    else wallPanel(a, -side / 2 - 0.01, side / 2 + 0.01, o.octagon, 'drum');
  }

  // Places a corbel built in plan (x, height, y) at an origin, plan x and y along two world
  // directions; the pair is ordered so the frame is right-handed and the faces still look down.
  const place = (corbel: Corbel, origin: THREE.Vector3, ex: THREE.Vector3, ey: THREE.Vector3) => {
    const up = new THREE.Vector3(0, 1, 0);
    if (new THREE.Vector3().crossVectors(ex, up).dot(ey) < 0) [ex, ey] = [ey, ex];
    const mesh = new THREE.Mesh(corbelGeometry(corbel, { cell: o.cell, joint: o.joint }), m.muqarnas);
    mesh.matrixAutoUpdate = false;
    mesh.matrix.makeBasis(ex, up, ey).setPosition(origin);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    pieces += corbel.pieces.length;
  };

  // The squinches: in each corner of the square, from the corner out to the octagon's side.
  const depth = R * Math.SQRT2 - R; // corner to the octagon's diagonal side
  const sq = squinch({ depth, bands: o.squinch.bands, bottom: o.octagon - o.squinch.height, height: o.squinch.height, hang: o.squinch.hang });
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    place(sq, new THREE.Vector3(sx * R, 0, sz * R), new THREE.Vector3(-sx, 0, 0), new THREE.Vector3(0, 0, -sz));
  }

  // The cornice at the top of the drum, around all eight sides, mitred at the corners.
  const C = o.cornice;
  const mitre = (poly: THREE.Vector2[]) => {
    const p = clipHalf(poly, new THREE.Vector2(side / 2, 0), new THREE.Vector2(-R, -side / 2));
    return clipHalf(p, new THREE.Vector2(-side / 2, 0), new THREE.Vector2(R, -side / 2));
  };
  const co = cornice({ length: side, tiers: C.tiers, step: C.step, span: C.span, bottom: o.spring - C.height, height: C.height, hang: C.hang }, mitre);
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    const { out, across } = axes(a);
    place(co, out.clone().multiplyScalar(R), across.clone().negate(), out.clone().negate());
  }

  // Over the middle of each axial wall, a cascade of muqarnas hanging from the frieze, between the
  // corners' squinches.
  const K = o.cascade;
  const ca = cascade({ width: K.width, tiers: K.tiers, step: K.step, span: K.span, bottom: o.octagon - K.height, height: K.height, hang: K.hang });
  for (let k = 0; k < 8; k += 2) {
    const a = (k * Math.PI) / 4;
    const { out, across } = axes(a);
    place(ca, out.clone().multiplyScalar(R), across.clone().negate(), out.clone().negate());
  }

  // Colonnettes in the drum, between each pair of windows and at their sides, carrying the arches.
  const column = colonnette(W.spring - W.sill, o.colonnettes.radius);
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    const { out, across } = axes(a);
    const outside = W.width / 2 + 0.07 + 0.09 + 0.035; // just outside a window's frame
    for (const x of [W.x[0] - outside, (W.x[0] + W.x[1]) / 2, W.x[1] + outside]) {
      const c = new THREE.Mesh(column, m.marble);
      c.position.copy(out.clone().multiplyScalar(R - 1.6 * o.colonnettes.radius)).addScaledVector(across, x).setY(W.sill);
      c.castShadow = c.receiveShadow = true;
      group.add(c);
    }
  }

  // The frieze: a band standing a little proud of the walls at the octagon's foot, one panel to a
  // side, each in its own coordinates (x along, y up from the band's foot) for its carving. Each
  // runs a little past the corner, behind its neighbour, so the corners close.
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    const proud = 0.04;
    const width = 2 * (R - proud) * Math.tan(Math.PI / 8) + 2 * (proud + 0.002) * Math.tan(Math.PI / 8) * 2;
    const band = new THREE.Mesh(new THREE.BoxGeometry(width, o.frieze, T + proud).translate(0, o.frieze / 2, (T + proud) / 2), m.frieze);
    band.position.copy(axes(a).out.multiplyScalar(R - proud)).setY(o.octagon);
    band.rotation.y = a;
    band.castShadow = band.receiveShadow = true;
    group.add(band);
  }

  return { group, windows, doors, uppers, side, pieces };
}
