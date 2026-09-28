// UNFOLD, look-development frame.
//
// Coronelli's 1688 terrestrial globe: all 24 gores and both polar calottes on the plaster core.
// Gore 12 peels away from its southern tip and relaxes toward its flat printed shape. Tissot's
// circles, drawn on the sphere, ride on the paper, so they stay round where the paper is glued and
// turn into ellipses as it flattens. A brass meridian ring stands beside the tear. High-key light,
// and depth of field through a thin lens focused on the peeled sheet. The view orbits the globe's
// center. The frame exists to judge paper, ink, and brass in the real renderer.
//
// Where each print lies on the sphere, and how prints load, is in sheets.ts. See README.md.

import * as THREE from 'three/webgpu';
import type { Node } from 'three/webgpu';
import {
  Fn, abs, attribute, atan, builtinAOContext, cos, cross, dot, faceDirection, float, floor, fract, sin,
  frontFacing, fwidth, interleavedGradientNoise, length, mix, mrt, mx_fractal_noise_float, normalView,
  pass, positionLocal, positionView, renderOutput, screenCoordinate, screenUV, select, sign, smoothstep,
  uniform, uv, vec2, vec3, vec4,
} from 'three/tsl';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { damp } from '../../src/core/damp.ts';
import { lensBlur } from '../../src/post/lens-blur.ts';
import { beforeNeutral } from '../../src/core/tone.ts';
import { Print, R, calotteShape, deg, goreShape, sheetName, sphere } from './sheets.ts';
import { DEFAULT_STUDIO, studioScene } from './studio.ts';
import type { Studio } from './studio.ts';
import type { GoreShape, Hinge, SheetInfo } from './sheets.ts';

const PEELING = 12; // the gore that peels
const HINGE = deg(-22); // latitude where the peeling gore is still glued
const RING_LON = deg(40);
// Where each calotte's print puts the scene's longitude 0, counterclockwise from the print's +x
// axis. Matched to the gores' ends at 70° (tools/lookdev/calotte-rotation.ts), then fixed by the
// phase of the meridians ruled every 5° just inside the rim; on the north calotte, the graduated
// meridian continues the seam at 0°, at 90.1° in the print.
const CALOTTE_ROTATION: Record<number, number> = { 25: deg(90.1), 26: deg(86.26) };
const PEEL_HALF_LIFE = 0.35; // s, LOOK.md: paper is heavy, deliberate
const LENS_HALF_LIFE = 0.3; // s, focus pulls and aperture changes; LOOK.md's state half-life for UNFOLD
const FOCAL_LENGTHS = [50, 105, 200]; // mm on full frame, keys 1–3
const STOPS = [1.4, 2, 2.8, 4, 5.6, 8, 11, 16];
const DEFAULT_FOCAL_LENGTH = 105;
const DEFAULT_STOP = 1; // f/2

// LOOK.md palette for UNFOLD, as linear colors.
const linear = (hex: string) => new THREE.Color(hex);
const FIELD = linear('#ecebe7');
const INK = linear('#1f1d1a');
const MAGENTA = linear('#c2185b');
const PLASTER = linear('#e4e2dc');
const BRASS = new THREE.Color().setRGB(0.91, 0.78, 0.42); // brass reflectance at normal incidence

// Renderer and pipeline ---------------------------------------------------------------------------

const renderer = new THREE.WebGPURenderer({ antialias: false, forceWebGL: new URLSearchParams(location.search).has('webgl') });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // the WebGPU renderer filters PCF by shadow.radius
document.body.prepend(renderer.domElement);
await renderer.init();

const scene = new THREE.Scene();
scene.background = beforeNeutral(FIELD);
// The studio, as image-based light: a north window, white room and table, and a strip for the
// brass (studio.ts).
const pmrem = new THREE.PMREMGenerator(renderer);
let studio: Studio = { ...DEFAULT_STUDIO, window: DEFAULT_STUDIO.window.clone(), strip: DEFAULT_STUDIO.strip.clone() };
function light(changes: Partial<Studio> = {}): void {
  studio = { ...studio, ...changes };
  const previous = scene.environment;
  scene.environment = pmrem.fromScene(studioScene(studio), 0.02).texture;
  previous?.dispose();
}
light();

