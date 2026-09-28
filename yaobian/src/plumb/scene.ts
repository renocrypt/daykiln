// PLUMB's scene: a workshop at dusk (LOOK.md, PLUMB). A workbench, four posts, and the net tied to
// their tops by its corners; one north window in the left wall, its light soft and from the side,
// the room falling to dusk around it. The model can be turned over and grown to the scale of a
// building: then the room is gone, the bench is the ground, and the window is the sky, the one
// light become the sun and the room's light the sky's.
//
// The model is drawn from the net's own knots: its twisted cord between them, a knot at each, the
// lead hung from them, and, once it stands, a plaster shell through them. Turning it over moves
// nothing in it.

import * as THREE from 'three/webgpu';
import type { Node } from 'three/webgpu';
import {
  Fn, attribute, cameraPosition, dot, float, fract, fwidth, length, mix, mx_noise_float, normalMap, pass, positionLocal, positionWorld, positionWorldDirection,
  renderOutput, smoothstep, texture, uniform, uv, vec2, vec3,
} from 'three/tsl';
import { Sky, type SkySetting } from '../core/sky/sky.ts';
import type { NoiseData } from '../core/sky/noise.ts';
import { focus } from '../core/focus.ts';
import { createStill } from '../core/still.ts';
import type { Net } from './net.ts';
import type { Loupe } from '../core/loupe.ts';
import { Softbox } from '../core/softbox.ts';
import { bumpNormal } from '../core/bump.ts';
import { wood } from '../core/wood.ts';

export const POST = 0.46; // m: the posts' height, where the net is tied
export const SCALE = 30; // the building, times the model
export const SLUG_HEIGHT = 0.0069; // m: a 20 g lead disc, on the model turned over
const FLOOR = -0.76; // the workshop's floor, below the bench's top
const WINDOW = { x: -1.9, y: 1.15, z: 0.15, width: 0.8, height: 1.0 }; // high in the left wall
const DAYLIGHT = 28; // the window's intensity
/**
 * Out of doors: the sky of Plates, baked from the atmosphere, from an afternoon sun to dusk. The sun
 * stands on the window's side, as it did; its elevation is the visitor's to set. The exposure adapts
 * as an eye does, partly: from the afternoon's, 0.7 of the way toward holding the zenith's light.
 */
export const SUN = { elevation: 12, highest: 25, lowest: -2.5, azimuth: THREE.MathUtils.degToRad(158) };
const AFTERNOON = 1.2e-4; // the afternoon sky's zenith near 0.5, as the scene's lights are set

/** Where the camera stands, around a point: degrees, and meters at the model's scale. */
export type View = { elevation: number; azimuth: number; distance: number; tx: number; ty: number; tz: number; fov: number; shift: number };
export const VIEWS = {
  table: { elevation: 14, azimuth: 0, distance: 1.7, tx: 0, ty: 0.26, tz: 0, fov: 30, shift: 0 }, // the model on its bench, at eye level
  close: { elevation: 6, azimuth: 30, distance: 0.72, tx: 0.03, ty: 0.3, tz: 0, fov: 30, shift: 0.3 }, // close on the cord and its knots, the curve they hang in
  aside: { elevation: 8, azimuth: -28, distance: 1.6, tx: 0, ty: 0.26, tz: 0, fov: 30, shift: 0.2 }, // turned, the model right of the words
  below: { elevation: -22, azimuth: 6, distance: 0.95, tx: 0, ty: 0.34, tz: 0, fov: 34, shift: 0.2 }, // from below, as Gaudí's models were photographed
  stands: { elevation: 16, azimuth: 0, distance: 1.6, tx: 0, ty: 0.14, tz: 0, fov: 30, shift: 0 }, // turned over, standing on the bench
  under: { elevation: -12, azimuth: 35, distance: 0.2, tx: 0, ty: 0.095, tz: 0, fov: 74, shift: 0 }, // under the vault at eye height when grown, across to a foot and the sky through its arches
} satisfies Record<string, View>;

const deg = THREE.MathUtils.degToRad;
const hex = (h: string) => new THREE.Color(h);
const rgb = (c: THREE.Color) => vec3(c.r, c.g, c.b);
const smooth = THREE.MathUtils.smoothstep;

/** Gradient noise in the plane, about ±0.7, for the dunes' shapes. */
function noise2(x: number, y: number): number {
  const grad = (ix: number, iy: number) => {
    let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    const a = ((h ^ (h >>> 16)) >>> 0) / 4294967296 * Math.PI * 2;
    return Math.cos(a) * (x - ix) + Math.sin(a) * (y - iy);
  };
  const x0 = Math.floor(x), y0 = Math.floor(y), u = x - x0, v = y - y0;
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const top = grad(x0, y0) + (grad(x0 + 1, y0) - grad(x0, y0)) * fade(u);
  const bottom = grad(x0, y0 + 1) + (grad(x0 + 1, y0 + 1) - grad(x0, y0 + 1)) * fade(u);
  return top + (bottom - top) * fade(v);
}

/**
 * The sand sea, m: level round the vault, then transverse dunes, their crests across a wind from
 * the sun's side (SUN.azimuth), each a long windward slope, a rounded brink, and a slip face near
 * the angle of repose, breaking into crescents where the sand runs short; under them, swells half a
 * kilometre long. A disc of rings, dense near, 3.5 km across its radius.
 */
