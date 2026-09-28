// WAKE's smoke, simulated: a herring gull's flight through a lattice of smoke threads, and the lattice
// at the frozen instant. Writes public/assets/wake/threads.bin, which lab/wake-still/threads.ts draws.
//
// A model, labeled as one. The wake is a vortex lattice shed from the trailing edge every step, each
// ring carrying the wing's bound circulation (elliptic across the span, rising in the downstroke, a
// quasi-steady assumption), rolling up under its own induced velocity (Biot–Savart with finite cores);
// the smoke is carried through the same field as material lines.
//
// The lattice: combs on one side of the path, each a column of nozzles, whose threads a light breeze has
// laid straight across the path, 5.6 m long, in 16 rows, dense where the wake passes. The columns keep
// time with the phases: PER_PHASE columns to each phase interval, one of them through each phase; AHEAD
// more ahead of the leading phase, where the air is still calm, and BEHIND more behind the last.
//
// All of the cost is one sum: the velocity every vortex segment induces at every point of smoke. It runs
// on the GPU, through Dawn's WebGPU for Node, and each point sums only the segments within REACH of it
// along the path, as far as the wake's pull carries; the whole flight takes a few seconds. Dawn needs the
// machine's GPU, so run it where nothing sandboxes Metal away from Node.
//
// Usage: node plates/tools/wake-sim.ts [out.bin]    env: PER_PHASE (1), AHEAD (3), BEHIND (1)

import { create, globals } from 'webgpu';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { GULL, SHOULDER, WING_LENGTH, WRIST, loading, wing } from '../src/wake/gull.ts';
import type { WingFrame } from '../src/wake/gull.ts';
import { BODY_PITCH, CLIMB, FROZEN_AT, PHASE_INTERVAL, POSES, bodyAt, pathY, phaseAt } from '../src/wake/flight.ts';

type Vec = [number, number, number];

Object.assign(globalThis, globals);
const started = performance.now();
const elapsed = () => `${((performance.now() - started) / 1000).toFixed(1)} s`;

// The wing's trailing edge --------------------------------------------------------------------

// Liu's chord at ten sections of a 1.1 m common gull wing (Table 1), at ξ = 0.05 … 0.95, closed to a
// point at the tip, and scaled to a herring gull's wing area over its span.
const CHORDS_1_1 = [0.194, 0.196, 0.198, 0.194, 0.184, 0.177, 0.168, 0.15, 0.126, 0.097];
const WING_AREA = 0.2; // m², both wings and the body between them

function liuChord(xi: number): number {
  const TIP_START = 0.85;
  if (xi > TIP_START) {
    const u = (xi - TIP_START) / (1 - TIP_START);
    return liuChord(TIP_START) * Math.sqrt(Math.max(0, 1 - u * u));
  }
  const f = xi / 0.1 - 0.5;
  if (f <= 0) return CHORDS_1_1[0];
  const i = Math.min(Math.floor(f), 8);
  return CHORDS_1_1[i] + (CHORDS_1_1[i + 1] - CHORDS_1_1[i]) * (f - i);
}
const CHORD_SCALE = (() => {
  let integral = 0;
  for (let i = 0; i < 1000; i++) integral += liuChord((i + 0.5) / 1000) / 1000;
  const bodyArea = 2 * SHOULDER.z * CHORDS_1_1[0];
  return (WING_AREA - bodyArea) / (2 * WING_LENGTH * integral);
})();

/** Chord at ξ, the fraction of the wing's length from the shoulder, m. */
function chord(xi: number): number {
  return liuChord(xi) * CHORD_SCALE;
}

const smooth = (x: number) => { const t = Math.min(Math.max(x, 0), 1); return t * t * (3 - 2 * t); };
const normalize = (a: Vec): Vec => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };

/** The trailing edge at ξ, in the body frame. The rods run at quarter chord; the sections turn over a short span round the wrist. */
function trailingPoint(xi: number, frames: { inner: WingFrame; outer: WingFrame }): Vec {
  const { inner, outer } = frames;
  const rod: Vec = xi <= WRIST
    ? [0, 1, 2].map((d) => inner.origin[d] + inner.span[d] * xi * WING_LENGTH) as Vec
    : [0, 1, 2].map((d) => outer.origin[d] + outer.span[d] * (xi - WRIST) * WING_LENGTH) as Vec;
  const blend = smooth((xi - (WRIST - 0.06)) / 0.12);
  const forward = normalize([0, 1, 2].map((d) => inner.forward[d] + (outer.forward[d] - inner.forward[d]) * blend) as Vec);
  const c = chord(xi);
  return [0, 1, 2].map((d) => rod[d] - 0.75 * c * forward[d]) as Vec;
}

// The flight and its wake -------------------------------------------------------------------------

const U = GULL.speed, PERIOD = 1 / GULL.frequency;
const DT = PERIOD / 40; // shedding and advection step
const SUBSTEPS = 4; // for the smoke, 2 ms each: under a centimeter of travel near a core
const MEAN_CIRCULATION = (4 * GULL.mass * 9.81) / (Math.PI * 1.225 * U * GULL.span); // elliptic loading, m²/s
const LOAD_SWING = 0.6; // circulation rises 60% in the downstroke and falls as much in the upstroke
const CORE = 0.025; // m, a vortex core's radius, at least
const XI = [1, 0.96, 0.9, 0.81, 0.69, 0.54, 0.37, 0.19, 0.02]; // trailing edge stations, tip to root
const STATIONS = XI.length * 2;
const PITCH = CLIMB + BODY_PITCH;

const toAir = (p: Vec, t: number): Vec => {
  const c = Math.cos(PITCH), s = Math.sin(PITCH), o = bodyAt(t);
  return [o[0] + p[0] * c - p[1] * s, o[1] + p[0] * s + p[1] * c, o[2] + p[2]];
};
/** The trailing edge in the air, left tip to right tip. */
const trailingEdge = (t: number): Vec[] => {
  const phase = phaseAt(t), left = wing(phase, -1), right = wing(phase, 1);
  return [...XI.map((xi) => toAir(trailingPoint(xi, left), t)), ...[...XI].reverse().map((xi) => toAir(trailingPoint(xi, right), t))];
};
/** Each panel's circulation: elliptic over the instantaneous span, rising in the downstroke. */
const circulation = (t: number, row: Vec[]): number[] => {
  const mid = MEAN_CIRCULATION * (1 + LOAD_SWING * loading(phaseAt(t)));
  const center = bodyAt(t)[2];
  const tipL = Math.abs(row[0][2] - center), tipR = Math.abs(row[row.length - 1][2] - center);
  return row.slice(0, -1).map((a, p) => {
    const z = (a[2] + row[p + 1][2]) / 2 - center, s = z < 0 ? z / tipL : z / tipR;
    return mid * Math.sqrt(Math.max(0, 1 - s * s));
  });
};

const gap = (u: Vec, v: Vec) => Math.hypot(u[0] - v[0], u[1] - v[1], u[2] - v[2]);
/**
 * The wake as vortex segments, 8 numbers each: a, Γ/4π, b, core². Ring k lies between rows k (older)
 * and k + 1; shared edges carry the difference of their rings' circulations; the wing's bound vortex
 * closes the newest rings. A streamwise edge stands for a sheet of trailing vorticity, so its core is at
 * least half the spacing of the stations beside it: smooth across the span, tight at the tips.
 */
function segments(rows: Vec[][], gammas: number[][], row: Vec[], gamma: number[]): Float32Array<ArrayBuffer> {
  const out: number[] = [];
  const push = (a: Vec, b: Vec, g: number, core = CORE) => { if (Math.abs(g) > 1e-6) out.push(a[0], a[1], a[2], g / (4 * Math.PI), b[0], b[1], b[2], core * core); };
  const spacing = (r: Vec[], i: number) => (gap(r[Math.max(0, i - 1)], r[i]) + gap(r[i], r[Math.min(STATIONS - 1, i + 1)])) / (i > 0 && i < STATIONS - 1 ? 2 : 1);
  const n = rows.length;
  for (let k = 0; k < n; k++) {
    for (let p = 0; p < STATIONS - 1; p++) push(rows[k][p], rows[k][p + 1], (k > 0 ? gammas[k - 1][p] : 0) - (k < n - 1 ? gammas[k][p] : gamma[p]));
    if (k < n - 1) for (let i = 0; i < STATIONS; i++) push(rows[k][i], rows[k + 1][i], (i < STATIONS - 1 ? gammas[k][i] : 0) - (i > 0 ? gammas[k][i - 1] : 0), Math.max(CORE, 0.5 * spacing(rows[k], i)));
  }
  if (n > 0) {
    const last = rows[n - 1];
    for (let i = 0; i < STATIONS; i++) push(last[i], row[i], (i < STATIONS - 1 ? gamma[i] : 0) - (i > 0 ? gamma[i - 1] : 0));
    for (let p = 0; p < STATIONS - 1; p++) push(row[p + 1], row[p], -gamma[p]);
  }
  return new Float32Array(out);
}