// A full-frame camera, 36 mm across the long side of the film. The focal length sets the field of
// view, and the same lens and film set the depth of field.
const camera = new THREE.PerspectiveCamera(16, innerWidth / innerHeight, 0.05, 30);
camera.filmGauge = 36;
camera.setFocalLength(DEFAULT_FOCAL_LENGTH);

// Globe ---------------------------------------------------------------------------------------------

// The plaster core shows wherever paper is missing or lifted.
const core = new THREE.Mesh(
  new THREE.SphereGeometry(R, 256, 128),
  (() => {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.95 });
    m.colorNode = vec3(PLASTER.r, PLASTER.g, PLASTER.b).mul(mx_fractal_noise_float(positionLocal.mul(18)).mul(0.012).add(1));
    return m;
  })(),
);
core.castShadow = core.receiveShadow = true;
scene.add(core);

// Uniforms shared by the paper.
const uNotation = uniform(new THREE.Vector3(INK.r, INK.g, INK.b));
const uTissot = uniform(1);
const TISSOT_RADIUS = deg(2.4);
const INK_WIDTH = 0.00035 / R; // 0.35 mm, in radians of arc

// Tissot's field is drawn where the paper is being diagnosed: full around the tear, fading out
// beyond uTissotReach of arc from its middle, so the rest of the globe stays Coronelli's.
const TEAR_MIDDLE = { lon: deg(15), lat: deg(-35) };
const uTissotReach = uniform(deg(40));

const tissotInk = Fn(() => {
  const geo = attribute('geo', 'vec2'); // longitude, latitude in radians
  const cosFromTear = sin(geo.y).mul(Math.sin(TEAR_MIDDLE.lat)).add(cos(geo.y).mul(Math.cos(TEAR_MIDDLE.lat)).mul(cos(geo.x.sub(TEAR_MIDDLE.lon))));
  const field = smoothstep(cos(uTissotReach.add(deg(20))), cos(uTissotReach.sub(deg(20))), cosFromTear);
  const latC = floor(geo.y.div(deg(10))).add(0.5).mul(deg(10));
  // Circles sit at odd multiples of 5°, so none straddles a gore seam. Above 60°, ten degrees of
  // longitude are too short for a circle, so each gore carries one, at its center.
  const cell = select(abs(latC).greaterThan(deg(60)), float(deg(30)), float(deg(10)));
  const lonC = floor(geo.x.div(cell)).add(0.5).mul(cell);
  const d = length(vec2(geo.x.sub(lonC).mul(cos(latC)), geo.y.sub(latC)));
  const ring = abs(d.sub(TISSOT_RADIUS));
  const aa = fwidth(ring);
  return float(1).sub(smoothstep(float(INK_WIDTH / 2), aa.add(INK_WIDTH / 2), ring)).mul(uTissot).mul(field);
});

/**
 * Bump from a procedural height, in meters, by screen-space derivatives (Mikkelsen's
 * perturbNormalArb). three's bumpMap re-samples a texture at offset UVs, which a procedural
 * height does not follow.
 */
function bumpNormal(height: Node<'float'>) {
  const sx = positionView.dFdx();
  const sy = positionView.dFdy();
  const r1 = cross(sy, normalView);
  const r2 = cross(normalView, sx);
  const det = dot(sx, r1).mul(faceDirection);
  const grad = sign(det).mul(r1.mul(height.dFdx()).add(r2.mul(height.dFdy())));
  return normalView.mul(abs(det)).sub(grad).normalize();
}

