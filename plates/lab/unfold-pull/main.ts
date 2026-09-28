// UNFOLD, the first slice of the experience: one meridian cut, and the pull.
//
// Coronelli's globe is cut along the meridian through the Pacific, between gores 6 and 7, and
// relaxes onto Mercator's projection: the sphere settles onto a cylinder with Mercator's northing,
// and the cylinder unbends about the central meridian, so the cut opens as the map flattens. The
// pull then moves the map continuously toward Lambert's cylindrical equal-area projection. Tissot's
// circles are drawn on the paper, so the map draws its own distortion as it changes: round and
// unequal at one end, equal and sheared at the other, both in between. The calottes, which no
// cylindrical projection can hold, lift off the poles and flatten into the discs they were printed
// as. See src/unfold/projection.ts; every displacement here is that file's formula, on the GPU.

import * as THREE from 'three/webgpu';
import type { Node } from 'three/webgpu';
import {
  Fn, abs, attribute, builtinAOContext, cameraViewMatrix, cos, cross, dot, faceDirection, float, floor, fract,
  frontFacing, fwidth, interleavedGradientNoise, length, log, max, mix, mrt, mx_fractal_noise_float, normalView,
  pass, positionView, renderOutput, screenCoordinate, screenUV, select, sign, sin, smoothstep, tan, uniform, uv, varying, vec2, vec3, vec4,
} from 'three/tsl';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { damp } from '../../src/core/damp.ts';
import { beforeNeutral } from '../../src/core/tone.ts';
import { lensBlur } from '../../src/post/lens-blur.ts';
import { CALOTTE_LATITUDE, R, mapFrame, northing, scaleFactors } from '../../src/unfold/projection.ts';
import { Print, deg, goreShape, calotteShape, goreWest, sheetName, sphere } from '../unfold-lookdev/sheets.ts';
import type { SheetInfo } from '../unfold-lookdev/sheets.ts';
import { DEFAULT_STUDIO, studioScene } from '../unfold-lookdev/studio.ts';

const LAMBDA0 = deg(30); // the map's central meridian: the cut runs opposite, between gores 6 and 7
const FRAME = mapFrame(LAMBDA0);
const CALOTTE_ROTATION: Record<number, number> = { 25: deg(90.1), 26: deg(86.26) };
const UNFOLD_HALF_LIFE = 0.7; // s: the unfolding settles in about four seconds, an explanatory move
const PULL_HALF_LIFE = 0.3; // s, LOOK.md's state half-life for UNFOLD
const FOCAL_LENGTH = 105;

const FIELD = new THREE.Color('#ecebe7');
const INK = new THREE.Color('#1f1d1a');

// Renderer, studio, camera ------------------------------------------------------------------------

const params = new URLSearchParams(location.search);
const renderer = new THREE.WebGPURenderer({ antialias: false, forceWebGL: params.has('webgl') });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.prepend(renderer.domElement);
await renderer.init();

const scene = new THREE.Scene();
scene.background = beforeNeutral(FIELD);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(studioScene(DEFAULT_STUDIO), 0.02).texture;

const camera = new THREE.PerspectiveCamera(16, innerWidth / innerHeight, 0.05, 40);
camera.filmGauge = 36;
camera.setFocalLength(FOCAL_LENGTH);

// A low raking key over the map's face, from the upper left.
const key = new THREE.DirectionalLight(new THREE.Color().setRGB(1, 0.97, 0.93), 2.6);
key.position.set(FRAME.p0[0] - 3, 2.2, FRAME.p0[2] + 2.5);
key.target.position.set(FRAME.p0[0], 0, FRAME.p0[2]);
key.castShadow = true;
key.shadow.mapSize.set(4096, 4096);
Object.assign(key.shadow.camera, { left: -2.4, right: 2.4, top: 2.4, bottom: -2.4, near: 0.5, far: 12 });
key.shadow.bias = -0.0002;
key.shadow.normalBias = 0.003;
scene.add(key, key.target);

// The unfolding, on the GPU ------------------------------------------------------------------------

