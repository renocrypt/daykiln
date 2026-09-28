// The smoke: a lattice of smoke threads across the gull's path, as the gull's wake left them at the
// frozen instant.
//
// Where each thread lies is simulated (tools/wake-sim.ts, a few seconds on the GPU):
// combs on one side of the path, each a column of nozzles, whose threads a light breeze has laid straight
// across it; a vortex-lattice wake shed by the gull's wings, rolling up under its own induction; the
// threads carried through that field as material lines. Sixteen walls of sixteen threads: one wall
// through each phase, three ahead of the leading phase, where the air is still calm, and one behind the
// last.
//
// How each thread is drawn is the smoke's own physics. A thread is a Gaussian of smoke with no edge. It
// spreads as it ages, σ² = σ0² + 2Dt, so smoke far from its comb is wider and fainter: crisp near the
// combs, a haze far across the path. Where the wake has drawn it out, the same smoke lies along a longer
// line and thins; where the wake has worked it hardest, in the curls, more of it strays from the thread
// into a haze. It comes out of its comb and fades at its far end without an edge. The sun scatters in
// it mostly forward and reaches its far side through its own smoke; the sky lights it from all round.

import * as THREE from 'three/webgpu';
import { Fn, abs, attribute, cameraPosition, cross, dot, exp, float, length, normalize, pow, smoothstep, sqrt, uniform, varying } from 'three/tsl';

export const uSun = uniform(new THREE.Vector3(1, 1, 1)); // the sun's light, color times intensity
export const uSunDirection = uniform(new THREE.Vector3(0, 1, 0)); // toward the sun
export const uSkyLight = uniform(new THREE.Vector3(0.3, 0.33, 0.4)); // the zenith's light, which lights the smoke from all round
/** The lens a thread is seen through: its aperture and focal length and where it focuses (m), and a pixel's size a meter away (m). */
export const uLens = { aperture: uniform(0), focal: uniform(0.022), focus: uniform(2), pixel: uniform(0.001) };

// The smoke in a thread -----------------------------------------------------------------------------

const SIGMA0 = 0.0012; // m: a thread's spread as it leaves its nozzle
const DIFFUSION = 6e-6; // m²/s: how fast it spreads in the breeze's small eddies; three seconds out, over the path, its spread is 6 mm
const LINE = 0.0035; // m: the smoke in a meter of thread, as optical depth times width; across its middle, about 0.9 fresh and 0.25 over the path
const WORKED_SPREAD = 1.2; // how much wider the wake's working makes a thread, where it has worked it hardest
const FADE_IN = 0.5, FADE_OUT = 1.5; // s of age over which a thread comes out of its comb, and fades at its far end
const RESAMPLE = 0.05; // m: the simulation keeps two points to a straight run; the drawing wants its spread and fade along it

type Header = { comb: { z: number; end: number; breeze: number }; threads: { column: number; row: number; count: number }[] };
type Thread = { column: number; points: THREE.Vector3[]; sigma: number[]; line: number[]; worked: number[] };

/** The simulation's threads, each a run of points: where it lies, the smoke's age there, and how far the wake has drawn it out. */
function read(buffer: ArrayBuffer): { header: Header; threads: { column: number; row: number; p: Float32Array }[] } {
  const length = new DataView(buffer).getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 4, length))) as Header;
  const data = new Float32Array(buffer, 4 + length);
  let o = 0;
  const threads = header.threads.map(({ column, row, count }) => {
    const p = data.subarray(o, o + count * 5);
    o += count * 5;
    return { column, row, p };
  });
  return { header, threads };
}

