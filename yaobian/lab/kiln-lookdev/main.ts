// KILN, first look-development frame: studies/lookdev-01-kiln.md.
//
// One Ru-type bowl under one strip softbox, to be judged at 4×. The glaze's color is computed
// from its thickness; the crackle is simulated as the glaze cools and drawn as sheets standing in
// the glaze; the softbox casts its own soft shadow. No interaction beyond looking, no score, no
// kiln. The frame exists to decide whether glaze can be rendered at the register the series needs.

import * as THREE from 'three/webgpu';
import type { Node } from 'three/webgpu';
import { Fn, builtinAOContext, float, interleavedGradientNoise, mix, mrt, normalView, pass, renderOutput, screenCoordinate, screenUV, uniform, vec4 } from 'three/tsl';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { dof } from 'three/addons/tsl/display/DepthOfFieldNode.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { at, bare, lathe, profile, thickness, type Side, type Surface } from '../../src/kiln/bowl.ts';
import { FRACTURE_DEFAULTS, type Crack, type FractureStats } from '../../src/kiln/fracture.ts';
import { crackField, type CrackRaster } from '../../src/kiln/crackField.ts';
import { section, surfaceOcclusion, tableOcclusion } from '../../src/kiln/occlusion.ts';
import { glaze, glazeMaterial, thicknessMaterial } from '../../src/kiln/glaze.ts';
import { Softbox } from '../../src/core/softbox.ts';
import { fill, room, studio, table } from '../../src/kiln/stage.ts';

const deg = THREE.MathUtils.degToRad;
const hint = document.querySelector<HTMLElement>('#hint')!;
const say = async (text: string) => {
  hint.textContent = text;
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
};

// The study's frame: 2400 × 1350, and its 4× crop, 600 × 338 of it rendered at 4× scale.
const FRAME = { width: 2400, height: 1350 };
const CROP = { width: 600, height: 338 };

// Renderer ------------------------------------------------------------------------------------------

const renderer = new THREE.WebGPURenderer({ antialias: false, forceWebGL: new URLSearchParams(location.search).has('webgl') });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.NeutralToneMapping; // LOOK.md: hue-preserving, so the blue does not drift
renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true;
document.body.prepend(renderer.domElement);
await renderer.init();
const isWebGPU = () => (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend === true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
scene.environment = studio(renderer);
scene.environmentIntensity = 2; // the fill: about a stop under the key on the glaze, as LOOK.md asks

const camera = new THREE.PerspectiveCamera(13, innerWidth / innerHeight, 0.02, 10);

// The bowl ------------------------------------------------------------------------------------------

type Built = { side: Side; surface: Surface; cracks: Crack[]; stats: FractureStats; mesh: THREE.Mesh; beauty: THREE.Material; thickness: THREE.Material; graph: THREE.LineSegments };
type Fired = { side: Side; cracks: Crack[]; stats: FractureStats; raster: CrackRaster };
const built: Built[] = [];
const fracture = { ...FRACTURE_DEFAULTS };

/** Fire one surface in a worker: the crackle and its fields. */
function fire(side: Side): Promise<Fired> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../../src/kiln/fire.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<Fired>) => { resolve(event.data); worker.terminate(); };
    worker.onerror = (event) => reject(event);
    worker.postMessage({ side, params: fracture, size: 8192 });
  });
}

