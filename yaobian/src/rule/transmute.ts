// RULE's hall passes from crystal to clay. Every surface starts as carved crystal: dark, glassy,
// lit only by what it reflects and a cold light at its edges. When the rule is let go, a front
// leaves the point on the wall where the rule was set and runs out through the hall at a steady
// pace, a line of fire; behind it every surface is fired clay, its carving kept.

import * as THREE from 'three/webgpu';
import { abs, dot, float, mix, mx_noise_float, normalView, positionView, positionWorld, pow, smoothstep, uniform, vec3 } from 'three/tsl';
import type { Node } from 'three/webgpu';

/** Where the front starts, and how far it has run, m. Beyond `REACH` it has passed everything. */
export const uOrigin = uniform(new THREE.Vector3(1.5, 3.4, 2.9));
export const uFront = uniform(0);
export const REACH = 11;

const BAND = 0.1; // m: the width of the line of fire
const GLOW = 0.45; // m behind it: the clay still red from the fire

type Standard = THREE.MeshStandardNodeMaterial;

/** Crystal before the front, clay behind it, on one material: its own colour and roughness become the clay's. */
export function transmute(m: Standard): void {
  const own = (m.colorNode ?? vec3(m.color.r, m.color.g, m.color.b)) as Node<'vec3'>;
  const ownRough = (m.roughnessNode ?? float(m.roughness)) as Node<'float'>;
  const ownGlow = (m.emissiveNode ?? vec3(0)) as Node<'vec3'>;

  // How far behind the front: an edge that wanders a little, as a flame's does.
  const d = positionWorld.sub(uOrigin).length().add(mx_noise_float(positionWorld.mul(2.2)).mul(0.25));
  const behind = uFront.sub(d);
  const fired = smoothstep(0, 0.05, behind); // 1 behind the front
  const burning = smoothstep(0.02, 0.4, uFront).mul(smoothstep(REACH, REACH - 1.5, uFront)); // only while it runs
  const line = smoothstep(BAND, 0, abs(behind)).mul(burning);
  const embers = fired.mul(behind.div(-GLOW).exp()).mul(burning); // cooling behind the line

  // Clay: the surface's own light and shade, in the colour of fired earth.
  const lum = dot(own, vec3(0.3, 0.59, 0.11));
  const clay = mix(own, vec3(1.3, 0.72, 0.46).mul(lum), 0.92);
  // Crystal: nearly black, so what shows is what it reflects, and a cold light where it turns away.
  const facing = abs(dot(normalView, positionView.normalize().negate()));
  const rim = pow(float(1).sub(facing), 2.5);
  const crystal = vec3(0.05, 0.075, 0.095);
  const cold = vec3(0.4, 0.62, 0.8).mul(rim.mul(1.5).add(0.05));

  m.colorNode = mix(crystal, clay, fired);
  m.roughnessNode = mix(float(0.08), ownRough.max(0.8), fired);
  m.metalnessNode = float(0);
  m.emissiveNode = mix(cold, ownGlow, fired).add(vec3(3.2, 0.9, 0.15).mul(line)).add(vec3(0.5, 0.08, 0.01).mul(embers));
  m.needsUpdate = true;
}

/** Every standard material under `root`, once each, except those `skip` names. */
export function transmuteAll(root: THREE.Object3D, skip: Set<THREE.Material>): void {
  const seen = new Set<THREE.Material>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (seen.has(m) || skip.has(m) || !(m as Standard).isMeshStandardNodeMaterial) continue;
      seen.add(m);
      transmute(m as Standard);
    }
  });
}
