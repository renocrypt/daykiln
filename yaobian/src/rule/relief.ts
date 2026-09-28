// The wall as a relief shader on a plane. The pattern's surfaces are baked over one repeat
// (bake.ts); here they become a height in millimeters, a normal, a shadow cast by the relief itself
// toward the sun, and one of two materials:
//   - stucco: straps stand proud of carved fields, with bevelled sides; at a crossing the
//     under-strap dips beneath the over-strap;
//   - tile: every field and every strap is a separate glazed piece, flush, set in mortar; at a
//     crossing the joint runs along the over-strap, so the under-strap reads as cut.
// The wall lies in the world's xy plane facing +z, one world meter to a thousand pattern
// millimeters. Nothing here is painted: every edge is a distance to a derived line.

import * as THREE from 'three/webgpu';
import type { Node } from 'three/webgpu';
import {
  Fn, dFdx, dFdy, dot, float, floor, fract, interleavedGradientNoise, ivec2, length, max, min, mix, mx_noise_float, normalize,
  positionWorld, screenCoordinate, select, smoothstep, sin, texture, textureLoad, transformNormalToView, uniform, vec2, vec3,
} from 'three/tsl';
import type { Relief } from './bake.ts';
import type { TextureNode } from 'three/webgpu';

/** A display hex as a linear color, for a vec3 uniform. */
const color = (hex: string) => {
  const c = new THREE.Color(hex);
  return new THREE.Vector3(c.r, c.g, c.b);
};

/** Values to react against in look development. Lengths in mm. */
export const relief = {
  mode: uniform(0), // 0 stucco, 1 tile
  strap: uniform(14), // must match the bake
  joint: uniform(1.6),
  jointDepth: uniform(1.1),
  tilt: uniform(0.02), // radians, how far a tile piece sits off true
  frame: uniform(0), // varies the shadow march's jitter between accumulated samples
  origin: uniform(new THREE.Vector2(100, 100)), // pattern mm at world (0, 0)
  home: uniform(new THREE.Vector2(100, 100)), // pattern mm at a large tile's center, where a field sets its star
  repeat: uniform(new THREE.Vector2(200, 200)), // mm
  texels: uniform(new THREE.Vector2(1600, 1600)),
  sun: uniform(new THREE.Vector3(-0.6, 0.6, 0.5).normalize()), // toward the sun, world
  sunSize: uniform(0.0047), // tan of the sun's angular radius
  // The sun enters through a doorway in a side wall, the plane x = doorX (m), perpendicular to
  // this wall; the doorway spans door = (z0, z1, y0, y1), m, z measured out from this wall.
  // doorOn = 0 lights the whole wall.
  doorOn: uniform(1),
  doorX: uniform(-1.6),
  door: uniform(new THREE.Vector4(0.5, 1.6, 1.35, 1.8)), // a shaft about a third of the frame wide
  plaster: uniform(color('#ddd6ca')),
  mortar: uniform(new THREE.Vector3(0.56, 0.51, 0.44)),
  strapGlaze: uniform(color('#efe9dc')),
  field0: uniform(color('#1f3f8f')), // largest faces: cobalt
  field1: uniform(color('#3e9a9c')), // turquoise
  field2: uniform(color('#d2a94a')), // yellow
  field3: uniform(color('#1e1c1a')), // black
};

export type ReliefTextures = { fields: THREE.DataTexture; ids: THREE.DataTexture };

/** Upload a bake: surfaces as half floats, filtered and repeating; identities as bytes, read exactly. */
export function reliefTextures(r: Relief): ReliefTextures {
  const half = new Uint16Array(r.fields.length);
  for (let i = 0; i < half.length; i++) half[i] = THREE.DataUtils.toHalfFloat(r.fields[i]);
  const fields = new THREE.DataTexture(half, r.nx, r.ny, THREE.RGBAFormat, THREE.HalfFloatType);
  fields.wrapS = fields.wrapT = THREE.RepeatWrapping;
  fields.magFilter = THREE.LinearFilter;
  fields.minFilter = THREE.LinearMipmapLinearFilter;
  fields.generateMipmaps = true;
  fields.needsUpdate = true;
  const ids = new THREE.DataTexture(r.ids, r.nx, r.ny, THREE.RGBAFormat, THREE.UnsignedByteType);
  ids.magFilter = ids.minFilter = THREE.NearestFilter;
  ids.needsUpdate = true;
  relief.repeat.value.set(r.width, r.height);
  relief.texels.value.set(r.nx, r.ny);
  return { fields, ids };
}

/**
 * Where a relief lies. By default, the lookdev 02 wall: the world's xy plane facing +z, with pattern
 * coordinates from the world position. Any other surface gives its pattern coordinates in mm, the
 * material to show (0 stucco, 1 tile), and how a normal in the relief's frame (x and y along the
 * pattern, z out of the surface) turns into the object's frame.
 */
export type ReliefFrame = {
  coord?: Node<'vec2'>;
  mode?: Node<'float'>;
  toObject?: (n: Node<'vec3'>) => Node<'vec3'>;
};