/** Laid paper carrying a print. Tissot's field is drawn on the gores, which span ±70°. */
function paperMaterial(print: Node<'vec4'>, metersPerUV: THREE.Vector2, tissot: boolean): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, roughness: 0.9, alphaTest: 0.5 });
  // Laid paper, in meters of relief: laid lines about 1.1 mm apart, chain lines about 25 mm
  // apart, and fiber. Fine detail fades out where a pixel is too coarse to hold it, so it never
  // turns into moiré.
  const sheet = uv().mul(vec2(metersPerUV.x, metersPerUV.y));
  const footprint = fwidth(sheet.y);
  const laid = sheet.y.mul((Math.PI * 2) / 0.0011).sin().mul(0.000008)
    .mul(float(1).sub(smoothstep(0.0003, 0.0006, footprint)));
  const chain = smoothstep(0.08, 0.0, abs(fract(sheet.x.div(0.025)).sub(0.5))).mul(0.000015);
  const fiber = mx_fractal_noise_float(vec3(sheet.mul(900), 0), 4, 2.1, 0.55).mul(0.000006)
    .mul(float(1).sub(smoothstep(0.0002, 0.0005, footprint)));
  m.normalNode = bumpNormal(laid.add(chain).add(fiber));
  const front = tissot ? mix(print.rgb, vec3(uNotation), tissotInk().mul(0.95)) : print.rgb;
  const back = mix(vec3(0.8), print.rgb, 0.08); // the reverse, with faint show-through
  m.colorNode = select(frontFacing, front, back);
  m.opacityNode = print.a;
  return m;
}

type Sheet = { info: SheetInfo; print: Print; mesh: THREE.Mesh; shape: GoreShape; label: string };

const anisotropy = renderer.getMaxAnisotropy();
const infos = await Promise.all(Array.from({ length: 26 }, (_, i) =>
  fetch(`/plates/assets/unfold/${sheetName(i + 1)}.json`).then((r) => (r.ok ? (r.json() as Promise<SheetInfo>) : null))));
const sheets: Sheet[] = [];
for (const info of infos) {
  if (!info) continue; // a sheet not yet prepared leaves the plaster bare
  const peels = info.piece === PEELING;
  const shape = info.kind === 'gore'
    ? goreShape(info, peels ? { cols: 48, lines: 180, hinge: HINGE } : { cols: 32, lines: 120 })
    : calotteShape(info, CALOTTE_ROTATION[info.piece]);
  const print = new Print(info, anisotropy);
  const mesh = new THREE.Mesh(shape.geometry, paperMaterial(print.node, shape.metersPerUV, info.kind === 'gore'));
  mesh.castShadow = mesh.receiveShadow = true;
  scene.add(mesh);
  const label = peels ? 'the peeling gore' : info.kind === 'gore' ? `gore ${info.piece}` : info.hemisphere === 'north' ? 'the north polar calotte' : 'the south polar calotte';
  sheets.push({ info, print, mesh, shape, label });
}
const peeling = sheets.find((s) => s.info.piece === PEELING)!;

/**
 * Lay the peeling gore for a peel amount in [0, 1]. South of the hinge the sheet leaves the sphere
 * and curls outward as a cylinder, which keeps the printed sheet's own flat geometry.
 */
function layPeel(sheet: Sheet, peel: number): void {
  const { sphere: onSphere, flat, along, hinge } = sheet.shape.peel!;
  const { C, N, east, south }: Hinge = hinge;
  const lift = deg(34) * peel;
  const curvature = 1.5 * peel; // 1/m
  const sT = south.clone().multiplyScalar(Math.cos(lift)).addScaledVector(N, Math.sin(lift));
  const nT = south.clone().multiplyScalar(-Math.sin(lift)).addScaledVector(N, Math.cos(lift));
  const position = sheet.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
  const band = 0.04; // m over which the sheet leaves the sphere
  const release = THREE.MathUtils.smoothstep(peel, 0, 0.2);
  const p = new THREE.Vector3(), f = new THREE.Vector3(), q = new THREE.Vector3();
  for (let k = 0; k < along.length; k++) {
    const y = along[k];
    p.fromArray(onSphere, k * 3);
    if (y > 0 && peel > 0) {
      f.fromArray(flat, k * 3);
      const x = f.clone().sub(C).dot(east);
      const arc = curvature > 1e-4 ? Math.sin(curvature * y) / curvature : y;
      const rise = curvature > 1e-4 ? (1 - Math.cos(curvature * y)) / curvature : 0;
      q.copy(C).addScaledVector(east, x).addScaledVector(sT, arc).addScaledVector(nT, rise);
      p.lerp(q, THREE.MathUtils.smoothstep(y, 0, band) * release);
    }
    position.setXYZ(k, p.x, p.y, p.z);
  }
  position.needsUpdate = true;
  sheet.mesh.geometry.computeVertexNormals();
  sheet.mesh.geometry.computeBoundingSphere(); // for picking a focus on the lifted sheet
}

