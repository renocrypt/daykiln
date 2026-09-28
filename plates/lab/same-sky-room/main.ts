// SAME SKY, the room: the first look-development frame of the inside act.
//
// A Skyspace, seen from its bench, in two plans: a square room with a square aperture, and a round
// room with a round one (O). The room is lime plaster, dark below and white above, with a felt bench
// round its walls and a long-pile carpet between; its flat ceiling floats above the walls on a slot
// of hidden light, and the aperture is cut to a knife edge. The sky is a real one, baked from a
// spectral model of the atmosphere, with a layer of cloud drifting across it (src/same-sky/sky.ts).
// In the afternoon the sun comes in: its patch lies on the far wall, and dust in the air shows its
// beam. As the sun sets, its patch climbs the wall into the slot, and the strip comes up to wash the
// ceiling; the visitor changes the wash, the sky's value never changes, and the probe reads it from
// the finished frame with the sky's clock held. The light in the room is solved (room.ts); the
// calibration is the flat-plane test's (lab/same-sky-perception): the wash is 0.5 linear at the
// aperture's edge.

import * as THREE from 'three/webgpu';
import {
  Break, Discard, Fn, If, Loop, abs, attribute, cameraPosition, cos, dFdx, dFdy, dot, float, getViewPosition, hash, log2,
  instanceIndex, interleavedGradientNoise, length, max, min, mix, pass, positionLocal, positionWorld, pow, renderOutput, screenCoordinate,
  screenUV, sin, smoothstep, step, texture, uniform, uv, varying, vec2, vec3, vec4,
} from 'three/tsl';
import type { Node } from 'three/webgpu';
import { smaa } from 'three/addons/tsl/display/SMAANode.js';
import { damp } from '../../src/core/damp.ts';
import type { NoiseData } from '../../src/same-sky/noise.ts';
import { Sky, imageTexture } from '../../src/same-sky/sky.ts';
import type { SkySetting } from '../../src/same-sky/sky.ts';
import { BENCH, REFLECTANCE, ROOM, SURFACES, apertureDistance, fineCounts, planOf } from './room.ts';
import type { Coarse, Part, RoomLight, Run, Shape, Surface } from './room.ts';
import type { Task } from './room-worker.ts';

const WASHES = [
  { name: 'neutral', hex: '#f2efe8' },
  { name: 'amber', hex: '#ffb45a' },
  { name: 'rose', hex: '#ff8fb8' },
  { name: 'violet', hex: '#9d8cff' },
  { name: 'green', hex: '#8fe0a0' },
  { name: 'dark', hex: '#f2efe8', gain: 1 / 16 },
];
// The sun stands behind the seated visitor's left shoulder, so its beam crosses the room ahead of
// them to the far wall. The wind at cloud height is about 17 m/s: a fifth of a degree a second.
const SUN_AZIMUTH = THREE.MathUtils.degToRad(196);
const WIND: [number, number] = [-14, -9.5];
/**
 * The suns the room's light is solved for, degrees: as the sun sets, its patch climbs the far wall a
 * quarter of a meter between each, and from about 9° it lies in the slot. Between them the bounce is
 * blended; eight, for two vec4 attributes.
 */
const SUNS = [25, 21.5, 18, 15, 11.5, 7.5, 4, 1];
/** The strip's program: it comes up as the sun nears the horizon, about forty minutes before sunset, and is full a degree below it. */
const PROGRAM = { start: 10, full: -1 };
/**
 * The exposure and white through the sunset. By day the room below is far darker than the sky
 * above, and the eye adapts to each as it looks at it: to the room's white surfaces, lit by the sky
 * and the sun, and, looking up, to the aperture's sky, as an architectural photographer exposes a
 * window apart from the room. Each adapts in part, by three quarters of the way in log (ADAPTATION),
 * so as the sun sets both dim a little. The eye's white follows the light on the room's surfaces, the
 * strip's included, but not the aperture, which it sees as a source; a third of the way (BALANCE),
 * so the sun's warm bounce reads as warm light on white rather than as brown. As the program comes
 * up, all of it hands over, in log, to the dusk's: one exposure for room and sky alike, set by eye
 * for each sky so that with the wash at 0.5 at the aperture's edge the sky keeps its color, and a
 * neutral white, since the wash's color is the visitor's to adapt to. Through twilight the exposure
 * opens as the eye adapts, a hundredfold by the end.
 */