await say('firing: the glaze cools and cracks…');
const started = performance.now();
const profiles = { inside: profile('inside'), outside: profile('outside') };
const fired = await Promise.all([fire('inside'), fire('outside')]);
const bowlSection = section(profiles.inside, profiles.outside);
for (const { side, cracks, stats, raster } of fired) {
  const surface = lathe(profiles[side], 1024, surfaceOcclusion(bowlSection, profiles[side]));
  const { material } = glazeMaterial(surface.profile, crackField(raster));
  const mesh = new THREE.Mesh(surface.geometry, material);
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.name = side;
  scene.add(mesh);
  const graph = crackGraph(surface, cracks);
  graph.visible = false;
  scene.add(graph);
  built.push({ side, surface, cracks, stats, mesh, beauty: material, thickness: thicknessMaterial(surface.profile), graph });
  console.info(`KILN ${side}: ${stats.cracks} cracks, ${stats.length.toFixed(0)} mm, spacing ${stats.spacing.toFixed(2)} mm, ends ${JSON.stringify(stats.ends)}, `
    + `simulated in ${stats.milliseconds.toFixed(0)} ms, field in ${raster.milliseconds.toFixed(0)} ms`);
}
console.info(`KILN fired in ${(performance.now() - started).toFixed(0)} ms`);

/** The point on a glaze surface at chart (u, v), mm, lifted `lift` mm above the glaze; meters. */
function surfacePoint(surface: Surface, u: number, v: number, lift = 0): [number, number, number] {
  const p = surface.profile;
  const s = Math.hypot(u, v);
  let phi = Math.atan2(v, u);
  if (phi < 0) phi += Math.PI * 2;
  const r = at(p, p.r, s), y = at(p, p.y, s), nr = at(p, p.nr, s), ny = at(p, p.ny, s);
  const h = thickness(p, s, phi) * (1 - bare(p, s, phi, r)) + lift;
  const rr = r + nr * h;
  return [(rr * Math.sin(phi)) / 1000, (y + ny * h) / 1000, (rr * Math.cos(phi)) / 1000];
}

/** The fracture graph as lines on the glaze, a hair above it, drawn from the simulation's polylines. */
function crackGraph(surface: Surface, cracks: Crack[]): THREE.LineSegments {
  const positions: number[] = [];
  const place = (u: number, v: number) => surfacePoint(surface, u, v, 0.02);
  for (const crack of cracks) {
    const pts = crack.points;
    let previous = place(pts[0], pts[1]);
    for (let j = 1; j < pts.length / 2; j++) {
      const next = place(pts[j * 2], pts[j * 2 + 1]);
      positions.push(...previous, ...next);
      previous = next;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return new THREE.LineSegments(geometry, new THREE.LineBasicNodeMaterial({ color: 0xff00aa }));
}

// Stage and light ----------------------------------------------------------------------------------

const tableMesh = table(tableOcclusion(bowlSection));
const roomMesh = room();
scene.add(tableMesh, roomMesh);

// One strip softbox, low and raking, its long side horizontal; neutral daylight, about 5,000 K.
const softbox = new Softbox({ width: 1.0, height: 0.2, intensity: 26, color: new THREE.Color().setRGB(1, 0.96, 0.9) });
scene.add(softbox.light);
// Behind and to the left, low: its strip lies along the right inner wall as one long highlight,
// and the bowl's shadow falls toward the camera.
const key = { azimuth: -140, elevation: 12, distance: 0.8 };
const bowlCenter = new THREE.Vector3(0, 0.026, 0);

function placeKey(): void {
  const a = deg(key.azimuth), e = deg(key.elevation);
  const position = new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)).multiplyScalar(key.distance).add(bowlCenter);
  softbox.place(position, bowlCenter);
  glaze.keyPosition.value.copy(position);
  // The fill comes from the other side, a little above: a bounce card, not a second light.
  const f = a + deg(165);
  fill.direction.value.set(Math.sin(f) * Math.cos(deg(30)), Math.sin(deg(30)), Math.cos(f) * Math.cos(deg(30))).normalize();
  softbox.renderShadow(renderer, scene, built.map((b) => b.mesh));
  needsRender = true;
}

// Post: ambient occlusion on the fill, depth of field, output, grain -----------------------------------