function dunes(): THREE.BufferGeometry {
  const RINGS = 320, AROUND = 480, EDGE = 3500;
  const wind = { x: Math.cos(SUN.azimuth + 0.35), z: Math.sin(SUN.azimuth + 0.35) }; // blowing from the sun's side, a little turned
  const ridge = (along: number, length: number, brink: number) => {
    const t = ((along / length) % 1 + 1) % 1; // 0 a trough … brink the crest … 1 the next trough
    return t < brink ? smooth(t, 0, brink) : 1 - smooth(t, brink, 1);
  };
  const height = (x: number, z: number) => {
    const r = Math.hypot(x, z);
    const open = smooth(r, 60, 240); // level where the vault stands
    if (open === 0) return 0;
    const along = -(x * wind.x + z * wind.z), across = x * wind.z - z * wind.x;
    const bend = 40 * noise2(across / 260, along / 400) + 12 * noise2(x / 90, z / 90); // the crests wander
    const sand = smooth(noise2(across / 180 + 3.1, along / 300) + 0.15 * noise2(x / 50, z / 50), -0.35, 0.3); // where there is sand enough for a ridge
    const dune = ridge(along + bend, 95 + 25 * noise2(x / 500, z / 500), 0.7) * (3 + 10 * sand);
    const swell = ridge(along + 2.5 * bend + 80 * noise2(across / 900, 7.7), 520, 0.62) * (11 + 8 * noise2(x / 800 + 5, z / 800));
    return open * (dune + swell);
  };
  const geometry = new THREE.BufferGeometry();
  const position = new Float32Array((RINGS * AROUND + 1) * 3);
  position[1] = 0; // the centre
  for (let i = 1; i <= RINGS; i++) {
    const r = EDGE * Math.pow(i / RINGS, 2.2);
    for (let j = 0; j < AROUND; j++) {
      const a = (j / AROUND) * Math.PI * 2, x = Math.cos(a) * r, z = Math.sin(a) * r, k = (1 + (i - 1) * AROUND + j) * 3;
      position[k] = x; position[k + 1] = height(x, z); position[k + 2] = z;
    }
  }
  const index: number[] = [];
  const at = (i: number, j: number) => (i === 0 ? 0 : 1 + (i - 1) * AROUND + (j % AROUND));
  for (let j = 0; j < AROUND; j++) index.push(0, at(1, j + 1), at(1, j));
  for (let i = 1; i < RINGS; i++) for (let j = 0; j < AROUND; j++) {
    const a = at(i, j), b = at(i, j + 1), c = at(i + 1, j + 1), d = at(i + 1, j);
    index.push(a, b, c, a, c, d);
  }
  geometry.setIndex(index);
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  // Its uv runs as a level plane's laid on the ground, x across and −z up: the normal map's frame.
  const uvs = new Float32Array((RINGS * AROUND + 1) * 2);
  for (let v = 0; v < uvs.length / 2; v++) { uvs[v * 2] = position[v * 3]; uvs[v * 2 + 1] = -position[v * 3 + 2]; }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry.translate(0, -0.001, 0);
}