const AFTERNOON = { sun: 25, exposure: 1.65e-3 };
const ADAPTATION = 0.75, BALANCE = 0.35;
const DUSK: [number, number][] = [[-1, 1.48e-3], [-4, 1.9e-2], [-6.5, 0.157]];
function duskExposure(elevation: number): number {
  const k = Math.max(DUSK.findIndex((_, i) => i < DUSK.length - 1 && elevation >= DUSK[i + 1][0]), 0);
  const [e0, x0] = DUSK[k], [e1, x1] = DUSK[Math.min(k + 1, DUSK.length - 1)];
  const t = e0 === e1 ? 0 : Math.min(Math.max((e0 - elevation) / (e0 - e1), 0), 1);
  return Math.exp(Math.log(x0) + (Math.log(x1) - Math.log(x0)) * t);
}
// One layer of altocumulus through the whole sunset: white by day, gold and rose as the sun sets,
// grey once the Earth's shadow passes it, at about 2.5° below the horizon.
const SETTING: SkySetting = { cloud: { base: 5200, top: 5450, coverage: 0.55, extinction: 0.03 }, sunAzimuth: SUN_AZIMUTH, wind: WIND, exposure: (e) => skyExposure(e) };
/** Places in the sunset the visitor can go straight to (S); P plays it through. */
const BOOKMARKS = [
  { name: 'afternoon', sun: 25, about: 'the sun\'s beam through the aperture' },
  { name: 'golden hour', sun: 5, about: 'the sun\'s patch in the slot; the program coming up' },
  { name: 'sunset', sun: 1.5, about: 'the sun\'s last light, red, in the slot' },
  { name: 'afterglow', sun: -1, about: 'the cloud still in sunlight' },
  { name: 'twilight', sun: -4, about: 'the cloud in the Earth\'s shadow' },
  { name: 'deep dusk', sun: -6.5, about: 'the end of civil twilight' },
];
const PASSAGE = 0.4; // degrees of the sun's fall a second when playing: a sunset in about eighty
const program = (elevation: number) => {
  const t = Math.min(Math.max((PROGRAM.start - elevation) / (PROGRAM.start - PROGRAM.full), 0), 1);
  return t * t * (3 - 2 * t);
};
// Colors in the solve's reflectances (room.ts): the lower room is dark, but not so dark it drinks
// the light and hides what it is made of.
const COLOR = {
  plaster: '#f2f1ee', // lime, near white: 0.85
  dado: '#5e6778', // the lower wall: lime tinted slate blue, 0.13
  felt: '#595f6b', // the bench: slate wool felt, 0.11
  fiber: '#86827c', // the carpet's fibers, warm grey; the pile's own shade brings them to 0.16
};
const PILE = { height: 0.035, layers: 24, tile: 0.2, lean: 0.012 }; // m: a long pile in levels, its tips leaning
const SHEEN = { plaster: 0.25, felt: 0.5 }; // how much a surface brightens seen at a glance: the velvet in lime, the nap of felt
const DUST = { count: 4000, size: 0.008, scatter: 0.03 }; // motes, m; the room's air scatters 3% of a beam per meter
const SUN_WIDTH = 0.0093; // rad, the sun's diameter: the width of a shadow's penumbra per meter from its edge
const WASH_HALF_LIFE = 0.8; // s, LOOK.md: adaptation takes time
const SETTLED = 5e-4;
const EDGE_VALUE = 0.5; // linear value of the washed ceiling at the aperture's edge, as in the flat test

const params = new URLSearchParams(location.search);
// Edges are smoothed by supersampling and SMAA rather than multisampling: four samples a pixel leave
// the aperture's long, shallow, high-contrast edges visibly stepped. The frame is drawn at one and a
// half times the display's resolution, up to about eight million pixels, and the browser scales it
// down.
// `?timing` records each pass's time on the GPU, for measuring; it costs a little, so it is off by default.
const renderer = new THREE.WebGPURenderer({ antialias: false, forceWebGL: params.has('webgl'), trackTimestamp: params.has('timing') });
const renderScale = () => Math.min(devicePixelRatio * 1.5, Math.sqrt(8e6 / (innerWidth * innerHeight)));
renderer.setPixelRatio(renderScale());
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.NeutralToneMapping; // hue-preserving; LOOK.md
renderer.toneMappingExposure = 1; // fixed: an adaptive exposure would change the sky's value
document.body.prepend(renderer.domElement);
await renderer.init();

const hint = document.querySelector<HTMLElement>('#hint')!;
// `switched`: the visitor has reached for the wash, which switches the strip on whatever the hour.
const state = { shape: 'square' as Shape, wash: 0, intensity: EDGE_VALUE, sun: BOOKMARKS[0].sun, switched: false, playing: false, hold: false, solving: false };

// The room's light is solved for each plan as it is asked for, by a pool of workers
// (room-worker.ts). The first solves the coarse radiosity, while the others find the direct light
// at the fine vertices, which needs none. Then all of them share out the rest of the fine vertices'
// light, in runs, each taking the next as it finishes; and the first puts the room together. The
// sky's noise is made in another worker, side by side with the first solve.
const POOL = Math.max(2, Math.min((navigator.hardwareConcurrency || 4) - 2, 8));
const solvers = Array.from({ length: POOL }, () => {
  const worker = new Worker(new URL('./room-worker.ts', import.meta.url), { type: 'module' });
  const waiting: ((data: unknown) => void)[] = [];
  worker.onmessage = (event) => waiting.shift()!(event.data);
  return {
    ask: <T>(task: Task, transfer: Transferable[] = []) => new Promise<T>((resolve) => { waiting.push(resolve as (data: unknown) => void); worker.postMessage(task, transfer); }),
    tell: (task: Task) => worker.postMessage(task),
  };
});
/**
 * A fine vertex's cost after the coarse solve, relative to one of the walls': at the bench and the
 * carpet, light is gathered afresh from every patch. Before it, the direct light costs about the
 * same at every vertex.
 */
