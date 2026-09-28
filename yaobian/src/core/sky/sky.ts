// The sky, from Plates (SAME SKY): a clear sky baked from a spectral model of the atmosphere
// (plates/tools/sky-bake.ts; public/assets/sky/), from an afternoon sun to deep dusk, and a layer of
// cloud drifting through it, as seen from the ground.
//
// The clear sky is looked up, never computed: its values are fixed, so a probe can read them. The
// cloud is marched through a slab at the layer's altitude. Its cloudlets are cellular billows
// gathered in patches and frayed at the edge; light reaches them from the sun, reddened by its long
// path past the Earth's limb and gone entirely once the layer falls into the Earth's shadow, and from
// the sky above and the world below. Higher orders of scattering in the cloud follow Wrenninge's
// octaves. The air between the ground and the layer dims the cloud and lays its own light over it,
// so the cloud sits in the sky rather than on it.

import * as THREE from 'three/webgpu';
import { Break, Fn, If, Loop, abs, acos, clamp, cos, dot, exp, float, interleavedGradientNoise, length, log, max, min, mix, pow, saturate, screenCoordinate, sin, smoothstep, step, texture, texture3D, uniform, vec2, vec3, vec4 } from 'three/tsl';
import type { Node } from 'three/webgpu';
import type { Image, NoiseData } from './noise.ts';

type Triple = [number, number, number];
type BakedSky = {
  name: string; sunElevation: number; zenith: Triple; zenithLuminance: number; groundIlluminance: number;
  sky: number; below: number; opticalDepth: Triple[];
  light: { sun: Triple[]; up: Triple[]; down: Triple[]; upIrradiance: Triple[]; downIrradiance: Triple[] };
};
type Baked = { map: { size: number }; below: { size: number; slices: number[] }; light: { altitudes: number[] }; skies: BakedSky[] };

/** A cloud layer: base and top altitude (m), how much of the sky it covers, its extinction at full density (m⁻¹). */
export type CloudLayer = { base: number; top: number; coverage: number; extinction: number };
/**
 * The sky's setting: its cloud, the sun's azimuth (rad, from +x toward +z), the wind (m/s), and
 * the exposure for each elevation of the sun, as a camera or an eye adapts through a sunset.
 */
export type SkySetting = { cloud: CloudLayer; sunAzimuth: number; wind: [number, number]; exposure: (elevation: number) => number };

// The cloud's texture, in meters of cloud.
const BILLOW_TILE = 5000; // billows of 150 to 600 m: altocumulus cloudlets, 1 to 5 degrees across
const WARP_TILE = 9000, WARP = 520;
const PATCH_TILE = 26000;
const DETAIL_TILE = 700;
const EROSION = 0.3;
const STEPS = 28;
const LIGHT_SAMPLES = [30, 90, 200, 420, 860]; // m toward the sun
const OCTAVES = 4, OCTAVE_A = 0.55, OCTAVE_B = 0.4, OCTAVE_C = 0.5; // Wrenninge 2013
const CLOUD_G = 0.85; // droplets' asymmetry

const HALF = (x: number) => THREE.DataUtils.toHalfFloat(x);
const FROM_HALF = (x: number) => THREE.DataUtils.fromHalfFloat(x);

function halfTexture(data: Uint16Array, size: number): THREE.DataTexture {
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.HalfFloatType);
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

/** A tileable noise image as a repeating texture; with mipmaps where it is sampled at a distance. */
export function imageTexture(img: Image, mipmaps = false): THREE.DataTexture | THREE.Data3DTexture {
  const format = img.channels === 4 ? THREE.RGBAFormat : img.channels === 2 ? THREE.RGFormat : THREE.RedFormat;
  const cubic = img.data.length === img.size ** 3 * img.channels;
  const t = cubic ? new THREE.Data3DTexture(img.data, img.size, img.size, img.size) : new THREE.DataTexture(img.data, img.size, img.size);
  t.format = format;
  t.type = THREE.UnsignedByteType;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (cubic) (t as THREE.Data3DTexture).wrapR = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = mipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.generateMipmaps = mipmaps;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  return t;
}

/**
 * Between two values of light that fall steeply with the sun, geometric rather than linear: the
 * sun's light near the horizon falls about exponentially with its elevation, and between baked
 * skies a linear blend would hold its color near the brighter sky's until the last moment. The floor
 * lets light fade out to nothing.
 */