// The lattice -------------------------------------------------------------------------------------

const COMB_Z = 3.0, END_Z = -2.6, BREEZE = 1.0; // m, m, m/s: the combs stand 3 m to one side
const ROWS = [-0.62, -0.45, -0.28, -0.235, -0.19, -0.145, -0.1, -0.055, -0.01, 0.035, 0.08, 0.125, 0.17, 0.215, 0.4, 0.55]; // m above the path
const PER_PHASE = Number(process.env.PER_PHASE ?? 1);
const AHEAD = Number(process.env.AHEAD ?? 3);
const BEHIND = Number(process.env.BEHIND ?? 1);
const LAID = 0.01; // m between a thread's points as the breeze laid it
const REACH = 1.6; // m along the path: segments farther from a point than this are ignored there, and smoke farther ahead of the gull has not yet felt it
const WINDOW_MARGIN = 0.1; // m: how far a point may move along the path in a step

const between = POSES[0].position[0] - POSES[1].position[0];
const columns: number[] = [];
for (let j = AHEAD; j >= 1; j--) columns.push(POSES[0].position[0] + (j * between) / PER_PHASE);
for (const pose of POSES) for (let j = 0; j < PER_PHASE; j++) columns.push(pose.position[0] - (j * between) / PER_PHASE);
for (let j = 1; j <= BEHIND; j++) columns.push(POSES[POSES.length - 1].position[0] - ((PER_PHASE - 1 + j) * between) / PER_PHASE);
columns.sort((a, b) => a - b); // the order the gull reaches them in

type Thread = { column: number; row: number; x: number; p: number[]; age: number[]; rest: number[] };
const threads: Thread[] = [];
columns.forEach((x, column) => ROWS.forEach((h, row) => {
  const th: Thread = { column, row, x, p: [], age: [], rest: [] };
  for (let z = END_Z; z <= COMB_Z + 1e-9; z += LAID) {
    th.p.push(x, pathY(x) + h, z);
    th.age.push((COMB_Z - z) / BREEZE); // smoke farther from its comb left it longer ago
    th.rest.push(th.rest.length ? LAID : 0); // the material length of the segment ending here
  }
  threads.push(th);
}));