// Base texture nodes, one pair per uploaded bake, shared by every surface drawn from it: every
// sample is a clone that reads its texture from these, so swapping a new bake into them redraws
// every such surface at once.
type Source = { fields: TextureNode<'vec4'>; ids: TextureNode<'vec4'> };
const sources = new WeakMap<ReliefTextures, Source>();
function sourceOf(textures: ReliefTextures) {
  let source = sources.get(textures);
  if (!source) sources.set(textures, (source = { fields: texture(textures.fields) as TextureNode<'vec4'>, ids: texture(textures.ids) as TextureNode<'vec4'> }));
  return source;
}

/** Redraw every surface drawn from `drawn` with the bake `next`. */
export function swapRelief(drawn: ReliefTextures, next: ReliefTextures): void {
  const source = sourceOf(drawn);
  source.fields.value = next.fields;
  source.ids.value = next.ids;
}

/** The relief's nodes over a pair of textures. */
export function reliefNodes(textures: ReliefTextures, frame: ReliefFrame = {}) {
  const { fields: fieldsMap, ids: idsMap } = sourceOf(textures);
  const swap = (next: ReliefTextures) => swapRelief(textures, next);
  /** Pattern coordinates, mm, of a world position on the wall. */
  const patternAt = (p: Node<'vec3'>) => p.xy.mul(1000).add(relief.origin);

  /** A mortar joint centered on distance 0 across it: a rounded groove. */
  const groove = (x: Node<'float'>) =>
    relief.jointDepth.negate().mul(float(1).sub(smoothstep(relief.joint.mul(0.5), relief.joint.mul(0.5).add(0.45), x)));

  /** The baked surfaces at pattern point q: height (mm) for the current material, and the rest. */
  const sample = (q: Node<'vec2'>) => {
    const f = fieldsMap.sample(q.div(relief.repeat));
    const tileJoint = f.y;
    return { height: mix(f.x, groove(tileJoint), frame.mode ?? relief.mode), tileJoint, line: f.z, sky: f.w };
  };
  const heightAt = (q: Node<'vec2'>) => sample(q).height;
  const toObject = frame.toObject ?? ((n: Node<'vec3'>) => n);

  const q = frame.coord ?? patternAt(positionWorld);
  const footprint = max(length(dFdx(positionWorld)), length(dFdy(positionWorld))).mul(1000); // mm per pixel
  const here = sample(q);

  // Normal from the height by central differences at about half a pixel, so detail finer than a
  // pixel averages out rather than sparkling.
  const e = max(float(0.12), footprint.mul(0.5));
  const hx = heightAt(q.add(vec2(e, 0))).sub(heightAt(q.sub(vec2(e, 0))));
  const hy = heightAt(q.add(vec2(0, e))).sub(heightAt(q.sub(vec2(0, e))));
  const reliefNormal = normalize(vec3(hx.negate().div(e.mul(2)), hy.negate().div(e.mul(2)), 1));

  // The shadow the relief casts on itself: march from the point toward the sun over the height,
  // softened by the sun's size and by the pixel's footprint. The march starts at a jittered offset
  // that changes between accumulated samples, so its steps average away instead of showing as
  // teeth on the shadow's edge.
  const shadow = Fn(() => {
    const L = normalize(relief.sun);
    const flat = length(L.xy).max(1e-4);
    const dir = L.xy.div(flat);
    const rise = L.z.div(flat); // mm of height gained per mm travelled
    const h0 = here.height;
    const reach = h0.negate().add(0.4).div(rise).max(0.5);
    const jitter = fract(interleavedGradientNoise(screenCoordinate.xy).add(relief.frame.mul(0.618034)));
    // Through the doorway: follow the ray toward the sun to the side wall's plane; the sun's disc,
    // seen through the opening from that far, sets the penumbra.
    const p = positionWorld;
    const t = relief.doorX.sub(p.x).div(L.x.min(-1e-4)).max(0);
    const zDoor = t.mul(L.z), yDoor = p.y.add(t.mul(L.y));
    const pen0 = t.mul(relief.sunSize).add(0.002);
    const door = relief.door;
    const through = smoothstep(pen0.negate(), pen0, zDoor.sub(door.x)).mul(smoothstep(pen0.negate(), pen0, door.y.sub(zDoor)))
      .mul(smoothstep(pen0.negate(), pen0, yDoor.sub(door.z))).mul(smoothstep(pen0.negate(), pen0, door.w.sub(yDoor)));
    let visible: Node<'float'> = mix(float(1), through, relief.doorOn);
    const STEPS = 40;
    for (let i = 0; i < STEPS; i++) {
      const s = reach.mul(float(i).add(jitter).div(STEPS).pow(1.4)).add(0.05);
      const above = h0.add(s.mul(rise)).sub(heightAt(q.add(dir.mul(s))));
      const pen = s.mul(relief.sunSize).add(footprint.mul(0.25)).add(0.03);
      visible = min(visible, smoothstep(pen.negate(), pen, above));
    }
    return visible;
  })();

  // Pieces: which piece a point is in, and that piece's identity across the whole wall.
  const cellCoord = q.div(relief.repeat);
  const texel = ivec2(fract(cellCoord).mul(relief.texels).floor());
  const ids = textureLoad(idsMap, texel);
  const pieceClass = floor(ids.x.mul(255).add(0.5));
  const code = floor(ids.z.mul(255).add(0.5));
  const homeCell = floor(cellCoord).add(vec2(code.mod(3).sub(1), floor(code.div(3)).sub(1)));
  const onStrap = pieceClass.greaterThan(254.5);
  const pieceKey = vec3(homeCell, floor(ids.y.mul(255).add(0.5)).add(select(onStrap, float(1000), float(0))));
  const random = (k: number) => fract(sin(dot(pieceKey.add(k * 17.13), vec3(12.9898, 78.233, 37.719))).mul(43758.5453));

  // How much of the sky the relief lets a point see: baked for stucco; for tile, only the joints.
  const stuccoOcclusion = here.sky;
  const tileOcclusion = mix(float(0.55), float(1), smoothstep(relief.joint.mul(0.5), relief.joint.mul(0.5).add(0.9), here.tileJoint));

  return { q, footprint, here, reliefNormal, shadow, pieceClass, onStrap, random, stuccoOcclusion, tileOcclusion, swap, sample, heightAt, toObject };
}