function logLerp(a: THREE.Vector3, b: THREE.Vector3, t: number): THREE.Vector3 {
  const floor = 1e-3 * Math.max(a.x, a.y, a.z, b.x, b.y, b.z);
  if (floor === 0) return new THREE.Vector3();
  const lerp = (x: number, y: number) => Math.max(Math.exp(Math.log(x + floor) * (1 - t) + Math.log(y + floor) * t) - floor, 0);
  return new THREE.Vector3(lerp(a.x, b.x), lerp(a.y, b.y), lerp(a.z, b.z));
}
/** The floor of the clear sky's geometric blend, in the bake's units: far below the darkest sky's radiance. */
const CLEAR_FLOOR = 1e-4;

/** Linear interpolation in a table of triples sampled at ascending positions. */
function lerpTable(xs: number[], ys: Triple[], x: number): THREE.Vector3 {
  const i = Math.min(Math.max(xs.findIndex((v) => v > x) - 1, 0), xs.length - 2);
  const t = Math.min(Math.max((x - xs[i]) / (xs[i + 1] - xs[i]), 0), 1);
  return new THREE.Vector3(...ys[i]).lerp(new THREE.Vector3(...ys[i + 1]), t);
}

export class Sky {
  readonly baked: Baked;
  readonly uniforms = {
    exposure: uniform(1),
    sunAzimuth: uniform(0),
    sunDirection: uniform(new THREE.Vector3(1, 0, 0)),
    drift: uniform(new THREE.Vector2()),
    evolve: uniform(0),
    base: uniform(4000),
    top: uniform(4600),
    coverage: uniform(0.5),
    extinction: uniform(0.04),
    sun: uniform(new THREE.Vector3()), // direct light on the layer, exposed
    up: uniform(new THREE.Vector3()), // the sky's light on the layer from above, as radiance, exposed
    down: uniform(new THREE.Vector3()), // the world's from below
    opticalDepth: uniform(new THREE.Vector3()), // of the air below the layer, vertical
    lit: uniform(0), // whether the sun reaches the layer at all
  };
  /** Seconds of sky time: the cloud's drift. */
  time = 0;
  /** The sun's elevation, degrees; between the baked skies, the two either side are blended. */
  elevation = 0;
  setting!: SkySetting;
  private readonly maps: THREE.DataTexture[];
  private readonly mapFloats: Float32Array[];
  private readonly halves: Uint16Array;
  private readonly belowTexture: THREE.DataTexture;
  private readonly mapNode;
  private readonly nextNode;
  private readonly blend = uniform(0);
  private readonly belowNode;
  private readonly noise: { billows: THREE.Texture; patches: THREE.Texture; detail: THREE.Texture };

  /** The baked skies, from `base`, with the cloud's noise (noise.ts). */
  static async load(base: string, noise: NoiseData): Promise<Sky> {
    const [json, bin] = await Promise.all([fetch(`${base}sky.json`).then((r) => r.json()), fetch(`${base}sky.bin`).then((r) => r.arrayBuffer())]);
    return new Sky(json as Baked, new Uint16Array(bin), noise);
  }

  private constructor(baked: Baked, halves: Uint16Array, noise: NoiseData) {
    this.baked = baked;
    this.halves = halves;
    this.noise = { billows: imageTexture(noise.billows), patches: imageTexture(noise.patches), detail: imageTexture(noise.detail) };
    const size = baked.map.size;
    this.maps = baked.skies.map((s) => halfTexture(halves.slice(s.sky, s.sky + size * size * 4), size));
    this.mapFloats = baked.skies.map((s) => Float32Array.from(halves.subarray(s.sky, s.sky + size * size * 4), FROM_HALF));
    const b = baked.below.size;
    this.belowTexture = halfTexture(new Uint16Array(b * b * 4), b);
    this.mapNode = texture(this.maps[0]);
    this.nextNode = texture(this.maps[Math.min(1, this.maps.length - 1)]);
    this.belowNode = texture(this.belowTexture);
  }

  /** The baked skies' elevations, from the highest sun to the lowest. */
  get elevations(): number[] { return this.baked.skies.map((s) => s.sunElevation); }

  /** The two baked skies either side of an elevation, and how far between them it lies. */
  private between(elevation: number): { i: number; t: number } {
    const e = this.elevations, last = e.length - 1;
    if (elevation >= e[0]) return { i: 0, t: 0 };
    if (elevation <= e[last]) return { i: last - 1, t: 1 };
    const i = e.findIndex((v, k) => k < last && v >= elevation && e[k + 1] <= elevation);
    return { i, t: (e[i] - elevation) / (e[i] - e[i + 1]) };
  }