const uUnfold = uniform(0);
const uPull = uniform(0);
const uTissot = uniform(1);
const TISSOT_RADIUS = deg(2.4);
const INK_WIDTH = 0.00035 / R; // 0.35 mm on the globe, in radians of arc

const p0 = vec3(...FRAME.p0), t0 = vec3(...FRAME.t0), n0 = vec3(...FRAME.n0);
const s1 = smoothstep(0, 0.5, uUnfold), s2 = smoothstep(0.5, 1, uUnfold);
const northingNode = (phi: Node<'float'>) => mix(log(tan(phi.mul(0.5).add(Math.PI / 4))), sin(phi), uPull);

/** A gore's point at (λ, φ): the formula of gorePoint in src/unfold/projection.ts. */
function gorePlace(lambda: Node<'float'>, phi: Node<'float'>, wrap: number): Node<'vec3'> {
  const onSphere = vec3(cos(phi).mul(sin(lambda)), sin(phi), cos(phi).mul(cos(lambda))).mul(R);
  const kappa = max(float(1).sub(s2).div(R), 1e-4);
  const b = lambda.sub(LAMBDA0).add(wrap).mul(R);
  const along = sin(kappa.mul(b)).div(kappa), inward = float(1).sub(cos(kappa.mul(b))).div(kappa);
  const cylinder = p0.add(t0.mul(along)).sub(n0.mul(inward));
  const onCylinder = vec3(cylinder.x, northingNode(phi).mul(R), cylinder.z);
  return mix(onSphere, onCylinder, s1);
}

/** A calotte's point: lifted off its pole, then flattened into its printed disc beside the map. */
function calottePlace(lambda: Node<'float'>, phi: Node<'float'>, north: boolean): Node<'vec3'> {
  const sgn = north ? 1 : -1;
  const onSphere = vec3(cos(phi).mul(sin(lambda)), sin(phi), cos(phi).mul(cos(lambda))).mul(R);
  const lifted = onSphere.add(vec3(0, sgn * 0.25, 0).mul(s1));
  const edge = northingNode(float(CALOTTE_LATITUDE)).mul(R);
  const discRadius = R * (Math.PI / 2 - CALOTTE_LATITUDE);
  const centre = vec3(FRAME.p0[0], edge.add(0.12 + discRadius).mul(sgn), FRAME.p0[2]);
  const r = float(Math.PI / 2).sub(abs(phi)).mul(R);
  const a = lambda.sub(LAMBDA0);
  const disc = centre.add(t0.mul(r.mul(sin(a)))).add(vec3(0, -sgn, 0).mul(r.mul(cos(a))));
  return mix(lifted, disc, s2);
}

/**
 * Bump from a procedural height, in meters, by screen-space derivatives (Mikkelsen's
 * perturbNormalArb), about a given view-space normal.
 */
function bumpNormal(height: Node<'float'>, base: Node<'vec3'>) {
  const sx = positionView.dFdx();
  const sy = positionView.dFdy();
  const r1 = cross(sy, base);
  const r2 = cross(base, sx);
  const det = dot(sx, r1).mul(faceDirection);
  const grad = sign(det).mul(r1.mul(height.dFdx()).add(r2.mul(height.dFdy())));
  return base.mul(abs(det)).sub(grad).normalize();
}

const tissotInk = Fn(() => {
  const geo = attribute('geo', 'vec2');
  const latC = floor(geo.y.div(deg(10))).add(0.5).mul(deg(10));
  const cell = select(abs(latC).greaterThan(deg(60)), float(deg(30)), float(deg(10)));
  const lonC = floor(geo.x.div(cell)).add(0.5).mul(cell);
  const d = length(vec2(geo.x.sub(lonC).mul(cos(latC)), geo.y.sub(latC)));
  const ring = abs(d.sub(TISSOT_RADIUS));
  return float(1).sub(smoothstep(float(INK_WIDTH / 2), fwidth(ring).add(INK_WIDTH / 2), ring)).mul(uTissot);
});