// Brass meridian ring, with degree ticks engraved and filled with black wax.
const RING_INNER = R + 0.014, RING_OUTER = R + 0.042, RING_DEPTH = 0.009;
const ringShape = new THREE.Shape().absarc(0, 0, RING_OUTER, 0, Math.PI * 2, false);
ringShape.holes.push(new THREE.Path().absarc(0, 0, RING_INNER, 0, Math.PI * 2, true));
const ringGeometry = new THREE.ExtrudeGeometry(ringShape, {
  depth: RING_DEPTH, curveSegments: 512, bevelEnabled: true, bevelThickness: 0.0007, bevelSize: 0.0007, bevelSegments: 3,
});
ringGeometry.translate(0, 0, -RING_DEPTH / 2);
const brass = new THREE.MeshPhysicalNodeMaterial({ metalness: 1 });
{
  const p = positionLocal;
  const r = length(p.xy);
  const degrees = atan(p.y, p.x).mul(180 / Math.PI);
  const nearest = abs(fract(degrees.add(0.5)).sub(0.5)); // degrees to the nearest whole degree
  const five = abs(fract(degrees.div(5).add(0.5)).sub(0.5)).mul(5);
  const ten = abs(fract(degrees.div(10).add(0.5)).sub(0.5)).mul(10);
  const width = float(0.00035);
  const toMeters = r.mul(Math.PI / 180);
  const tick = (distance: typeof nearest, length: number) => {
    const meters = distance.mul(toMeters);
    return float(1).sub(smoothstep(width, width.add(fwidth(meters)), meters))
      .mul(smoothstep(float(RING_OUTER - length - 0.0003), float(RING_OUTER - length), r));
  };
  const onFace = smoothstep(float(RING_DEPTH / 2 - 0.0004), float(RING_DEPTH / 2), p.z);
  const engraved = tick(nearest, 0.004).max(tick(five, 0.007)).max(tick(ten, 0.011)).mul(onFace);
  const wear = mx_fractal_noise_float(p.mul(60), 3, 2, 0.5).mul(0.5).add(0.5);
  const tarnish = smoothstep(0.55, 0.85, mx_fractal_noise_float(p.mul(14), 3, 2, 0.5).mul(0.5).add(0.5));
  const metal = vec3(BRASS.r, BRASS.g, BRASS.b).mul(float(1).sub(tarnish.mul(0.28)));
  brass.colorNode = mix(metal, vec3(INK.r, INK.g, INK.b), engraved);
  brass.metalnessNode = float(1).sub(engraved);
  brass.roughnessNode = mix(wear.mul(0.1).add(0.2).add(tarnish.mul(0.12)), float(0.65), engraved);
}
const ring = new THREE.Mesh(ringGeometry, brass);
ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(Math.cos(RING_LON), 0, -Math.sin(RING_LON)));
ring.castShadow = ring.receiveShadow = true;
scene.add(ring);