const GATHER: Record<Surface, number> = { dado: 1, upper: 1, top: 1, cove: 1, ceiling: 1, bench: 33, carpet: 38 };
/** Runs of about equal cost, three for each worker. */
function share(counts: number[], cost: (surface: Surface) => number, workers: number): { surface: Surface; from: number; to: number }[] {
  const each = SURFACES.reduce((sum, surface, n) => sum + counts[n] * cost(surface), 0) / (workers * 3);
  return SURFACES.flatMap((surface, n) => {
    const size = Math.max(1, Math.round(each / cost(surface)));
    return Array.from({ length: Math.ceil(counts[n] / size) }, (_, i) => ({ surface, from: i * size, to: Math.min((i + 1) * size, counts[n]) }));
  });
}
/** Each worker takes the next task as it finishes its last. */
async function drain<T>(workers: typeof solvers, tasks: Task[], done: (result: T, task: Task) => void): Promise<void> {
  await Promise.all(workers.map(async (s) => {
    for (let task = tasks.shift(); task; task = tasks.shift()) {
      const transfer = task.task === 'run' ? [task.direct.buffer] : [];
      const t = task;
      done(await s.ask<T>(t, transfer), t);
    }
  }));
}
const toward = (elevation: number) => {
  const e = THREE.MathUtils.degToRad(elevation);
  return [Math.cos(e) * Math.cos(SUN_AZIMUTH), Math.sin(e), Math.cos(e) * Math.sin(SUN_AZIMUTH)];
};
async function solve(shape: Shape): Promise<RoomLight> {
  const started = performance.now();
  const counts = fineCounts(shape);
  const directs = SURFACES.map((_, n) => new Float64Array(counts[n] * 2));
  const coarse = solvers[0].ask<Coarse>({ task: 'coarse', shape, suns: SUNS.map(toward) });
  await drain<Float64Array>(solvers.slice(1), share(counts, () => 1, POOL - 1).map((r) => ({ task: 'direct', shape, ...r })), (direct, task) => {
    if (task.task === 'direct') directs[SURFACES.indexOf(task.surface)].set(direct, task.from * 2);
  });
  for (const s of solvers) s.tell({ task: 'hold', shape, coarse: await coarse });
  const runs: Run[] = [];
  await drain<Run>(solvers, share(counts, (surface) => GATHER[surface], POOL).map((r) => ({
    task: 'run', ...r, direct: directs[SURFACES.indexOf(r.surface)].slice(r.from * 2, r.to * 2),
  })), (run) => runs.push(run));
  const light = await solvers[0].ask<RoomLight>({ task: 'assemble', runs }, runs.map((r) => r.light.buffer));
  light.seconds = (performance.now() - started) / 1000;
  return light;
}
const started = performance.now();
const noiseWorker = new Worker(new URL('../../src/same-sky/noise-worker.ts', import.meta.url), { type: 'module' });
const [noise, first] = await Promise.all([
  new Promise<NoiseData>((resolve) => { noiseWorker.onmessage = (event) => { resolve(event.data as NoiseData); noiseWorker.terminate(); }; }),
  solve(state.shape),
]);
const sky = await Sky.load('/plates/assets/same-sky/', noise);
const loadMs = performance.now() - started;
let light = first;

// Uniforms of the room's light.
const RADIANCE = REFLECTANCE.plaster / Math.PI; // Lambertian plaster: radiance per unit irradiance
const uStrip = uniform(new THREE.Vector3()); // the wash, per unit strip
const uSky = uniform(new THREE.Vector3()); // the clear sky's mean radiance through the aperture
const uSun = uniform(new THREE.Vector3()); // the sun's illuminance normal to it
const uSunDirection = uniform(new THREE.Vector3(...toward(AFTERNOON.sun))); // toward the sun
const uAperture = uniform(new THREE.Vector2()); // the aperture's spine and radius
const uFront = uniform(new THREE.Vector2()); // the bench front's spine and radius
const uDust = uniform(0); // scattering by the room's air, m⁻¹; nothing to see without the sun
// The sun's bounce, blended between the two solved suns either side of it (SUNS). The patch itself
// is drawn exact.
const uSunsA = uniform(new THREE.Vector4()), uSunsB = uniform(new THREE.Vector4());
const uBalance = uniform(new THREE.Vector3(1, 1, 1)); // the eye's white: gains on the whole frame
const uTime = uniform(0);

/** The weight of each solved sun at an elevation: linear between the two either side. */
function sunWeights(elevation: number): number[] {
  const w = SUNS.map(() => 0), last = SUNS.length - 1;
  if (elevation >= SUNS[0]) w[0] = 1;
  else if (elevation <= SUNS[last]) w[last] = 1;
  else {
    const k = SUNS.findIndex((e, i) => i < last && elevation <= e && elevation >= SUNS[i + 1]);
    const t = (SUNS[k] - elevation) / (SUNS[k] - SUNS[k + 1]);
    w[k] = 1 - t; w[k + 1] = t;
  }
  return w;
}
const luminance = (v: THREE.Vector3) => 0.2126 * v.x + 0.7152 * v.y + 0.0722 * v.z;

/**
 * How far up the strip is: as the program has it, or full once the visitor has reached for the wash.
 * By day, against the daylight, the wash colors the ceiling but hardly moves the sky, as in a real
 * Skyspace; the program brings the strip up by itself from about forty minutes before sunset.
 */
const stripLevel = (elevation: number) => Math.max(program(elevation), state.switched ? 1 : 0);
/** The strip's color and strength that give the wash's value at the aperture's edge, at a level. */
function stripFor(index: number, edgeValue: number, level = stripLevel(state.sun)): THREE.Vector3 {
  const wash = WASHES[index];
  const c = new THREE.Color(wash.hex);
  const peak = Math.max(c.r, c.g, c.b);
  const gain = wash.gain ?? 1;
  return new THREE.Vector3(c.r, c.g, c.b).multiplyScalar((level * edgeValue * gain) / peak / (RADIANCE * light.edge));
}

/**
 * The clear sky's mean radiance through the aperture, not exposed, seen from the middle of the floor,
 * weighted by projected solid angle: the room's solution takes the aperture as a uniform emitter.
 */
