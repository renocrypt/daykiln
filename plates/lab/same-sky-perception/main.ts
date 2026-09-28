// SAME SKY, first test: light before the room.
//
// A full-screen ceiling wash surrounds a square of sky pixels whose displayed value never
// changes. If a colored wash does not visibly shift that square on real screens, no plaster,
// cove, or room model can rescue the piece. See README.md beside this file for the protocol.

import * as THREE from 'three/webgpu';
import {
  Fn, abs, float, interleavedGradientNoise, max, mix, renderOutput, screenCoordinate, select,
  uniform, vec4,
} from 'three/tsl';
import { damp } from '../../src/core/damp.ts';

// Wash hues, normalized so the brightest channel is 1; intensity scales them.
const WASHES = [
  { name: 'neutral', hex: '#f2efe8' },
  { name: 'amber', hex: '#ffb45a' },
  { name: 'rose', hex: '#ff8fb8' },
  { name: 'violet', hex: '#9d8cff' },
  { name: 'green', hex: '#8fe0a0' },
  { name: 'dark', hex: '#f2efe8', gain: 1 / 16 },
] as const;

// Constant sky values, chosen inside the near-linear range of the neutral tone curve.
const SKIES = [
  { name: 'twilight', hex: '#5b78b0' },
  { name: 'deep dusk', hex: '#3a4c78' },
  { name: 'overcast', hex: '#9aa0a8' },
] as const;

const WASH_HALF_LIFE = 0.8; // s, LOOK.md: adaptation takes time
const QUARTER_STOP = Math.pow(2, 0.25);
const LOG_KEY = 'plates.same-sky-perception.log';
// Linear difference below which the ease snaps to its target: under half an 8-bit code value
// even for the dark wash, so the snap is invisible and the GPU can idle.
const SETTLED = 5e-4;

type Wash = (typeof WASHES)[number];

const state = {
  a: 1, // index into WASHES: the wash under test
  b: 0, // the comparison wash
  showingB: false,
  intensity: 0.5, // linear value of the wash at the aperture edge
  sky: 0,
  size: 0.3, // aperture side as a fraction of the short side of the screen
  gradient: false,
  probe: false,
  panel: false,
};

function linear(hex: string): THREE.Vector3 {
  const c = new THREE.Color(hex); // stored in linear sRGB
  return new THREE.Vector3(c.r, c.g, c.b);
}

function washColor(wash: Wash, intensity: number): THREE.Color {
  const c = new THREE.Color(wash.hex); // stored in linear sRGB
  const peak = Math.max(c.r, c.g, c.b);
  const gain = 'gain' in wash ? wash.gain : 1;
  return c.multiplyScalar((intensity * gain) / peak);
}

// Shading. Every value is linear until renderOutput applies the tone curve and sRGB encoding.
const uWash = uniform(new THREE.Vector3());
const uSky = uniform(linear(SKIES[state.sky].hex));
const uCenter = uniform(new THREE.Vector2());
const uHalf = uniform(0); // device pixels
const uReach = uniform(1); // device pixels from the center to the frame's far edge
const uGradient = uniform(0);

const frame = Fn(() => {
  const p = screenCoordinate.xy.sub(uCenter);
  // Pixel centers are either inside or outside: the knife edge has no blended pixel and no reveal.
  const inSky = max(abs(p.x), abs(p.y)).lessThan(uHalf);
  // Optional brightening toward the cove along the walls, over a rounded-square distance: the
  // exact square distance creases along the diagonals and shows as lines. The rise starts with
  // zero slope at the aperture edge, so no darker ring forms around the sky; that would read as
  // a reveal.
  const q = abs(p).div(uReach); // pow() of a negative base is undefined in WGSL and GLSL
  const d = q.x.pow(4).add(q.y.pow(4)).pow(0.25).mul(uReach);
  const t = d.sub(uHalf).div(uReach.sub(uHalf)).clamp(0, 1);
  const rise = mix(float(1), t.mul(t).mul(0.6).add(1), uGradient);
  const color = select(inSky, uSky, uWash.mul(rise));
  const display = renderOutput(vec4(color, 1));
  // Static dither keeps slow gradients from banding. The sky is flat and stays undithered, so
  // every one of its pixels holds exactly one value.
  const dither = interleavedGradientNoise(screenCoordinate.xy).sub(0.5).div(255);
  return vec4(display.rgb.add(select(inSky, float(0), dither)), 1);
});

const params = new URLSearchParams(location.search);
const renderer = new THREE.WebGPURenderer({ antialias: false, forceWebGL: params.has('webgl') });
renderer.setPixelRatio(window.devicePixelRatio); // the edge must land on device pixels
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.NeutralToneMapping; // hue-preserving; LOOK.md
renderer.toneMappingExposure = 1; // fixed: an adaptive exposure would change the sky's value
document.body.prepend(renderer.domElement);
await renderer.init();