  /** Choose the sky's setting; the sun keeps its elevation. */
  set(setting: SkySetting): void {
    this.setting = setting;
    const u = this.uniforms, { cloud } = setting;
    u.sunAzimuth.value = setting.sunAzimuth;
    u.base.value = cloud.base;
    u.top.value = cloud.top;
    u.coverage.value = cloud.coverage;
    u.extinction.value = cloud.extinction;
    this.setSun(this.elevation);
  }

  /**
   * The sun's direct light at an elevation and an altitude (m), not exposed, as illuminance normal
   * to it; zero once it has set there.
   */
  sunAt(elevation: number, altitude = 0): THREE.Vector3 {
    const { i, t } = this.between(elevation);
    const altitudes = this.baked.light.altitudes, skies = this.baked.skies;
    return logLerp(lerpTable(altitudes, skies[i].light.sun, altitude), lerpTable(altitudes, skies[i + 1].light.sun, altitude), t);
  }

  /**
   * Set the sun's elevation, degrees. Everything baked is blended between the two skies either
   * side of it: the clear sky, the light on the cloud, and the air below it.
   */
  setSun(elevation: number): void {
    this.elevation = elevation;
    const { i, t } = this.between(elevation);
    const a = this.baked.skies[i], b = this.baked.skies[i + 1];
    const u = this.uniforms, { cloud, sunAzimuth } = this.setting;
    const exposure = this.setting.exposure(elevation);
    u.exposure.value = exposure;
    this.mapNode.value = this.maps[i];
    this.nextNode.value = this.maps[i + 1];
    this.blend.value = t;
    const e = THREE.MathUtils.degToRad(elevation);
    u.sunDirection.value.set(Math.cos(e) * Math.cos(sunAzimuth), Math.sin(e), Math.cos(e) * Math.sin(sunAzimuth));
    const middle = (cloud.base + cloud.top) / 2, altitudes = this.baked.light.altitudes;
    const mixed = (table: (sky: BakedSky) => Triple[], at: number) => lerpTable(altitudes, table(a), at).lerp(lerpTable(altitudes, table(b), at), t);
    u.sun.value.copy(this.sunAt(elevation, middle)).multiplyScalar(exposure);
    // A layer of cloud is lit through its level faces: the sky's light on it is its illuminance
    // from above and below, as the radiance of a uniform sky that gives it, E / π. The bright band
    // along the horizon, which dominates the sky's mean radiance at dusk, reaches a layer edge-on.
    u.up.value.copy(mixed((sky) => sky.light.upIrradiance, middle)).multiplyScalar(exposure / Math.PI);
    u.down.value.copy(mixed((sky) => sky.light.downIrradiance, middle)).multiplyScalar(exposure / Math.PI);
    u.lit.value = u.sun.value.lengthSq() > 0 ? 1 : 0;
    const slices = this.baked.below.slices;
    const depth = (sky: BakedSky) => lerpTable([0, ...slices], [[0, 0, 0], ...sky.opticalDepth], cloud.base);
    u.opticalDepth.value.copy(depth(a).lerp(depth(b), t));
    // The air's own light below the layer's base, between the baked slices and the two skies.
    const size = this.baked.below.size, n = size * size * 4;
    const k = Math.min(Math.max(slices.findIndex((h) => h > cloud.base) - 1, 0), slices.length - 2);
    const s = Math.min(Math.max((cloud.base - slices[k]) / (slices[k + 1] - slices[k]), 0), 1);
    const data = this.belowTexture.image.data as Uint16Array;
    for (let m = 0; m < n; m++) {
      const at = (sky: BakedSky) => {
        const lo = FROM_HALF(this.halves[sky.below + k * n + m]), hi = FROM_HALF(this.halves[sky.below + (k + 1) * n + m]);
        return lo + (hi - lo) * s;
      };
      data[m] = HALF(at(a) + (at(b) - at(a)) * t);
    }
    this.belowTexture.needsUpdate = true;
  }

  /** Advance the sky's clock: the cloud drifts with the wind and slowly changes shape. */
  advance(dt: number): void {
    this.time += dt;
    const [wx, wz] = this.setting.wind;
    this.uniforms.drift.value.set(wx * this.time, wz * this.time);
    this.uniforms.evolve.value = this.time * 0.7;
  }