// Light: broad soft environment for the high key, one low raking key for the engraving.
const hingeCenter = sphere(HINGE, deg(15), R);
const surface = hingeCenter.clone().normalize();
const key = new THREE.DirectionalLight(new THREE.Color().setRGB(1, 0.97, 0.93), 3.4);
{
  const eastAt = new THREE.Vector3(Math.cos(deg(15)), 0, -Math.sin(deg(15)));
  const northAt = new THREE.Vector3().crossVectors(surface, eastAt).normalize();
  const graze = eastAt.clone().multiplyScalar(-0.75).addScaledVector(northAt, 0.66).normalize();
  const direction = graze.multiplyScalar(Math.cos(deg(14))).addScaledVector(surface, Math.sin(deg(14))).normalize();
  key.position.copy(hingeCenter).addScaledVector(direction, 3);
  key.target.position.copy(hingeCenter);
}
key.castShadow = true;
key.shadow.mapSize.set(4096, 4096);
Object.assign(key.shadow.camera, { left: -0.8, right: 0.8, top: 0.8, bottom: -0.8, near: 0.5, far: 6 });
key.shadow.bias = -0.0002;
key.shadow.normalBias = 0.002;
key.shadow.radius = 4;
scene.add(key, key.target);

// Post: ambient occlusion on indirect light, then depth of field through the lens, output, grain.
const prePass = pass(scene, camera);
prePass.setMRT(mrt({ output: normalView }));
const aoPass = ao(prePass.getTextureNode('depth'), prePass.getTextureNode(), camera);
aoPass.resolutionScale = 0.5;
const scenePass = pass(scene, camera);
scenePass.contextNode = builtinAOContext(aoPass.getTextureNode().sample(screenUV).r);
const lens = lensBlur(scenePass.getTextureNode(), scenePass.getTextureNode('depth'), camera);
const pipeline = new THREE.RenderPipeline(renderer);
pipeline.outputColorTransform = false;
pipeline.outputNode = Fn(() => {
  const display = renderOutput(lens);
  const grain = interleavedGradientNoise(screenCoordinate.xy).sub(0.5).mul(1.5 / 255); // fine, static
  return vec4(display.rgb.add(grain), 1);
})();

// View and lens -----------------------------------------------------------------------------------

// The view orbits the globe's own center, as one walks around a globe on a table, and dollies
// toward it. There is no panning, so the globe never swings about a point on its surface.
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.rotateSpeed = 0.6;
controls.zoomSpeed = 0.6;
controls.minDistance = 1.05; // clear of the lifted sheet
controls.maxDistance = 12;

// Focus is a spot on a surface, not the orbit center, and it moves with the paper as the sheet
// peels. It starts on the peeled sheet, where Tissot's circles have become ellipses, and moves to
// wherever the visitor clicks, racking over LENS_HALF_LIFE. While that spot is behind the globe,
// the lens focuses on the surface facing the camera instead.
type Anchor = { mesh: THREE.Mesh; vertices: number[]; weights: number[] };

/** The peeling sheet's vertex nearest a longitude and latitude. */
function sheetVertex(lon: number, lat: number): number {
  const geo = peeling.mesh.geometry.getAttribute('geo');
  let nearest = 0, best = Infinity;
  for (let k = 0; k < geo.count; k++) {
    const distance = Math.hypot(geo.getX(k) - lon, geo.getY(k) - lat);
    if (distance < best) { nearest = k; best = distance; }
  }
  return nearest;
}

const corner = new THREE.Vector3();
/** Where an anchor is now, in world space. */
function locate(anchor: Anchor, out: THREE.Vector3): THREE.Vector3 {
  const position = anchor.mesh.geometry.getAttribute('position');
  out.set(0, 0, 0);
  anchor.vertices.forEach((vertex, i) => out.addScaledVector(corner.fromBufferAttribute(position, vertex), anchor.weights[i]));
  return out.applyMatrix4(anchor.mesh.matrixWorld);
}

const HOME: Anchor = { mesh: peeling.mesh, vertices: [sheetVertex(deg(15), deg(-35))], weights: [1] };
const focus = { anchor: HOME, chosen: new THREE.Vector3(), shown: new THREE.Vector3(), on: 'the peeled sheet' };