/** The projection's own graticule, every 10°, as hairlines a device pixel wide over the print. */
const graticule = Fn(() => {
  const geo = attribute('geo', 'vec2');
  const line = (coordinate: Node<'float'>) => {
    const distance = abs(fract(coordinate.div(deg(10)).add(0.5)).sub(0.5)).mul(deg(10));
    return float(1).sub(smoothstep(float(0), fwidth(coordinate).mul(1.2), distance));
  };
  return max(line(geo.x), line(geo.y)).mul(smoothstep(0.35, 0.8, uUnfold)).mul(0.8);
});

function sheetMaterial(print: Node<'vec4'>, metersPerUV: THREE.Vector2, place: (l: Node<'float'>, p: Node<'float'>) => Node<'vec3'>, tissot: boolean): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, roughness: 0.9, alphaTest: 0.5 });
  const geo = attribute('geo', 'vec2');
  const e = 1e-3;
  // Keep the finite differences off the poles, where every longitude meets.
  const phi = geo.y.clamp(-deg(89.9), deg(89.9));
  m.positionNode = place(geo.x, phi);
  const east = place(geo.x.add(e), phi).sub(place(geo.x.sub(e), phi));
  const north = place(geo.x, phi.add(e)).sub(place(geo.x, phi.sub(e)));
  const worldNormal = varying(cross(east, north).normalize());
  const viewNormal = cameraViewMatrix.mul(vec4(worldNormal, 0)).xyz.normalize();
  // Laid paper, as on the look-development frame.
  const sheet = uv().mul(vec2(metersPerUV.x, metersPerUV.y));
  const footprint = fwidth(sheet.y);
  const laid = sheet.y.mul((Math.PI * 2) / 0.0011).sin().mul(0.000008).mul(float(1).sub(smoothstep(0.0003, 0.0006, footprint)));
  const chain = smoothstep(0.08, 0.0, abs(fract(sheet.x.div(0.025)).sub(0.5))).mul(0.000015);
  const fiber = mx_fractal_noise_float(vec3(sheet.mul(900), 0), 4, 2.1, 0.55).mul(0.000006).mul(float(1).sub(smoothstep(0.0002, 0.0005, footprint)));
  m.normalNode = bumpNormal(laid.add(chain).add(fiber), viewNormal);
  const ink = vec3(INK.r, INK.g, INK.b);
  const withTissot = tissot ? mix(print.rgb, ink, tissotInk().mul(0.95)) : print.rgb;
  const front = mix(withTissot, ink, graticule());
  const back = mix(vec3(0.8), print.rgb, 0.08);
  m.colorNode = select(frontFacing, front, back);
  m.opacityNode = print.a;
  return m;
}

// Sheets --------------------------------------------------------------------------------------------

const anisotropy = renderer.getMaxAnisotropy();
const infos = (await Promise.all(Array.from({ length: 26 }, (_, i) =>
  fetch(`/plates/assets/unfold/${sheetName(i + 1)}.json`).then((r) => (r.ok ? (r.json() as Promise<SheetInfo>) : null))))).filter((i): i is SheetInfo => i !== null);
const prints: Print[] = [];
for (const info of infos) {
  const print = new Print(info, anisotropy);
  prints.push(print);
  let mesh: THREE.Mesh;
  if (info.kind === 'gore') {
    // The gore's longitudes, unwrapped once so the whole gore lies on one side of the cut.
    const centre = goreWest(info.piece) + deg(15) - LAMBDA0;
    const wrap = -2 * Math.PI * Math.round(centre / (2 * Math.PI));
    const shape = goreShape(info, { cols: 32, lines: 160 });
    mesh = new THREE.Mesh(shape.geometry, sheetMaterial(print.node, shape.metersPerUV, (l, p) => gorePlace(l, p, wrap), true));
  } else {
    const shape = calotteShape(info, CALOTTE_ROTATION[info.piece]);
    mesh = new THREE.Mesh(shape.geometry, sheetMaterial(print.node, shape.metersPerUV, (l, p) => calottePlace(l, p, info.hemisphere === 'north'), false));
  }
  mesh.frustumCulled = false; // positions are the vertex shader's, not the buffer's
  mesh.castShadow = mesh.receiveShadow = true;
  scene.add(mesh);
}
await Promise.all(prints.map((p) => p.showNow(1)));