const apertureMemo = new Map<string, THREE.Vector3>();
function apertureRadiance(elevation: number): THREE.Vector3 {
  const key = `${state.shape} ${elevation}`;
  const known = apertureMemo.get(key);
  if (known) return known.clone();
  const plan = planOf(state.shape), extent = plan.aperture.spine + plan.aperture.radius;
  const sum = new THREE.Vector3();
  let weight = 0;
  const n = 16;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = -extent + ((i + 0.5) / n) * 2 * extent, z = -extent + ((j + 0.5) / n) * 2 * extent;
      if (apertureDistance(plan, x, z) >= 0) continue;
      const d = new THREE.Vector3(x, ROOM.ceiling, z);
      const r2 = d.lengthSq();
      d.normalize();
      const w = (d.y * d.y) / r2;
      sum.addScaledVector(sky.clearRadiance(d, elevation), w);
      weight += w;
    }
  }
  if (apertureMemo.size > 16) apertureMemo.clear();
  apertureMemo.set(key, sum.divideScalar(weight).clone());
  return sum;
}

/** The daylight's mean radiance on the room's white surfaces, the upper walls and the ceiling, from the sky and the sun. */
function roomLight(elevation: number): THREE.Vector3 {
  const weights = sunWeights(elevation);
  return apertureRadiance(elevation).multiplyScalar(light.seen[1])
    .addScaledVector(sky.sunAt(elevation), weights.reduce((sum, w, m) => sum + w * light.seen[2 + m], 0)).multiplyScalar(RADIANCE);
}
/** An exposure adapted by day to a light, in part, handing over to the dusk's as the program comes up: see AFTERNOON. */
function adapted(adapting: (elevation: number) => number, elevation: number): number {
  const day = Math.log(AFTERNOON.exposure) + ADAPTATION * Math.log(adapting(AFTERNOON.sun) / adapting(elevation));
  const p = program(elevation);
  return Math.exp((1 - p) * day + p * Math.log(duskExposure(elevation)));
}
/** The exposure of the room, for the plan in view. */
const roomExposure = (elevation: number) => adapted((e) => luminance(roomLight(e)), elevation);
/** The exposure of the aperture's sky: the probe's. */
const skyExposure = (elevation: number) => adapted((e) => luminance(apertureRadiance(e)), elevation);
/** The white at an elevation: gains that take the light on the room's surfaces partway to neutral, at its own luminance. */
function balanceAt(elevation: number): THREE.Vector3 {
  // The strip as the program has it, never as the visitor has set it: the white, like the exposure,
  // must not move with the wash, or the sky's value would.
  const strip = stripFor(0, EDGE_VALUE, program(elevation)).multiplyScalar((light.seen[0] * RADIANCE) / roomExposure(elevation));
  const d = roomLight(elevation).add(strip), y = luminance(d), keep = 1 - program(elevation);
  const gain = new THREE.Vector3(...[d.x, d.y, d.z].map((c) => (Math.max(c, 1e-9) / y) ** (-BALANCE * keep)));
  return gain.divideScalar(luminance(new THREE.Vector3(gain.x * d.x, gain.y * d.y, gain.z * d.z)) / y);
}

/** Set the sun's elevation: the sky and its exposure, the room's, the sun's light and direction, its bounce, and the dust's glow. */
function setSun(elevation: number): void {
  state.sun = elevation;
  sky.setSun(elevation);
  const exposure = roomExposure(elevation);
  uSky.value.copy(apertureRadiance(elevation)).multiplyScalar(exposure);
  uSun.value.copy(sky.sunAt(elevation)).multiplyScalar(exposure);
  uSunDirection.value.copy(sky.uniforms.sunDirection.value);
  const w = sunWeights(elevation);
  uSunsA.value.set(w[0], w[1], w[2], w[3]);
  uSunsB.value.set(w[4], w[5], w[6], w[7]);
  uBalance.value.copy(balanceAt(elevation));
  uDust.value = uSun.value.lengthSq() > 0 ? DUST.scatter : 0;
}
function setPlan(): void {
  const plan = planOf(state.shape);
  uAperture.value.set(plan.aperture.spine, plan.aperture.radius);
  uFront.value.set(plan.front.spine, plan.front.radius);
  setSun(state.sun);
}
if (SUNS.length !== 8) throw new Error('the solved suns fill two vec4 attributes');
sky.elevation = state.sun;
sky.set(SETTING);
setPlan();
uStrip.value.copy(stripFor(state.wash, state.intensity));

// Surfaces -----------------------------------------------------------------------------------------

const scene = new THREE.Scene();
function geometryOf(part: Part): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(part.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(part.normals, 3));
  g.setAttribute('strip', new THREE.BufferAttribute(part.strip, 1));
  g.setAttribute('sky', new THREE.BufferAttribute(part.sky, 1));
  const suns = new THREE.InterleavedBuffer(part.sun, SUNS.length);
  g.setAttribute('sunA', new THREE.InterleavedBufferAttribute(suns, 4, 0));
  g.setAttribute('sunB', new THREE.InterleavedBufferAttribute(suns, 4, 4));
  g.setIndex(new THREE.BufferAttribute(part.index, 1));
  return g;
}
const linear = (hex: string) => { const c = new THREE.Color(hex); return vec3(c.r, c.g, c.b); };

/** Whether the sun reaches a point: its ray toward the sun leaves through the aperture; soft over the penumbra. */
const sunThrough = (p: Node<'vec3'>) => {
  const t = float(ROOM.ceiling).sub(p.y).div(max(uSunDirection.y, 1e-3));
  const hit = abs(p.xz.add(uSunDirection.xz.mul(t))).sub(uAperture.x);
  const distance = length(max(hit, vec2(0))).add(min(max(hit.x, hit.y), 0)).sub(uAperture.y);
  const half = t.mul(SUN_WIDTH / 2).add(1e-3);
  return float(1).sub(smoothstep(half.negate(), half, distance)).mul(step(0, uSunDirection.y));
};
/** The irradiance at a vertex: the solved light under the wash, the sky, and the sun's bounce; and the sun's own patch. */
const irradiance = () => {
  const normal = attribute('normal', 'vec3');
  const bounce = dot(attribute('sunA', 'vec4'), uSunsA).add(dot(attribute('sunB', 'vec4'), uSunsB));
  return attribute('strip', 'float').mul(uStrip).add(attribute('sky', 'float').mul(uSky)).add(bounce.mul(uSun))
    .add(uSun.mul(max(dot(normal, uSunDirection), 0)).mul(sunThrough(positionWorld)));
};
/** How far a surface is seen at a glance, 0 face on, 1 edge on. */
const glance = () => float(1).sub(abs(dot(attribute('normal', 'vec3'), cameraPosition.sub(positionWorld).normalize())));