const state = {
  peel: 0.62, peelShown: 0.62,
  focalLength: DEFAULT_FOCAL_LENGTH, stop: DEFAULT_STOP, fNumberShown: STOPS[DEFAULT_STOP],
  dof: true, agx: false, magenta: false, tissot: true,
};
layPeel(peeling, state.peelShown); // the first frame is already the held still
focus.shown.copy(locate(focus.anchor, focus.chosen));

function resetView(): void {
  state.focalLength = DEFAULT_FOCAL_LENGTH;
  camera.setFocalLength(DEFAULT_FOCAL_LENGTH);
  controls.target.set(0, 0, 0);
  camera.position.copy(sphere(deg(-38), deg(8), 2.6));
  controls.update();
}
resetView();

const ray = new THREE.Vector3();
/** Whether the line from the camera to a point clears the globe's core. */
function inView(point: THREE.Vector3): boolean {
  const o = camera.position;
  ray.subVectors(point, o);
  const length = ray.length();
  ray.divideScalar(length);
  const b = o.dot(ray);
  const discriminant = b * b - (o.lengthSq() - R * R);
  if (discriminant <= 0) return true;
  return -b - Math.sqrt(discriminant) >= length - 0.003;
}

const inViewSpace = new THREE.Vector3();
/** Distance to the plane of focus: the focused point's depth along the view axis. */
function focusDepth(): number {
  camera.updateMatrixWorld();
  return -inViewSpace.copy(focus.shown).applyMatrix4(camera.matrixWorldInverse).z;
}

/** Change lenses and keep the magnification at the plane of focus: the framing holds, the perspective changes. */
function setFocalLength(mm: number): void {
  const f0 = state.focalLength / 1000, f1 = mm / 1000;
  const S0 = focusDepth();
  const S1 = (S0 - f0) * (f1 / f0) + f1;
  const D0 = camera.position.length();
  camera.position.multiplyScalar(THREE.MathUtils.clamp(D0 + S1 - S0, controls.minDistance, controls.maxDistance) / D0);
  state.focalLength = mm;
  camera.setFocalLength(mm);
  controls.update();
}

// Print resolution follows the view --------------------------------------------------------------

const frustum = new THREE.Frustum();
const viewProjection = new THREE.Matrix4();
const probe = new THREE.Vector3();

/** The coarsest level whose print is at least as fine as the screen, where the sheet is in view. */
function neededLevel(sheet: Sheet): number {
  const position = sheet.mesh.geometry.getAttribute('position');
  const pixelsAtOneMeter = renderer.domElement.height / (2 * Math.tan(deg(camera.fov) / 2)); // pixels per meter at 1 m
  let need = 0; // texels per meter
  for (const k of sheet.shape.samples) {
    probe.fromBufferAttribute(position, k);
    if (!frustum.containsPoint(probe) || !inView(probe)) continue;
    const depth = -probe.applyMatrix4(camera.matrixWorldInverse).z;
    need = Math.max(need, pixelsAtOneMeter / Math.max(depth, camera.near));
  }
  if (need === 0) return 0;
  const texelsPerMeter = (height: number) => height / sheet.shape.metersPerUV.y;
  const level = sheet.info.levels.findIndex((height) => texelsPerMeter(height) >= need * 0.85);
  return level === -1 ? sheet.info.levels.length - 1 : level;
}

function frame(): void {
  camera.updateMatrixWorld();
  viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  frustum.setFromProjectionMatrix(viewProjection, camera.coordinateSystem);
}

// The opening frame is held until every print it shows is at the resolution it needs.
frame();
await Promise.all(sheets.map((sheet) => sheet.print.showNow(neededLevel(sheet))));

