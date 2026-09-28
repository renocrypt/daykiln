// The gull as a cast: Julian Johnson-Mortimer's "seagull v1" (Sketchfab, CC BY 4.0; prepared by
// tools/gull-asset.ts), posed at one moment of the stroke from src/wake/gull.ts.
//
// Marey modeled his gull's successive positions as sculpture, so the frozen phases are cast forms:
// the source's head, body and wing in bronze, its flight and tail feathers as thin bronze blades cut
// to their outlines. The source flies with its wings raised in a V. Each wing is laid flat about its
// shoulder, then carried by the stroke's two rods: the arm by the inner, the hand by the outer, with a
// short blend at the shoulder and the wrist so nothing tears. The head holds level while the body
// rises and falls with the stroke, as a flying gull's does.

import * as THREE from 'three/webgpu';
import { texture, uv } from 'three/tsl';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SHOULDER, WRIST, WING_LENGTH, wing } from '../../src/wake/gull.ts';
import type { Vec, WingFrame } from '../../src/wake/gull.ts';

/** The source's wings rise from the shoulder at this angle, measured from its wing surface. */
const REST_DIHEDRAL = Math.atan(0.69);
/** The source's hand is swept back from its arm by about this much; the stroke's sweep is measured from it. */
const REST_SWEEP = (20 * Math.PI) / 180;
const SHOULDER_BLEND = 0.04; // m of span over which the wing leaves the body
const WRIST_BLEND = 0.03; // m either side of the wrist over which the hand takes over from the arm

/** A piece of the cast: its rest shape, and which channel of the cut-outs trims it (−1 for none). */
type Piece = { geometry: THREE.BufferGeometry; cutout: number };
export type Gull = { still: Piece[]; beating: Piece[]; cutouts: THREE.Texture };

export async function loadGull(): Promise<Gull> {
  const [gltf, cutouts] = await Promise.all([
    new GLTFLoader().loadAsync('/plates/assets/wake/gull.glb'),
    new THREE.TextureLoader().loadAsync('/plates/assets/wake/gull-alpha.webp'),
  ]);
  cutouts.colorSpace = THREE.NoColorSpace;
  cutouts.flipY = false; // glTF's texture coordinates
  const pieces = (name: string): Piece[] => {
    const node = gltf.scene.getObjectByName(name)!;
    const out: Piece[] = [];
    node.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        const mesh = o as THREE.Mesh;
        out.push({ geometry: mesh.geometry, cutout: ((mesh.material as THREE.Material).userData.cutout as number) ?? -1 });
      }
    });
    return out;
  };
  return { still: pieces('still'), beating: pieces('beating'), cutouts };
}

/** A material's opacity from its channel of the cut-outs, for a piece that has one. */
export function cutoutMaterial<T extends THREE.NodeMaterial>(material: T, gull: Gull, channel: number): T {
  if (channel < 0) return material;
  const m = material.clone() as T;
  const c = texture(gull.cutouts, uv());
  m.opacityNode = (channel === 0 ? c.r : channel === 1 ? c.g : c.b);
  m.alphaTest = 0.5;
  m.side = THREE.DoubleSide;
  return m;
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
};

/** A point held in a rod's frame, placed by that frame. */
function place(frame: WingFrame, local: Vec): Vec {
  const { origin: o, forward: f, span: s, up: u } = frame;
  return [
    o[0] + f[0] * local[0] + s[0] * local[1] + u[0] * local[2],
    o[1] + f[1] * local[0] + s[1] * local[1] + u[1] * local[2],
    o[2] + f[2] * local[0] + s[2] * local[1] + u[2] * local[2],
  ];
}