const pile = texture(imageTexture(noise.pile, true));
const drift = texture(imageTexture(noise.patches, true)); // slow variation: the way the pile lies

// Lime plaster, white above and dark below: matte, with a hint of velvet where it is seen at a glance.
const white = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
white.colorNode = irradiance().mul(linear(COLOR.plaster)).div(Math.PI).mul(pow(glance(), 3).mul(SHEEN.plaster).add(1));
const dado = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
dado.colorNode = irradiance().mul(linear(COLOR.dado)).div(Math.PI).mul(pow(glance(), 3).mul(SHEEN.plaster).add(1));

// Felt: dark wool, faintly mottled, with a nap that catches light at a glance.
const felt = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
const mottle = mix(pile.sample(positionWorld.xz.div(0.05)).b, pile.sample(positionWorld.xy.add(positionWorld.zy).div(0.05)).b, abs(attribute('normal', 'vec3').y).oneMinus());
felt.colorNode = irradiance().mul(linear(COLOR.felt)).div(Math.PI).mul(mottle.mul(0.1).add(0.95)).mul(pow(glance(), 2).mul(SHEEN.felt).add(1));

// The carpet: a long pile, in levels. Every tuft keeps its section up to its own height and rounds
// off at its tip, leaning the way the pile lies there; the pile's own shade deepens toward its base,
// and the tips catch the light at a glance. Where the pile lies differently, it reads lighter or
// darker, as a brushed pile does. It is drawn as one plane at the pile's top: from there the view ray
// is followed down through the levels, and the first tuft it meets is what is seen, as if each level
// were drawn as a shell over the one below. It matches the 24 shells it replaces, and costs about a
// third less; it is still the frame's largest cost, since a group of pixels on the GPU walks as deep
// as its deepest.
const carpet = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
carpet.positionNode = positionLocal.add(vec3(0, PILE.height, 0));
/** The pile at a point of the floor's plan and a level of it, 0 at the floor and 1 at the top, looked up at given mip levels. */
const pileAt = (p: Node<'vec2'>, level: Node<'float'>, lod: Node<'vec2'>) => {
  const lie = drift.sample(p.div(1.3)).level(lod.y);
  const tuft = pile.sample(p.add(lie.rg.sub(0.5).mul(2 * PILE.lean).mul(level.mul(level))).div(PILE.tile)).level(lod.x);
  const cover = (shape: Node<'float'>, height: Node<'float'>) => shape.sub(level.div(height.mul(0.55).add(0.45)).pow(2));
  return { lie, covered: max(step(level, 0), smoothstep(0, 0.06, max(cover(tuft.r, tuft.g), cover(tuft.b, tuft.a)))) };
};
const pileSeen = Fn(() => {
  const view = positionWorld.sub(cameraPosition).normalize(), down = min(view.y, -1e-3), top = positionWorld.xz;
  // The mip levels a shell's own lookups would take, from the footprint of a pixel on the pile.
  const footprint = max(length(dFdx(top)), length(dFdy(top)));
  const lod = vec2(log2(footprint.mul(256 / PILE.tile)), log2(footprint.mul(256 / 1.3))).max(vec2(0));
  const seen = vec4(top, 0, 0).toVar(); // where, at what level, and the lie there
  const bench = float(0).toVar();
  Loop(PILE.layers, ({ i }) => {
    const level = float(PILE.layers - 1).sub(float(i)).div(PILE.layers - 1);
    const p = top.add(view.xz.mul(level.sub(1).mul(PILE.height).div(down)));
    // Past the bench's front the ray has met the bench, which is drawn itself.
    If(length(max(abs(p).sub(uFront.x), vec2(0))).greaterThan(uFront.y), () => { bench.assign(1); Break(); });
    const at = pileAt(p, level, lod);
    If(at.covered.greaterThanEqual(0.5), () => { seen.assign(vec4(p, level, at.lie.r)); Break(); });
  });
  If(bench.greaterThan(0), () => { Discard(); });
  return seen;
})();
const level = pileSeen.z;
carpet.colorNode = irradiance().mul(linear(COLOR.fiber)).div(Math.PI).mul(mix(0.28, 1, pow(level, 0.7))).mul(pileSeen.w.sub(0.5).mul(0.25).add(1))
  .mul(pow(glance(), 2).mul(level).mul(0.6).add(1));

const room = new THREE.Group();
scene.add(room);
function build(): void {
  for (const child of [...room.children]) { (child as THREE.Mesh).geometry.dispose(); room.remove(child); }
  room.add(new THREE.Mesh(geometryOf(light.white), white), new THREE.Mesh(geometryOf(light.dado), dado), new THREE.Mesh(geometryOf(light.felt), felt));
  room.add(new THREE.Mesh(geometryOf(light.carpet), carpet));
}
build();

