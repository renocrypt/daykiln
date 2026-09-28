// WAKE, frozen still: the first look-development frame.
//
// Time frozen inside the field. A herring gull's successive phases sweep diagonally through a lattice of
// smoke threads across its path, a wall of them through each phase, which its wake has bent down and
// wound into curls where its wingtips passed (threads.ts), and the flight runs on past the frame's edge. The phases are cast in
// bronze after Marey's 1887 gull; the air is a late afternoon sky over the sea, with a low, hard sun from
// the side and no ground.

import * as THREE from 'three/webgpu';
import { Fn, convertToTexture, float, interleavedGradientNoise, mix, pass, positionWorldDirection, pow, renderOutput, screenCoordinate, smoothstep, vec3, vec4 } from 'three/tsl';
import type { Node } from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { lensBlur } from '../../src/post/lens-blur.ts';
import { Sky } from '../../src/same-sky/sky.ts';
import type { NoiseData } from '../../src/same-sky/noise.ts';
import { GULL, loading } from '../../src/wake/gull.ts';
import { BOB, PHASE_INTERVAL, POSES } from '../../src/wake/flight.ts';
import { castGull, cutoutMaterial, loadGull, skeleton } from './bird.ts';
import { loadThreads, uLens, uSkyLight, uSun, uSunDirection } from './threads.ts';

const BRONZE = new THREE.Color().setRGB(0.3, 0.2, 0.12); // patinated cast bronze's reflectance

const params = new URLSearchParams(location.search);
const renderer = new THREE.WebGPURenderer({ antialias: false, forceWebGL: params.has('webgl') });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.NeutralToneMapping; // keeps the sky's color; the meter (below) keeps the glare in range
document.body.prepend(renderer.domElement);
await renderer.init();

const scene = new THREE.Scene();

// The sky: SAME SKY's (src/same-sky/sky.ts), baked from a spectral model of the atmosphere, with a
// layer of altocumulus, at any of its baked hours from the afternoon to twilight. Below the horizon lies the
// sea: its water's own dark slate, and the sky it reflects, fully only at grazing. The frame is a frozen
// moment, so its cloud holds still: the sky is drawn once into a cube whenever the sun moves, and that
// cube is the camera's background and the light the bronze reflects.
/** The hours the sky was baked for, by the sun's elevation in degrees; S steps through them. */
const HOURS = [
  { name: 'afternoon', sun: 25 }, { name: 'late afternoon', sun: 12 }, { name: 'golden hour', sun: 5 }, { name: 'sunset', sun: 1.5 },
  { name: 'afterglow', sun: -1 }, { name: 'dusk', sun: -2.5 }, { name: 'twilight', sun: -4 },
];
let hour = 1; // late afternoon: a low sun, from the side
/** How far the exposure follows the sky as it darkens: as an eye, partly, so dusk still reads as dusk. */
const ADAPTATION = 0.75;
const SEA = new THREE.Color().setRGB(0.03, 0.038, 0.044); // the water's own light
// In the afternoon the sky is exposed to put its zenith where LOOK.md's sea sky had its upper air, #8d8f95.
const ZENITH = 0.275;
const noise = await new Promise<NoiseData>((resolve) => {
  const worker = new Worker(new URL('../../src/same-sky/noise-worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (event) => { resolve(event.data as NoiseData); worker.terminate(); };
});
const heavens = await Sky.load('/plates/assets/same-sky/', noise);
const luminance = (v: THREE.Vector3) => 0.2126 * v.x + 0.7152 * v.y + 0.0722 * v.z;
let exposure = 1;
heavens.elevation = HOURS[hour].sun;
heavens.set({ cloud: { base: 3600, top: 3900, coverage: 0.42, extinction: 0.03 }, sunAzimuth: 0, wind: [0, 0], exposure: () => exposure });
/** The light seen looking in a direction: the sky, or below the horizon the sea. */
const looking = (direction: Node<'vec3'>) => {
  const sky = heavens.radiance(vec3(direction.x, direction.y.abs(), direction.z));
  // Water reflects 2% of the light square on, and more toward grazing (Schlick).
  const reflected = float(0.02).add(pow(float(1).add(direction.y.min(0)), 5).mul(0.98));
  return mix(vec3(SEA.r, SEA.g, SEA.b).add(sky.mul(reflected)), sky, smoothstep(-0.01, 0.002, direction.y));
};
const skyScene = new THREE.Scene();
{
  const dome = new THREE.Mesh(new THREE.SphereGeometry(50, 64, 32), new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide }));
  (dome.material as THREE.MeshBasicNodeMaterial).colorNode = looking(positionWorldDirection);
  skyScene.add(dome);
}
const skyCube = new THREE.CubeRenderTarget(1536, { type: THREE.HalfFloatType });
const skyCamera = new THREE.CubeCamera(1, 100, skyCube);
scene.background = skyCube.texture;
const reflections = new THREE.PMREMGenerator(renderer);
let environment: THREE.RenderTarget | null = null;
/** Draw the sky for the sun as it now is, and light the bronze and the smoke by it. */
function lightFromSky(toward: THREE.Vector3): void {
  heavens.setting.sunAzimuth = Math.atan2(toward.z, toward.x);
  const elevation = HOURS[hour].sun, zenith = (e: number) => luminance(heavens.clearRadiance(new THREE.Vector3(0, 1, 0), e));
  exposure = (ZENITH / zenith(HOURS[0].sun)) * (zenith(HOURS[0].sun) / zenith(elevation)) ** ADAPTATION;
  heavens.set(heavens.setting);
  heavens.setSun(elevation);
  const light = heavens.sunAt(elevation).multiplyScalar(exposure);
  sun.intensity = luminance(light);
  if (sun.intensity > 0) sun.color.setRGB(light.x / sun.intensity, light.y / sun.intensity, light.z / sun.intensity);
  skyCamera.update(renderer, skyScene);
  environment = reflections.fromCubemap(skyCube.texture, environment);
  scene.environment = environment.texture;
  // The smoke's light: the sun's, and the sky's from all round, as the zenith's radiance.
  uSun.value.set(sun.color.r, sun.color.g, sun.color.b).multiplyScalar(sun.intensity);
  uSkyLight.value.copy(heavens.clearRadiance(new THREE.Vector3(0, 1, 0))).multiplyScalar(exposure);
}