// A click, not a drag, focuses on what it lands on.
const raycaster = new THREE.Raycaster();
const pickable = new Map<THREE.Object3D, string>([
  ...sheets.map((s) => [s.mesh, s.label] as [THREE.Object3D, string]), [ring, 'the meridian ring'], [core, 'the plaster core'],
]);
let press: { x: number; y: number; time: number } | null = null;
renderer.domElement.addEventListener('pointerdown', (event) => {
  press = { x: event.clientX, y: event.clientY, time: performance.now() };
});
renderer.domElement.addEventListener('pointerup', (event) => {
  if (!press) return;
  const click = Math.hypot(event.clientX - press.x, event.clientY - press.y) < 4 && performance.now() - press.time < 400;
  press = null;
  if (!click) return;
  const rect = renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const [hit] = raycaster.intersectObjects([...pickable.keys()], false);
  const barycoord = (hit as { barycoord?: THREE.Vector3 } | undefined)?.barycoord;
  if (!hit?.face || !barycoord) return;
  focus.anchor = { mesh: hit.object as THREE.Mesh, vertices: [hit.face.a, hit.face.b, hit.face.c], weights: barycoord.toArray() };
  focus.on = pickable.get(hit.object) ?? 'the scene';
  needsRender = true;
});

// Render on demand ----------------------------------------------------------------------------------

let needsRender = true;
controls.addEventListener('change', () => { needsRender = true; });

function layout(): void {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.setFocalLength(state.focalLength); // the field of view follows the film's aspect
  needsRender = true;
}
addEventListener('resize', layout);

const panel = document.querySelector<HTMLElement>('#panel')!;
const readout = document.querySelector<HTMLElement>('#readout')!;
const hint = document.querySelector<HTMLElement>('#hint')!;
hint.textContent = 'UNFOLD · look development · click to focus · H for controls';
setTimeout(() => hint.classList.add('gone'), 3000);

function describe(): void {
  const hidden = !inView(focus.chosen) || !frustum.containsPoint(focus.chosen);
  const fine = sheets.filter((s) => s.print.shown > 0).map((s) => `${s.info.piece}@${s.info.levels[s.print.shown]}`);
  readout.textContent = [
    `backend   ${(renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'WebGPU' : 'WebGL 2'}`,
    `lens      ${state.focalLength} mm · f/${STOPS[state.stop]} · depth of field ${state.dof ? 'on' : 'off'}`,
    `focus     ${lens.focusDistance.toFixed(3)} m · ${hidden ? `the surface facing the camera, while ${focus.on} is out of view` : focus.on}`,
    `peel      ${state.peel.toFixed(2)}`,
    `prints    ${sheets.length} sheets · finer than the base: ${fine.join(' ') || 'none'}`,
    `tone      ${state.agx ? 'AgX' : 'neutral'} · Tissot ${state.tissot ? (state.magenta ? 'magenta' : 'ink') : 'off'}`,
  ].join('\n');
}

addEventListener('keydown', (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  // The aperture keys go by the character typed, so the keypad's − and + work as well.
  const code = event.key === '-' || event.key === '_' ? 'OpenUp' : event.key === '=' || event.key === '+' ? 'StopDown' : event.code;
  switch (code) {
    case 'BracketRight': state.peel = Math.min(state.peel + 0.1, 1); break;
    case 'BracketLeft': state.peel = Math.max(state.peel - 0.1, 0); break;
    case 'OpenUp': state.stop = Math.max(state.stop - 1, 0); break;
    case 'StopDown': state.stop = Math.min(state.stop + 1, STOPS.length - 1); break;
    case 'Digit1': case 'Digit2': case 'Digit3':
      setFocalLength(FOCAL_LENGTHS[Number(event.code.slice(-1)) - 1]);
      break;
    case 'KeyD': state.dof = !state.dof; break;
    case 'KeyT':
      state.agx = !state.agx;
      renderer.toneMapping = state.agx ? THREE.AgXToneMapping : THREE.NeutralToneMapping;
      scene.background = state.agx ? FIELD.clone() : beforeNeutral(FIELD);
      pipeline.needsUpdate = true;
      break;
    case 'KeyM': {
      state.magenta = !state.magenta;
      const c = state.magenta ? MAGENTA : INK;
      uNotation.value.set(c.r, c.g, c.b);
      break;
    }
    case 'KeyI': state.tissot = !state.tissot; uTissot.value = state.tissot ? 1 : 0; break;
    case 'KeyR':
      resetView();
      focus.anchor = HOME;
      focus.on = 'the peeled sheet';
      state.stop = DEFAULT_STOP;
      break;
    case 'KeyH': panel.hidden = !panel.hidden; break;
    default: return;
  }
  event.preventDefault();
  needsRender = true;
  describe();
});