const pipeline = new THREE.RenderPipeline(renderer);
pipeline.outputColorTransform = false; // the frame node applies the output transform itself
pipeline.outputNode = frame();

const backend = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'WebGPU' : 'WebGL 2';

// Render on demand: a settled frame is drawn once, then the GPU idles until something changes.
let needsRender = true;

function layout(): void {
  needsRender = true;
  renderer.setSize(innerWidth, innerHeight);
  const { width, height } = renderer.domElement;
  uCenter.value.set(width / 2, height / 2);
  uHalf.value = Math.round((state.size * Math.min(width, height)) / 2);
  uReach.value = Math.max(width, height) / 2;
}
addEventListener('resize', layout);
layout();

const current = washColor(WASHES[state.a], state.intensity);
function target(): THREE.Color {
  return washColor(WASHES[state.showingB ? state.b : state.a], state.intensity);
}

// Probe: reads the canvas itself, after the output transform, in the same task as the render.
const probeCanvas = document.createElement('canvas');
probeCanvas.width = probeCanvas.height = 32;
const probeCtx = probeCanvas.getContext('2d', { willReadFrequently: true })!;
const probe = { first: '', frames: 0, changed: 0, sky: [0, 0, 0], uniform: true, wash: [0, 0, 0] };

function sample(x: number, y: number, w: number, h: number): { mean: number[]; uniform: boolean } {
  probeCtx.clearRect(0, 0, w, h);
  probeCtx.drawImage(renderer.domElement, x, y, w, h, 0, 0, w, h);
  const d = probeCtx.getImageData(0, 0, w, h).data;
  const sum = [0, 0, 0];
  let same = true;
  for (let i = 0; i < d.length; i += 4) {
    for (let c = 0; c < 3; c++) sum[c] += d[i + c];
    if (d[i] !== d[0] || d[i + 1] !== d[1] || d[i + 2] !== d[2]) same = false;
  }
  const n = d.length / 4;
  return { mean: sum.map((s) => s / n), uniform: same };
}

function readProbe(): void {
  const cx = Math.round(uCenter.value.x);
  const cy = Math.round(uCenter.value.y);
  const half = uHalf.value;
  const sky = sample(cx - 12, cy - 12, 24, 24);
  const key = sky.mean.map((v) => v.toFixed(2)).join(' ');
  if (probe.frames === 0) probe.first = key;
  else if (key !== probe.first) probe.changed++;
  probe.frames++;
  probe.sky = sky.mean;
  probe.uniform &&= sky.uniform;
  probe.wash = sample(cx + half + 4, cy - 12, 8, 24).mean;
}

function resetProbe(): void {
  Object.assign(probe, { first: '', frames: 0, changed: 0, uniform: true });
}

// Panel: hidden while judging, so nothing but wash and sky is in view.
const panel = document.querySelector<HTMLElement>('#panel')!;
const readout = document.querySelector<HTMLElement>('#readout')!;
const hint = document.querySelector<HTMLElement>('#hint')!;
let hintTimer = 0;

// A brief confirmation at the bottom edge, far from the aperture, then gone.
function flash(text: string): void {
  hint.textContent = text;
  hint.classList.remove('gone');
  clearTimeout(hintTimer);
  hintTimer = window.setTimeout(() => hint.classList.add('gone'), 1600);
}

function log(): Record<string, unknown>[] {
  return JSON.parse(localStorage.getItem(LOG_KEY) ?? '[]');
}

function rate(score: number): void {
  const entries = log();
  entries.push({
    at: new Date().toISOString(),
    backend,
    userAgent: navigator.userAgent,
    viewport: [innerWidth, innerHeight],
    devicePixelRatio,
    p3: matchMedia('(color-gamut: p3)').matches,
    hdr: matchMedia('(dynamic-range: high)').matches,
    sky: SKIES[state.sky].name,
    washA: WASHES[state.a].name,
    washB: WASHES[state.b].name,
    intensity: state.intensity,
    apertureFraction: state.size,
    gradient: state.gradient,
    perceivedShift: score, // 0 none, 1 slight, 2 clear, 3 strong
  });
  localStorage.setItem(LOG_KEY, JSON.stringify(entries));
  const words = ['none', 'slight', 'clear', 'strong'];
  flash(`recorded: ${words[score]} · ${WASHES[state.a].name} against ${WASHES[state.b].name} · ${entries.length} ratings`);
}

function exportLog(): void {
  const blob = new Blob([JSON.stringify(log(), null, 2)], { type: 'application/json' });
  const link = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: `same-sky-perception-${Date.now()}.json`,
  });
  link.click();
  URL.revokeObjectURL(link.href);
  flash(`exported ${log().length} ratings`);
}