/**
 * The camera's meter: the mean light over the frame, sampled on the sky and the sea it looks at, sets the
 * exposure, as a camera's does, so looking toward the sun stops down and looking away opens up. It
 * follows only partly, so a bright view still reads bright.
 */
const METER = 0.18; // the mean light a view is exposed to: middle grey
const METER_FOLLOW = 0.95;
function meter(): number {
  const dir = new THREE.Vector3(), up = new THREE.Vector3(), total = { light: 0, n: 0 };
  camera.updateMatrixWorld();
  for (let i = 0; i < 7; i++) {
    for (let j = 0; j < 5; j++) {
      dir.set((i / 6) * 2 - 1, (j / 4) * 2 - 1, 0.5).unproject(camera).sub(camera.position).normalize();
      up.set(dir.x, Math.abs(dir.y), dir.z);
      const sky = luminance(heavens.clearRadiance(up)) * exposure;
      const light = dir.y >= 0 ? sky : 0.2126 * SEA.r + 0.7152 * SEA.g + 0.0722 * SEA.b + sky * (0.02 + 0.98 * (1 + dir.y) ** 5);
      total.light += light;
      total.n++;
    }
  }
  return Math.min(2, Math.max(0.12, (METER / (total.light / total.n)) ** METER_FOLLOW));
}

// The sun: low and hard, from the side. Nothing in the scene casts a shadow map: the phases shadow
// nothing (see bird.ts).
const sun = new THREE.DirectionalLight();
scene.add(sun, sun.target);

// A full-frame camera with a wide lens, inside the field among the threads.
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.05, 200);
camera.filmGauge = 36;
camera.setFocalLength(24);

const poses = POSES, gull = GULL;

// The frozen phases, cast. B takes them out of the frame: the air keeps what the bird did to it.
const gullCast = await loadGull();
const bronze = new THREE.MeshPhysicalNodeMaterial({ color: BRONZE, metalness: 1, roughness: 0.46 }); // cast and patinated, not polished: it keeps its color toward grazing
/**
 * One material per cut-out channel, made once. The feathers' thin blades (channel 0) are left rougher: flat
 * blades seen near edge on would mirror the bright sky at the horizon whole, and read as white feathers.
 */