const MAX_SEGMENT = 0.006, MIN_SEGMENT = 0.002, MAX_POINTS = 8000;
// Smoke stretched a hundredfold is too faint to show; such a stretch is carried on but not refined.
const STRETCH_CAP = 100;
/** Keep a thread's segments between MIN_SEGMENT and MAX_SEGMENT, inserting along a Catmull–Rom curve. */
function refine(th: Thread): void {
  const p = [th.p[0], th.p[1], th.p[2]], age = [th.age[0]], rest = [0];
  const n = th.age.length;
  for (let i = 1; i < n; i++) {
    const ax = p[p.length - 3], ay = p[p.length - 2], az = p[p.length - 1];
    const bx = th.p[i * 3], by = th.p[i * 3 + 1], bz = th.p[i * 3 + 2];
    const length = Math.hypot(bx - ax, by - ay, bz - az);
    if (length < MIN_SEGMENT && i < n - 1) { th.rest[i + 1] += th.rest[i]; continue; }
    if (length > MAX_SEGMENT && age.length < MAX_POINTS && length < th.rest[i] * STRETCH_CAP) {
      const pieces = Math.min(8, Math.ceil(length / MAX_SEGMENT));
      const i0 = Math.max(0, i - 2), i3 = Math.min(n - 1, i + 1);
      const P0 = [th.p[i0 * 3], th.p[i0 * 3 + 1], th.p[i0 * 3 + 2]], P1 = [ax, ay, az], P2 = [bx, by, bz], P3 = [th.p[i3 * 3], th.p[i3 * 3 + 1], th.p[i3 * 3 + 2]];
      for (let s = 1; s < pieces; s++) {
        const t = s / pieces;
        for (let d = 0; d < 3; d++) p.push(0.5 * (2 * P1[d] + (-P0[d] + P2[d]) * t + (2 * P0[d] - 5 * P1[d] + 4 * P2[d] - P3[d]) * t * t + (-P0[d] + 3 * P1[d] - 3 * P2[d] + P3[d]) * t * t * t));
        age.push(th.age[i - 1] + (th.age[i] - th.age[i - 1]) * t);
        rest.push(th.rest[i] / pieces);
      }
      p.push(bx, by, bz); age.push(th.age[i]); rest.push(th.rest[i] / pieces);
      continue;
    }
    p.push(bx, by, bz); age.push(th.age[i]); rest.push(th.rest[i]);
  }
  th.p = p; th.age = age; th.rest = rest;
}

// The GPU: induced velocity at many points from every segment -------------------------------------

const WGSL = /* wgsl */ `
struct Params { count: u32, segCount: u32, h: f32, pad: u32 };
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> segs: array<vec4f>; // a, Γ/4π; b, core²
@group(0) @binding(2) var<storage, read_write> pos: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> mid: array<vec4f>;
@group(0) @binding(4) var<storage, read> windows: array<vec2u>; // each workgroup's run of segments

const TILE = 256u;
var<workgroup> tileA: array<vec4f, TILE>;
var<workgroup> tileB: array<vec4f, TILE>;
var<workgroup> run: vec2u;

// Biot–Savart for a straight segment with a regularized core.
fn induced(p: vec3f, a: vec4f, b: vec4f) -> vec3f {
  let r0 = b.xyz - a.xyz;
  let r1 = p - a.xyz;
  let r2 = p - b.xyz;
  let c = cross(r1, r2);
  let den = dot(c, c) + b.w * dot(r0, r0);
  let l1 = length(r1);
  let l2 = length(r2);
  if (den < 1e-14 || l1 < 1e-9 || l2 < 1e-9) { return vec3f(0.0); }
  return c * (a.w * dot(r0, r1 / l1 - r2 / l2) / den);
}

// The segments near the workgroup's points along the path, sorted by x, pass through the workgroup's
// memory a tile at a time, shared by its 256 points.
fn velocity(p: vec3f, li: u32, wg: u32) -> vec3f {
  if (li == 0u) { run = windows[wg]; }
  let w = workgroupUniformLoad(&run);
  var v = vec3f(0.0);
  for (var base = w.x; base < w.y; base += TILE) {
    let j = base + li;
    if (j < w.y) { tileA[li] = segs[2u * j]; tileB[li] = segs[2u * j + 1u]; }
    workgroupBarrier();
    let m = min(TILE, w.y - base);
    for (var k = 0u; k < m; k++) { v += induced(p, tileA[k], tileB[k]); }
    workgroupBarrier();
  }
  return v;
}

// Midpoint rule: half a step on the velocity here, then the whole step on the velocity there.
@compute @workgroup_size(256)
fn half(@builtin(global_invocation_id) gid: vec3u, @builtin(local_invocation_index) li: u32, @builtin(workgroup_id) wg: vec3u) {
  let i = min(gid.x, params.count - 1u);
  let p = pos[i].xyz;
  let v = velocity(p, li, wg.x);
  if (gid.x < params.count) { mid[gid.x] = vec4f(p + v * (0.5 * params.h), 0.0); }
}

@compute @workgroup_size(256)
fn full(@builtin(global_invocation_id) gid: vec3u, @builtin(local_invocation_index) li: u32, @builtin(workgroup_id) wg: vec3u) {
  let i = min(gid.x, params.count - 1u);
  let v = velocity(mid[i].xyz, li, wg.x);
  if (gid.x < params.count) { let q = pos[gid.x]; pos[gid.x] = vec4f(q.xyz + v * params.h, q.w); }
}
`;