/** A thread for drawing: its straight runs cut to RESAMPLE, and the smoke's spread and strength at each point. */
function thread(p: Float32Array, column: number, row: number, lifetime: number): Thread {
  const out: Thread = { column, points: [], sigma: [], line: [], worked: [] };
  // Each nozzle puts out a little more or less smoke than its neighbors.
  const strength = 0.8 + 0.35 * ((((Math.sin(column * 12.9898 + row * 78.233) * 43758.5453) % 1) + 1) % 1);
  const add = (x: number, y: number, z: number, age: number, stretch: number) => {
    const worked = THREE.MathUtils.smoothstep(Math.log(Math.max(1, stretch)), Math.log(2), Math.log(25));
    const fade = THREE.MathUtils.smoothstep(age, 0, FADE_IN) * (1 - THREE.MathUtils.smoothstep(age, lifetime - FADE_OUT, lifetime));
    out.points.push(new THREE.Vector3(x, y, z));
    out.sigma.push(Math.sqrt(SIGMA0 * SIGMA0 + 2 * DIFFUSION * age) * (1 + WORKED_SPREAD * worked));
    // Drawn out, a thread's smoke lies thinner along it: less so here than in fact, so the curls' arms still show.
    out.line.push((LINE * strength * fade) / Math.sqrt(Math.max(1, stretch)));
    out.worked.push(worked);
  };
  const n = p.length / 5;
  for (let i = 0; i < n; i++) {
    const o = i * 5;
    if (i > 0) {
      const q = o - 5, gap = Math.hypot(p[o] - p[q], p[o + 1] - p[q + 1], p[o + 2] - p[q + 2]);
      const pieces = Math.floor(gap / RESAMPLE);
      for (let k = 1; k < pieces; k++) {
        const t = k / pieces, at = (d: number) => p[q + d] + (p[o + d] - p[q + d]) * t;
        add(at(0), at(1), at(2), at(3), at(4));
      }
    }
    add(p[o], p[o + 1], p[o + 2], p[o + 3], p[o + 4]);
  }
  return out;
}

// Drawing ------------------------------------------------------------------------------------------

// A thread is a core with a faint halo of smoke that has strayed from it, HALO times as wide, holding
// HALO_SHARE of its smoke; where the wake has worked it hardest, more of it strays, and farther, so the
// curls go to haze. The ribbon reaches past both, REACH spreads either side of its middle.
const HALO = [3.5, 7.5], HALO_SHARE = [0.3, 0.65], REACH = [9, 19];
const FORWARD = 0.6, BACKWARD = -0.3, BACK_SHARE = 0.2; // the smoke's scattering: mostly forward, some back
const ALBEDO = 0.9;
const AMBIENT = 0.65; // the sky's light on the smoke from all round, as a share of the zenith's: the sea below gives little
const MANY = 0.075; // the sun's light scattered more than once, which leaves the smoke evenly every way
// A thread's far side is lit through the thread's own smoke, drawn a little deeper than it is so that a
// thread shows a side darker than the air as well as one brighter: the proof it is lit.
const SHADE = 1.25;

/** Ribbons turned to the eye along each thread, as wide as the lens images it. */
function smokeMaterial(): THREE.MeshBasicNodeMaterial {
  const material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const middle = attribute('position', 'vec3'), bent = attribute('along', 'vec4'), along = bent.xyz, smoke = attribute('smoke', 'vec4');
  const sigma = smoke.x, line = smoke.y, side = smoke.z, worked = smoke.w;
  const reach = worked.mul(REACH[1] - REACH[0]).add(REACH[0]);
  const toEye = cameraPosition.sub(middle), distance = length(toEye), eye = toEye.div(distance);
  const across = normalize(cross(along, eye));
  // Off the focus the lens images a thread wider (its disc's spread is a quarter of its width), and no finer than about a pixel.
  const blur = uLens.aperture.mul(abs(distance.sub(uLens.focus))).div(uLens.focus.sub(uLens.focal).max(1e-3));
  const seen = sqrt(sigma.mul(sigma).add(blur.mul(0.25).pow(2)).add(distance.mul(uLens.pixel).mul(0.6).pow(2)));
  // A ribbon wider than the curve it follows would fold over itself where a curl winds tight: there it
  // is drawn no wider than most of the curve's radius, and its halo is cut short, softly.
  const half = seen.mul(reach).min(bent.w.mul(0.6)), extent = half.div(seen);
  material.positionNode = middle.add(across.mul(side.mul(half)));
  // Seen along its length a thread lies deeper; near the lens the smoke fades, where it would fill the frame.
  const slant = length(cross(along, eye)).max(0.3);
  const depth = varying(line.div(seen.mul(Math.sqrt(2 * Math.PI))).div(slant).mul(smoothstep(0.12, 0.45, distance)));
  const offset = varying(side.mul(extent)), edge = varying(extent);
  const halo = varying(worked.mul(HALO[1] - HALO[0]).add(HALO[0])), haloShare = varying(worked.mul(HALO_SHARE[1] - HALO_SHARE[0]).add(HALO_SHARE[0]));
  const own = varying(line.div(sigma.mul(Math.sqrt(2 * Math.PI))).mul(SHADE)); // across the thread's middle, toward the sun
  const sunward = varying(dot(across, uSunDirection));
  const view = varying(eye.negate());
  material.opacityNode = Fn(() => {
    const x2 = offset.mul(offset);
    const profile = exp(x2.mul(-0.5)).mul(float(1).sub(haloShare)).add(exp(x2.mul(-0.5).div(halo.mul(halo))).mul(haloShare.div(halo)))
      .mul(smoothstep(edge, edge.mul(0.75), abs(offset)));
    return float(1).sub(exp(depth.mul(profile).negate()));
  })();
  material.colorNode = Fn(() => {
    // The sun reaches the far side of a thread through its own smoke.
    const between = float(1).sub(smoothstep(-2, 2, offset.mul(sunward)));
    const sunlit = exp(own.mul(between).negate());
    const c = dot(view, uSunDirection);
    const hg = (g: number) => float((1 - g * g) / (4 * Math.PI)).div(pow(float(1 + g * g).sub(c.mul(2 * g)), 1.5));
    const phase = hg(FORWARD).mul(1 - BACK_SHARE).add(hg(BACKWARD).mul(BACK_SHARE));
    return uSun.mul(phase.add(MANY).mul(sunlit)).add(uSkyLight.mul(AMBIENT)).mul(ALBEDO);
  })();
  return material;
}

