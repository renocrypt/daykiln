// RULE, first look-development frame: studies/lookdev-02-rule.md.
//
// A wall drawn by one construction: Hankin's polygons in contact on a periodic tiling, at one
// contact angle, interlaced. The same rule is rendered in carved stucco and in cut-tile mosaic,
// under one raking sun, seen frontally with a long lens and no depth of field. The frame exists to
// choose RULE's hero material and to prove the pattern generator at 4×.

import * as THREE from 'three/webgpu';
import {
  Fn, abs, atan, float, fract, interleavedGradientNoise, mix, pass, positionLocal, renderOutput, screenCoordinate, select, smoothstep, step,
  uniform, vec3, vec4,
} from 'three/tsl';
import type { TilingName, Vec } from '../../src/rule/tiling.ts';
import type { Pattern } from '../../src/rule/hankin.ts';
import type { Relief } from '../../src/rule/bake.ts';
import type { BakeRequest } from '../../src/rule/bake.worker.ts';
import { relief, reliefNodes, reliefSun, reliefTextures, stuccoMaterial, tileMaterial } from '../../src/rule/relief.ts';
import { loadFace, save, shoot, type Region } from '../../src/core/capture.ts';

const deg = THREE.MathUtils.degToRad;
const hint = document.querySelector<HTMLElement>('#hint')!;
const say = async (text: string) => {
  hint.textContent = text;
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
};

// The study's frame and its 4× crop; the wall section the frame shows, in meters.
const FRAME = { width: 2400, height: 1350 };
const CROP = { width: 600, height: 338 };
const WALL = { height: 0.675 }; // m: a section 1.2 m wide, six octagons across
const DISTANCE = 8; // m: a long lens, so the wall is drawn almost in elevation

// The rule's ground: a tiling, and the point of its repeat set at the frame's center, a large tile's.
type Ground = { tiling: TilingName; across: number; center: Vec };
const GROUNDS: Ground[] = [
  { tiling: '4.8.8', across: 200, center: [100, 100] },
  { tiling: '6.6.6', across: 200, center: [0, 0] },
  { tiling: '3.12.12', across: 220, center: [0, 0] },
];
const STRAP = 14; // mm
const TEXEL = 0.1; // mm: a 4× crop's pixel is about 0.12 mm

const state = { ground: 0, angle: 72.5, material: 'stucco' as 'stucco' | 'tile', overlay: false, sunAzimuth: 135, sunElevation: 25 };

// Renderer ------------------------------------------------------------------------------------------

const renderer = new THREE.WebGPURenderer({ antialias: false, forceWebGL: new URLSearchParams(location.search).has('webgl') });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.NeutralToneMapping; // LOOK.md: the tile hues must not drift
renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true; // the sun's shadow is the relief's own; see relief.ts
document.body.prepend(renderer.domElement);
await renderer.init();
const isWebGPU = () => (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend === true;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#ece7dd');

/**
 * A courtyard for the fill and for the glaze to reflect: sky above the roofline, the facing
 * arcade's sunlit plaster and dark openings, warm paving below. The glaze's tilted pieces each
 * reflect a different part of it, which is how a tiled wall reads as made of pieces.
 */
function courtyard(): THREE.Texture {
  const sky = new THREE.Scene();
  const material = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide });
  const dir = positionLocal.normalize();
  const up = dir.y;
  const elevation = up.asin().mul(180 / Math.PI);
  const azimuth = atan(dir.x, dir.z).mul(180 / Math.PI);
  const bay = fract(azimuth.div(18)).sub(0.5).mul(18); // degrees from the nearest bay's axis
  const opening = step(abs(bay), float(5.5)).mul(step(elevation, float(9).add(float(5.5).mul(float(1).sub(bay.div(5.5).pow(2)).max(0).sqrt()))));
  const zenith = vec3(0.4, 0.53, 0.78), horizon = vec3(0.82, 0.82, 0.8);
  const skyColor = mix(horizon, zenith, smoothstep(22, 70, elevation));
  const facade = mix(vec3(0.78, 0.7, 0.58), vec3(0.06, 0.05, 0.045), opening);
  const paving = vec3(0.42, 0.33, 0.24);
  material.colorNode = select(elevation.lessThan(0), paving, select(elevation.lessThan(22), facade, skyColor));
  sky.add(new THREE.Mesh(new THREE.SphereGeometry(10, 128, 64), material));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(sky, 0.004).texture;
  pmrem.dispose();
  return texture;
}
scene.environment = courtyard();
scene.environmentIntensity = 0.6; // the shade: the courtyard's light, about a stop under the shaft