const byCutout = (base: THREE.MeshPhysicalNodeMaterial) => {
  const made = new Map<number, THREE.Material>();
  return (cutout: number) => {
    if (!made.has(cutout)) {
      const m = cutoutMaterial(base, gullCast, cutout);
      if (cutout === 0) m.roughness = 0.62;
      made.set(cutout, m);
    }
    return made.get(cutout)!;
  };
};
const phases = new THREE.Group();
const bronzeFor = byCutout(bronze);
for (const pose of poses) phases.add(castGull(gullCast, pose, -BOB * loading(pose.phase), bronzeFor));
scene.add(phases);

// The smoke, among the phases in the scene itself: it writes no depth, so the phases hide it and it
// veils them, each as it lies.
const wisps = await loadThreads('/plates/assets/wake/threads.bin');
scene.add(wisps.smoke);

// The field round the phases, for placing the sun's light.
const field = new THREE.Box3();
for (const pose of poses) field.expandByPoint(new THREE.Vector3(...pose.position));
field.expandByScalar(1.2);
/** Place the sun toward a direction from the field: its azimuth, at the hour's elevation. */
let sunToward = new THREE.Vector3();
function aimSun(toward: THREE.Vector3): void {
  sunToward = toward.clone();
  const center = field.getCenter(new THREE.Vector3());
  const size = field.getSize(new THREE.Vector3()).length();
  const e = THREE.MathUtils.degToRad(HOURS[hour].sun), a = Math.atan2(toward.z, toward.x);
  const direction = new THREE.Vector3(Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a));
  uSunDirection.value.copy(direction);
  sun.position.copy(center).addScaledVector(direction, size);
  sun.target.position.copy(center);
  lightFromSky(direction);
}
// Toward the sun: a side light, from behind the camera's left, so the bronze and the smoke are lit from
// the side, not from behind.
aimSun(new THREE.Vector3(-0.46, 0.58, 0.67));

// The overlay test (LOOK.md): the phases' skeletons alone, drawn over the beauty frame.
const overlay = new THREE.Scene();
{
  const bones = new THREE.LineBasicMaterial({ color: 0x20c0ff });
  for (const pose of poses) {
    const g = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(skeleton(pose), 3)), bones);
    g.position.set(...pose.position);
    g.rotation.z = pose.pitch;
    overlay.add(g);
  }
  // And the threads' middles, where the smoke is drawn.
  overlay.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(wisps.lines, 3)), new THREE.LineBasicMaterial({ color: 0xff8a3d })));
}

// Post: depth of field through the lens, output, fine grain.
const scenePass = pass(scene, camera);
// The frame as the pinhole sees it, drawn once, for the lens to blur or to show as it is.
const frame = convertToTexture(scenePass.getTextureNode());
const lens = lensBlur(frame, scenePass.getTextureNode('depth'), camera);
lens.fNumber = 5.6;
// The overlay's lines are drawn after tone mapping, in full color, over the finished frame.
const overlayPass = pass(overlay, camera);
const pipeline = new THREE.RenderPipeline(renderer);
pipeline.outputColorTransform = false;
// The output is built for what is on: passes that nothing reads are not rendered, so with the lens off
// its blur costs nothing, and the overlay costs nothing until it is shown.
const outputs = new Map<string, THREE.Node>();
function useOutput(): void {
  const key = `${state.dof}:${state.overlay}`;
  let node = outputs.get(key);
  if (!node) {
    const withLens = state.dof, withOverlay = state.overlay;
    node = Fn(() => {
      const display = renderOutput(withLens ? lens : frame);
      let rgb = display.rgb;
      if (withOverlay) { const lines = overlayPass.getTextureNode(); rgb = mix(rgb, lines.rgb, lines.a); }
      return vec4(rgb.add(interleavedGradientNoise(screenCoordinate.xy).sub(0.5).mul(1.5 / 255)), 1);
    })();
    outputs.set(key, node);
  }
  pipeline.outputNode = node;
  pipeline.needsUpdate = true;
}

// View --------------------------------------------------------------------------------------------

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxDistance = 8; // m from the target: inside the field, not an overview of it
// The composition (LOOK.md's crop test): inside the field, below the flight and among the threads,
// looking up so no horizon shows. The phases cross the frame on a diagonal, the oldest broken by the
// top-left edge, the leading one in the lower right third.
const middle = new THREE.Vector3(...poses[Math.floor(poses.length / 2)].position);
const HOME = { from: middle.clone().add(new THREE.Vector3(-0.14, -0.9, 0.8)), to: new THREE.Vector3(middle.x + 1.76, middle.y + 0.5, -0.2), focalLength: 22 };
const focusPoint = HOME.to.clone();
function resetView(): void {
  camera.setFocalLength(HOME.focalLength);
  controls.target.copy(HOME.to);
  camera.position.copy(HOME.from);
  focusPoint.copy(HOME.to);
  controls.update();
}
resetView();

