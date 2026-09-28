// Where the bowl sits: an unfinished wood table, a room falling to shadow behind, and the soft
// fill, as an environment with no bright source in it, so the softbox stays the one light.

import * as THREE from 'three/webgpu';
import { float, length, mix, positionLocal, positionWorld, pow, smoothstep, texture, uniform, vec2, vec3 } from 'three/tsl';
import { bumpNormal } from '../core/bump.ts';
import { wood } from '../core/wood.ts';
import { TABLE_REACH } from './occlusion.ts';

const linear = (hex: string) => new THREE.Color(hex);

/** The table and the room's presence: 1 there … 0 gone to black, leaving the bowl alone. */
export const presence = uniform(1);
/** Whether the bowl stands in its place on the table, 1, or has been lifted from it, 0: its shadow on the fill goes with it. */
export const seated = uniform(1);

/** LOOK.md, KILN palette: table and room, as linear colors. */
export const TABLE = linear('#8a7660');
export const ROOM = linear('#a59c90');

/** Unfinished wood, grain along x. `occlusion` is the bowl's shadow on the fill by distance from its axis (occlusion.ts). */
export function table(occlusion: Float32Array): THREE.Mesh {
  const material = new THREE.MeshStandardNodeMaterial({ roughness: 0.8 });
  const grain = wood(vec3(TABLE.r, TABLE.g, TABLE.b), positionWorld.xz.mul(1000)); // mm; the grain runs along x
  material.colorNode = grain.color;
  material.normalNode = bumpNormal(grain.height);
  const ao = new THREE.DataTexture(occlusion, occlusion.length, 1, THREE.RedFormat, THREE.FloatType);
  ao.magFilter = ao.minFilter = THREE.NearestFilter; // float: interpolated by hand below
  ao.needsUpdate = true;
  // Linear interpolation between the 256 radii, so the occlusion has no steps.
  const at = length(positionWorld.xz).mul((1000 / TABLE_REACH) * (occlusion.length - 1)).min(occlusion.length - 1.001);
  const i0 = at.floor();
  const sample = (i: typeof i0) => texture(ao, vec2(i.add(0.5).div(occlusion.length), 0.5)).r;
  material.aoNode = mix(float(1), mix(sample(i0), sample(i0.add(1)), at.sub(i0)), seated).mul(presence);
  material.colorNode = material.colorNode!.mul(presence);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(4, 4).rotateX(-Math.PI / 2), material);
  mesh.receiveShadow = true;
  mesh.name = 'table';
  return mesh;
}

/** The room behind: a plain wall well beyond the table, lit only by what reaches it. */
export function room(): THREE.Mesh {
  const material = new THREE.MeshStandardNodeMaterial({ roughness: 0.95 });
  material.colorNode = vec3(ROOM.r, ROOM.g, ROOM.b).mul(presence);
  material.aoNode = presence;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(8, 4), material);
  mesh.position.set(0, 1.2, -1.6);
  mesh.name = 'room';
  return mesh;
}

/** The fill's strength, and its direction: opposite the key and a little above. */
export const fill = {
  direction: uniform(new THREE.Vector3(0.6, 0.35, 0.72).normalize()),
};

/**
 * The environment the glaze reflects and the fill that lights the shadows: the warm table below,
 * the room around, and a broad soft fill card, blurred, with nothing bright enough to read as a
 * second light.
 */
export function studio(renderer: THREE.WebGPURenderer): THREE.Texture {
  const scene = new THREE.Scene();
  const material = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide });
  const dir = positionLocal.normalize();
  const floor = vec3(TABLE.r, TABLE.g, TABLE.b).mul(0.55);
  const walls = vec3(ROOM.r, ROOM.g, ROOM.b).mul(mix(float(0.55), float(0.8), smoothstep(0, 0.6, dir.y)));
  const card = pow(dir.dot(fill.direction).max(0), 3).mul(1.4);
  material.colorNode = mix(floor, walls, smoothstep(-0.04, 0.06, dir.y)).add(vec3(ROOM.r, ROOM.g, ROOM.b).mul(card));
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 64, 32), material));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(scene, 0.03).texture;
  pmrem.dispose();
  return texture;
}