const prePass = pass(scene, camera);
prePass.setMRT(mrt({ output: normalView }));
const aoPass = ao(prePass.getTextureNode('depth'), prePass.getTextureNode(), camera);
aoPass.radius.value = 0.025;
aoPass.thickness.value = 0.004;
const scenePass = pass(scene, camera);
scenePass.contextNode = builtinAOContext(aoPass.getTextureNode().sample(screenUV).r);
const uFocus = uniform(0.64);
// The lens. Captures simulate it: each sample renders from a point on the aperture with the focal
// plane held still, so blur has a physical cause and occlusion at edges is exact. The screen shows
// a quick post-process stand-in for the same focus.
const lens = {
  aperture: 0.003, // m, entrance pupil diameter: near rim ≈ 2.8 px of blur at 2400 px, far table ≈ 6 px
  previewBokeh: 4, // px at 2400 wide, for the screen only
};
const uFocalRange = uniform(0.25);
const uBokeh = uniform(lens.previewBokeh);
let dofOn = true;
// The screen's stand-in blur composites a half-resolution image even at zero bokeh, which leaves a
// faint halo around the bowl; captures take the scene pass directly and blur with the aperture.
const uPreviewBlur = uniform(1);
const previewBlur = dof(scenePass.getTextureNode(), scenePass.getViewZNode(), uFocus, uFocalRange, uBokeh) as unknown as Node<'vec4'>;
const focused = mix(scenePass.getTextureNode(), previewBlur, uPreviewBlur);
const uGrain = uniform(1);
const pipeline = new THREE.RenderPipeline(renderer);
pipeline.outputColorTransform = false;
pipeline.outputNode = Fn(() => {
  const display = renderOutput(focused);
  const grain = interleavedGradientNoise(screenCoordinate.xy).sub(0.5).mul(float(1.5 / 255).mul(uGrain)); // fine, static
  return vec4(display.rgb.add(grain), 1);
})();

// View ------------------------------------------------------------------------------------------------

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
const STUDY_VIEW = { elevation: 33, azimuth: 8, distance: 0.74, target: new THREE.Vector3(0, 0.024, 0.004) };
function resetView(): void {
  const { elevation, azimuth, distance, target } = STUDY_VIEW;
  controls.target.copy(target);
  camera.position.set(
    Math.sin(deg(azimuth)) * Math.cos(deg(elevation)), Math.sin(deg(elevation)), Math.cos(deg(azimuth)) * Math.cos(deg(elevation)),
  ).multiplyScalar(distance).add(target);
  controls.update();
  needsRender = true;
}

let needsRender = true;
controls.addEventListener('change', () => { needsRender = true; });

function layout(): void {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  needsRender = true;
}
addEventListener('resize', layout);

type Mode = 'beauty' | 'thickness' | 'graph';
let mode: Mode = 'beauty';
const flat = new THREE.MeshBasicNodeMaterial({ color: 0x77726a });
function setMode(next: Mode): void {
  mode = next;
  for (const b of built) {
    b.mesh.material = next === 'thickness' ? b.thickness : b.beauty;
    b.graph.visible = next === 'graph';
  }
  tableMesh.material = next === 'thickness' ? flat : tableStandard;
  roomMesh.material = next === 'thickness' ? flat : roomStandard;
  renderer.toneMapping = next === 'thickness' ? THREE.NoToneMapping : THREE.NeutralToneMapping;
  pipeline.needsUpdate = true;
  needsRender = true;
}
const tableStandard = tableMesh.material as THREE.Material;
const roomStandard = roomMesh.material as THREE.Material;

// Capture ---------------------------------------------------------------------------------------------

const captureTarget = new THREE.RenderTarget(1, 1, { type: THREE.UnsignedByteType, depthBuffer: false });
const halton = (i: number, b: number) => {
  let f = 1, r = 0;
  for (let n = i + 1; n > 0; n = Math.floor(n / b)) { f /= b; r += f * (n % b); }
  return r;
};
// Top-left corners of the 4× crops in the 2400 × 1350 frame: the glaze where the key's highlight
// crosses the crackle, and the foot, where the body shows. One crop cannot hold both: seen from
// above, the foot faces away from the key.
const crop = { x: 1330, y: 420 };
const footCrop = { x: 900, y: 790 };