  /**
   * The clear sky's radiance in a world direction, not exposed, from the baked maps on the CPU, as
   * the shader blends them; at the sun's elevation, or at another.
   */
  clearRadiance(direction: THREE.Vector3, elevation = this.elevation): THREE.Vector3 {
    const { i, t } = this.between(elevation);
    const a = this.clearFrom(this.mapFloats[i], direction), b = this.clearFrom(this.mapFloats[i + 1], direction);
    const blend = (x: number, y: number) => Math.exp(Math.log(x + CLEAR_FLOOR) * (1 - t) + Math.log(y + CLEAR_FLOOR) * t) - CLEAR_FLOOR;
    return new THREE.Vector3(blend(a.x, b.x), blend(a.y, b.y), blend(a.z, b.z));
  }

  private clearFrom(f: Float32Array, direction: THREE.Vector3): THREE.Vector3 {
    const size = this.baked.map.size;
    const a = this.setting.sunAzimuth;
    const along = direction.x * Math.cos(a) + direction.z * Math.sin(a), across = direction.z * Math.cos(a) - direction.x * Math.sin(a);
    const radius = Math.min(Math.acos(THREE.MathUtils.clamp(direction.y, -1, 1)) / (Math.PI / 2), 1);
    const flat = Math.max(Math.hypot(along, across), 1e-9);
    const x = ((along / flat) * radius * 0.5 + 0.5) * size - 0.5, y = ((across / flat) * radius * 0.5 + 0.5) * size - 0.5;
    const x0 = THREE.MathUtils.clamp(Math.floor(x), 0, size - 2), y0 = THREE.MathUtils.clamp(Math.floor(y), 0, size - 2);
    const tx = THREE.MathUtils.clamp(x - x0, 0, 1), ty = THREE.MathUtils.clamp(y - y0, 0, 1);
    const out = new THREE.Vector3();
    for (const [dx, dy, w] of [[0, 0, (1 - tx) * (1 - ty)], [1, 0, tx * (1 - ty)], [0, 1, (1 - tx) * ty], [1, 1, tx * ty]] as const) {
      const o = ((y0 + dy) * size + x0 + dx) * 4;
      out.x += f[o] * w; out.y += f[o + 1] * w; out.z += f[o + 2] * w;
    }
    return out;
  }