// WebGPU compiles pipelines asynchronously, and the first frames can be incomplete. Keep drawing
// for a short warm-up before rendering only on demand.
let warmup = 30;
let last = performance.now();
let lastLevels = 0;
const facing = new THREE.Vector3();
renderer.setAnimationLoop((now) => {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  const moving = controls.update();

  const easing = Math.abs(state.peel - state.peelShown) > 1e-3;
  if (easing) {
    state.peelShown = damp(state.peelShown, state.peel, PEEL_HALF_LIFE, dt);
    layPeel(peeling, state.peelShown);
  } else if (state.peelShown !== state.peel) {
    state.peelShown = state.peel;
    layPeel(peeling, state.peelShown);
    needsRender = true;
  }

  // The focused point racks toward its aim with the same exponential damping as damp(). A
  // millimeter short of it, the circle of confusion is well under a tenth of a pixel. A point out
  // of the frame or behind the globe hands focus to the surface facing the camera.
  frame();
  locate(focus.anchor, focus.chosen);
  const aim = inView(focus.chosen) && frustum.containsPoint(focus.chosen) ? focus.chosen : facing.copy(camera.position).setLength(R);
  const racking = focus.shown.distanceTo(aim) > 0.001;
  if (racking) focus.shown.lerp(aim, 1 - Math.pow(2, -dt / LENS_HALF_LIFE));
  else if (!focus.shown.equals(aim)) { focus.shown.copy(aim); needsRender = true; }

  // The iris eases in stops.
  const fNumber = STOPS[state.stop];
  const opening = Math.abs(Math.log2(state.fNumberShown / fNumber)) > 0.003;
  if (opening) state.fNumberShown = 2 ** damp(Math.log2(state.fNumberShown), Math.log2(fNumber), LENS_HALF_LIFE, dt);
  else if (state.fNumberShown !== fNumber) { state.fNumberShown = fNumber; needsRender = true; }

  // Prints: a few times a second, ask each sheet for the level the view needs; fade in arrivals.
  if (now - lastLevels > 150) {
    lastLevels = now;
    for (const sheet of sheets) sheet.print.request(neededLevel(sheet), now / 1000);
  }
  let resolving = false;
  for (const sheet of sheets) resolving = sheet.print.step(dt) || resolving;

  if (warmup > 0) { warmup--; needsRender = true; }
  if (!moving && !easing && !racking && !opening && !resolving && !needsRender) return;
  needsRender = false;
  lens.focusDistance = focusDepth();
  lens.fNumber = state.fNumberShown;
  lens.enabled = state.dof;
  pipeline.render();
  if (!panel.hidden) describe();
});
describe();

// Lab inspection from the console.
Object.assign(window, {
  plates: {
    camera, controls, scene, renderer, state, lens, focus, key, sheets, aoPass, pipeline, uTissotReach,
    render: () => { needsRender = true; },
    /** Rebuild the studio's light with some of its values changed: plates.light({ windowRadiance: 3 }). */
    light: (changes: Partial<Studio>) => {
      light(changes);
      needsRender = true;
      return studio;
    },
    /** Look at the globe's center from a latitude and longitude in degrees, at a distance in meters. */
    view: (lat: number, lon: number, distance: number) => {
      camera.position.copy(sphere(deg(lat), deg(lon), distance));
      controls.update();
      needsRender = true;
    },
    /** Focus on the peeling sheet at a longitude and latitude in degrees. */
    focusSheet: (lon: number, lat: number) => {
      focus.anchor = { mesh: peeling.mesh, vertices: [sheetVertex(deg(lon), deg(lat))], weights: [1] };
      needsRender = true;
    },
  },
});