type Shot = { width: number; height: number; scale: number; x: number; y: number; samples: number };

/** Render the study's frame, or a region of it at a scale, accumulated over jittered samples. */
let capturing = false; // the frame loop stands still while a capture accumulates

async function shoot({ width, height, scale, x, y, samples }: Shot): Promise<ImageData> {
  capturing = true;
  const saved = { ratio: renderer.getPixelRatio(), size: renderer.getSize(new THREE.Vector2()), aspect: camera.aspect };
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  camera.aspect = FRAME.width / FRAME.height;
  captureTarget.setSize(width, height);
  uGrain.value = 0;
  uBokeh.value = 0; // the aperture below does the blurring
  uPreviewBlur.value = 0;
  // GTAO's noise is fixed per pixel, so sub-pixel jitter cannot average it: it showed as grain on
  // the foot at 4×. Its temporal mode rotates the noise every frame, which the accumulation averages.
  aoPass.useTemporalFiltering = true;
  controls.update();
  const eye = camera.position.clone();
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
  const focus = camera.position.distanceTo(controls.target);
  const tanY = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const tanX = tanY * (FRAME.width / FRAME.height);
  const aperture = mode === 'thickness' ? 0 : lens.aperture;
  const accumulated = new Float32Array(width * height * 4);
  const stride = Math.ceil((width * 4) / 256) * 256; // WebGPU pads each row to 256 bytes
  // WebGPU finishes compiling some passes asynchronously: the first frames after a change can be
  // incomplete, so a few are rendered and thrown away before any is counted.
  camera.setViewOffset(FRAME.width * scale, FRAME.height * scale, x * scale, y * scale, width, height);
  for (let i = 0; i < 4; i++) {
    renderer.setRenderTarget(captureTarget);
    pipeline.render();
    renderer.setRenderTarget(null);
    await renderer.readRenderTargetPixelsAsync(captureTarget, 0, 0, 1, 1);
  }
  for (let i = 0; i < samples; i++) {
    const jx = halton(i, 2) - 0.5, jy = halton(i, 3) - 0.5;
    // A point on the aperture (Vogel's spiral fills the disc evenly), and the shear that keeps the
    // focal plane where it was.
    const radius = (aperture / 2) * Math.sqrt((i + 0.5) / samples), angle = i * 2.399963;
    const ax = radius * Math.cos(angle), ay = radius * Math.sin(angle);
    camera.position.copy(eye).addScaledVector(right, ax).addScaledVector(up, ay);
    camera.updateMatrixWorld();
    const fullW = FRAME.width * scale, fullH = FRAME.height * scale;
    const shiftX = (ax / (focus * tanX)) * (fullW / 2), shiftY = (ay / (focus * tanY)) * (fullH / 2);
    camera.setViewOffset(fullW, fullH, x * scale + jx - shiftX, y * scale + jy + shiftY, width, height);
    softbox.frame.value = i;
    renderer.setRenderTarget(captureTarget);
    pipeline.render();
    renderer.setRenderTarget(null);
    const pixels = (await renderer.readRenderTargetPixelsAsync(captureTarget, 0, 0, width, height)) as Uint8Array;
    const rowStride = isWebGPU() ? stride : width * 4;
    for (let row = 0; row < height; row++) {
      const from = row * rowStride, to = row * width * 4;
      for (let c = 0; c < width * 4; c++) accumulated[to + c] += pixels[from + c];
    }
  }
  camera.clearViewOffset();
  camera.position.copy(eye);
  camera.updateMatrixWorld();
  camera.aspect = saved.aspect;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(saved.ratio);
  renderer.setSize(saved.size.x, saved.size.y);
  uGrain.value = 1;
  uPreviewBlur.value = 1;
  aoPass.useTemporalFiltering = false;
  softbox.frame.value = 0;
  capturing = false;
  const image = new ImageData(width, height);
  const grain = mode === 'thickness' ? 0 : 1.5;
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const g = (fract(52.9829189 * fract(0.06711056 * col + 0.00583715 * row)) - 0.5) * grain;
      const i = (row * width + col) * 4;
      image.data[i] = accumulated[i] / samples + g;
      image.data[i + 1] = accumulated[i + 1] / samples + g;
      image.data[i + 2] = accumulated[i + 2] / samples + g;
      image.data[i + 3] = 255;
    }
  }
  needsRender = true;
  return image;
}
const fract = (x: number) => x - Math.floor(x);