// The instance is kept for the whole run: once the collector frees it, Dawn's event loop locks freed memory.
const gpu = create([]);
Object.assign(globalThis, { wakeSimGPU: gpu });
const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
if (!adapter) throw new Error('No GPU adapter: run this where nothing sandboxes the GPU away from Node.');
const device = await adapter.requestDevice({ requiredLimits: { maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize, maxBufferSize: adapter.limits.maxBufferSize } });
const module = device.createShaderModule({ code: WGSL });
const bindLayout = device.createBindGroupLayout({
  entries: [
    { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
    { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
    { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
  ],
});
const layout = device.createPipelineLayout({ bindGroupLayouts: [bindLayout] });
const halfStep = device.createComputePipeline({ layout, compute: { module, entryPoint: 'half' } });
const fullStep = device.createComputePipeline({ layout, compute: { module, entryPoint: 'full' } });
const SEG_CAPACITY = 16000;
const segBuffer = device.createBuffer({ size: SEG_CAPACITY * 32, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });

/** Points carried on the GPU: positions in, positions out after some midpoint steps. */
class Cloud {
  private capacity = 0;
  private pos!: GPUBuffer;
  private mid!: GPUBuffer;
  private windows!: GPUBuffer;
  private bind!: GPUBindGroup;
  private params = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

  private ensure(count: number): void {
    if (count <= this.capacity) return;
    for (const b of [this.pos, this.mid, this.windows]) b?.destroy();
    this.capacity = Math.ceil(count * 1.5);
    const size = this.capacity * 16;
    this.pos = device.createBuffer({ size, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC });
    this.mid = device.createBuffer({ size, usage: GPUBufferUsage.STORAGE });
    this.windows = device.createBuffer({ size: Math.ceil(this.capacity / 256) * 8, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this.bind = device.createBindGroup({
      layout: bindLayout,
      entries: [
        { binding: 0, resource: { buffer: this.params } },
        { binding: 1, resource: { buffer: segBuffer } },
        { binding: 2, resource: { buffer: this.pos } },
        { binding: 3, resource: { buffer: this.mid } },
        { binding: 4, resource: { buffer: this.windows } },
      ],
    });
  }

  /**
   * Carry `count` points (xyz, one vec4 each) through the field `steps` times by h. `along` holds the
   * segments' midpoints along the path, sorted as the segments are: each workgroup sums only the
   * segments within REACH of its points (and a margin for how far they move in the step).
   */
  async carry(points: Float32Array<ArrayBuffer>, count: number, segCount: number, along: Float64Array, h: number, steps: number): Promise<Float32Array> {
    this.ensure(count);
    const groups = Math.ceil(count / 256), windows = new Uint32Array(groups * 2);
    const first = (x: number) => { let lo = 0, hi = segCount; while (lo < hi) { const m = (lo + hi) >> 1; if (along[m] < x) lo = m + 1; else hi = m; } return lo; };
    for (let g = 0; g < groups; g++) {
      let lo = Infinity, hi = -Infinity;
      for (let i = g * 256, end = Math.min(count, i + 256); i < end; i++) { const x = points[i * 4]; if (x < lo) lo = x; if (x > hi) hi = x; }
      windows[g * 2] = first(lo - REACH - WINDOW_MARGIN);
      windows[g * 2 + 1] = first(hi + REACH + WINDOW_MARGIN);
    }
    device.queue.writeBuffer(this.windows, 0, windows);
    device.queue.writeBuffer(this.pos, 0, points, 0, count * 4);
    const params = new ArrayBuffer(16);
    new Uint32Array(params, 0, 2).set([count, segCount]);
    new Float32Array(params, 8, 1)[0] = h;
    device.queue.writeBuffer(this.params, 0, params);
    const encoder = device.createCommandEncoder();
    // Everything the GPU is still working through is held until it has finished: Dawn's Node binding
    // can crash if the collector takes an encoder or a pass while its commands still run.
    const held: unknown[] = [encoder, params, points, windows];
    for (let s = 0; s < steps; s++) {
      const pass = encoder.beginComputePass();
      held.push(pass);
      pass.setBindGroup(0, this.bind);
      pass.setPipeline(halfStep);
      pass.dispatchWorkgroups(groups);
      pass.setPipeline(fullStep);
      pass.dispatchWorkgroups(groups);
      pass.end();
    }
    // A staging buffer the size of this read, mapped whole and let go: Dawn's Node binding does not
    // take kindly to one buffer mapped over and over in parts.
    const read = device.createBuffer({ size: count * 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    encoder.copyBufferToBuffer(this.pos, 0, read, 0, count * 16);
    const commands = encoder.finish();
    held.push(commands, read);
    device.queue.submit([commands]);
    await device.queue.onSubmittedWorkDone();
    await read.mapAsync(GPUMapMode.READ);
    const out = new Float32Array(read.getMappedRange().slice(0));
    read.unmap();
    read.destroy();
    held.length = 0;
    return out;
  }
}

// The flight --------------------------------------------------------------------------------------

const smoke = new Cloud(), nodes = new Cloud();
const rows: Vec[][] = [], gammas: number[][] = [];
let gpuTime = 0, steps = 0, active = 0;
for (let t = 0; t <= FROZEN_AT + 1e-9; t += DT, steps++) {
  const row = trailingEdge(t), gamma = circulation(t, row);
  const unsorted = segments(rows, gammas, row, gamma), segCount = unsorted.length / 8;
  const order = Array.from({ length: segCount }, (_, i) => i).sort((a, b) => (unsorted[a * 8] + unsorted[a * 8 + 4]) - (unsorted[b * 8] + unsorted[b * 8 + 4]));
  const segs = new Float32Array(unsorted.length), along = new Float64Array(segCount);
  order.forEach((j, i) => { segs.set(unsorted.subarray(j * 8, j * 8 + 8), i * 8); along[i] = (unsorted[j * 8] + unsorted[j * 8 + 4]) / 2; });
  if (segCount > SEG_CAPACITY) throw new Error(`${segCount} segments: raise SEG_CAPACITY`);
  if (segCount > 0) {
    device.queue.writeBuffer(segBuffer, 0, segs);
    const birdX = bodyAt(t)[0];
    while (active < threads.length && threads[active].x <= birdX + REACH) active++;
    // The smoke the gull has reached: out to the GPU, SUBSTEPS midpoint steps, back.
    let count = 0;
    for (let i = 0; i < active; i++) count += threads[i].age.length;
    if (count > 0) {
      const packed = new Float32Array(count * 4);
      let o = 0;
      for (let i = 0; i < active; i++) { const p = threads[i].p; for (let j = 0; j < p.length; j += 3) { packed[o] = p[j]; packed[o + 1] = p[j + 1]; packed[o + 2] = p[j + 2]; o += 4; } }
      const g0 = performance.now();
      const moved = await smoke.carry(packed, count, segCount, along, DT / SUBSTEPS, SUBSTEPS);
      gpuTime += performance.now() - g0;
      o = 0;
      for (let i = 0; i < active; i++) { const p = threads[i].p; for (let j = 0; j < p.length; j += 3) { p[j] = moved[o]; p[j + 1] = moved[o + 1]; p[j + 2] = moved[o + 2]; o += 4; } refine(threads[i]); }
    }
    // Meanwhile the wake's own nodes move with the same field: one midpoint step.
    const nodeCount = rows.length * STATIONS;
    const packed = new Float32Array(nodeCount * 4);
    rows.forEach((r, k) => r.forEach((p, i) => packed.set(p, (k * STATIONS + i) * 4)));
    const g0 = performance.now();
    const moved = await nodes.carry(packed, nodeCount, segCount, along, DT, 1);
    gpuTime += performance.now() - g0;
    rows.forEach((r, k) => r.forEach((p, i) => { const o = (k * STATIONS + i) * 4; p[0] = moved[o]; p[1] = moved[o + 1]; p[2] = moved[o + 2]; }));
  }
  rows.push(row);
  gammas.push(gamma);
  if (steps % 25 === 0) {
    const points = threads.reduce((n, th) => n + th.age.length, 0);
    console.log(`t ${t.toFixed(3)} s · ${segCount} segments · ${active}/${threads.length} threads moving · ${points} points · ${elapsed()} (GPU ${(gpuTime / 1000).toFixed(1)} s)`);
  }
}

// Output ------------------------------------------------------------------------------------------

/** Drop points that a straight line through their neighbours would place within TOLERANCE (Douglas–Peucker). */
const TOLERANCE = 0.0004;
function keep(p: number[]): number[] {
  const n = p.length / 3, kept = new Uint8Array(n);
  kept[0] = kept[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const ax = p[a * 3], ay = p[a * 3 + 1], az = p[a * 3 + 2];
    const dx = p[b * 3] - ax, dy = p[b * 3 + 1] - ay, dz = p[b * 3 + 2] - az, len2 = dx * dx + dy * dy + dz * dz;
    let worst = -1, far = 0;
    for (let i = a + 1; i < b; i++) {
      const vx = p[i * 3] - ax, vy = p[i * 3 + 1] - ay, vz = p[i * 3 + 2] - az;
      const t = len2 > 0 ? Math.max(0, Math.min(1, (vx * dx + vy * dy + vz * dz) / len2)) : 0;
      const d = Math.hypot(vx - t * dx, vy - t * dy, vz - t * dz);
      if (d > far) { far = d; worst = i; }
    }
    if (worst > 0 && far > TOLERANCE) { kept[worst] = 1; stack.push([a, worst], [worst, b]); }
  }
  const out: number[] = [];
  kept.forEach((k, i) => { if (k) out.push(i); });
  return out;
}

const header = {
  note: 'WAKE frozen still, simulated by tools/wake-sim.ts: a vortex-lattice model of a herring gull\'s wake, not a measurement.',
  frozenAt: FROZEN_AT, phaseInterval: PHASE_INTERVAL, perPhase: PER_PHASE, ahead: AHEAD, behind: BEHIND,
  comb: { z: COMB_Z, end: END_Z, breeze: BREEZE }, rows: ROWS, columns,
  poses: POSES.map((pose) => ({ phase: pose.phase, position: pose.position, pitch: pose.pitch })),
  threads: [] as { column: number; row: number; count: number }[],
};
const data: number[] = [];
let written = 0;
for (const th of threads) {
  const n = th.age.length;
  // Stretch at each point: how much longer the material near it has become.
  const seg = (j: number) => gap([th.p[j * 3], th.p[j * 3 + 1], th.p[j * 3 + 2]], [th.p[(j - 1) * 3], th.p[(j - 1) * 3 + 1], th.p[(j - 1) * 3 + 2]]) / Math.max(1e-9, th.rest[j]);
  const stretch = th.age.map((_, i) => ((i > 0 ? seg(i) : seg(1)) + (i < n - 1 ? seg(i + 1) : seg(n - 1))) / 2);
  const kept = keep(th.p);
  header.threads.push({ column: th.column, row: th.row, count: kept.length });
  for (const i of kept) data.push(th.p[i * 3], th.p[i * 3 + 1], th.p[i * 3 + 2], th.age[i], stretch[i]);
  written += kept.length;
}
const path = process.argv[2] ?? 'public/plates/assets/wake/threads.bin';
mkdirSync(dirname(path), { recursive: true });
const json = new TextEncoder().encode(JSON.stringify(header));
const pad = (4 - ((4 + json.length) % 4)) % 4;
const file = new Uint8Array(4 + json.length + pad + data.length * 4);
new DataView(file.buffer).setUint32(0, json.length + pad, true);
file.set(json, 4);
file.fill(32, 4 + json.length, 4 + json.length + pad);
new Float32Array(file.buffer, 4 + json.length + pad).set(data);
writeFileSync(path, file);
console.log(`wrote ${path}: ${threads.length} threads, ${written} points kept, ${(file.length / 1e6).toFixed(1)} MB, ${steps} steps, ${rows.length} wake rows, in ${elapsed()} (GPU ${(gpuTime / 1000).toFixed(1)} s)`);
process.exit(0);