function clearLog(): void {
  if (!confirm(`Delete all ${log().length} recorded ratings on this browser?`)) return;
  localStorage.removeItem(LOG_KEY);
  flash('log cleared');
}

function render(): void {
  const rgb = (v: number[]) => v.map((x) => x.toFixed(1).padStart(5)).join(' ');
  const lines = [
    `backend    ${backend} · ${devicePixelRatio}× · exposure fixed · neutral tone curve`,
    `wash       ${state.showingB ? 'B' : 'A'}  A ${WASHES[state.a].name} / B ${WASHES[state.b].name} · edge ${state.intensity.toFixed(3)} linear${state.gradient ? ' · gradient' : ''}`,
    `sky        ${SKIES[state.sky].name} · aperture ${Math.round(state.size * 100)}% of short side`,
    state.probe
      ? `probe sky  ${rgb(probe.sky)}  ${probe.uniform ? 'uniform' : 'NOT uniform'} · ${probe.changed === 0 ? 'unchanged' : `CHANGED in ${probe.changed}`} over ${probe.frames} reads`
      : 'probe      off',
    state.probe ? `probe wash ${rgb(probe.wash)}  (band just outside the edge)` : '',
    `log        ${log().length} ratings`,
  ];
  readout.textContent = lines.filter(Boolean).join('\n');
}

const actions: Record<string, () => void> = {
  toggle: () => { state.showingB = !state.showingB; },
  cut: () => { state.showingB = !state.showingB; current.copy(target()); },
  brighter: () => { state.intensity = Math.min(state.intensity * QUARTER_STOP, 4); },
  dimmer: () => { state.intensity = Math.max(state.intensity / QUARTER_STOP, 1 / 64); },
  sky: () => { state.sky = (state.sky + 1) % SKIES.length; uSky.value.copy(linear(SKIES[state.sky].hex)); resetProbe(); },
  nextB: () => { state.b = (state.b + 1) % WASHES.length; },
  larger: () => { state.size = Math.min(state.size + 0.05, 0.8); layout(); resetProbe(); },
  smaller: () => { state.size = Math.max(state.size - 0.05, 0.05); layout(); resetProbe(); },
  gradient: () => { state.gradient = !state.gradient; uGradient.value = state.gradient ? 1 : 0; },
  probe: () => { state.probe = !state.probe; resetProbe(); },
  panel: () => { state.panel = !state.panel; panel.hidden = !state.panel; },
  fullscreen: () => { void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()); },
  export: exportLog,
  clear: clearLog,
};

addEventListener('keydown', (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const digit = /^Digit([0-9])$/.exec(event.code);
  if (digit && event.shiftKey) {
    const score = Number(digit[1]);
    if (score <= 3) rate(score);
  } else if (digit) {
    const index = Number(digit[1]) - 1;
    if (index >= 0 && index < WASHES.length) state.a = index;
  } else {
    const key: Record<string, string> = {
      Space: 'toggle', KeyX: 'cut', ArrowUp: 'brighter', ArrowDown: 'dimmer', KeyS: 'sky',
      KeyB: 'nextB', BracketRight: 'larger', BracketLeft: 'smaller', KeyG: 'gradient',
      KeyP: 'probe', KeyH: 'panel', KeyF: 'fullscreen', KeyE: 'export',
    };
    const name = key[event.code];
    if (!name) return;
    actions[name]();
  }
  event.preventDefault();
  needsRender = true;
  render();
});

renderer.domElement.addEventListener('click', () => { actions.toggle(); needsRender = true; render(); });
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-action]')) {
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    const { action } = button.dataset;
    if (action === 'nextA') state.a = (state.a + 1) % WASHES.length;
    else if (action?.startsWith('rate')) rate(Number(action.slice(4)));
    else if (action && actions[action]) actions[action]();
    needsRender = true;
    render();
  });
}

let last = performance.now();
renderer.setAnimationLoop((now) => {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  const goal = target();
  const easing = Math.max(Math.abs(goal.r - current.r), Math.abs(goal.g - current.g), Math.abs(goal.b - current.b)) > SETTLED;
  if (easing) {
    current.r = damp(current.r, goal.r, WASH_HALF_LIFE, dt);
    current.g = damp(current.g, goal.g, WASH_HALF_LIFE, dt);
    current.b = damp(current.b, goal.b, WASH_HALF_LIFE, dt);
  } else {
    current.copy(goal);
  }
  if (!easing && !needsRender) return;
  needsRender = false;
  uWash.value.set(current.r, current.g, current.b);
  pipeline.render();
  // Frames are drawn only when something changes, so every drawn frame is probed.
  if (state.probe) readProbe();
  if (state.panel) render();
});
render();