async function save(name: string, image: ImageData | Blob): Promise<string> {
  let blob = image as Blob;
  if (image instanceof ImageData) {
    const canvas = new OffscreenCanvas(image.width, image.height);
    canvas.getContext('2d')!.putImageData(image, 0, 0);
    blob = await canvas.convertToBlob({ type: 'image/png' });
  }
  const response = await fetch(`/__studies/${name}`, { method: 'POST', body: blob });
  return response.text();
}

/** Blend two frames: the fracture graph over the beauty at 50%. */
function blend(a: ImageData, b: ImageData): ImageData {
  const out = new ImageData(a.width, a.height);
  for (let i = 0; i < a.data.length; i++) out.data[i] = (a.data[i] + b.data[i]) / 2;
  return out;
}

/** Legend in the label monospace's stand-in, bottom left: lab frames are records, not experience. */
function annotate(image: ImageData, lines: string[], ramp = false): ImageData {
  const canvas = new OffscreenCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(image, 0, 0);
  ctx.font = '24px ui-monospace, "SF Mono", Menlo, monospace';
  ctx.fillStyle = '#2b2723';
  const x = 48;
  let y = image.height - 48 - (lines.length - 1) * 34;
  if (ramp) {
    const w = 480, h = 18, top = y - 70;
    for (let i = 0; i < w; i++) {
      const t = i / w;
      const c = rampColor(t);
      ctx.fillStyle = `rgb(${c.map((v) => Math.round(Math.pow(v, 1 / 2.2) * 255)).join(',')})`;
      ctx.fillRect(x + i, top, 1, h);
    }
    ctx.fillStyle = '#2b2723';
    for (const mm of [0, 0.5, 1, 1.5]) ctx.fillText(mm.toFixed(1), x + (mm / 1.8) * w - 8, top + h + 28);
    y += 10;
  }
  for (const line of lines) { ctx.fillText(line, x, y); y += 34; }
  return ctx.getImageData(0, 0, image.width, image.height);
}
// Mirrors thicknessMaterial's ramp (linear), for the legend.
function rampColor(t: number): number[] {
  const s = (a: number, b: number, x: number) => { const u = Math.min(Math.max((x - a) / (b - a), 0), 1); return u * u * (3 - 2 * u); };
  const m = (a: number[], b: number[], f: number) => a.map((v, i) => v + (b[i] - v) * f);
  return m(m([0.93, 0.9, 0.82], [0.45, 0.62, 0.64], s(0, 0.5, t)), [0.05, 0.16, 0.24], s(0.4, 1, t));
}