// The sky: seen only through the aperture, never lit or graded. It is drawn after the room and
// behind it, so its cloud is marched only where the aperture shows it; it writes no depth.
const skyMaterial = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false });
skyMaterial.colorNode = sky.radiance(positionWorld.sub(cameraPosition));
const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(30, 48, 24), skyMaterial);
skyMesh.renderOrder = 1;
skyMesh.frustumCulled = false;
scene.add(skyMesh);

// Dust: motes wandering slowly through the room's air, seen only where the sun's beam lights them.
const hg = (nu: Node<'float'>, g: number) => float((1 - g * g) / (4 * Math.PI)).div(pow(float(1 + g * g).sub(nu.mul(2 * g)), 1.5));
const dustPhase = (nu: Node<'float'>) => mix(hg(nu, 0.6), hg(nu, -0.2), 0.35); // dust scatters forward, and some back
const motes = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
const mote = Fn(() => {
  // TSL's hash takes an integer seed: each coordinate gets its own.
  const i = float(instanceIndex).mul(4);
  const seed = vec3(hash(i), hash(i.add(1)), hash(i.add(2)));
  const rise = uTime.mul(0.006).add(seed.y.mul(3.8)).mod(3.8);
  const wander = vec3(sin(uTime.mul(0.07).add(seed.x.mul(40))), 0, cos(uTime.mul(0.05).add(seed.z.mul(40)))).mul(0.12);
  return vec3(seed.x.mul(7).sub(3.5), rise.add(0.4), seed.z.mul(7).sub(3.5)).add(wander);
})();
motes.positionNode = mote;
motes.scaleNode = float(DUST.size);
const moteLight = varying(sunThrough(mote).mul(dustPhase(dot(mote.sub(cameraPosition).normalize(), uSunDirection))));
// Each mote glints as it turns.
const glint = sin(uTime.mul(hash(float(instanceIndex).mul(4).add(3)).mul(3).add(1)).add(hash(float(instanceIndex).mul(4).add(3).add(4096 * 4)).mul(6.3))).mul(0.5).add(0.5);
motes.colorNode = uSun.mul(moteLight).mul(varying(glint.mul(glint).mul(0.9).add(0.1))).mul(2);
motes.opacityNode = float(1).sub(smoothstep(0.1, 0.5, length(uv().sub(0.5))));
const dust = new THREE.Sprite(motes);
dust.count = DUST.count;
dust.frustumCulled = false;
dust.renderOrder = 2;
scene.add(dust);

// Camera -------------------------------------------------------------------------------------------

// A full-frame camera with a 14 mm lens. The visitor sits on the bench by the west wall, leaning
// back against it, and looks across the room on the diagonal: the far bench and a strip of carpet,
// the far walls, the slot's glow, the ceiling receding, the aperture in perspective. L looks
// straight up, the plate's still frame. The camera holds still; only the visitor turns it.
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.05, 50);
camera.filmGauge = 36;
const EYE = BENCH.seat + 0.75; // m, seated
const SEATED = (() => {
  const position = new THREE.Vector3(-3.25, EYE, 1.2), yaw = THREE.MathUtils.degToRad(66), pitch = THREE.MathUtils.degToRad(25);
  const look = position.clone().add(new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)));
  return { position, look, focalLength: 14 };
})();
const UPWARD = { position: new THREE.Vector3(0, 1.15, 0.25), look: new THREE.Vector3(0, ROOM.ceiling, 0), focalLength: 18 };
let HOME = SEATED;
const view = { yaw: 0, pitch: 0 };
function resetView(): void {
  camera.setFocalLength(HOME.focalLength);
  camera.position.copy(HOME.position);
  const d = HOME.look.clone().sub(HOME.position).normalize();
  view.pitch = Math.asin(d.y);
  view.yaw = Math.atan2(d.x, -d.z);
  aim();
}
function aim(): void {
  const d = new THREE.Vector3(Math.sin(view.yaw) * Math.cos(view.pitch), Math.sin(view.pitch), -Math.cos(view.yaw) * Math.cos(view.pitch));
  camera.lookAt(camera.position.clone().add(d));
  needsRender = true;
}

// Output -------------------------------------------------------------------------------------------

// The sun's beam in the room's air: along each view ray, as far as the ceiling, the light the air
// scatters toward the eye where the sun reaches it. Then the eye's white and the tone curve; then
// SMAA on the displayed image, which touches only edges; last, a dither fixed to the screen, so slow
// gradients do not band and a held sky reads the same in every frame.
const BEAM_STEPS = 32;
const BEAM_MARGIN = 0.06; // m in the ceiling's plane: past the aperture's edge by more than the penumbra's half-width, from anywhere in the room
// The output pass draws a quad with a camera of its own: the scene camera's matrices are passed in.
const eye = uniform(camera.position), eyeWorld = uniform(camera.matrixWorld), eyeUnproject = uniform(camera.projectionMatrixInverse);
const scenePass = pass(scene, camera);
const pipeline = new THREE.RenderPipeline(renderer);
pipeline.outputColorTransform = false;
const shown = Fn(() => {
  const color = scenePass.getTextureNode().toVar();
  If(uDust.greaterThan(0), () => {
    const depth = scenePass.getTextureNode('depth').sample(screenUV).r;
    const far = eyeWorld.mul(vec4(getViewPosition(screenUV, depth, eyeUnproject), 1)).xyz.sub(eye);
    const direction = far.normalize();
    const reach = min(length(far), float(ROOM.ceiling).sub(eye.y).div(max(direction.y, 1e-3)));
    // The beam is the aperture swept along the sun's direction: a point is in it if its ray toward
    // the sun meets the ceiling's plane inside the aperture. Along the view ray that meeting point
    // moves on a straight line, so the stretch of the view ray inside the beam is found exactly, as a
    // ray against a box, and only that stretch is marched. Most of the frame's rays never enter it.
    const k = uSunDirection.xz.div(uSunDirection.y);
    const from = eye.xz.add(k.mul(float(ROOM.ceiling).sub(eye.y))), along = direction.xz.sub(k.mul(direction.y));
    const safe = max(abs(along), vec2(1e-6)).mul(step(vec2(0), along).mul(2).sub(1)); // never zero, the sign kept
    const extent = uAperture.x.add(uAperture.y).add(BEAM_MARGIN);
    const t0 = extent.negate().sub(from).div(safe), t1 = extent.sub(from).div(safe);
    const enter = max(max(min(t0.x, t1.x), min(t0.y, t1.y)), 0), exit = min(min(max(t0.x, t1.x), max(t0.y, t1.y)), reach);
    If(exit.greaterThan(enter), () => {
      const step = exit.sub(enter).div(BEAM_STEPS), jitter = interleavedGradientNoise(screenCoordinate.xy);
      const lit = float(0).toVar();
      Loop(BEAM_STEPS, ({ i }) => { lit.addAssign(sunThrough(eye.add(direction.mul(enter.add(float(i).add(jitter).mul(step)))))); });
      color.assign(vec4(color.rgb.add(uSun.mul(uDust).mul(dustPhase(dot(direction, uSunDirection))).mul(lit).mul(step)), color.a));
    });
  });
  return renderOutput(vec4(color.rgb.mul(uBalance), color.a));
})();
const antialiased = smaa(shown) as unknown as Node<'vec4'>;
pipeline.outputNode = vec4(antialiased.rgb.add(interleavedGradientNoise(screenCoordinate.xy).sub(0.5).div(255)), 1);