// Post: ambient occlusion, then depth of field through the lens, output, grain.
const prePass = pass(scene, camera);
prePass.setMRT(mrt({ output: normalView }));
const aoPass = ao(prePass.getTextureNode('depth'), prePass.getTextureNode(), camera);
aoPass.resolutionScale = 0.5;
const scenePass = pass(scene, camera);
scenePass.contextNode = builtinAOContext(aoPass.getTextureNode().sample(screenUV).r);
const lens = lensBlur(scenePass.getTextureNode(), scenePass.getTextureNode('depth'), camera);
lens.fNumber = 2.8;
const pipeline = new THREE.RenderPipeline(renderer);
pipeline.outputColorTransform = false;
pipeline.outputNode = Fn(() => {
  const display = renderOutput(lens);
  return vec4(display.rgb.add(interleavedGradientNoise(screenCoordinate.xy).sub(0.5).mul(1.5 / 255)), 1);
})();

// View, state, interaction ------------------------------------------------------------------------

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.rotateSpeed = 0.6;
controls.minDistance = 1.2;
controls.maxDistance = 16;

const GLOBE_VIEW = sphere(deg(12), LAMBDA0 + deg(8), 2.9);
/**
 * The map's view: square to its face, far enough back to hold Mercator's map, the tallest, and its
 * discs. It does not move with the pull: every cylindrical projection keeps the equator and the
 * longitudes, so only the latitudes should be seen to change.
 */
function mapView(): { position: THREE.Vector3; target: THREE.Vector3 } {
  const height = 2 * (R * northing(CALOTTE_LATITUDE, 0) + 0.12 + 2 * R * (Math.PI / 2 - CALOTTE_LATITUDE));
  const width = 2 * Math.PI * R;
  const vertical = 2 * Math.atan(camera.getFilmHeight() / 2 / FOCAL_LENGTH);
  const horizontal = 2 * Math.atan(camera.getFilmWidth() / 2 / FOCAL_LENGTH);
  const distance = Math.max((height * 1.12) / 2 / Math.tan(vertical / 2), (width * 1.1) / 2 / Math.tan(horizontal / 2));
  const target = new THREE.Vector3(...FRAME.p0);
  return { position: target.clone().add(new THREE.Vector3(...FRAME.n0).multiplyScalar(distance)), target };
}

const state = { unfold: 0, unfoldShown: 0, pull: 0, pullShown: 0, tissot: true };
const globeCamera = { position: GLOBE_VIEW.clone(), target: new THREE.Vector3() };
function resetView(): void {
  state.unfold = 0;
  globeCamera.position.copy(GLOBE_VIEW);
  camera.position.copy(GLOBE_VIEW);
  controls.target.set(0, 0, 0);
  controls.update();
}
resetView();

// In the map, a vertical drag is the pull: up toward equal area, down toward conformal.
let dragging: { y: number } | null = null;
renderer.domElement.addEventListener('pointerdown', (e) => { if (state.unfold === 1) dragging = { y: e.clientY }; });
addEventListener('pointermove', (e) => {
  if (!dragging) return;
  state.pull = THREE.MathUtils.clamp(state.pull - (e.clientY - dragging.y) / 400, 0, 1);
  dragging = { y: e.clientY };
  needsRender = true;
});
addEventListener('pointerup', () => { dragging = null; });

let needsRender = true;
controls.addEventListener('change', () => { needsRender = true; });
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.setFocalLength(FOCAL_LENGTH);
  needsRender = true;
});

const panel = document.querySelector<HTMLElement>('#panel')!;
const readout = document.querySelector<HTMLElement>('#readout')!;
const hint = document.querySelector<HTMLElement>('#hint')!;
hint.textContent = 'UNFOLD · the cut and the pull · U to unfold · H for controls';
setTimeout(() => hint.classList.add('gone'), 4000);