/** A wall's threads as one mesh of ribbons: two vertices to a point, one either side. */
function ribbons(threads: Thread[], material: THREE.Material): THREE.Mesh {
  const count = threads.reduce((total, { points }) => total + points.length, 0);
  const position = new Float32Array(count * 6), along = new Float32Array(count * 8), smoke = new Float32Array(count * 8);
  const index: number[] = [];
  let v = 0;
  for (const { points, sigma, line, worked } of threads) {
    const n = points.length;
    for (let i = 0; i < n; i++) {
      const a = points[Math.max(0, i - 1)], b = points[i], c = points[Math.min(n - 1, i + 1)];
      const t = c.clone().sub(a);
      if (t.lengthSq() < 1e-14) t.set(1, 0, 0);
      t.normalize();
      // The curve's radius here, through this point and its neighbors.
      const ab = a.distanceTo(b), bc = b.distanceTo(c), ca = c.distanceTo(a);
      const twice = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a)).length();
      const radius = twice > 1e-12 ? (ab * bc * ca) / (2 * twice) : 10;
      for (const side of [-1, 1]) {
        position.set([b.x, b.y, b.z], v * 3);
        along.set([t.x, t.y, t.z, Math.min(10, radius)], v * 4);
        smoke.set([sigma[i], line[i], side, worked[i]], v * 4);
        v++;
      }
      if (i < n - 1) { const a = v - 2; index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('along', new THREE.BufferAttribute(along, 4));
  geometry.setAttribute('smoke', new THREE.BufferAttribute(smoke, 4));
  geometry.setIndex(index);
  geometry.computeBoundingSphere();
  return new THREE.Mesh(geometry, material);
}

/** The smoke, one mesh to a wall, so the walls are laid far to near; and the threads' middles as line segments, for the overlay test. */
export async function loadThreads(url: string): Promise<{ smoke: THREE.Group; lines: Float32Array }> {
  const { header, threads } = read(await (await fetch(url)).arrayBuffer());
  const lifetime = (header.comb.z - header.comb.end) / header.comb.breeze;
  const walls = new Map<number, Thread[]>(), lines: number[] = [];
  for (const { column, row, p } of threads) {
    const drawn = thread(p, column, row, lifetime);
    if (!walls.has(column)) walls.set(column, []);
    walls.get(column)!.push(drawn);
    for (let i = 1; i < drawn.points.length; i++) lines.push(...drawn.points[i - 1].toArray(), ...drawn.points[i].toArray());
  }
  const material = smokeMaterial(), smoke = new THREE.Group();
  for (const wall of walls.values()) smoke.add(ribbons(wall, material));
  return { smoke, lines: new Float32Array(lines) };
}