let needsRender = true;
resetView();

// Look around by dragging; the camera never moves on its own.
let dragging: { x: number; y: number } | null = null;
renderer.domElement.addEventListener('pointerdown', (e) => { dragging = { x: e.clientX, y: e.clientY }; renderer.domElement.setPointerCapture(e.pointerId); });
renderer.domElement.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  view.yaw -= (e.clientX - dragging.x) * 0.0025;
  view.pitch = THREE.MathUtils.clamp(view.pitch + (e.clientY - dragging.y) * 0.0025, -1.2, 1.5);
  dragging = { x: e.clientX, y: e.clientY };
  aim();
});
renderer.domElement.addEventListener('pointerup', () => { dragging = null; });
addEventListener('resize', () => {
  renderer.setPixelRatio(renderScale());
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.setFocalLength(HOME.focalLength);
  needsRender = true;
});

// Probe --------------------------------------------------------------------------------------------

// The probe reads the canvas itself, after the output transform, in the same task as the render. It
// counts while the sky's clock is held; a drifting cloud changes the sky, as a sky does.
const probeCanvas = document.createElement('canvas');
probeCanvas.width = probeCanvas.height = 16;
const probeCtx = probeCanvas.getContext('2d', { willReadFrequently: true })!;
const probe = { sky: [0, 0, 0], ceiling: [0, 0, 0], first: '', changed: 0, frames: 0 };
function readAt(point: THREE.Vector3): number[] {
  const v = point.clone().project(camera);
  const { width, height } = renderer.domElement;
  const x = Math.round((v.x * 0.5 + 0.5) * width) - 4, y = Math.round((-v.y * 0.5 + 0.5) * height) - 4;
  probeCtx.clearRect(0, 0, 8, 8);
  probeCtx.drawImage(renderer.domElement, x, y, 8, 8, 0, 0, 8, 8);
  const d = probeCtx.getImageData(0, 0, 8, 8).data;
  const mean = [0, 0, 0];
  for (let i = 0; i < 64; i++) for (let c = 0; c < 3; c++) mean[c] += d[i * 4 + c] / 64;
  return mean.map((m) => Math.round(m * 10) / 10);
}
function resetProbe(): void { probe.frames = 0; probe.changed = 0; }
// Reading the canvas back makes the CPU wait for the GPU. So it is read on every drawn frame only
// while the probe counts, with the sky held, and otherwise twice a second while the panel shows it.
let probed = -Infinity;
function sampleProbe(now: number): void {
  if (!state.hold && (panel.hidden || now - probed < 500)) return;
  probed = now;
  const plan = planOf(state.shape);
  probe.sky = readAt(new THREE.Vector3(0, ROOM.ceiling + 0.5, 0));
  probe.ceiling = readAt(new THREE.Vector3(plan.aperture.spine + plan.aperture.radius + 0.06, ROOM.ceiling, 0));
  if (!state.hold) return;
  const key = probe.sky.join(',');
  if (probe.frames === 0) probe.first = key;
  else if (key !== probe.first) probe.changed++;
  probe.frames++;
}

// Panel and keys -----------------------------------------------------------------------------------