async function captureStudy(final = false): Promise<string[]> {
  const prefix = final ? 'lookdev-01-kiln' : `scratch/kiln-${new Date().toISOString().slice(11, 19).replaceAll(':', '')}`;
  const written: string[] = [];
  const full = { width: FRAME.width, height: FRAME.height, scale: 1, x: 0, y: 0 };
  await say('capturing the beauty frame…');
  setMode('beauty');
  const beauty = await shoot({ ...full, samples: 40 });
  written.push(await save(`${prefix}.png`, beauty));
  await say('capturing the 4× crop…');
  const crop4x = await shoot({ width: CROP.width * 4, height: CROP.height * 4, scale: 4, x: crop.x, y: crop.y, samples: 64 });
  written.push(await save(`${prefix}-4x.png`, crop4x));
  const foot4x = await shoot({ width: CROP.width * 4, height: CROP.height * 4, scale: 4, x: footCrop.x, y: footCrop.y, samples: 64 });
  written.push(await save(`${prefix}-4x-foot.png`, foot4x));
  await say('capturing the thickness map…');
  setMode('thickness');
  const thick = await shoot({ ...full, samples: 8 });
  written.push(await save(`${prefix}-thickness.png`, annotate(thick, ['glaze thickness, mm · contours every 0.25 mm · model, not measured'], true)));
  await say('capturing the fracture graph…');
  setMode('graph');
  const graph = await shoot({ ...full, samples: 40 });
  const [inside, outside] = built.map((b) => b.stats);
  written.push(await save(`${prefix}-fracture.png`, annotate(blend(beauty, graph), [
    `fracture graph at 50% · inside ${inside.cracks} cracks, ${inside.ends.crack} T-ends · outside ${outside.cracks} cracks, ${outside.ends.crack} T-ends`,
    `seed ${fracture.seed} · cooling ${fracture.cooling} · model, labeled PA in the record`,
  ])));
  setMode('beauty');
  const fourX = await shoot({ width: CROP.width * 4, height: CROP.height * 4, scale: 4, x: crop.x, y: crop.y, samples: 32 });
  setMode('graph');
  const fourXGraph = await shoot({ width: CROP.width * 4, height: CROP.height * 4, scale: 4, x: crop.x, y: crop.y, samples: 32 });
  setMode('beauty');
  written.push(await save(`${prefix}-fracture-4x.png`, blend(fourX, fourXGraph)));
  await say('setting the labels…');
  written.push(await labelTest('Martian Mono Narrow', '/yaobian/fonts/martian-mono/MartianMono-NrRg.woff2', final ? 'lookdev-01-kiln-labels' : `${prefix.replace('scratch/', '')}-labels`, final));
  written.push(await save(`${prefix}.json`, new Blob([JSON.stringify(record(), null, 2)], { type: 'application/json' })));
  await say(`wrote ${written.join(', ')}`);
  return written;
}

function record() {
  return {
    study: 'studies/lookdev-01-kiln.md',
    date: new Date().toISOString(),
    backend: isWebGPU() ? 'WebGPU' : 'WebGL 2',
    camera: { position: camera.position.toArray(), target: controls.target.toArray(), fov: camera.fov },
    key: { ...key, width: softbox.width, height: softbox.height, intensity: softbox.light.intensity },
    exposure: renderer.toneMappingExposure,
    environmentIntensity: scene.environmentIntensity,
    crop,
    footCrop,
    fracture,
    stats: Object.fromEntries(built.map((b) => [b.side, b.stats])),
    glaze: Object.fromEntries(Object.entries(glaze).map(([k, u]) => [k, (u.value as { toArray?: () => number[] }).toArray?.() ?? u.value])),
  };
}

// Label test ------------------------------------------------------------------------------------------

/** A chart point (mm) for arc length s and azimuth φ, where x = r sin φ and z = r cos φ. */
const chartAt = (s: number, phi: number): [number, number] => [s * Math.cos(phi), s * Math.sin(phi)];

/**
 * LOOK.md's label system on the study frame, in a candidate monospace: one face for every label and
 * readout, hairline leaders one device pixel wide, a 3 px dot on the anchored part, ink in the
 * piece's key. The frame is 2400 px wide, a 1200 px screen at 2×, so 11 CSS px is 22 px here.
 */