const camera = new THREE.PerspectiveCamera(THREE.MathUtils.radToDeg(2 * Math.atan(WALL.height / 2 / DISTANCE)), innerWidth / innerHeight, 1, 20);
camera.position.set(0, 0, DISTANCE);
camera.lookAt(0, 0, 0);

// The rule ------------------------------------------------------------------------------------------

let pattern!: Pattern;
let baked!: Relief;
/** Draw and bake the rule in a worker. */
function draw(): Promise<void> {
  const ground = GROUNDS[state.ground];
  const request: BakeRequest = {
    tiling: ground.tiling, across: ground.across, angle: deg(state.angle),
    options: { strap: STRAP, texel: TEXEL, reach: 16, depth: 9, bevel: 2.4, dip: 3.4, dipLength: 14 },
  };
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../../src/rule/bake.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<{ pattern: Pattern; relief: Relief }>) => {
      ({ pattern, relief: baked } = event.data);
      relief.origin.value.set(ground.center[0], ground.center[1]);
      relief.strap.value = STRAP;
      worker.terminate();
      resolve();
    };
    worker.onerror = (event) => reject(event);
    worker.postMessage(request);
  });
}

await say('drawing the rule…');
await draw();
const nodes = reliefNodes(reliefTextures(baked));
const materials = { stucco: stuccoMaterial(nodes), tile: tileMaterial(nodes) };
const wall = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.0), materials.stucco);
wall.receiveShadow = true;
scene.add(wall);

async function redraw(): Promise<void> {
  await say(`drawing ${GROUNDS[state.ground].tiling} at ${state.angle}°…`);
  await draw();
  nodes.swap(reliefTextures(baked));
  rebuildOverlay();
  describe();
  needsRender = true;
  hint.textContent = `${pattern.tiling.name} · θ ${state.angle}° · ${baked.faces} faces in ${baked.classes.length} classes · ${baked.milliseconds.toFixed(0)} ms`;
}

// One sun, raking across the wall from the upper left.
const sun = reliefSun(nodes, new THREE.Color().setRGB(1, 0.96, 0.9), 6);
scene.add(sun, sun.target);
function placeSun(): void {
  const a = deg(state.sunAzimuth), e = deg(state.sunElevation);
  const L = new THREE.Vector3(Math.cos(a) * Math.cos(e), Math.sin(a) * Math.cos(e), Math.sin(e));
  relief.sun.value.copy(L);
  sun.position.copy(L).multiplyScalar(10);
  needsRender = true;
}