  /** The sky's radiance, exposed, in a world direction (y up), with the cloud. */
  radiance(direction: Node<'vec3'>): Node<'vec3'> {
    const u = this.uniforms;
    const { billows, patches, detail } = this.noise;
    const billowsNode = texture(billows), patchesNode = texture(patches), detailNode = texture3D(detail);
    const zero = float(0);

    /** Where a direction falls on a baked map: azimuthal equidistant about the zenith, the sun along +x. */
    const mapUV = (dir: Node<'vec3'>) => {
      const c = cos(u.sunAzimuth), s = sin(u.sunAzimuth);
      const flat = vec2(dir.x.mul(c).add(dir.z.mul(s)), dir.z.mul(c).sub(dir.x.mul(s)));
      const radius = min(acos(clamp(dir.y, -1, 1)).div(Math.PI / 2), 1);
      return flat.div(max(length(flat), 1e-6)).mul(radius).mul(0.5).add(0.5);
    };
    /**
     * The cloudlets' density at a point relative to the observer: rounded masses gathered in
     * patches, densest at their cores and thin at their edges, where they are also shallowest; about
     * as thick as they are wide, as altocumulus is, flatter below their middle and domed above.
     */
    const shape = (p: Node<'vec3'>) => {
      const q = p.xz.add(u.drift);
      const h = p.y.sub(u.base).div(u.top.sub(u.base));
      const warp = billowsNode.sample(q.div(WARP_TILE)).level(zero).ba.sub(0.5).mul(WARP);
      const field = billowsNode.sample(q.add(warp).div(BILLOW_TILE)).level(zero);
      const patch = patchesNode.sample(q.div(PATCH_TILE)).level(zero).r;
      const coverage = saturate(u.coverage.add(patch.sub(0.5).mul(1.2)));
      const masses = field.r.mul(field.g.mul(0.35).add(0.75));
      const body = saturate(masses.sub(float(1).sub(coverage)).div(0.3));
      const offset = h.sub(0.4);
      const reach = body.mul(mix(0.4, 0.6, step(0, offset)));
      return body.mul(smoothstep(0, 0.35, float(1).sub(abs(offset).div(max(reach, 1e-3)))));
    };
    /** The shape frayed at its edges by the detail volume. */
    const density = (p: Node<'vec3'>) => {
      const s = shape(p);
      const q = p.xz.add(u.drift);
      const fray = float(1).sub(detailNode.sample(vec3(q.x, p.y.add(u.evolve), q.y).div(DETAIL_TILE)).level(zero).r).mul(EROSION);
      return saturate(s.sub(fray).div(max(float(1).sub(fray), 0.05)));
    };
    const hg = (nu: Node<'float'>, g: number) => float((1 - g * g) / (4 * Math.PI)).div(pow(float(1 + g * g).sub(nu.mul(2 * g)), 1.5));

    /** The cloud along a ray: its light, and the transmittance through it. */
    const march = (dir: Node<'vec3'>) => {
      const L = vec3(0).toVar();
      const T = float(1).toVar();
      const t0 = u.base.div(dir.y), t1 = u.top.div(dir.y);
      const dt = t1.sub(t0).div(STEPS);
      const jitter = interleavedGradientNoise(screenCoordinate.xy);
      const nu = dot(dir, u.sunDirection);
      Loop(STEPS, ({ i }) => {
        const p = dir.mul(t0.add(float(i).add(jitter).mul(dt)));
        const d = density(p);
        If(d.greaterThan(0.002), () => {
          const sigma = d.mul(u.extinction);
          // The sky above and the world below, each reaching the point through the cloud between.
          // Diffuse light passes a cloud far more easily than a beam: the diffusion approximation,
          // 1 / (1 + 3/4 (1 − g) τ).
          const thick = u.top.sub(u.base);
          const tauUp = shape(p.add(vec3(0, thick.mul(0.2), 0))).add(shape(p.add(vec3(0, thick.mul(0.5), 0)))).mul(thick.mul(0.3)).mul(u.extinction);
          const tauDown = shape(p.sub(vec3(0, thick.mul(0.2), 0))).mul(thick.mul(0.3)).mul(u.extinction);
          const diffuse = (tau: Node<'float'>) => float(1).div(tau.mul(0.75 * (1 - CLOUD_G)).add(1));
          const light = u.up.mul(diffuse(tauUp)).add(u.down.mul(diffuse(tauDown))).mul(0.5).toVar();
          If(u.lit.greaterThan(0), () => {
            let tau: Node<'float'> = float(0);
            let previous = 0;
            for (const s of LIGHT_SAMPLES) {
              tau = tau.add(shape(p.add(u.sunDirection.mul(s))).mul(s - previous));
              previous = s;
            }
            tau = tau.mul(u.extinction);
            let scatter: Node<'float'> = float(0);
            for (let k = 0; k < OCTAVES; k++) {
              const phase = mix(hg(nu, 0.8 * OCTAVE_C ** k), hg(nu, -0.3 * OCTAVE_C ** k), 0.2);
              scatter = scatter.add(exp(tau.mul(-(OCTAVE_B ** k))).mul(phase).mul(OCTAVE_A ** k));
            }
            light.addAssign(u.sun.mul(scatter));
          });
          // Energy-conserving over the step (Hillaire 2016); the droplets' albedo is 1.
          const e = exp(sigma.mul(dt).negate());
          L.addAssign(light.mul(T).mul(float(1).sub(e)));
          T.mulAssign(e);
        });
        If(T.lessThan(0.01), () => { Break(); });
      });
      return vec4(L, T);
    };

    return Fn(() => {
      const dir = direction.normalize().toVar();
      const uv = mapUV(dir);
      // Blended geometrically, as clearRadiance does: the sky darkens about exponentially as the sun sinks.
      const clear = exp(mix(log(this.mapNode.sample(uv).rgb.add(CLEAR_FLOOR)), log(this.nextNode.sample(uv).rgb.add(CLEAR_FLOOR)), this.blend)).sub(CLEAR_FLOOR).mul(u.exposure);
      const color = clear.toVar();
      If(dir.y.greaterThan(0.03), () => {
        const cloud = march(dir);
        const below = this.belowNode.sample(mapUV(dir)).rgb.mul(u.exposure);
        const air = exp(u.opticalDepth.negate().div(dir.y));
        color.assign(mix(below, clear, cloud.a).add(cloud.rgb.mul(air)));
      });
      return color;
    })();
  }
}
