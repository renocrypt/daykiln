// The studio the globe stands in, as an environment for image-based light.
//
// LOOK.md: broad, soft north light keeps the field high-key, and a strip light gives each brass
// ring one long continuous highlight. The room is white and the table paler still, so the globe's
// underside is filled by their bounce instead of falling dark. Built here and prefiltered with
// PMREM; no photographed environment.

import * as THREE from 'three/webgpu';

export type Studio = {
  /** Direction from the globe to the middle of the north window. */
  window: THREE.Vector3;
  /** Radiance of the window, relative to white paper under it. */
  windowRadiance: number;
  /** Direction from the globe to the strip light. */
  strip: THREE.Vector3;
  stripRadiance: number;
  /** Radiance of the room's walls and ceiling, and of the table below the globe. */
  room: number;
  table: number;
};

// Set by measurement in the whole-globe view: lit paper at 244 of 255, a little above the field's
// 236 so the silhouette holds; paper turning away at about 178; the far limb at about 145.
export const DEFAULT_STUDIO: Studio = {
  window: new THREE.Vector3(-0.69, 0.42, 0.59),
  windowRadiance: 4.5,
  strip: new THREE.Vector3(0.85, 0.15, 0.5),
  stripRadiance: 9,
  room: 0.42,
  table: 0.7,
};

const DAYLIGHT = new THREE.Color().setRGB(0.97, 0.99, 1.0); // the window: overcast north sky
const LAMP = new THREE.Color().setRGB(1.0, 0.975, 0.95); // the strip: a daylight lamp, a touch warmer
const WALL = new THREE.Color().setRGB(0.95, 0.94, 0.92);

function emitter(color: THREE.Color, radiance: number, side: THREE.Side = THREE.DoubleSide): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(radiance), side });
}

/** Face a panel at a distance along a direction, toward the globe. */
function place(mesh: THREE.Mesh, direction: THREE.Vector3, distance: number): THREE.Mesh {
  mesh.position.copy(direction).normalize().multiplyScalar(distance);
  mesh.lookAt(0, 0, 0);
  return mesh;
}

export function studioScene(studio: Studio): THREE.Scene {
  const scene = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(14, 9, 14), emitter(WALL, studio.room, THREE.BackSide));
  room.position.y = 2; // the floor lies 2.5 m below the globe's center
  scene.add(room);
  const table = new THREE.Mesh(new THREE.CircleGeometry(2.4, 64), emitter(WALL, studio.table));
  table.rotation.x = -Math.PI / 2;
  table.position.y = -1.1; // the stand's foot, a table's height below the sphere
  scene.add(table);
  scene.add(place(new THREE.Mesh(new THREE.PlaneGeometry(5, 3.4), emitter(DAYLIGHT, studio.windowRadiance)), studio.window, 6));
  // A tall narrow softbox, standing upright.
  const strip = place(new THREE.Mesh(new THREE.PlaneGeometry(0.3, 4.5), emitter(LAMP, studio.stripRadiance)), studio.strip, 3.5);
  strip.lookAt(0, strip.position.y, 0);
  scene.add(strip);
  return scene;
}