// The derivation: the tiling and the lines drawn from it, a hair above the wall.
const overlay = new THREE.Group();
scene.add(overlay);
function rebuildOverlay(): void {
  overlay.clear();
  const t = pattern.tiling;
  const [ox, oy] = [relief.origin.value.x, relief.origin.value.y];
  const tilingLines: number[] = [], ruleLines: number[] = [];
  const toWorld = (x: number, y: number) => [(x - ox) / 1000, (y - oy) / 1000, 0.0005];
  const reach = [1700, 1000]; // mm around the center
  const i0 = Math.floor((ox - reach[0]) / t.width) - 1, i1 = Math.ceil((ox + reach[0]) / t.width) + 1;
  const j0 = Math.floor((oy - reach[1]) / t.height) - 1, j1 = Math.ceil((oy + reach[1]) / t.height) + 1;
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      const dx = i * t.width, dy = j * t.height;
      for (const poly of t.tiles) {
        poly.forEach((p, k) => {
          const q = poly[(k + 1) % poly.length];
          tilingLines.push(...toWorld(p[0] + dx, p[1] + dy), ...toWorld(q[0] + dx, q[1] + dy));
        });
      }
      for (const s of pattern.segments) ruleLines.push(...toWorld(s.a[0] + dx, s.a[1] + dy), ...toWorld(s.b[0] + dx, s.b[1] + dy));
    }
  }
  const lines = (positions: number[], color: string) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return new THREE.LineSegments(g, new THREE.LineBasicNodeMaterial({ color }));
  };
  overlay.add(lines(tilingLines, '#00a3c4'), lines(ruleLines, '#ff00aa'));
  overlay.visible = state.overlay;
}
rebuildOverlay();

// Post: output and a fine static grain ----------------------------------------------------------------

const uGrain = uniform(1);
const pipeline = new THREE.RenderPipeline(renderer);
pipeline.outputColorTransform = false;
pipeline.outputNode = Fn(() => {
  const display = renderOutput(pass(scene, camera));
  return vec4(display.rgb.add(interleavedGradientNoise(screenCoordinate.xy).sub(0.5).mul(float(1.5 / 255).mul(uGrain))), 1);
})();

let needsRender = true;
let capturing = false;
function layout(): void {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  needsRender = true;
}
addEventListener('resize', layout);

function setMaterial(next: 'stucco' | 'tile'): void {
  state.material = next;
  relief.mode.value = next === 'tile' ? 1 : 0;
  wall.material = materials[next];
  needsRender = true;
}

// Capture ---------------------------------------------------------------------------------------------

const shooter = {
  renderer, camera, frame: FRAME,
  render: () => pipeline.render(),
  beforeSample: (i: number) => { relief.frame.value = i; },
};
async function frame(region: Partial<Region> = {}): Promise<ImageData> {
  capturing = true;
  uGrain.value = 0;
  const image = await shoot(shooter, { width: FRAME.width, height: FRAME.height, scale: 1, x: 0, y: 0, samples: 24, ...region });
  uGrain.value = 1;
  capturing = false;
  needsRender = true;
  return image;
}
const crop = { x: 900, y: 480 }; // inside the shaft, across a crossing

/**
 * The derivation record: the tiling and the lines derived from it drawn over the frame at 50%, the
 * contact angle drawn once at one contact point, and a caption. Drawn on a canvas, where a line
 * can be wider than one pixel.
 */