const state = { overlay: false, dof: true, bird: true };
useOutput();
let needsRender = true;
controls.addEventListener('change', () => { needsRender = true; });
addEventListener('resize', () => {
  // The lens stays the same lens: its focal length is read before the film's height changes with the aspect.
  const focalLength = camera.getFocalLength();
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.setFocalLength(focalLength);
  needsRender = true;
});

const panel = document.querySelector<HTMLElement>('#panel')!;
const readout = document.querySelector<HTMLElement>('#readout')!;
const hint = document.querySelector<HTMLElement>('#hint')!;
hint.textContent = 'WAKE · frozen still · H for controls';
setTimeout(() => hint.classList.add('gone'), 3000);
function describe(): void {
  readout.textContent = [
    `backend   ${(renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'WebGPU' : 'WebGL 2'}`,
    `gull      herring gull · ${gull.speed} m/s · ${gull.frequency} Hz · span ${gull.span} m`,
    `phases    ${poses.length}, one every ${(PHASE_INTERVAL * 1000).toFixed(1)} ms · spacing ${(gull.speed * PHASE_INTERVAL).toFixed(3)} m`,
    `sky       ${HOURS[hour].name} · the sun ${HOURS[hour].sun}° · S for the next hour`,
    `lens      ${camera.getFocalLength().toFixed(0)} mm · f/${lens.fNumber} · overlay ${state.overlay ? 'on' : 'off'} · bird ${state.bird ? 'in the frame' : 'gone'}`,
  ].join('\n');
}
addEventListener('keydown', (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  switch (event.code) {
    case 'KeyO': state.overlay = !state.overlay; useOutput(); break;
    case 'KeyD': state.dof = !state.dof; lens.enabled = state.dof; useOutput(); break;
    case 'KeyB': state.bird = !state.bird; phases.visible = state.bird; break;
    case 'KeyR': resetView(); break;
    case 'KeyS': hour = (hour + (event.shiftKey ? HOURS.length - 1 : 1)) % HOURS.length; aimSun(sunToward); break;
    case 'KeyH': panel.hidden = !panel.hidden; break;
    default: return;
  }
  event.preventDefault();
  needsRender = true;
  describe();
});

let warmup = 30;
const drawing = new THREE.Vector2();
// For look development: called once, just after the next frame is drawn, while it can still be read.
let afterFrame: (() => void) | null = null;
renderer.setAnimationLoop(() => {
  const moving = controls.update();
  if (warmup > 0) { warmup--; needsRender = true; }
  if (!moving && !needsRender) return;
  needsRender = false;
  camera.updateMatrixWorld();
  lens.focusDistance = -focusPoint.clone().applyMatrix4(camera.matrixWorldInverse).z;
  // The threads are drawn as wide as this lens images them.
  uLens.focal.value = camera.getFocalLength() / 1000;
  uLens.aperture.value = state.dof ? uLens.focal.value / lens.fNumber : 0;
  uLens.focus.value = lens.focusDistance;
  uLens.pixel.value = (2 * Math.tan(THREE.MathUtils.degToRad(camera.getEffectiveFOV()) / 2)) / renderer.getDrawingBufferSize(drawing).y;
  renderer.toneMappingExposure = meter();
  pipeline.render();
  if (afterFrame) { const then = afterFrame; afterFrame = null; then(); }
  if (!panel.hidden) describe();
});
describe();

Object.assign(window, {
  plates: {
    camera, controls, scene, renderer, sun, lens, state, poses, phases, focusPoint,
    aimSun: (x: number, y: number, z: number) => { aimSun(new THREE.Vector3(x, y, z)); needsRender = true; },
    render: () => { needsRender = true; },
    /** Draw a frame, then call back while the canvas still holds it. */
    afterFrame: (then: () => void) => { afterFrame = then; needsRender = true; },
    /** Place the camera at `from`, looking at `to`, with a focal length in mm; focus on `to`. */
    view: (from: [number, number, number], to: [number, number, number], mm = 24) => {
      camera.setFocalLength(mm);
      controls.target.set(...to);
      camera.position.set(...from);
      controls.update();
      focusPoint.set(...to);
      needsRender = true;
    },
  },
});