export type ReliefNodes = ReturnType<typeof reliefNodes>;

/** Carved gypsum plaster: matte, fine-grained, with faint chisel facets on the cut faces. */
export function stuccoMaterial(n: ReliefNodes): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial();
  const grain = mx_noise_float(vec3(n.q.mul(1 / 0.35), 0)).mul(0.022).add(mx_noise_float(vec3(n.q.mul(1 / 3), 1.7)).mul(0.012));
  const field = n.here.line.greaterThan(relief.strap.mul(0.5));
  const tone = select(field, float(0.965), float(1)); // cut faces are a shade darker than the skin
  m.colorNode = vec3(relief.plaster).mul(grain.add(1)).mul(tone);
  const chisel = mx_noise_float(vec3(n.q.mul(1 / 1.2), 3.3)).mul(0.035);
  m.normalNode = transformNormalToView(n.toObject(normalize(n.reliefNormal.add(vec3(chisel, chisel.negate(), 0)))));
  m.roughnessNode = float(0.86);
  m.metalnessNode = float(0);
  m.aoNode = n.stuccoOcclusion;
  return m;
}

/** Cut-tile mosaic: glazed pieces, one color each, each a fraction of a degree off true, in mortar. */
export function tileMaterial(n: ReliefNodes): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial();
  const c = n.pieceClass;
  const field = select(c.lessThan(0.5), vec3(relief.field0),
    select(c.lessThan(1.5), vec3(relief.field1), select(c.lessThan(2.5), vec3(relief.field2), vec3(relief.field3))));
  const glaze = select(n.onStrap, vec3(relief.strapGlaze), field);
  // Each piece fired a little differently: lighter or darker, a touch warmer or cooler.
  // Straps are continuous between the joints that cut them, so only the field pieces vary.
  const pieceWise = select(n.onStrap, float(0), float(1));
  const shade = n.random(1).sub(0.5).mul(0.14).mul(pieceWise).add(1);
  const cast = n.random(5).sub(0.5).mul(0.06).mul(pieceWise);
  const variation = vec3(shade.add(cast), shade, shade.sub(cast));
  const inJoint = float(1).sub(smoothstep(relief.joint.mul(0.5), relief.joint.mul(0.5).add(0.25), n.here.tileJoint));
  const mortarGrain = mx_noise_float(vec3(n.q.mul(1 / 0.3), 5.1)).mul(0.08).add(1);
  m.colorNode = mix(glaze.mul(variation), vec3(relief.mortar).mul(mortarGrain), inJoint);
  // Each piece's tilt, and the glaze's own slow waviness.
  const tilt = vec3(n.random(2).sub(0.5), n.random(3).sub(0.5), 0).mul(relief.tilt.mul(2)).mul(pieceWise);
  const wave = vec3(mx_noise_float(vec3(n.q.mul(1 / 18), 7.7)), mx_noise_float(vec3(n.q.mul(1 / 18), 9.1)), 0).mul(0.006);
  const surface = normalize(n.reliefNormal.add(tilt.add(wave).mul(float(1).sub(inJoint))));
  m.normalNode = transformNormalToView(n.toObject(surface));
  m.roughnessNode = mix(n.random(4).mul(0.05).add(0.1), float(0.92), inJoint);
  m.metalnessNode = float(0);
  m.aoNode = n.tileOcclusion;
  return m;
}

/** The sun's shadow on the wall is the relief's own; nothing else in the scene casts one. */
export function reliefSun(n: ReliefNodes, color: THREE.Color, intensity: number): THREE.DirectionalLight {
  const sun = new THREE.DirectionalLight(color, intensity);
  sun.castShadow = true;
  (sun.shadow as unknown as { shadowNode: Node<'float'> }).shadowNode = n.shadow;
  return sun;
}