const panel = document.querySelector<HTMLElement>('#panel')!;
const readout = document.querySelector<HTMLElement>('#readout')!;
hint.textContent = 'SAME SKY · the room · H for controls';
setTimeout(() => hint.classList.add('gone'), 3000);
function describe(): void {
  const near = BOOKMARKS.reduce((a, b) => (Math.abs(b.sun - state.sun) < Math.abs(a.sun - state.sun) ? b : a));
  const zenith = sky.clearRadiance(new THREE.Vector3(0, 1, 0)).y;
  readout.textContent = [
    `backend    ${(renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'WebGPU' : 'WebGL 2'} · loaded in ${loadMs.toFixed(0)} ms · ${state.solving ? 'solving the other plan…' : `${state.shape} plan, light solved in ${light.seconds.toFixed(1)} s`} · ${device ? `${gpuMs.toFixed(1)} ms a frame, ` : ''}drawn ${drawnMs > 0 ? Math.round(1000 / drawnMs) : 0} times a second`,
    `wash       ${stripLevel(state.sun) > 0 ? `${WASHES[state.wash].name} · ${(state.intensity * stripLevel(state.sun)).toFixed(3)} linear at the aperture's edge${state.switched || program(state.sun) >= 1 ? '' : ', as the program brings it up'}` : 'off: the program brings it up as the sun nears the horizon; 1–6 switch it on now'}`,
    `sun        ${state.sun.toFixed(1)}° · near ${near.name}, ${near.about} · zenith about ${zenith.toPrecision(3)} cd/m², exposed ${sky.uniforms.exposure.value.toPrecision(3)}, the room ${roomExposure(state.sun).toPrecision(3)} · ${state.playing ? 'setting' : 'still'} · cloud ${state.hold ? `held at ${sky.time.toFixed(1)} s` : `drifting, ${sky.time.toFixed(0)} s`}`,
    `probe      sky ${probe.sky.join(' ')} · ceiling at the edge ${probe.ceiling.join(' ')} · ${state.hold ? `sky changed in ${probe.changed} of ${probe.frames} frames` : 'hold the sky (T) to count'}`,
  ].join('\n');
}

addEventListener('keydown', async (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const digit = Number(event.key);
  if (Number.isInteger(digit) && digit >= 1 && digit <= WASHES.length) { state.wash = digit - 1; state.switched = true; }
  else if (event.code === 'ArrowUp') { state.intensity *= 2 ** 0.25; state.switched = true; }
  else if (event.code === 'ArrowDown') { state.intensity /= 2 ** 0.25; state.switched = true; }
  else if (event.code === 'KeyS') {
    const next = BOOKMARKS.find((b) => b.sun < state.sun - 0.01) ?? BOOKMARKS[0];
    state.playing = false;
    setSun(next.sun);
    resetProbe();
  } else if (event.code === 'KeyP') state.playing = !state.playing;
  else if (event.code === 'BracketLeft') setSun(Math.max(state.sun - 0.5, BOOKMARKS[BOOKMARKS.length - 1].sun));
  else if (event.code === 'BracketRight') setSun(Math.min(state.sun + 0.5, BOOKMARKS[0].sun));
  else if (event.code === 'KeyT') { state.hold = !state.hold; resetProbe(); }
  else if (event.code === 'KeyR') resetView();
  else if (event.code === 'KeyL') { HOME = HOME === SEATED ? UPWARD : SEATED; resetView(); resetProbe(); }
  else if (event.code === 'KeyO' && !state.solving) {
    state.solving = true;
    describe();
    const shape: Shape = state.shape === 'square' ? 'circle' : 'square';
    light = await solve(shape);
    state.shape = shape;
    state.solving = false;
    setPlan();
    build();
    resetProbe();
  } else if (event.code === 'KeyH') panel.hidden = !panel.hidden;
  else return;
  event.preventDefault();
  needsRender = true;
  describe();
});

// A frame is drawn at once when something asks for one: a key, a drag, a resize, and the first
// frames, while the pipelines compile. Continuous change, the cloud drifting, the wash easing, the
// sun setting, is drawn CALM times a second: the cloud crosses about two css pixels a second, and
// drawing it at the display's rate only heats the machine. With the sky's clock held and nothing
// easing, nothing is drawn.
const CALM = 30;
const device = (renderer.backend as { device?: { queue: { onSubmittedWorkDone(): Promise<void> } } }).device;
let gpuMs = 0, drawnMs = 0;
let warmup = 30;
let last = performance.now();
renderer.setAnimationLoop((now) => {
  const goal = stripFor(state.wash, state.intensity);
  const current = uStrip.value;
  const easing = Math.max(Math.abs(goal.x - current.x), Math.abs(goal.y - current.y), Math.abs(goal.z - current.z)) > SETTLED;
  const changing = easing || !state.hold;
  if (warmup > 0) { warmup--; needsRender = true; }
  if (!needsRender && !(changing && now - last >= 1000 / CALM - 2)) {
    if (!easing && !current.equals(goal)) { current.copy(goal); needsRender = true; }
    return;
  }
  const dt = Math.min((now - last) / 1000, 1.5 / CALM);
  drawnMs += (now - last - drawnMs) * 0.1;
  last = now;
  if (easing) current.set(damp(current.x, goal.x, WASH_HALF_LIFE, dt), damp(current.y, goal.y, WASH_HALF_LIFE, dt), damp(current.z, goal.z, WASH_HALF_LIFE, dt));
  if (!state.hold) {
    sky.advance(dt);
    uTime.value = sky.time;
    if (state.playing) {
      const end = BOOKMARKS[BOOKMARKS.length - 1].sun;
      setSun(Math.max(state.sun - PASSAGE * dt, end));
      if (state.sun <= end) state.playing = false;
    }
  }
  needsRender = false;
  // Render and GPU in series, from the render call to the queue's completion; WebGPU only.
  const submitted = performance.now();
  pipeline.render();
  device?.queue.onSubmittedWorkDone().then(() => { gpuMs += (performance.now() - submitted - gpuMs) * 0.1; });
  sampleProbe(now);
  if (!panel.hidden) describe();
});
describe();

Object.assign(window, {
  plates: {
    camera, scene, renderer, pipeline, state, probe, view, sky, aim, setSun, roomExposure, skyExposure, balanceAt, light: () => light,
    uniforms: { uStrip, uSky, uSun, uDust, uTime, uSunsA, uSunsB, uBalance },
    render: () => { needsRender = true; },
    settle: () => { uStrip.value.copy(stripFor(state.wash, state.intensity)); },
  },
});