async function labelTest(family: string, url: string, slug: string, final = false): Promise<string> {
  const face = new FontFace(family, `url(${url})`);
  await face.load();
  document.fonts.add(face);
  setMode('beauty');
  const beauty = await shoot({ width: FRAME.width, height: FRAME.height, scale: 1, x: 0, y: 0, samples: 24 });
  const canvas = new OffscreenCanvas(FRAME.width, FRAME.height);
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(beauty, 0, 0);

  const savedAspect = camera.aspect;
  camera.aspect = FRAME.width / FRAME.height;
  camera.updateProjectionMatrix();
  const project = (p: [number, number, number]) => {
    const v = new THREE.Vector3(...p).project(camera);
    return [((v.x + 1) / 2) * FRAME.width, ((1 - v.y) / 2) * FRAME.height];
  };
  const [inside, outside] = built.map((b) => b.surface);
  // A crack in the far side of the well, where the view is sharpest.
  const crack = built[0].cracks.find((c) => {
    const x = c.points[Math.floor(c.points.length / 4) * 2], y = c.points[Math.floor(c.points.length / 4) * 2 + 1];
    const s = Math.hypot(x, y), phi = Math.atan2(y, x);
    return s > 14 && s < 26 && Math.cos(phi) < -0.8 && c.length > 6;
  }) ?? built[0].cracks[0];
  const mid = Math.floor(crack.points.length / 4) * 2;
  const soleMid = (outside.profile.marks.footSoleIn + outside.profile.marks.footSoleOut) / 2;
  const anchors = [
    { at: project(surfacePoint(inside, ...chartAt(inside.profile.length, -Math.PI / 2))), text: 'rim · glaze 0.07 mm', size: 11, dx: -250, dy: -150 },
    { at: project(surfacePoint(inside, ...chartAt(8, Math.PI))), text: 'well · glaze 1.3 mm', size: 12, dx: 300, dy: -250 },
    { at: project(surfacePoint(inside, crack.points[mid], crack.points[mid + 1])), text: `crack · opened at ${Math.round(crack.load * 100)}% of the tension · PA`, size: 13, dx: 160, dy: -330 },
    { at: project(surfacePoint(outside, ...chartAt(soleMid, 0.25))), text: 'foot · body bare where worn', size: 12, dx: -330, dy: 150 },
  ];
  camera.aspect = savedAspect;
  camera.updateProjectionMatrix();

  const ink = '#2b2723';
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = 1;
  for (const { at: [x, y], text, size, dx, dy } of anchors) {
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2); // a 3 CSS px dot is 6 px across at 2×
    ctx.fill();
    const tx = x + dx, ty = y + dy;
    ctx.beginPath();
    ctx.moveTo(Math.round(x) + 0.5, Math.round(y) + 0.5);
    ctx.lineTo(Math.round(tx) + 0.5, Math.round(ty) + 0.5);
    ctx.stroke();
    ctx.font = `${size * 2}px "${family}"`;
    const width = ctx.measureText(text).width;
    const tag = `  ${size} px`; // the test's size note, set clear of the leader
    const tagWidth = ctx.measureText(tag).width;
    const left = dx < 0 ? tx - width - tagWidth : tx;
    const shelf = dx < 0 ? [tx - width - tagWidth, tx] : [tx, tx + width];
    ctx.beginPath(); // a short shelf under the words, so the leader lands on the text
    ctx.moveTo(Math.round(shelf[0]) + 0.5, Math.round(ty) + 0.5);
    ctx.lineTo(Math.round(shelf[1]) + 0.5, Math.round(ty) + 0.5);
    ctx.stroke();
    ctx.fillText(`${text}${tag}`, left, ty - 10);
  }
  const [a, b] = built.map((bb) => bb.stats);
  ctx.font = `${12 * 2}px "${family}"`;
  ctx.fillText(`KILN · look development 01 · ${a.cracks.toLocaleString('en-US')} cracks inside, ${b.cracks.toLocaleString('en-US')} outside · seed ${fracture.seed} · 12 px`, 48, FRAME.height - 84);
  ctx.font = `${11 * 2}px "${family}"`;
  ctx.fillText(`${family} · 0O 1lI 5S 8B 2Z · 0123456789 · 1,111.11 mm · 11 px`, 48, FRAME.height - 44);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return save(final ? `${slug}.png` : `scratch/labels-${slug}.png`, blob);
}

// Panel and keys ------------------------------------------------------------------------------------