/** A beating piece posed at a phase of the stroke. */
function posed(rest: THREE.BufferGeometry, phase: number): THREE.BufferGeometry {
  const geometry = rest.clone();
  const p = geometry.getAttribute('position') as THREE.BufferAttribute;
  const frames = { [1]: wing(phase, 1), [-1]: wing(phase, -1) };
  const wrist = WING_LENGTH * WRIST;
  const cd = Math.cos(REST_DIHEDRAL), sd = Math.sin(REST_DIHEDRAL);
  const cs = Math.cos(REST_SWEEP), ss = Math.sin(REST_SWEEP);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const side = z >= 0 ? 1 : -1;
    // Laid flat about the shoulder's forward axis, then held in the rest arm's frame: forward, out
    // along the span, up.
    const dy = y - SHOULDER.y, dz = side * z - SHOULDER.z;
    const along = dz * cd + dy * sd, up = dy * cd - dz * sd;
    const arm: Vec = [x - SHOULDER.x, along, up];
    // The rest hand: from the wrist, swept back by the rest sweep about the up axis.
    const hx = arm[0], hs = arm[1] - wrist;
    const hand: Vec = [hx * cs + hs * ss, hs * cs - hx * ss, arm[2]];
    const f = frames[side];
    const byArm = place(f.inner, arm), byHand = place(f.outer, hand);
    const h = smooth(wrist - WRIST_BLEND, wrist + WRIST_BLEND, along);
    const moved: Vec = [byArm[0] + (byHand[0] - byArm[0]) * h, byArm[1] + (byHand[1] - byArm[1]) * h, byArm[2] + (byHand[2] - byArm[2]) * h];
    const w = smooth(0, SHOULDER_BLEND, along);
    p.setXYZ(i, x + (moved[0] - x) * w, y + (moved[1] - y) * w, z + (moved[2] - z) * w);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** A still piece with the head lowered by `headDrop`, to hold it level against the body's rise. */
function held(rest: THREE.BufferGeometry, headDrop: number): THREE.BufferGeometry {
  const geometry = rest.clone();
  const p = geometry.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + smooth(0.08, 0.17, p.getX(i)) * headDrop);
  return geometry;
}

export type Pose = { t: number; phase: number; position: [number, number, number]; pitch: number };

/** A cast gull at one pose, placed in the air's frame; `material` gives each piece its material by its cut-out. */
export function castGull(gull: Gull, pose: Pose, bob: number, material: (cutout: number) => THREE.Material): THREE.Group {
  const group = new THREE.Group();
  const headDrop = -bob; // the body rose by bob; the head stays on the line
  // The phases are moments, not objects standing together: like the exposures on one of Marey's
  // plates, none shadows another, or the smoke of another moment.
  for (const piece of gull.still) group.add(Object.assign(new THREE.Mesh(held(piece.geometry, headDrop), material(piece.cutout)), { userData: { cutout: piece.cutout } }));
  for (const piece of gull.beating) group.add(Object.assign(new THREE.Mesh(posed(piece.geometry, pose.phase), material(piece.cutout)), { userData: { cutout: piece.cutout } }));
  group.position.set(...pose.position);
  group.rotation.z = pose.pitch;
  return group;
}

/** The wing's rods and chord at the wrist, as line segments, for the overlay test. */
export function skeleton(pose: Pose): number[] {
  const out: number[] = [];
  for (const side of [1, -1] as const) {
    const f = wing(pose.phase, side);
    const wrist: Vec = [f.inner.origin[0] + f.inner.span[0] * f.inner.length, f.inner.origin[1] + f.inner.span[1] * f.inner.length, f.inner.origin[2] + f.inner.span[2] * f.inner.length];
    const tip: Vec = [f.outer.origin[0] + f.outer.span[0] * f.outer.length, f.outer.origin[1] + f.outer.span[1] * f.outer.length, f.outer.origin[2] + f.outer.span[2] * f.outer.length];
    out.push(...f.inner.origin, ...wrist, ...wrist, ...tip);
  }
  out.push(-0.3, 0, 0, 0.28, 0.02, 0); // the body's axis
  return out;
}