export async function buildPlumb(renderer: THREE.WebGPURenderer, net: Net, o: { unit: number }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 4000);
  const size = { width: 1, height: 1 };
  const uDay = uniform(0); // 0 the workshop at dusk … 1 out of doors, by day
  const uScale = uniform(1); // the model's scale
  const uBuilt = uniform(0); // 0 a plaster model … 1 a building: what the surface was made against

  // Fades are dithered, not blended: no sorting, and the grain is the series' own.
  const fading = <M extends THREE.Material>(m: M) => { m.alphaHash = true; return m; };

  // The sky and the room ------------------------------------------------------------------------------

  // Out of doors, the baked sky and its cloud; in the workshop, dark.
  const noise = await new Promise<NoiseData>((resolve) => {
    const worker = new Worker(new URL('../core/sky/noise-worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event) => { resolve(event.data as NoiseData); worker.terminate(); };
  });
  const heavens = await Sky.load('/yaobian/assets/sky/', noise);
  const zenith = (e: number) => { const r = heavens.clearRadiance(new THREE.Vector3(0, 1, 0), e); return 0.2126 * r.x + 0.7152 * r.y + 0.0722 * r.z; };
  const SETTING: SkySetting = {
    cloud: { base: 5200, top: 5450, coverage: 0.45, extinction: 0.03 }, sunAzimuth: SUN.azimuth, wind: [6, 2],
    exposure: (e) => AFTERNOON * Math.pow(zenith(SUN.highest) / zenith(e), 0.7),
  };
  heavens.set(SETTING);
  heavens.setSun(SUN.elevation);
  // Below the horizon, out of doors, is the ground: the light it returns, the sun's and the sky's on
  // it times its albedo, spread evenly (Lambert). Set with the sun (stage).
  const GROUND_ALBEDO = 0.4; // desert sand
  const uGround = uniform(new THREE.Vector3());
  const uHaze = { toward: uniform(new THREE.Vector3()), away: uniform(new THREE.Vector3()) }; // the horizon's radiance, exposed
  const groundLight = () => {
    const e = heavens.elevation, exposure = SETTING.exposure(e);
    const sunOn = heavens.sunAt(e).multiplyScalar(Math.max(0, Math.sin(THREE.MathUtils.degToRad(e))));
    const skyOn = heavens.clearRadiance(new THREE.Vector3(0, 1, 0), e).multiplyScalar(Math.PI * 1.3); // the sky's illuminance on the level, its zenith's radiance brightened toward the horizon
    uGround.value.copy(sunOn.add(skyOn)).multiplyScalar((exposure * GROUND_ALBEDO) / Math.PI);
    // The horizon, toward the sun and away from it, for the haze over the far sand.
    const a = SETTING.sunAzimuth, level = (turn: number) => new THREE.Vector3(Math.cos(a + turn), 0.02, Math.sin(a + turn)).normalize();
    uHaze.toward.value.copy(heavens.clearRadiance(level(0), e)).multiplyScalar(exposure);
    uHaze.away.value.copy(heavens.clearRadiance(level(Math.PI), e)).multiplyScalar(exposure);
  };
  groundLight();
  const outdoors = (d: Node<'vec3'>) => mix(vec3(uGround), heavens.radiance(d), smoothstep(-0.02, 0.02, d.y));
  const sky = (d: Node<'vec3'>) => mix(vec3(0.012, 0.011, 0.01), outdoors(d), uDay);
  scene.backgroundNode = sky(positionWorldDirection);

  // The room's light, as an environment: dusk plaster and floor, and the window, a patch of cool sky
  // in the left wall; by day the patch widens to the whole sky. Drawn again as the day comes.
  const toWindow = new THREE.Vector3(WINDOW.x, WINDOW.y, WINDOW.z).normalize();
  const envScene = new THREE.Scene();
  {
    const m = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide });
    const d = positionLocal.normalize();
    const wall = mix(vec3(0.05, 0.043, 0.036), vec3(0.028, 0.024, 0.02), smoothstep(-0.1, -0.5, d.y));
    const reach = mix(float(0.93), float(-0.2), uDay); // the window's patch, as the cosine of its reach
    const patch = smoothstep(reach, reach.add(0.05), d.dot(vec3(toWindow.x, toWindow.y, toWindow.z)));
    const light = vec3(0.55, 0.6, 0.68).mul(float(0.9)).mul(float(1).sub(uDay)); // the window's own light, in the workshop only
    m.colorNode = mix(wall, sky(d).max(light.mul(smoothstep(-0.2, 0.1, d.y))), patch);
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 64, 32), m));
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTarget = pmrem.fromScene(envScene, 0.04);
  scene.environment = envTarget.texture;
  let envDay = 0, envSun = heavens.elevation;

  // The workshop: floor, walls, and the window's opening, dusk plaster.
  const roomMaterial = fading(new THREE.MeshStandardNodeMaterial({ roughness: 0.95 }));
  {
    const p = positionWorld.mul(1000);
    roomMaterial.colorNode = rgb(hex('#4a4239')).mul(mx_noise_float(p.mul(1 / 90)).mul(0.08).add(mx_noise_float(p.mul(1 / 7)).mul(0.03)).add(1));
  }
  const floorMaterial = fading(new THREE.MeshStandardNodeMaterial({ roughness: 0.9, color: hex('#2c2723') }));
  const room = new THREE.Group();
  {
    const wallBox = (w: number, h: number, d: number, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), roomMaterial);
      mesh.position.set(x, y, z);
      mesh.receiveShadow = true;
      room.add(mesh);
    };
    const top = 1.95, t = 0.12;
    wallBox(5, top - FLOOR, t, 0, (top + FLOOR) / 2, -1.7); // back
    wallBox(t, top - FLOOR, 5, 2.3, (top + FLOOR) / 2, 0); // right
    // The left wall, around the window.
    const w0 = WINDOW.z - WINDOW.width / 2, w1 = WINDOW.z + WINDOW.width / 2, s0 = WINDOW.y - WINDOW.height / 2, s1 = WINDOW.y + WINDOW.height / 2;
    wallBox(t, top - FLOOR, w0 + 2.5, WINDOW.x, (top + FLOOR) / 2, (w0 - 2.5) / 2);
    wallBox(t, top - FLOOR, 2.5 - w1, WINDOW.x, (top + FLOOR) / 2, (w1 + 2.5) / 2);
    wallBox(t, s0 - FLOOR, WINDOW.width, WINDOW.x, (s0 + FLOOR) / 2, WINDOW.z);
    wallBox(t, top - s1, WINDOW.width, WINDOW.x, (top + s1) / 2, WINDOW.z);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(5, 5).rotateX(-Math.PI / 2).translate(0, FLOOR, 0), floorMaterial);
    floor.receiveShadow = true;
    room.add(floor);
    // The window: the sky beyond it, and its bars.
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(WINDOW.width, WINDOW.height).rotateY(Math.PI / 2), new THREE.MeshBasicNodeMaterial({ color: new THREE.Color().setRGB(0.9, 0.98, 1.1) }));
    glass.position.set(WINDOW.x - 0.04, WINDOW.y, WINDOW.z);
    room.add(glass);
    const bar = new THREE.MeshStandardNodeMaterial({ color: hex('#2a241e'), roughness: 0.8 });
    for (const g of [new THREE.BoxGeometry(0.03, WINDOW.height, 0.022), new THREE.BoxGeometry(0.03, 0.022, WINDOW.width)]) {
      const b = new THREE.Mesh(g, bar);
      b.position.set(WINDOW.x, WINDOW.y, WINDOW.z);
      room.add(b);
    }
  }

  // The bench and the posts, unfinished wood.
  const benchMaterial = fading(new THREE.MeshStandardNodeMaterial({ roughness: 0.78 }));
  {
    const grain = wood(rgb(hex('#6b5643')), positionWorld.xz.mul(1000));
    benchMaterial.colorNode = grain.color;
    benchMaterial.normalNode = bumpNormal(grain.height);
  }
  const bench = new THREE.Group();
  {
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.05, 1.1).translate(0, -0.025, 0), benchMaterial);
    top.receiveShadow = top.castShadow = true;
    bench.add(top);
    for (const [x, z] of [[-0.82, -0.47], [0.82, -0.47], [-0.82, 0.47], [0.82, 0.47]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.065, -FLOOR - 0.05, 0.065).translate(x, (FLOOR - 0.05) / 2, z), benchMaterial);
      leg.receiveShadow = leg.castShadow = true;
      bench.add(leg);
    }
  }
  const postMaterial = fading(new THREE.MeshStandardNodeMaterial({ roughness: 0.75 }));
  {
    const p = positionWorld.mul(1000);
    const grain = wood(rgb(hex('#8a735b')), vec3(p.y, p.x.add(p.z), 0).xy); // the grain runs up the post
    postMaterial.colorNode = grain.color;
    postMaterial.normalNode = bumpNormal(grain.height);
  }
  const posts = new THREE.Group();
  const corners = net.supports.map((k) => new THREE.Vector3(net.position[k * 3], 0, net.position[k * 3 + 2]));
  for (const c of corners) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.018, POST + 0.008, 0.018).translate(c.x, (POST + 0.008) / 2, c.z), postMaterial);
    post.castShadow = post.receiveShadow = true;
    posts.add(post);
  }
  // The ground the vault stands on out of doors: a sand sea. Level where the vault stands, then
  // dunes, their crests across the wind that comes from the sun's side, so at a low sun their
  // windward slopes take the light and their slip faces fall into shade; beyond them the long
  // swells of older dunes, hazed with distance to the sky's horizon. The sand's surface is a scan of
  // wind ripples (Poly Haven, CC0), laid in meters at the building's scale, at two sizes one through
  // the other so it does not repeat to the eye.
  const groundMaterial = fading(new THREE.MeshStandardNodeMaterial());
  {
    const load = (name: string, color = false) => {
      const t = new THREE.TextureLoader().load(`/yaobian/assets/ground/${name}.jpg`);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 16;
      if (color) t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    const maps = { color: load('sand-color', true), normal: load('sand-normal'), rough: load('sand-rough') };
    const p = positionWorld.xz;
    const near = p.div(5), far = vec2(p.x.mul(0.8).sub(p.y.mul(0.6)), p.x.mul(0.6).add(p.y.mul(0.8))).div(23).add(0.31); // m a tile; the larger turned
    const other = smoothstep(-0.25, 0.35, mx_noise_float(p.div(40)));
    const sample = (map: THREE.Texture) => mix(texture(map, near), texture(map, far), other);
    // The scan is a pale grey sand; the desert's is warm, about 0.4 of the light returned.
    groundMaterial.colorNode = sample(maps.color).rgb.mul(vec3(2.15, 1.55, 1.0)).min(1);
    groundMaterial.roughnessNode = sample(maps.rough).r;
    groundMaterial.normalNode = normalMap(sample(maps.normal));
    // Under the vault the ground sees the sky only through its arches: darkest under the crown.
    const under = length(p).div(uScale.mul(net.options.span / 2));
    groundMaterial.aoNode = mix(float(1), mix(float(0.3), float(1), smoothstep(0.25, 1.1, under)), uBuilt);
    // The air between: far sand gives way to the horizon's light, warm toward the sun.
    const toward = positionWorld.sub(cameraPosition);
    const haze = float(1).sub(toward.length().div(-2600).exp());
    const facing = dot(toward.xz.normalize(), vec3(heavens.uniforms.sunDirection).xz.normalize()).mul(0.5).add(0.5);
    groundMaterial.colorNode = groundMaterial.colorNode.mul(float(1).sub(haze));
    groundMaterial.emissiveNode = mix(vec3(uHaze.away), vec3(uHaze.toward), facing.mul(facing)).mul(haze);
  }
  const ground = new THREE.Mesh(dunes(), groundMaterial);
  ground.receiveShadow = true;
  scene.add(room, bench, posts, ground);

  // The model -------------------------------------------------------------------------------------------

  // Tied at the posts' tops: model space has its supports at y = 0.
  const model = new THREE.Group();
  model.position.y = POST;
  scene.add(model);

  // Cord: three plies twisted, a groove between each; fiber along the plies.
  const cordMaterial = fading(new THREE.MeshStandardNodeMaterial({ roughness: 0.92 }));
  {
    const t = uv();
    const turns = t.x.mul(3).add(t.y.mul(20));
    const ply = fract(turns);
    // A turn of the plies is seen only where it spans several pixels; smaller, only the cord's tone.
    const resolved = smoothstep(0.3, 0.1, fwidth(turns));
    const groove = mix(float(0.82), smoothstep(0, 0.18, ply).mul(smoothstep(1, 0.82, ply)), resolved);
    const fiber = mx_noise_float(vec3(t.x.mul(40), t.y.mul(260), 0)).mul(smoothstep(0.5, 0.2, fwidth(t.y.mul(260))));
    cordMaterial.colorNode = rgb(hex('#cfc6b4')).mul(mix(float(0.72), float(1.03), groove)).mul(fiber.mul(0.06).add(1));
    cordMaterial.normalNode = bumpNormal(groove.mul(0.00018).add(fiber.mul(0.00002)).mul(uScale));
  }
  const segments = net.strings.length / 2;
  const cords = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.00055, 0.00055, 1, 8, 1, true), cordMaterial, segments);
  const knots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.0009, 10, 8), cordMaterial, net.count);
  // Lead: cast teardrops, dull grey, hazed white where the oxide has bloomed.
  const leadMaterial = fading(new THREE.MeshStandardNodeMaterial());
  {
    const p = positionWorld.mul(1000);
    const bloom = smoothstep(-0.1, 0.6, mx_noise_float(p.mul(1 / 6)).add(mx_noise_float(p.mul(1 / 1.5)).mul(0.25)));
    leadMaterial.colorNode = mix(rgb(hex('#65666a')), rgb(hex('#9a9893')), bloom.mul(0.55)).mul(mx_noise_float(p.mul(1 / 0.3)).mul(0.04).add(1));
    leadMaterial.roughnessNode = mix(float(0.55), float(0.85), bloom);
    leadMaterial.metalnessNode = mix(float(0.35), float(0.1), bloom);
  }
  // A 20 g sinker: a teardrop 20 mm long, its top at the origin, round below and drawn to a point above.
  const SINKER = 0.02;
  const sinkerGeometry = new THREE.LatheGeometry(Array.from({ length: 25 }, (_, i) => {
    const s = i / 24; // 0 at the bottom … 1 at the top
    return new THREE.Vector2(Math.max(0.0003, 0.0092 * Math.pow(Math.sin(Math.PI * s), 0.6) * (1 - 0.7 * s)), -SINKER + s * SINKER);
  }), 24);
  const most = 400;
  const sinkers = new THREE.InstancedMesh(sinkerGeometry, leadMaterial, most);
  // Turned over, the same lead presses down where it pulled: cast slugs, 20 g each, stacked on the
  // knot, so a peak shows what it carries. Nothing pushes up: the loads keep their direction, and
  // the shape, mirrored, carries them in compression.
  // Each a cast disc, 1.76 cm³ of lead, its edges rounded, so where two stand one on another the
  // rounds meet in a groove, and they can be counted.
  const SLUG = { radius: 0.009, height: SLUG_HEIGHT, round: 0.0014 }; // m: 20 g of lead
  const slugProfile: THREE.Vector2[] = [new THREE.Vector2(0, 0)];
  for (let i = 0; i <= 6; i++) { const a = (Math.PI / 2) * (i / 6); slugProfile.push(new THREE.Vector2(SLUG.radius - SLUG.round * (1 - Math.sin(a)), SLUG.round * (1 - Math.cos(a)))); }
  for (let i = 0; i <= 6; i++) { const a = (Math.PI / 2) * (i / 6); slugProfile.push(new THREE.Vector2(SLUG.radius - SLUG.round * (1 - Math.cos(a)), SLUG.height - SLUG.round + SLUG.round * Math.sin(a))); }
  slugProfile.push(new THREE.Vector2(0, SLUG.height));
  const slugMaterial = fading(leadMaterial.clone());
  // Hung under the knot in model space, which is upside down once turned: the disc's top is its y = 0.
  const slugs = new THREE.InstancedMesh(new THREE.LatheGeometry(slugProfile, 32).translate(0, -SLUG.height, 0), slugMaterial, most);
  const dropMaterial = fading(cordMaterial.clone());
  const drops = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.0006, 0.0006, 1, 6, 1, true), dropMaterial, net.count);
  for (const mesh of [cords, knots, sinkers, drops, slugs]) { mesh.castShadow = true; mesh.frustumCulled = false; }
  sinkers.count = drops.count = slugs.count = 0;

  // The shell: plaster through the knots, once the model stands. Its grain is fine at any scale; a
  // faint mottle in the model's own space becomes the weathering of a building.
  const shellMaterial = fading(new THREE.MeshStandardNodeMaterial({ roughness: 0.95, side: THREE.DoubleSide }));
  shellMaterial.aoNode = attribute('open', 'float'); // how much of the world the underside sees (below)
  {
    const p = positionWorld.mul(1000), q = positionLocal.mul(1000);
    // The finest grain, half a millimeter, only where a pixel is smaller than it; seen obliquely it would stripe.
    const fine = mx_noise_float(p.mul(1 / 0.5)).mul(smoothstep(0.3, 0.1, length(fwidth(p))));
    const grain = fine.mul(0.03).add(mx_noise_float(p.mul(1 / 4)).mul(0.02));
    // A building this size is cast against timber: board marks 120 mm apart, each board's face a
    // little different, a joint between. The model on the bench is plaster, smooth: the boards come
    // only as it becomes a building, and only near, where each spans many pixels.
    const across = q.x.div(4);
    const board = fract(across), seen = smoothstep(0.1, 0.05, fwidth(across)); // only where a board spans ten pixels and more: finer, its joints are stripes
    const face = mx_noise_float(vec3(across.floor().mul(7.31), q.z.mul(1 / 90), 0)).mul(0.045);
    const joint = smoothstep(0.06, 0, board).add(smoothstep(0.94, 1, board)).min(1);
    const boards = face.sub(joint.mul(0.06)).mul(seen).mul(uBuilt);
    shellMaterial.colorNode = rgb(hex('#dcd6cb')).mul(grain.add(mx_noise_float(q.mul(1 / 60)).mul(0.04)).add(boards).add(1));
    shellMaterial.normalNode = bumpNormal(fine.mul(0.00004).sub(joint.mul(seen).mul(uBuilt).mul(0.00008)).mul(uScale));
  }
  // The shell has a thickness: its face through the knots, the cord standing on it as ribs; its
  // back a plaster's thickness below, on the side that becomes the vault's underside; and a rim
  // closing the two along the free edges, where a building's arches would show their depth.
  const THICK = 0.0025; // m: 75 mm when grown
  const shellGeometry = new THREE.BufferGeometry();
  const n = net.knots;
  const faces: number[] = [];
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
    const a = net.index(i, j), b = net.index(i + 1, j), c = net.index(i + 1, j + 1), d = net.index(i, j + 1);
    faces.push(a, b, c, a, c, d); // the face
    faces.push(a + net.count, c + net.count, b + net.count, a + net.count, d + net.count, c + net.count); // the back
  }
  // The rim: the boundary, once round, each stretch a quad of its own, so its normals stay its own.
  const boundary: number[] = [];
  for (let i = 0; i < n - 1; i++) boundary.push(net.index(i, 0));
  for (let j = 0; j < n - 1; j++) boundary.push(net.index(n - 1, j));
  for (let i = n - 1; i > 0; i--) boundary.push(net.index(i, n - 1));
  for (let j = n - 1; j > 0; j--) boundary.push(net.index(0, j));
  const rimStart = 2 * net.count;
  boundary.forEach((_, e) => {
    const v = rimStart + e * 4;
    faces.push(v, v + 1, v + 2, v, v + 2, v + 3);
  });
  shellGeometry.setIndex(faces);
  shellGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array((rimStart + boundary.length * 4) * 3), 3));
  const offset = new Float32Array(net.count * 3); // each knot's back: above it as it hangs, below it once it stands
  // The vault's underside sees the ground under it, in its shade, and the world only through its
  // arches: fully at the free edges, little at the crown. Its occlusion, by how far a knot is from
  // the nearest edge in the net's own grid; the face and the rim see the open sky.
  {
    const open = new Float32Array(rimStart + boundary.length * 4).fill(1);
    const half = (n - 1) / 2;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const inward = Math.min(i, j, n - 1 - i, n - 1 - j) / half; // 0 at an edge … 1 at the crown
      open[net.count + net.index(i, j)] = 1 - 0.75 * Math.pow(inward, 0.6);
    }
    shellGeometry.setAttribute('open', new THREE.BufferAttribute(open, 1));
  }
  const shell = new THREE.Mesh(shellGeometry, shellMaterial);
  shell.castShadow = shell.receiveShadow = true;
  shell.frustumCulled = false;
  // The knot under the visitor's hand.
  const cursor = new THREE.Mesh(new THREE.SphereGeometry(0.0028, 16, 12), new THREE.MeshBasicNodeMaterial({ color: hex('#b3322a') }));
  cursor.visible = false;
  model.add(cords, knots, sinkers, drops, slugs, shell, cursor);

  // Light -------------------------------------------------------------------------------------------------

  // The window: soft, from the side; its shadow broad where the cord is far from what it falls on.
  const north = new Softbox({
    width: WINDOW.width, height: WINDOW.height, intensity: DAYLIGHT, color: new THREE.Color().setRGB(0.86, 0.92, 1),
    extent: 1.3, near: 0.1, far: 5, samples: { blockers: 16, taps: 32 }, bias: { depth: 0.003, normal: 0.002 },
  });
  north.place(new THREE.Vector3(WINDOW.x + 0.02, WINDOW.y, WINDOW.z), new THREE.Vector3(0, 0.1, -0.1));
  scene.add(north.light);
  const casters = [cords, knots, sinkers, drops, slugs, shell, ...posts.children, ...bench.children];
  let shadowDirty = true;
  // By day, the sun, from the same side, higher.
  const sun = new THREE.DirectionalLight(new THREE.Color().setRGB(1, 0.96, 0.9), 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.radius = 4;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);

  // Passes: the view, a little depth of field at the model's scale, the loupe, a trace of grain -------------

  const scenePass = pass(scene, camera);
  const uFocus = uniform(1.7), uBokeh = uniform(6), uRange = uniform(0.35);
  const lens = focus(scenePass, camera, { distance: uFocus, range: uRange, radius: uBokeh });
  const still = createStill(renderer);
  const pipeline = new THREE.RenderPipeline(renderer);
  pipeline.outputColorTransform = false;
  let loupe: Loupe | null = null;
  function output(): void {
    pipeline.outputNode = Fn(() => {
      let display = renderOutput(lens.node) as Node<'vec4'>;
      if (loupe) display = loupe.composite(display);
      return still.blend(display);
    })();
    pipeline.needsUpdate = true;
  }
  output();

  // Scratch
  const up = new THREE.Vector3(0, 1, 0), a = new THREE.Vector3(), b = new THREE.Vector3(), dir = new THREE.Vector3();
  const q = new THREE.Quaternion(), m = new THREE.Matrix4(), s = new THREE.Vector3();
  const knot = (k: number, out: THREE.Vector3) => out.set(net.position[k * 3], net.position[k * 3 + 1], net.position[k * 3 + 2]);
  const target = new THREE.Vector3();

  return {
    scene, camera, model, pipeline, uGrain: still.uGrain,
    /** The sun's elevation, degrees, out of doors. */
    get sun(): number { return heavens.elevation; },
    setSun(elevation: number): void { heavens.setSun(THREE.MathUtils.clamp(elevation, SUN.lowest, SUN.highest)); groundLight(); shadowDirty = true; },
    /** The sky's clock: its cloud drifts. Whether there is sky to see, so a frame is due. */
    advance(dt: number): boolean { if (uDay.value <= 0) return false; heavens.advance(dt); return true; },
    /**
     * Draw: `fresh` when anything has changed; otherwise the still at rest takes one more sample,
     * the lens's pattern and the window's shadow turned for it.
     */
    draw(fresh = true): void {
      if (shadowDirty && north.light.intensity > 0) { north.renderShadow(renderer, scene, casters); shadowDirty = false; }
      still.draw(camera, fresh, (sample) => {
        lens.frame.value = sample;
        north.frame.value = sample;
        pipeline.render();
      });
    },
    /** Whether the still at rest has all its samples. */
    get refined(): boolean { return still.done; },
    layout(width: number, height: number): void {
      size.width = width; size.height = height;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },
    setLoupe(next: Loupe | null): void { if (next !== loupe) { loupe = next; output(); } },

    /** Draw the model from the net's knots as they are now. */
    update(): void {
      for (let e = 0; e < segments; e++) {
        knot(net.strings[e * 2], a); knot(net.strings[e * 2 + 1], b);
        dir.subVectors(b, a);
        const length = dir.length();
        q.setFromUnitVectors(up, dir.divideScalar(length || 1));
        m.compose(a.add(b).multiplyScalar(0.5), q, s.set(1, length, 1));
        cords.setMatrixAt(e, m);
      }
      cords.instanceMatrix.needsUpdate = true;
      for (let k = 0; k < net.count; k++) knots.setMatrixAt(k, m.makeTranslation(knot(k, a)));
      knots.instanceMatrix.needsUpdate = true;
      // Each weight is one sinker, hung one under another on a cord from the knot; and, for the
      // model turned over, one slug, stacked on the knot on the side that will be up.
      let hung = 0, lines = 0, stacked = 0;
      for (let k = 0; k < net.count && hung < most; k++) {
        const count = Math.round(net.load[k] / o.unit);
        if (!count) continue;
        knot(k, a);
        const drop = 0.028 + (count - 1) * (SINKER + 0.004);
        m.compose(b.copy(a).add(dir.set(0, -drop / 2, 0)), q.identity(), s.set(1, drop, 1));
        drops.setMatrixAt(lines++, m);
        for (let i = 0; i < count && hung < most; i++) {
          m.compose(b.copy(a).add(dir.set(0, -0.028 - i * (SINKER + 0.004), 0)), q.setFromAxisAngle(up, k * 2.4 + i), s.setScalar(1));
          sinkers.setMatrixAt(hung++, m);
          // Model space is upside down once turned: a slug above the knot is below it here.
          m.compose(b.copy(a).add(dir.set(0, -0.0004 - i * SLUG.height, 0)), q.setFromAxisAngle(up, k * 1.7 + i * 2.3), s.set(1 + 0.03 * Math.sin(k + i * 3.1), 1, 1 + 0.03 * Math.sin(k + i * 3.1)));
          slugs.setMatrixAt(stacked++, m);
        }
      }
      sinkers.count = hung;
      drops.count = lines;
      slugs.count = stacked;
      sinkers.instanceMatrix.needsUpdate = drops.instanceMatrix.needsUpdate = slugs.instanceMatrix.needsUpdate = true;
      const p = shellGeometry.attributes.position as THREE.BufferAttribute;
      const P = net.position, at = (i: number, j: number) => net.index(THREE.MathUtils.clamp(i, 0, n - 1), THREE.MathUtils.clamp(j, 0, n - 1)) * 3;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        // The surface's normal at the knot, from its neighbours, turned up: hanging, the side above.
        const u0 = at(i - 1, j), u1 = at(i + 1, j), v0 = at(i, j - 1), v1 = at(i, j + 1);
        a.set(P[u1] - P[u0], P[u1 + 1] - P[u0 + 1], P[u1 + 2] - P[u0 + 2]);
        b.set(P[v1] - P[v0], P[v1 + 1] - P[v0 + 1], P[v1 + 2] - P[v0 + 2]);
        dir.crossVectors(a, b).normalize();
        if (dir.y < 0) dir.negate();
        const k = net.index(i, j) * 3;
        offset[k] = P[k] + dir.x * THICK; offset[k + 1] = P[k + 1] + dir.y * THICK; offset[k + 2] = P[k + 2] + dir.z * THICK;
      }
      p.array.set(P.subarray(0, net.count * 3), 0);
      p.array.set(offset, net.count * 3);
      boundary.forEach((k, e) => {
        const next = boundary[(e + 1) % boundary.length], v = (rimStart + e * 4) * 3;
        p.array.set(P.subarray(k * 3, k * 3 + 3), v);
        p.array.set(P.subarray(next * 3, next * 3 + 3), v + 3);
        p.array.set(offset.subarray(next * 3, next * 3 + 3), v + 6);
        p.array.set(offset.subarray(k * 3, k * 3 + 3), v + 9);
      });
      p.needsUpdate = true;
      shellGeometry.computeVertexNormals();
      shellGeometry.computeBoundingSphere();
      shadowDirty = true;
    },

    /** The knot under the visitor's hand, or none. */
    point(k: number | null): void {
      cursor.visible = k !== null;
      if (k !== null) knot(k, cursor.position);
    },

    /** The knot nearest a point on screen, CSS px, within reach; supports are not offered. */
    pick(x: number, y: number, reach = 28): number | null {
      model.updateMatrixWorld();
      let best: number | null = null, nearest = reach * reach;
      for (let k = 0; k < net.count; k++) {
        if (net.isSupport(k)) continue;
        knot(k, a).applyMatrix4(model.matrixWorld).project(camera);
        const px = (a.x * 0.5 + 0.5) * size.width, py = (0.5 - a.y * 0.5) * size.height;
        const d = (px - x) ** 2 + (py - y) ** 2;
        if (d < nearest && a.z < 1) { nearest = d; best = k; }
      }
      return best;
    },

    /**
     * The photograph, as Gaudí took his: the model as it hangs now, from below, in the workshop's
     * light, 4:3; turned upside down, as he turned his. Returns the picture and every knot's place
     * on it, 0 … 1 across and down, so the strings can be traced over it.
     */
    async photograph(view: View, width = 1600, height = 1200): Promise<{ url: string; at: Float32Array }> {
      const saved = { ratio: renderer.getPixelRatio(), size: renderer.getSize(new THREE.Vector2()), width: size.width, height: size.height };
      renderer.setPixelRatio(1);
      renderer.setSize(width, height, false);
      size.width = width; size.height = height;
      camera.aspect = width / height;
      this.stage(0, 0, { ...view, shift: 0 });
      const photo = new THREE.RenderTarget(width, height, { type: THREE.UnsignedByteType, depthBuffer: false });
      const bound = renderer.getRenderTarget();
      renderer.setRenderTarget(photo);
      for (let i = 0; i < 2; i++) { if (shadowDirty && north.light.intensity > 0) { north.renderShadow(renderer, scene, casters); shadowDirty = false; } still.plain(() => pipeline.render()); }
      renderer.setRenderTarget(bound);
      // Where each knot is in it, turned too; then the view is the page's again before anything waits.
      model.updateMatrixWorld();
      const at = new Float32Array(net.count * 2);
      for (let k = 0; k < net.count; k++) {
        knot(k, a).applyMatrix4(model.matrixWorld).project(camera);
        at[k * 2] = 1 - (a.x * 0.5 + 0.5); at[k * 2 + 1] = 1 - (0.5 - a.y * 0.5);
      }
      renderer.setPixelRatio(saved.ratio);
      renderer.setSize(saved.size.x, saved.size.y, false);
      this.layout(saved.width, saved.height);
      const pixels = (await renderer.readRenderTargetPixelsAsync(photo, 0, 0, width, height)) as Uint8Array;
      photo.dispose();
      const stride = pixels.length / height; // rows are padded
      // Turned upside down: the last pixel first.
      const image = new ImageData(width, height);
      for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
        const from = row * stride + col * 4, to = ((height - 1 - row) * width + (width - 1 - col)) * 4;
        image.data[to] = pixels[from]; image.data[to + 1] = pixels[from + 1]; image.data[to + 2] = pixels[from + 2]; image.data[to + 3] = 255;
      }
      const canvas = new OffscreenCanvas(width, height);
      canvas.getContext('2d')!.putImageData(image, 0, 0);
      const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.82 });
      const url = await new Promise<string>((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result as string); r.readAsDataURL(blob); });
      return { url, at };
    },

    /** A knot's place on screen, CSS px; `beyond` m further along the way its lead hangs, or stands. */
    onScreen(k: number, beyond = 0): { x: number; y: number } {
      model.updateMatrixWorld();
      knot(k, a);
      a.y -= beyond;
      a.applyMatrix4(model.matrixWorld).project(camera);
      return { x: (a.x * 0.5 + 0.5) * size.width, y: (0.5 - a.y * 0.5) * size.height };
    },

    /**
     * The stage: `flip` 0 hanging … 1 turned over and standing on the bench; `grow` 0 the model's
     * scale … 1 a building's. The camera stands at a view, at the model's scale, and turns by the
     * visitor's look, degrees.
     */
    stage(flip: number, grow: number, view: View, look = { yaw: 0, pitch: 0 }): void {
      const scale = Math.pow(SCALE, grow);
      uBuilt.value = smooth(grow, 0.5, 0.95);
      if (model.rotation.x !== Math.PI * flip || model.scale.x !== scale) shadowDirty = true;
      model.rotation.x = Math.PI * flip; // away from the camera, over the supports
      model.scale.setScalar(scale);
      uScale.value = scale;
      leadMaterial.opacity = dropMaterial.opacity = 1 - smooth(flip, 0.05, 0.3);
      // Lowered from the posts' tops to the bench as it turns, but never into it: on its side the net
      // reaches half its width below the line it turns about, and the lead further. Lifted clear.
      const c = Math.cos(Math.PI * flip), sn = Math.sin(Math.PI * flip);
      let lowest = 0;
      for (let k = 0; k < net.count; k++) {
        const y = net.position[k * 3 + 1], z = net.position[k * 3 + 2];
        lowest = Math.min(lowest, y * c - z * sn);
        const count = leadMaterial.opacity > 0 ? Math.round(net.load[k] / o.unit) : 0;
        if (count) lowest = Math.min(lowest, (y - 0.028 - count * (SINKER + 0.004)) * c - z * sn - 0.0092 * sn); // its radius, lying on its side
      }
      model.position.y = Math.max(POST * (1 - flip), (-lowest + 0.004 * sn) * scale);
      sinkers.visible = drops.visible = leadMaterial.opacity > 0;
      slugMaterial.opacity = smooth(flip, 0.8, 1) * (1 - smooth(grow, 0.02, 0.2)); // on the bench; not grown to a building's
      slugs.visible = slugMaterial.opacity > 0;
      // The strings found the shape; a building is the shell alone.
      cordMaterial.opacity = 1 - smooth(grow, 0.25, 0.6);
      cords.visible = knots.visible = cordMaterial.opacity > 0;
      postMaterial.opacity = 1 - smooth(flip, 0.1, 0.5);
      posts.visible = postMaterial.opacity > 0;
      shellMaterial.opacity = smooth(flip, 0.55, 1);
      shell.visible = shellMaterial.opacity > 0;
      roomMaterial.opacity = floorMaterial.opacity = 1 - smooth(grow, 0.02, 0.22);
      room.visible = roomMaterial.opacity > 0;
      benchMaterial.opacity = 1 - smooth(grow, 0.05, 0.35);
      bench.visible = benchMaterial.opacity > 0;
      groundMaterial.opacity = smooth(grow, 0.1, 0.45);
      ground.visible = groundMaterial.opacity > 0;

      // The window becomes the sky: its light gives way to the sun's, the room's to the sky's.
      const day = smooth(grow, 0.15, 0.75);
      uDay.value = day;
      if (Math.abs(day - envDay) > 0.04 || (day !== envDay && (day === 0 || day === 1)) || heavens.elevation !== envSun) {
        pmrem.fromScene(envScene, 0.04, 0.1, 100, { renderTarget: envTarget });
        envDay = day; envSun = heavens.elevation;
      }
      north.light.intensity = DAYLIGHT * (1 - smooth(grow, 0.05, 0.4));
      // The sun where the sky has it, its colour the sky's, its strength falling as it sets.
      const sunLight = heavens.sunAt(heavens.elevation), noon = heavens.sunAt(SUN.highest);
      const strength = (0.2126 * sunLight.x + 0.7152 * sunLight.y + 0.0722 * sunLight.z) / (0.2126 * noon.x + 0.7152 * noon.y + 0.0722 * noon.z);
      sun.color.setRGB(sunLight.x, sunLight.y, sunLight.z).multiplyScalar(1 / Math.max(sunLight.x, sunLight.y, sunLight.z, 1e-9));
      sun.intensity = 3.2 * day * Math.pow(strength, 0.6);
      scene.environmentIntensity = 1 + 0.6 * day;
      sun.position.copy(heavens.uniforms.sunDirection.value).multiplyScalar(3 * scale);
      sun.target.position.set(0, 0.2 * scale, 0);
      const cam = sun.shadow.camera;
      const reach = 0.7 * scale;
      if (cam.right !== reach) {
        Object.assign(cam, { left: -reach, right: reach, top: reach, bottom: -reach, near: 0.5 * scale, far: 6 * scale });
        cam.updateProjectionMatrix();
      }

      // The camera; the depth of field narrows to nothing as the model becomes a building. On a
      // narrow screen the camera stands back, keeping its perspective, so the model keeps its width;
      // under the vault, where it cannot, the lens widens a little instead. The words are below the
      // picture there, so it is not shifted aside for them.
      const narrow = Math.max(1, 1.2 / (size.width / size.height));
      const wide = view.fov >= 60;
      const distance = view.distance * (wide ? 1 : Math.pow(narrow, 0.85));
      const shift = narrow > 1 ? 0 : view.shift;
      target.set(view.tx, view.ty, view.tz).multiplyScalar(scale);
      const ve = deg(view.elevation), va = deg(view.azimuth);
      camera.position.set(Math.sin(va) * Math.cos(ve), Math.sin(ve), Math.cos(va) * Math.cos(ve)).multiplyScalar(distance * scale).add(target);
      camera.lookAt(target);
      // The visitor's own look, a turn of the head: about the vertical, then up or down.
      if (look.yaw || look.pitch) {
        camera.rotateOnWorldAxis(up, deg(look.yaw));
        camera.rotateX(deg(look.pitch));
      }
      camera.near = 0.01 * scale;
      camera.fov = wide ? Math.min(95, view.fov * Math.sqrt(narrow)) : view.fov;
      camera.updateProjectionMatrix();
      if (Math.abs(shift) > 1e-4) camera.setViewOffset(size.width, size.height, -shift * size.width, 0, size.width, size.height);
      else if (camera.view?.enabled) camera.clearViewOffset();
      uFocus.value = distance * scale;
      uRange.value = 0.35 * scale;
      uBokeh.value = 6 * (renderer.domElement.width / 2400) * (1 - smooth(grow, 0, 0.3));
    },
  };
}