async function derivationRecord(beauty: ImageData): Promise<ImageData> {
  await loadFace('Martian Mono Narrow', '/yaobian/fonts/martian-mono/MartianMono-NrRg.woff2');
  camera.aspect = FRAME.width / FRAME.height;
  camera.updateProjectionMatrix();
  const [ox, oy] = [relief.origin.value.x, relief.origin.value.y];
  const toScreen = (x: number, y: number): [number, number] => {
    const v = new THREE.Vector3((x - ox) / 1000, (y - oy) / 1000, 0).project(camera);
    return [((v.x + 1) / 2) * FRAME.width, ((1 - v.y) / 2) * FRAME.height];
  };
  const pxPerMm = toScreen(ox + 1, oy)[0] - toScreen(ox, oy)[0];
  const t = pattern.tiling;
  const span = [FRAME.width / pxPerMm / 2 + t.width, FRAME.height / pxPerMm / 2 + t.height];
  const i0 = Math.floor((ox - span[0]) / t.width), i1 = Math.ceil((ox + span[0]) / t.width);
  const j0 = Math.floor((oy - span[1]) / t.height), j1 = Math.ceil((oy + span[1]) / t.height);

  // The overlay, drawn alone, then laid over the frame at 50%.
  const layer = new OffscreenCanvas(FRAME.width, FRAME.height);
  const lc = layer.getContext('2d')!;
  lc.lineCap = 'round';
  const stroke = (color: string, width: number, lines: [number, number, number, number][]) => {
    lc.strokeStyle = color;
    lc.lineWidth = width;
    lc.beginPath();
    for (const [x0, y0, x1, y1] of lines) {
      const a = toScreen(x0, y0), b = toScreen(x1, y1);
      lc.moveTo(a[0], a[1]);
      lc.lineTo(b[0], b[1]);
    }
    lc.stroke();
  };
  const tilingLines: [number, number, number, number][] = [], ruleLines: [number, number, number, number][] = [];
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      const dx = i * t.width, dy = j * t.height;
      for (const poly of t.tiles) {
        poly.forEach((p, k) => {
          const q = poly[(k + 1) % poly.length];
          tilingLines.push([p[0] + dx, p[1] + dy, q[0] + dx, q[1] + dy]);
        });
      }
      for (const s of pattern.segments) ruleLines.push([s.a[0] + dx, s.a[1] + dy, s.b[0] + dx, s.b[1] + dy]);
    }
  }
  stroke('#00c8f0', 3, tilingLines);
  stroke('#ff1fb4', 4, ruleLines);
  const canvas = new OffscreenCanvas(FRAME.width, FRAME.height);
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(beauty, 0, 0);
  ctx.globalAlpha = 0.5;
  ctx.drawImage(layer, 0, 0);
  ctx.globalAlpha = 1;

  // The contact angle, once: at the contact point nearest a third of the frame, the tile edge,
  // one derived line, and the short arc between them.
  const goal = [FRAME.width * 0.36, FRAME.height * 0.42];
  let best: { at: Vec; seg: number; d: number } | null = null;
  for (const c of pattern.crossings) {
    if (c.lines[0].length !== 2) continue; // contact points only
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const at: Vec = [c.at[0] + i * t.width, c.at[1] + j * t.height];
      const sp = toScreen(...at);
      const d = Math.hypot(sp[0] - goal[0], sp[1] - goal[1]);
      if (!best || d < best.d) best = { at, seg: c.lines[0][0], d };
    }
  }
  const ink = '#2b2723';
  ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineWidth = 3;
  if (best) {
    const seg = pattern.segments[best.seg];
    const poly = t.tiles[seg.tile];
    const p0 = poly[seg.edge], p1 = poly[(seg.edge + 1) % poly.length];
    const el = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    let e: Vec = [(p1[0] - p0[0]) / el, (p1[1] - p0[1]) / el];
    const sl = Math.hypot(seg.b[0] - seg.a[0], seg.b[1] - seg.a[1]);
    const dir: Vec = [(seg.b[0] - seg.a[0]) / sl, (seg.b[1] - seg.a[1]) / sl];
    if (e[0] * dir[0] + e[1] * dir[1] < 0) e = [-e[0], -e[1]]; // the edge ray on the line's side
    const at = toScreen(...best.at);
    const r = 34 * pxPerMm;
    const along = (v: Vec, len: number) => toScreen(best!.at[0] + v[0] * len, best!.at[1] + v[1] * len);
    const e0 = along([-e[0], -e[1]], 48), e1 = along(e, 48), l1 = along(dir, 48);
    ctx.beginPath(); ctx.moveTo(...e0); ctx.lineTo(...e1); ctx.stroke(); // the tile edge
    ctx.beginPath(); ctx.moveTo(...at); ctx.lineTo(...l1); ctx.stroke(); // the derived line
    const a0 = Math.atan2(e1[1] - at[1], e1[0] - at[0]), a1 = Math.atan2(l1[1] - at[1], l1[0] - at[0]);
    let delta = a1 - a0;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    ctx.beginPath(); ctx.arc(at[0], at[1], r, a0, a0 + delta, delta < 0); ctx.stroke();
    ctx.beginPath(); ctx.arc(at[0], at[1], 6, 0, Math.PI * 2); ctx.fill();
    const mid = a0 + delta / 2;
    ctx.font = '30px "Martian Mono Narrow"';
    const label = `θ ${state.angle}°`;
    const lw = ctx.measureText(label).width;
    const lx = at[0] + Math.cos(mid) * (r + 26) - (Math.cos(mid) < 0 ? lw : 0), ly = at[1] + Math.sin(mid) * (r + 26) + 10;
    ctx.fillStyle = 'rgb(236 231 221 / 0.86)';
    ctx.fillRect(lx - 8, ly - 30, lw + 16, 42);
    ctx.fillStyle = ink;
    ctx.fillText(label, lx, ly);
  }
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();

  ctx.font = '24px "Martian Mono Narrow"';
  const caption = [
    `derivation · ${t.name} tiling in cyan · lines derived from it in magenta · contact angle θ ${state.angle}°`,
    `Hankin's polygons in contact · every strap on a derived line · ${pattern.segments.length} segments and ${pattern.crossings.length} crossings a repeat`,
  ];
  const width = Math.max(...caption.map((l) => ctx.measureText(l).width));
  ctx.fillStyle = 'rgb(236 231 221 / 0.9)';
  ctx.fillRect(28, FRAME.height - 118, width + 40, 92);
  ctx.fillStyle = ink;
  caption.forEach((l, i) => ctx.fillText(l, 48, FRAME.height - 76 + i * 34));
  return ctx.getImageData(0, 0, FRAME.width, FRAME.height);
}