function projectionName(pull: number): string {
  if (pull < 0.005) return 'Mercator: conformal, angles kept';
  if (pull > 0.995) return 'Lambert cylindrical equal-area: areas kept';
  return `a compromise, ${Math.round(pull * 100)}% of the way to equal area: neither kept`;
}
function describe(): void {
  const at60 = scaleFactors(deg(60), state.pullShown);
  const at70 = scaleFactors(deg(70), state.pullShown);
  readout.textContent = [
    `backend    ${(renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'WebGPU' : 'WebGL 2'}`,
    `unfolded   ${Math.round(state.unfoldShown * 100)}% · cut between gores 6 and 7`,
    `projection ${projectionName(state.pullShown)}`,
    `at 60°     meridian ×${at60.h.toFixed(2)} · parallel ×${at60.k.toFixed(2)} · area ×${at60.area.toFixed(2)} · shape ${at60.shear.toFixed(2)}:1`,
    `at 70°     area ×${at70.area.toFixed(2)} of the equator's: Greenland's band, drawn ${at70.area.toFixed(1)} times too large`,
  ].join('\n');
}

addEventListener('keydown', (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  switch (event.code) {
    case 'KeyU': state.unfold = state.unfold === 1 ? 0 : 1; if (state.unfold === 1) globeCamera.position.copy(camera.position); break;
    case 'ArrowUp': state.pull = Math.min(1, state.pull + 0.1); break;
    case 'ArrowDown': state.pull = Math.max(0, state.pull - 0.1); break;
    case 'KeyI': state.tissot = !state.tissot; uTissot.value = state.tissot ? 1 : 0; break;
    case 'KeyR': resetView(); state.pull = 0; break;
    case 'KeyH': panel.hidden = !panel.hidden; break;
    default: return;
  }
  event.preventDefault();
  needsRender = true;
  describe();
});

let warmup = 30;
let last = performance.now();
const camTarget = new THREE.Vector3();
renderer.setAnimationLoop((now) => {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  const unfolding = Math.abs(state.unfold - state.unfoldShown) > 1e-4;
  if (unfolding) state.unfoldShown = damp(state.unfoldShown, state.unfold, UNFOLD_HALF_LIFE, dt);
  else state.unfoldShown = state.unfold;
  const pulling = Math.abs(state.pull - state.pullShown) > 1e-4;
  if (pulling) state.pullShown = damp(state.pullShown, state.pull, PULL_HALF_LIFE, dt);
  else state.pullShown = state.pull;
  uUnfold.value = state.unfoldShown;
  uPull.value = state.pullShown;

  // The camera explains the move the visitor caused: from the globe out to the map, and back.
  const travel = THREE.MathUtils.smoothstep(state.unfoldShown, 0.15, 1);
  controls.enabled = state.unfold === 0 && state.unfoldShown < 0.01;
  let moving = false;
  if (controls.enabled) moving = controls.update();
  else {
    const map = mapView();
    camera.position.copy(globeCamera.position).lerp(map.position, travel);
    camTarget.set(0, 0, 0).lerp(map.target, travel);
    camera.lookAt(camTarget);
    controls.target.copy(camTarget);
  }

  const resolving = prints.reduce((any, p) => p.step(dt) || any, false);
  if (warmup > 0) { warmup--; needsRender = true; }
  if (!moving && !unfolding && !pulling && !resolving && !needsRender) return;
  needsRender = false;
  // Focus: the globe's facing surface, then the map's centre.
  camera.updateMatrixWorld();
  const facing = camera.position.clone().setLength(R);
  const focus = facing.lerp(new THREE.Vector3(...FRAME.p0), travel);
  lens.focusDistance = -focus.applyMatrix4(camera.matrixWorldInverse).z;
  pipeline.render();
  if (!panel.hidden) describe();
});
describe();

Object.assign(window, { plates: { camera, controls, scene, renderer, state, lens, key, render: () => { needsRender = true; } } });