const panel = document.querySelector<HTMLElement>('#panel')!;
const readout = document.querySelector<HTMLElement>('#readout')!;
const cropBox = document.querySelector<HTMLElement>('#crop')!;

function describe(): void {
  const [inside, outside] = built.map((b) => b.stats);
  readout.textContent = [
    `backend   ${isWebGPU() ? 'WebGPU' : 'WebGL 2'} · view ${mode}`,
    `key       azimuth ${key.azimuth}° · elevation ${key.elevation}° · ${softbox.width} × ${softbox.height} m at ${key.distance} m · exposure ${renderer.toneMappingExposure.toFixed(2)}`,
    `crackle   inside ${inside.cracks} cracks, spacing ${inside.spacing.toFixed(1)} mm · outside ${outside.cracks}, ${outside.spacing.toFixed(1)} mm · seed ${fracture.seed}`,
  ].join('\n');
}

function showCrop(): void {
  // Map the crop's frame rectangle onto the screen, which shows the same view at another size.
  const scaleX = innerWidth / FRAME.width, scaleY = innerHeight / FRAME.height;
  const s = Math.max(scaleX, scaleY); // the screen crops the 16:9 frame to its own aspect, centered
  const offsetX = (innerWidth - FRAME.width * s) / 2, offsetY = (innerHeight - FRAME.height * s) / 2;
  Object.assign(cropBox.style, {
    left: `${offsetX + crop.x * s}px`, top: `${offsetY + crop.y * s}px`, width: `${CROP.width * s}px`, height: `${CROP.height * s}px`,
  });
}

addEventListener('keydown', (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  switch (event.code) {
    case 'ArrowLeft': key.azimuth -= 4; placeKey(); break;
    case 'ArrowRight': key.azimuth += 4; placeKey(); break;
    case 'ArrowUp': key.elevation = Math.min(key.elevation + 2, 80); placeKey(); break;
    case 'ArrowDown': key.elevation = Math.max(key.elevation - 2, 4); placeKey(); break;
    case 'BracketRight': renderer.toneMappingExposure *= 1.1; break;
    case 'BracketLeft': renderer.toneMappingExposure /= 1.1; break;
    case 'KeyV': setMode(mode === 'beauty' ? 'thickness' : mode === 'thickness' ? 'graph' : 'beauty'); break;
    case 'KeyK': glaze.crackle.value = glaze.crackle.value ? 0 : 1; break;
    case 'KeyB': glaze.bubbles.value = glaze.bubbles.value ? 0 : 1; break;
    case 'KeyD': dofOn = !dofOn; break;
    case 'KeyX': cropBox.style.display = cropBox.style.display === 'block' ? 'none' : 'block'; showCrop(); break;
    case 'KeyC': void captureStudy(false); break;
    case 'KeyR': resetView(); break;
    case 'KeyH': panel.hidden = !panel.hidden; break;
    default: return;
  }
  event.preventDefault();
  needsRender = true;
  describe();
});

// Frame loop: render on demand ------------------------------------------------------------------------

resetView();
placeKey();
await say('KILN · look development · H for controls');
setTimeout(() => hint.classList.add('gone'), 3000);
describe();

let warmup = 30;
renderer.setAnimationLoop(() => {
  if (capturing) return;
  const moving = controls.update();
  if (warmup > 0) { warmup--; needsRender = true; }
  if (!moving && !needsRender) return;
  needsRender = false;
  uFocus.value = camera.position.distanceTo(controls.target); // focus follows the orbit target
  uBokeh.value = dofOn && mode !== 'thickness' ? lens.previewBokeh * (renderer.domElement.width / FRAME.width) : 0;
  pipeline.render();
});

// Lab inspection from the console and from the capture tooling.
Object.assign(window, {
  kiln: {
    THREE, camera, controls, scene, renderer, softbox, key, placeKey, glaze, fracture, built, crop, setMode, captureStudy, shoot, save,
    uFocus, uFocalRange, uBokeh, lens, aoPass, resetView, labelTest, render: () => { needsRender = true; },
  },
});