/** The rule turning: one wall at several contact angles, as a sheet. */
async function angleSheet(angles: number[]): Promise<ImageData> {
  const cols = 3, rows = Math.ceil(angles.length / cols);
  const w = 800, h = 450, gap = 12, caption = 44;
  const canvas = new OffscreenCanvas(cols * w + (cols - 1) * gap, rows * (h + caption));
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ece7dd';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await loadFace('Martian Mono Narrow', '/yaobian/fonts/martian-mono/MartianMono-NrRg.woff2');
  ctx.font = '22px "Martian Mono Narrow"';
  ctx.fillStyle = '#2b2723';
  const saved = state.angle;
  for (let k = 0; k < angles.length; k++) {
    state.angle = angles[k];
    await redraw();
    const image = await frame({ width: w, height: h, scale: w / FRAME.width, samples: 12 });
    const x = (k % cols) * (w + gap), y = Math.floor(k / cols) * (h + caption);
    ctx.putImageData(image, x, y);
    ctx.fillText(`θ ${angles[k]}°`, x + 4, y + h + 30);
  }
  state.angle = saved;
  await redraw();
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

async function captureStudy(final = false): Promise<string[]> {
  const prefix = final ? 'lookdev-02-rule' : `scratch/rule-${new Date().toISOString().slice(11, 19).replaceAll(':', '')}`;
  const written: string[] = [];
  const four = { width: CROP.width * 4, height: CROP.height * 4, scale: 4, x: crop.x, y: crop.y, samples: 16 };
  const materialNow = state.material;
  const beauty: Record<string, ImageData> = {};
  for (const m of ['stucco', 'tile'] as const) {
    setMaterial(m);
    await say(`capturing the ${m} frame…`);
    beauty[m] = await frame();
    written.push(await save(`${prefix}-${m}.png`, beauty[m]));
    written.push(await save(`${prefix}-${m}-4x.png`, await frame(four)));
  }
  await say('capturing the derivation…');
  written.push(await save(`${prefix}-derivation.png`, await derivationRecord(beauty.tile)));
  setMaterial('stucco');
  await say('turning the rule…');
  written.push(await save(`${prefix}-angles.png`, await angleSheet([45, 55, 60, 67.5, 72.5, 78])));
  setMaterial(materialNow);
  written.push(await save(`${prefix}.json`, new Blob([JSON.stringify(record(), null, 2)], { type: 'application/json' })));
  await say(`wrote ${written.join(', ')}`);
  return written;
}

function record() {
  return {
    study: 'studies/lookdev-02-rule.md',
    date: new Date().toISOString(),
    backend: isWebGPU() ? 'WebGPU' : 'WebGL 2',
    tiling: pattern.tiling.name, angle: state.angle, strap: STRAP, texel: TEXEL,
    segments: pattern.segments.length, crossings: pattern.crossings.length,
    faces: baked.faces, classes: baked.classes.map((c) => ({ area: +c.area.toFixed(1), faces: c.faces.length })), conflicts: baked.conflicts,
    sun: { azimuth: state.sunAzimuth, elevation: state.sunElevation, intensity: sun.intensity },
    environmentIntensity: scene.environmentIntensity, exposure: renderer.toneMappingExposure, crop,
    relief: Object.fromEntries(Object.entries(relief).map(([k, u]) => [k, (u.value as { toArray?: () => number[] }).toArray?.() ?? u.value])),
  };
}

// Panel and keys ------------------------------------------------------------------------------------

const panel = document.querySelector<HTMLElement>('#panel')!;
const readout = document.querySelector<HTMLElement>('#readout')!;
function describe(): void {
  readout.textContent = [
    `backend   ${isWebGPU() ? 'WebGPU' : 'WebGL 2'} · ${state.material}`,
    `rule      ${pattern.tiling.name} · θ ${state.angle}° · ${pattern.segments.length} segments, ${pattern.crossings.length} crossings a repeat · interlace conflicts ${baked.conflicts}`,
    `sun       azimuth ${state.sunAzimuth}° · ${state.sunElevation}° to the wall`,
  ].join('\n');
}

let busy = false;
addEventListener('keydown', async (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey || busy) return;
  const rebake = async () => { busy = true; await redraw(); busy = false; };
  switch (event.code) {
    case 'BracketRight': state.angle = Math.min(state.angle + 2.5, 85); void rebake(); break;
    case 'BracketLeft': state.angle = Math.max(state.angle - 2.5, 20); void rebake(); break;
    case 'KeyT': state.ground = (state.ground + 1) % GROUNDS.length; void rebake(); break;
    case 'KeyM': setMaterial(state.material === 'stucco' ? 'tile' : 'stucco'); break;
    case 'KeyG': state.overlay = !state.overlay; overlay.visible = state.overlay; break;
    case 'ArrowLeft': state.sunAzimuth += 5; placeSun(); break;
    case 'ArrowRight': state.sunAzimuth -= 5; placeSun(); break;
    case 'ArrowUp': state.sunElevation = Math.min(state.sunElevation + 3, 85); placeSun(); break;
    case 'ArrowDown': state.sunElevation = Math.max(state.sunElevation - 3, 5); placeSun(); break;
    case 'KeyC': void captureStudy(false); break;
    case 'KeyH': panel.hidden = !panel.hidden; break;
    default: return;
  }
  event.preventDefault();
  needsRender = true;
  describe();
});

// Frame loop: render on demand ----------------------------------------------------------------------

placeSun();
describe();
hint.textContent = `RULE · look development · ${pattern.tiling.name} · θ ${state.angle}° · H for controls`;
setTimeout(() => hint.classList.add('gone'), 3000);
let warmup = 30;
renderer.setAnimationLoop(() => {
  if (capturing) return;
  if (warmup > 0) { warmup--; needsRender = true; }
  if (!needsRender) return;
  needsRender = false;
  pipeline.render();
});

Object.assign(window, {
  rule: {
    THREE, renderer, scene, camera, sun, relief, state, crop, setMaterial, redraw, placeSun, frame, save, captureStudy, angleSheet,
    derivationRecord, get pattern() { return pattern; }, get baked() { return baked; }, render: () => { needsRender = true; },
  },
});
