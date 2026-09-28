// SAME SKY's skies, baked offline from a spectral model of the atmosphere.
//
// The model is Bruneton's (2017): a spherical Earth; Rayleigh scattering by the air; Mie scattering
// by aerosols; and absorption by ozone, whose Chappuis bands take the orange out of the sunlight
// that reaches the upper air at dusk and keep the twilight zenith blue (Hulburt 1953). His
// demonstration atmosphere is very clean; this one carries a continental aerosol load near the
// ground and a thin stratospheric aerosol layer, the source of twilight's purple light. Light is
// followed at 48 wavelengths from 360 to 830 nm. Single scattering is integrated along each ray,
// with the Earth's shadow cast across the sun's disc. The higher orders, which carry much of the
// light in deep twilight, follow Hillaire (2020): the second order's transfer, taken as isotropic,
// summed as a geometric series. Refraction is ignored, so each sun sits about half a degree lower
// than it would appear.
//
// For each sky it writes, in linear sRGB with luminance in cd/m²:
// - the clear sky over the upper hemisphere, the part the aperture frames;
// - for cloud layers from 2 to 12 km: the light of the air between the ground and the layer, and
//   the air's vertical optical depth, so clouds sit in the sky rather than on it;
// - from the ground to 12 km: the sun's direct light, reddened by its long path, and the light of
//   the sky above and of the world below, as mean radiance and as illuminance on a level surface:
//   the light on a cloud.
//
// Usage: node plates/tools/sky-bake.ts            writes public/assets/same-sky/sky.json and sky.bin
//        node plates/tools/sky-bake.ts --check    only the checks against the measured frames

import { mkdir, writeFile } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { DataUtils } from 'three';

/**
 * The skies baked for the room, by the sun's geometric elevation: a sunset, from the afternoon to
 * the end of civil twilight, dense where the light changes fastest. The room plays through them.
 */
const SKIES = [
  { name: 'afternoon', sun: 25 },
  { name: 'late afternoon', sun: 12 },
  { name: 'golden hour', sun: 5 },
  { name: 'sunset', sun: 1.5 },
  { name: 'sundown', sun: 0 },
  { name: 'afterglow', sun: -1 },
  { name: 'dusk', sun: -2.5 },
  { name: 'twilight', sun: -4 },
  { name: 'late twilight', sun: -5.25 },
  { name: 'deep dusk', sun: -6.5 },
];
/**
 * Measured frames to check the model against: Poly Haven's Qwantani Dusk 1 and 2 (CC0), 19 minutes
 * apart on 2024-08-22 at 28.49° S, 29.01° E; the sun's elevation is from their capture times. The
 * zenith's chromaticity is the photograph's, white-balanced at 5303 K; the ratios are the sky's
 * luminance at 30° from the zenith, toward and away from the sun, to the zenith's
 * (tools/lookdev/sky-zenith.ts).
 */
const CHECKS = [
  { name: 'Qwantani Dusk 1', sun: -1.23, zenith: [0.2592, 0.2717], toward: 1.75, away: 1.35 },
  { name: 'Qwantani Dusk 2', sun: -5.32, zenith: [0.2645, 0.2627], toward: 1.78, away: 1.08 },
];

// Spectra -------------------------------------------------------------------------------------------
// 48 bins of 10 nm from 360 nm, each the mean over its bin, from Bruneton's demonstration
// (github.com/ebruneton/precomputed_atmospheric_scattering, BSD-3-Clause, © 2017 Eric Bruneton).

const N = 48;
const LAMBDA = Float64Array.from({ length: N }, (_, i) => 365 + 10 * i); // bin centres, nm
/** Solar irradiance at the top of the atmosphere, W m⁻² nm⁻¹: ASTM G-173, extraterrestrial column. */
const SOLAR = [
  1.11776, 1.14259, 1.01249, 1.14716, 1.72765, 1.73054, 1.6887, 1.61253, 1.91198, 2.03474, 2.02042, 2.02212,
  1.93377, 1.95809, 1.91686, 1.8298, 1.8685, 1.8931, 1.85149, 1.8504, 1.8341, 1.8345, 1.8147, 1.78158,
  1.7533, 1.6965, 1.68194, 1.64654, 1.6048, 1.52143, 1.55622, 1.5113, 1.474, 1.4482, 1.41018, 1.36775,
  1.34188, 1.31429, 1.28303, 1.26758, 1.2367, 1.2082, 1.18737, 1.14683, 1.12362, 1.1058, 1.07124, 1.04992,
];
/** Ozone's absorption cross-section at 233 K, m² (IUP Bremen, Serdyuchenko et al.). */
const OZONE_CROSS_SECTION = [
  1.18e-27, 2.182e-28, 2.818e-28, 6.636e-28, 1.527e-27, 2.763e-27, 5.52e-27, 8.451e-27, 1.582e-26, 2.316e-26,
  3.669e-26, 4.924e-26, 7.752e-26, 9.016e-26, 1.48e-25, 1.602e-25, 2.139e-25, 2.755e-25, 3.091e-25, 3.5e-25,
  4.266e-25, 4.672e-25, 4.398e-25, 4.701e-25, 5.019e-25, 4.305e-25, 3.74e-25, 3.215e-25, 2.662e-25, 2.238e-25,
  1.852e-25, 1.473e-25, 1.209e-25, 9.423e-26, 7.455e-26, 6.566e-26, 5.105e-26, 4.15e-26, 4.228e-26, 3.237e-26,
  2.451e-26, 2.801e-26, 2.534e-26, 1.624e-26, 1.465e-26, 2.078e-26, 1.383e-26, 7.105e-27,
];
/** CIE 1931 2° color matching functions, 360–830 nm at 5 nm: x̄, ȳ, z̄. */
const CIE = [
  0.0001299, 0.000003917, 0.0006061, 0.0002321, 0.000006965, 0.001086, 0.0004149, 0.00001239, 0.001946, 0.0007416, 0.00002202, 0.003486,
  0.001368, 0.000039, 0.00645, 0.002236, 0.000064, 0.01055, 0.004243, 0.00012, 0.02005, 0.00765, 0.000217, 0.03621,
  0.01431, 0.000396, 0.06785, 0.02319, 0.00064, 0.1102, 0.04351, 0.00121, 0.2074, 0.07763, 0.00218, 0.3713,
  0.13438, 0.004, 0.6456, 0.21477, 0.0073, 1.03905, 0.2839, 0.0116, 1.3856, 0.3285, 0.01684, 1.62296,
  0.34828, 0.023, 1.74706, 0.34806, 0.0298, 1.7826, 0.3362, 0.038, 1.77211, 0.3187, 0.048, 1.7441,
  0.2908, 0.06, 1.6692, 0.2511, 0.0739, 1.5281, 0.19536, 0.09098, 1.28764, 0.1421, 0.1126, 1.0419,
  0.09564, 0.13902, 0.81295, 0.05795, 0.1693, 0.6162, 0.03201, 0.20802, 0.46518, 0.0147, 0.2586, 0.3533,
  0.0049, 0.323, 0.272, 0.0024, 0.4073, 0.2123, 0.0093, 0.503, 0.1582, 0.0291, 0.6082, 0.1117,
  0.06327, 0.71, 0.07825, 0.1096, 0.7932, 0.05725, 0.1655, 0.862, 0.04216, 0.22575, 0.91485, 0.02984,
  0.2904, 0.954, 0.0203, 0.3597, 0.9803, 0.0134, 0.43345, 0.99495, 0.00875, 0.51205, 1, 0.00575,
  0.5945, 0.995, 0.0039, 0.6784, 0.9786, 0.00275, 0.7621, 0.952, 0.0021, 0.8425, 0.9154, 0.0018,
  0.9163, 0.87, 0.00165, 0.9786, 0.8163, 0.0014, 1.0263, 0.757, 0.0011, 1.0567, 0.6949, 0.001,
  1.0622, 0.631, 0.0008, 1.0456, 0.5668, 0.0006, 1.0026, 0.503, 0.00034, 0.9384, 0.4412, 0.00024,
  0.85445, 0.381, 0.00019, 0.7514, 0.321, 0.0001, 0.6424, 0.265, 0.00005, 0.5419, 0.217, 0.00003,
  0.4479, 0.175, 0.00002, 0.3608, 0.1382, 0.00001, 0.2835, 0.107, 0, 0.2187, 0.0816, 0,
  0.1649, 0.061, 0, 0.1212, 0.04458, 0, 0.0874, 0.032, 0, 0.0636, 0.0232, 0,
  0.04677, 0.017, 0, 0.0329, 0.01192, 0, 0.0227, 0.00821, 0, 0.01584, 0.005723, 0,
  0.011359, 0.004102, 0, 0.008111, 0.002929, 0, 0.00579, 0.002091, 0, 0.004109, 0.001484, 0,
  0.002899, 0.001047, 0, 0.002049, 0.00074, 0, 0.00144, 0.00052, 0, 0.001, 0.000361, 0,
  0.00069, 0.000249, 0, 0.000476, 0.000172, 0, 0.000332, 0.00012, 0, 0.000235, 0.0000848, 0,
  0.000166, 0.00006, 0, 0.000117, 0.0000424, 0, 0.0000831, 0.00003, 0, 0.0000588, 0.0000212, 0,
  0.0000415, 0.000015, 0, 0.0000293, 0.0000106, 0, 0.0000206, 0.00000746, 0, 0.0000146, 0.00000526, 0,
  0.00001, 0.0000037, 0, 0.0000071, 0.00000256, 0, 0.0000051, 0.0000018, 0, 0.00000355, 0.00000127, 0,
  0.00000251, 0.00000091, 0, 0.00000178, 0.00000064, 0, 0.00000125, 0.00000045, 0,
];
/** Weights that integrate a binned spectral radiance, linearly interpolated, against x̄ ȳ z̄ at 1 nm; with 683 lm/W. */
const XYZ_WEIGHTS = (() => {
  const w = [new Float64Array(N), new Float64Array(N), new Float64Array(N)];
  for (let l = 360; l <= 830; l++) {
    const f = Math.min(Math.max((l - LAMBDA[0]) / 10, 0), N - 1.000001), i = Math.floor(f), u = f - i;
    const c = (l - 360) / 5, j = Math.min(Math.floor(c), 93), v = c - j;
    for (let k = 0; k < 3; k++) {
      const cmf = CIE[j * 3 + k] * (1 - v) + CIE[(j + 1) * 3 + k] * v;
      w[k][i] += 683 * cmf * (1 - u);
      w[k][i + 1] += 683 * cmf * u;
    }
  }
  return w;
})();
const XYZ_TO_SRGB = [3.2406, -1.5372, -0.4986, -0.9689, 1.8758, 0.0415, 0.0557, -0.204, 1.057];

function toXYZ(spectrum: ArrayLike<number>): number[] {
  const out = [0, 0, 0];
  for (let k = 0; k < 3; k++) for (let i = 0; i < N; i++) out[k] += XYZ_WEIGHTS[k][i] * spectrum[i];
  return out;
}
function toRGB(spectrum: ArrayLike<number>): number[] {
  const [X, Y, Z] = toXYZ(spectrum);
  const m = XYZ_TO_SRGB;
  return [m[0] * X + m[1] * Y + m[2] * Z, m[3] * X + m[4] * Y + m[5] * Z, m[6] * X + m[7] * Y + m[8] * Z];
}

// The atmosphere -------------------------------------------------------------------------------------

const R_BOTTOM = 6360e3, R_TOP = 6460e3; // m
const H_TOP = Math.sqrt(R_TOP * R_TOP - R_BOTTOM * R_BOTTOM);
const SUN_ANGULAR_RADIUS = 0.00935 / 2;
const GROUND_ALBEDO = 0.1;
const OBSERVER = 2; // m above the ground
/** Aerosols near the ground: a clean continental load (optical depth at 550 nm), single scattering albedo, asymmetry. */
const AEROSOL = { depth: 0.1, angstrom: 1.3, height: 1200, albedo: 0.95, g: 0.76 };
/** Background stratospheric sulfate: a thin layer near 20 km, of small particles. */
const STRATOSPHERE = { depth: 0.006, angstrom: 1.5, altitude: 20e3, width: 4e3, albedo: 1, g: 0.7 };
/** Ozone: 300 Dobson units in Bruneton's tent between 10 and 40 km, peaking at 25 km. */
const OZONE_PEAK_DENSITY = (300 * 2.687e20) / 15000; // molecules m⁻³

// Components: 0 air, 1 aerosol near the ground, 2 stratospheric aerosol, 3 ozone. Coefficients per
// unit density, m⁻¹.
const SCATTERING = [new Float64Array(N), new Float64Array(N), new Float64Array(N), new Float64Array(N)];
const EXTINCTION = [new Float64Array(N), new Float64Array(N), new Float64Array(N), new Float64Array(N)];
for (let i = 0; i < N; i++) {
  SCATTERING[0][i] = EXTINCTION[0][i] = 1.24062e-6 / (LAMBDA[i] / 1000) ** 4;
  EXTINCTION[1][i] = (AEROSOL.depth / AEROSOL.height) * (LAMBDA[i] / 550) ** -AEROSOL.angstrom;
  SCATTERING[1][i] = EXTINCTION[1][i] * AEROSOL.albedo;
  EXTINCTION[2][i] = (STRATOSPHERE.depth / (STRATOSPHERE.width * Math.sqrt(2 * Math.PI))) * (LAMBDA[i] / 550) ** -STRATOSPHERE.angstrom;
  SCATTERING[2][i] = EXTINCTION[2][i] * STRATOSPHERE.albedo;
  EXTINCTION[3][i] = OZONE_PEAK_DENSITY * OZONE_CROSS_SECTION[i];
}

function density(h: number, out: Float64Array): void {
  out[0] = Math.exp(-h / 8000);
  out[1] = Math.exp(-h / AEROSOL.height);
  const s = (h - STRATOSPHERE.altitude) / STRATOSPHERE.width;
  out[2] = Math.exp(-0.5 * s * s);
  out[3] = Math.min(Math.max(h < 25e3 ? h / 15e3 - 2 / 3 : 8 / 3 - h / 15e3, 0), 1);
}

const rayleighPhase = (nu: number) => (3 / (16 * Math.PI)) * (1 + nu * nu);
/** Cornette–Shanks, as Bruneton uses it. */
function miePhase(nu: number, g: number): number {
  const k = ((3 / (8 * Math.PI)) * (1 - g * g)) / (2 + g * g);
  return (k * (1 + nu * nu)) / (1 + g * g - 2 * g * nu) ** 1.5;
}

const clamp = (x: number, a: number, b: number) => Math.min(Math.max(x, a), b);
function smoothstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
const distanceToTop = (r: number, mu: number) => Math.max(0, -r * mu + Math.sqrt(Math.max(r * r * (mu * mu - 1) + R_TOP * R_TOP, 0)));
const hitsGround = (r: number, mu: number) => mu < 0 && r * r * (mu * mu - 1) + R_BOTTOM * R_BOTTOM >= 0;
const distanceToGround = (r: number, mu: number) => Math.max(0, -r * mu - Math.sqrt(Math.max(r * r * (mu * mu - 1) + R_BOTTOM * R_BOTTOM, 0)));
/** Distance along an upward ray to the sphere of radius rs > r. */
const distanceUpTo = (r: number, mu: number, rs: number) => -r * mu + Math.sqrt(Math.max(r * r * (mu * mu - 1) + rs * rs, 0));
/** The sun's visible fraction from radius r, where the sun's zenith cosine is muS: the Earth's shadow across its disc. */
function sunVisible(r: number, muS: number): number {
  const sinH = R_BOTTOM / r, cosH = -Math.sqrt(Math.max(1 - sinH * sinH, 0));
  return smoothstep(-sinH * SUN_ANGULAR_RADIUS, sinH * SUN_ANGULAR_RADIUS, muS - cosH);
}

// Tables ----------------------------------------------------------------------------------------------

// Column densities to the top of the atmosphere, for rays that clear the ground, in Bruneton's
// parameterization: x_r from the radius, x_mu from the distance to the top.
const T_MU = 512, T_R = 256;
// Hillaire's transfer of the higher orders, Ψ, at 48 wavelengths, over altitude and the sun's elevation.
const PSI_H = 32, PSI_E = 181, PSI_DIRECTIONS = 128, PSI_TOP = 100e3;
// Outputs.
const MAP = 128; // the clear sky: azimuthal equidistant about the zenith, to the horizon
const BELOW = 32; // the air under a cloud layer, same projection
const SLICES = Array.from({ length: 6 }, (_, i) => (i + 1) * 2000); // cloud-layer altitudes, m
const LIGHT = Array.from({ length: 49 }, (_, i) => i * 250); // altitudes for the light on clouds, m
const RING = 16; // directions per hemisphere: RING zenith rings × RING azimuths over half a turn

type Shared = {
  columns: Float64Array; lnPsi: Float64Array; sky: Float64Array; below: Float64Array;
  up: Float64Array; upCos: Float64Array; down: Float64Array; downCos: Float64Array; ground: Float64Array;
};
const allocate = (n: number) => new Float64Array(new SharedArrayBuffer(n * 8));

// Scratch, per thread.
const rho4 = new Float64Array(4), cols = new Float64Array(4), psi = new Float64Array(N);
const sunT = new Float64Array(N);

function columnsAt(shared: Shared, r: number, mu: number, out: Float64Array): void {
  const rho = Math.sqrt(Math.max(r * r - R_BOTTOM * R_BOTTOM, 0));
  const dMin = R_TOP - r, dMax = rho + H_TOP;
  const xMu = clamp((distanceToTop(r, mu) - dMin) / (dMax - dMin), 0, 1), xR = clamp(rho / H_TOP, 0, 1);
  const fi = xMu * (T_MU - 1), fj = xR * (T_R - 1);
  const i = Math.min(Math.floor(fi), T_MU - 2), j = Math.min(Math.floor(fj), T_R - 2), u = fi - i, v = fj - j;
  const c = shared.columns;
  for (let k = 0; k < 4; k++) {
    const a = c[(j * T_MU + i) * 4 + k], b = c[(j * T_MU + i + 1) * 4 + k];
    const d = c[((j + 1) * T_MU + i) * 4 + k], e = c[((j + 1) * T_MU + i + 1) * 4 + k];
    out[k] = (a * (1 - u) + b * u) * (1 - v) + (d * (1 - u) + e * u) * v;
  }
}

/** The sun's spectral transmittance to radius r, times its visible fraction. */
function sunlight(shared: Shared, r: number, muS: number, out: Float64Array): number {
  const visible = sunVisible(r, muS);
  if (visible <= 0) { out.fill(0); return 0; }
  columnsAt(shared, r, muS, cols);
  for (let l = 0; l < N; l++) {
    out[l] = visible * Math.exp(-(EXTINCTION[0][l] * cols[0] + EXTINCTION[1][l] * cols[1] + EXTINCTION[2][l] * cols[2] + EXTINCTION[3][l] * cols[3]));
  }
  return visible;
}

function psiAt(shared: Shared, h: number, muS: number, out: Float64Array): void {
  const fk = Math.sqrt(clamp(h / PSI_TOP, 0, 1)) * (PSI_H - 1);
  const fm = clamp((Math.asin(clamp(muS, -1, 1)) * 180) / Math.PI + 90, 0, PSI_E - 1);
  const k = Math.min(Math.floor(fk), PSI_H - 2), m = Math.min(Math.floor(fm), PSI_E - 2), u = fk - k, v = fm - m;
  const t = shared.lnPsi;
  const a = (k * PSI_E + m) * N, b = (k * PSI_E + m + 1) * N, c = ((k + 1) * PSI_E + m) * N, d = ((k + 1) * PSI_E + m + 1) * N;
  const wa = (1 - u) * (1 - v), wb = (1 - u) * v, wc = u * (1 - v), wd = u * v;
  for (let l = 0; l < N; l++) out[l] = Math.exp(t[a + l] * wa + t[b + l] * wb + t[c + l] * wc + t[d + l] * wd);
}

/**
 * Light arriving along a ray, and the ray's transmittance: single scattering in the Earth's shadow,
 * the higher orders from Ψ, and the ground's light where the ray meets it. The ray starts at radius
 * r with zenith cosine mu; muS is the sun's zenith cosine there, nu the cosine between ray and sun.
 * It stops at the top of the atmosphere, the ground, or radius `stop`.
 */
function march(shared: Shared, r: number, mu: number, muS: number, nu: number, steps: number, L: Float64Array, T: Float64Array, stop = Infinity, groundRadiance?: Float64Array): void {
  L.fill(0);
  T.fill(1);
  const ground = hitsGround(r, mu);
  let end = ground ? distanceToGround(r, mu) : distanceToTop(r, mu);
  let stopped = false;
  if (stop < Infinity && mu > 0) {
    const s = distanceUpTo(r, mu, stop);
    if (s < end) { end = s; stopped = true; }
  }
  const phaseR = rayleighPhase(nu), phaseA = miePhase(nu, AEROSOL.g), phaseS = miePhase(nu, STRATOSPHERE.g);
  let previous = 0;
  for (let s = 0; s < steps; s++) {
    const next = end * ((s + 1) / steps) ** 2;
    const t = end * ((s + 0.5) / steps) ** 2, dt = next - previous;
    previous = next;
    const rt = Math.sqrt(t * t + 2 * r * mu * t + r * r);
    const muSt = clamp((r * muS + t * nu) / rt, -1, 1);
    density(rt - R_BOTTOM, rho4);
    const lit = sunlight(shared, rt, muSt, sunT);
    psiAt(shared, rt - R_BOTTOM, muSt, psi);
    for (let l = 0; l < N; l++) {
      const sR = SCATTERING[0][l] * rho4[0], sA = SCATTERING[1][l] * rho4[1], sS = SCATTERING[2][l] * rho4[2];
      const sigmaT = EXTINCTION[0][l] * rho4[0] + EXTINCTION[1][l] * rho4[1] + EXTINCTION[2][l] * rho4[2] + EXTINCTION[3][l] * rho4[3];
      const single = lit > 0 ? sunT[l] * (sR * phaseR + sA * phaseA + sS * phaseS) : 0;
      const source = SOLAR[l] * (single + psi[l] * (sR + sA + sS));
      const e = Math.exp(-sigmaT * dt);
      L[l] += T[l] * source * (sigmaT > 0 ? (1 - e) / sigmaT : dt);
      T[l] *= e;
    }
  }
  if (ground && !stopped && groundRadiance) for (let l = 0; l < N; l++) L[l] += T[l] * groundRadiance[l];
}

/** Uniform directions on the sphere (a Fibonacci lattice), for Ψ. */
const SPHERE = Array.from({ length: PSI_DIRECTIONS }, (_, i) => {
  const z = 1 - (2 * (i + 0.5)) / PSI_DIRECTIONS, a = i * Math.PI * (3 - Math.sqrt(5)), s = Math.sqrt(1 - z * z);
  return [s * Math.cos(a), s * Math.sin(a), z];
});

// Work, split across threads ---------------------------------------------------------------------------

type Task =
  | { kind: 'columns' }
  | { kind: 'psi' }
  | { kind: 'sky'; sun: number }
  | { kind: 'below'; sun: number }
  | { kind: 'up'; sun: number }
  | { kind: 'down'; sun: number };

function run(shared: Shared, task: Task, id: number, count: number): void {
  const L = new Float64Array(N), T = new Float64Array(N);
  if (task.kind === 'columns') {
    for (let j = id; j < T_R; j += count) {
      const rho = (H_TOP * j) / (T_R - 1), r = Math.sqrt(rho * rho + R_BOTTOM * R_BOTTOM);
      const dMin = R_TOP - r, dMax = rho + H_TOP;
      for (let i = 0; i < T_MU; i++) {
        const d = dMin + (i / (T_MU - 1)) * (dMax - dMin);
        const mu = d === 0 ? 1 : clamp((H_TOP * H_TOP - rho * rho - d * d) / (2 * r * d), -1, 1);
        const steps = 1500, sum = [0, 0, 0, 0];
        for (let s = 0; s < steps; s++) {
          const t = ((s + 0.5) / steps) * d;
          density(Math.sqrt(t * t + 2 * r * mu * t + r * r) - R_BOTTOM, rho4);
          for (let k = 0; k < 4; k++) sum[k] += rho4[k];
        }
        for (let k = 0; k < 4; k++) shared.columns[(j * T_MU + i) * 4 + k] = (sum[k] * d) / steps;
      }
    }
    return;
  }
  if (task.kind === 'psi') {
    const Lf = new Float64Array(N), Ff = new Float64Array(N), L2 = new Float64Array(N), F = new Float64Array(N);
    for (let k = id; k < PSI_H; k += count) {
      const r = R_BOTTOM + Math.max(PSI_TOP * (k / (PSI_H - 1)) ** 2, 1);
      for (let m = 0; m < PSI_E; m++) {
        const elevation = ((m - 90) * Math.PI) / 180, muS = Math.sin(elevation), cosE = Math.cos(elevation);
        L2.fill(0); F.fill(0);
        for (const [x, , z] of SPHERE) {
          const mu = z, nu = x * cosE + z * muS;
          const ground = hitsGround(r, mu), end = ground ? distanceToGround(r, mu) : distanceToTop(r, mu);
          Lf.fill(0); Ff.fill(0); T.fill(1);
          const steps = 40;
          let previous = 0;
          for (let s = 0; s < steps; s++) {
            const next = end * ((s + 1) / steps) ** 2, t = end * ((s + 0.5) / steps) ** 2, dt = next - previous;
            previous = next;
            const rt = Math.sqrt(t * t + 2 * r * mu * t + r * r), muSt = clamp((r * muS + t * nu) / rt, -1, 1);
            density(rt - R_BOTTOM, rho4);
            const lit = sunlight(shared, rt, muSt, sunT);
            for (let l = 0; l < N; l++) {
              const sigmaS = SCATTERING[0][l] * rho4[0] + SCATTERING[1][l] * rho4[1] + SCATTERING[2][l] * rho4[2];
              const sigmaT = sigmaS + (EXTINCTION[1][l] - SCATTERING[1][l]) * rho4[1] + EXTINCTION[3][l] * rho4[3];
              const e = Math.exp(-sigmaT * dt), w = sigmaT > 0 ? (1 - e) / sigmaT : dt;
              if (lit > 0) Lf[l] += (T[l] * sigmaS * sunT[l] * w) / (4 * Math.PI);
              Ff[l] += T[l] * sigmaS * w;
              T[l] *= e;
            }
          }
          if (ground) {
            const muSg = clamp((r * muS + end * nu) / R_BOTTOM, -1, 1);
            if (sunlight(shared, R_BOTTOM, muSg, sunT) > 0) for (let l = 0; l < N; l++) Lf[l] += (T[l] * GROUND_ALBEDO * Math.max(muSg, 0) * sunT[l]) / Math.PI;
          }
          for (let l = 0; l < N; l++) { L2[l] += Lf[l] / PSI_DIRECTIONS; F[l] += Ff[l] / PSI_DIRECTIONS; }
        }
        for (let l = 0; l < N; l++) shared.lnPsi[(k * PSI_E + m) * N + l] = Math.log(Math.max(L2[l] / (1 - F[l]), 1e-300));
      }
    }
    return;
  }
  const elevation = (task.sun * Math.PI) / 180, muS = Math.sin(elevation), cosE = Math.cos(elevation);
  const r0 = R_BOTTOM + OBSERVER;
  if (task.kind === 'sky') {
    // Symmetric about the sun's vertical: the map's lower half mirrors the upper.
    for (let j = id; j < MAP / 2; j += count) {
      for (let i = 0; i < MAP; i++) {
        const u = ((i + 0.5) / MAP) * 2 - 1, v = ((j + 0.5) / MAP) * 2 - 1;
        const zenith = Math.min(Math.hypot(u, v), 1) * (Math.PI / 2), azimuth = Math.atan2(v, u);
        const mu = Math.cos(zenith), nu = Math.sin(zenith) * Math.cos(azimuth) * cosE + mu * muS;
        march(shared, r0, mu, muS, nu, 320, L, T);
        const rgb = toRGB(L);
        for (const row of [j, MAP - 1 - j]) shared.sky.set(rgb, (row * MAP + i) * 3);
      }
    }
    return;
  }
  if (task.kind === 'below') {
    for (let row = id; row < SLICES.length * (BELOW / 2); row += count) {
      const slice = Math.floor(row / (BELOW / 2)), j = row % (BELOW / 2);
      for (let i = 0; i < BELOW; i++) {
        const u = ((i + 0.5) / BELOW) * 2 - 1, v = ((j + 0.5) / BELOW) * 2 - 1;
        const zenith = Math.min(Math.hypot(u, v), 1) * (Math.PI / 2 - 1e-3), azimuth = Math.atan2(v, u);
        const mu = Math.cos(zenith), nu = Math.sin(zenith) * Math.cos(azimuth) * cosE + mu * muS;
        march(shared, r0, mu, muS, nu, 200, L, T, R_BOTTOM + SLICES[slice]);
        const rgb = toRGB(L);
        for (const jj of [j, BELOW - 1 - j]) shared.below.set(rgb, ((slice * BELOW + jj) * BELOW + i) * 3);
      }
    }
    return;
  }
  // The sky's mean radiance over the hemisphere above a point (and, at the ground, its irradiance),
  // or over the hemisphere below, where most rays end on the ground.
  const upward = task.kind === 'up';
  const meanL = new Float64Array(N), irradiance = new Float64Array(N);
  for (let a = id; a < LIGHT.length; a += count) {
    const r = R_BOTTOM + Math.max(LIGHT[a], OBSERVER);
    meanL.fill(0); irradiance.fill(0);
    let solid = 0;
    for (let q = 0; q < RING; q++) {
      const zenith = ((q + 0.5) / RING) * (Math.PI / 2) + (upward ? 0 : Math.PI / 2);
      for (let p = 0; p < RING; p++) {
        const azimuth = ((p + 0.5) / RING) * Math.PI;
        const mu = Math.cos(zenith), nu = Math.sin(zenith) * Math.cos(azimuth) * cosE + mu * muS;
        march(shared, r, mu, muS, nu, 160, L, T, Infinity, upward ? undefined : shared.ground);
        const dOmega = Math.sin(zenith) * (Math.PI / 2 / RING) * (Math.PI / RING) * 2; // both halves
        solid += dOmega;
        for (let l = 0; l < N; l++) { meanL[l] += L[l] * dOmega; irradiance[l] += L[l] * Math.abs(mu) * dOmega; }
      }
    }
    const target = upward ? shared.up : shared.down;
    target.set(toRGB(meanL.map((x) => x / solid)), a * 3);
    (upward ? shared.upCos : shared.downCos).set(toRGB(irradiance), a * 3);
    if (upward && a === 0) shared.ground.set(irradiance.map((x) => (x * GROUND_ALBEDO) / Math.PI));
  }
}

// Worker ----------------------------------------------------------------------------------------------

if (!isMainThread) {
  const { shared, id, count } = workerData as { shared: Shared; id: number; count: number };
  parentPort!.on('message', (task: Task) => { run(shared, task, id, count); parentPort!.postMessage('done'); });
}

// Main ------------------------------------------------------------------------------------------------

if (isMainThread) {
  const started = Date.now();
  const shared: Shared = {
    columns: allocate(T_R * T_MU * 4),
    lnPsi: allocate(PSI_H * PSI_E * N),
    sky: allocate(MAP * MAP * 3),
    below: allocate(SLICES.length * BELOW * BELOW * 3),
    up: allocate(LIGHT.length * 3),
    upCos: allocate(LIGHT.length * 3),
    down: allocate(LIGHT.length * 3),
    downCos: allocate(LIGHT.length * 3),
    ground: allocate(N),
  };
  const count = Math.max(1, Math.min(availableParallelism() - 1, 12));
  const workers = Array.from({ length: count }, (_, id) => new Worker(new URL(import.meta.url), { workerData: { shared, id, count } }));
  const all = (task: Task) => Promise.all(workers.map((w) => new Promise((resolve) => { w.once('message', resolve); w.postMessage(task); })));
  const lap = (label: string) => console.log(`${label.padEnd(34)} ${((Date.now() - started) / 1000).toFixed(1)} s`);

  await all({ kind: 'columns' });
  lap('column densities');
  await all({ kind: 'psi' });
  lap('higher orders (Hillaire Ψ)');

  const luminance = (c: number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const L = new Float64Array(N), T = new Float64Array(N);
  /** One ray from the observer: its linear sRGB, absolute. */
  const ray = (sun: number, zenith: number, azimuth: number) => {
    const e = (sun * Math.PI) / 180, mu = Math.cos(zenith);
    march(shared, R_BOTTOM + OBSERVER, mu, Math.sin(e), Math.sin(zenith) * Math.cos(azimuth) * Math.cos(e) + mu * Math.sin(e), 640, L, T);
    return toRGB(L);
  };

  // Check against the measured frames: the zenith's chromaticity, as a camera white-balanced at
  // 5303 K records it (a Bradford adaptation from that daylight white to D65), and the gradient.
  const bradford = (() => {
    const M = [[0.8951, 0.2664, -0.1614], [-0.7502, 1.7135, 0.0367], [0.0389, -0.0685, 1.0296]];
    const Minv = [[0.9869929, -0.1470543, 0.1599627], [0.4323053, 0.5183603, 0.0492912], [-0.0085287, 0.0400428, 0.9684867]];
    const white = (x: number, y: number) => [x / y, 1, (1 - x - y) / y];
    const cone = (v: number[]) => M.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);
    const src = cone(white(0.3374, 0.3518)), dst = cone(white(0.3127, 0.329));
    return (xyz: number[]) => {
      const c = cone(xyz).map((v, k) => (v * dst[k]) / src[k]);
      return Minv.map((row) => row[0] * c[0] + row[1] * c[1] + row[2] * c[2]);
    };
  })();
  const xy = (xyz: number[]) => [xyz[0] / (xyz[0] + xyz[1] + xyz[2]), xyz[1] / (xyz[0] + xyz[1] + xyz[2])];
  const srgbToXYZ = (c: number[]) => [0.4124 * c[0] + 0.3576 * c[1] + 0.1805 * c[2], 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2], 0.0193 * c[0] + 0.1192 * c[1] + 0.9505 * c[2]];
  for (const check of CHECKS) {
    const zenith = ray(check.sun, 0, 0), deg30 = Math.PI / 6;
    const toward = luminance(ray(check.sun, deg30, 0)) / luminance(zenith), away = luminance(ray(check.sun, deg30, Math.PI)) / luminance(zenith);
    const modelXY = xy(bradford(srgbToXYZ(zenith)));
    console.log(`check ${check.name}, sun ${check.sun}°: zenith ${luminance(zenith).toPrecision(3)} cd/m², xy ${modelXY.map((v) => v.toFixed(4)).join(' ')} (measured ${check.zenith.join(' ')}), ` +
      `30° toward ${toward.toFixed(2)} (${check.toward}), away ${away.toFixed(2)} (${check.away})`);
  }
  // And against the conventional figure for the end of civil twilight, sun 6° down: 3.4 lx on the
  // ground under a clear sky.
  {
    const e = (-6 * Math.PI) / 180, irradiance = new Float64Array(N);
    for (let q = 0; q < RING; q++) {
      const zenith = ((q + 0.5) / RING) * (Math.PI / 2);
      for (let p = 0; p < RING; p++) {
        const azimuth = ((p + 0.5) / RING) * Math.PI, mu = Math.cos(zenith);
        march(shared, R_BOTTOM + OBSERVER, mu, Math.sin(e), Math.sin(zenith) * Math.cos(azimuth) * Math.cos(e) + mu * Math.sin(e), 320, L, T);
        const dOmega = Math.sin(zenith) * (Math.PI / 2 / RING) * (Math.PI / RING) * 2;
        for (let l = 0; l < N; l++) irradiance[l] += L[l] * mu * dOmega;
      }
    }
    console.log(`check end of civil twilight, sun -6°: ground ${toXYZ(irradiance)[1].toPrecision(3)} lx (conventional 3.4)`);
  }
  lap('checks');
  if (process.argv.includes('--check')) { await Promise.all(workers.map((w) => w.terminate())); process.exit(0); }

  // The vertical optical depth of the air to each slice, as linear sRGB seen against sunlight.
  const solarRGB = toRGB(SOLAR);
  const opticalDepth = SLICES.map((top) => {
    const sums = [0, 0, 0, 0], steps = 2000;
    for (let s = 0; s < steps; s++) {
      density(((s + 0.5) / steps) * (top - OBSERVER) + OBSERVER, rho4);
      for (let k = 0; k < 4; k++) sums[k] += (rho4[k] * (top - OBSERVER)) / steps;
    }
    const transmitted = SOLAR.map((e, l) => e * Math.exp(-(EXTINCTION[0][l] * sums[0] + EXTINCTION[1][l] * sums[1] + EXTINCTION[2][l] * sums[2] + EXTINCTION[3][l] * sums[3])));
    return toRGB(transmitted).map((c, k) => -Math.log(c / solarRGB[k]));
  });

  const round = (x: number) => Number(x.toPrecision(5));
  const halves: Uint16Array[] = [];
  let offset = 0;
  const pack = (rgb: Float64Array) => {
    const n = rgb.length / 3, out = new Uint16Array(n * 4);
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 3; k++) out[i * 4 + k] = DataUtils.toHalfFloat(Math.max(rgb[i * 3 + k], 0));
      out[i * 4 + 3] = DataUtils.toHalfFloat(1);
    }
    halves.push(out);
    const at = offset;
    offset += out.length;
    return at;
  };
  const skies = [];
  for (const sky of SKIES) {
    await all({ kind: 'sky', sun: sky.sun });
    await all({ kind: 'below', sun: sky.sun });
    await all({ kind: 'up', sun: sky.sun });
    await all({ kind: 'down', sun: sky.sun });
    const e = (sky.sun * Math.PI) / 180;
    const sun = LIGHT.map((h) => {
      sunlight(shared, R_BOTTOM + Math.max(h, OBSERVER), Math.sin(e), sunT);
      // Past sunset the direct light is redder than sRGB can hold; clip it to the gamut's edge.
      return toRGB(SOLAR.map((s, l) => s * sunT[l])).map((c) => round(Math.max(c, 0)));
    });
    const zenith = ray(sky.sun, 0, 0);
    const triples = (a: Float64Array) => Array.from({ length: a.length / 3 }, (_, i) => [a[i * 3], a[i * 3 + 1], a[i * 3 + 2]].map(round));
    skies.push({
      name: sky.name,
      sunElevation: sky.sun,
      zenith: zenith.map(round),
      zenithLuminance: round(luminance(zenith)),
      groundIlluminance: round(luminance(Array.from(shared.upCos.subarray(0, 3)))),
      sky: pack(shared.sky),
      below: pack(shared.below),
      opticalDepth: opticalDepth.map((c) => c.map(round)),
      light: { sun, up: triples(shared.up), down: triples(shared.down), upIrradiance: triples(shared.upCos), downIrradiance: triples(shared.downCos) },
    });
    lap(`sky: ${sky.name} (${sky.sun}°), zenith ${luminance(zenith).toPrecision(3)} cd/m²`);
  }
  await Promise.all(workers.map((w) => w.terminate()));

  const header = {
    about: 'SAME SKY skies, baked by tools/sky-bake.ts: linear sRGB, luminance in cd/m², illuminance in lux. The sun lies along +x of each map.',
    model: { atmosphere: 'Bruneton 2017 with ozone', higherOrders: 'Hillaire 2020', aerosol: AEROSOL, stratosphere: STRATOSPHERE, groundAlbedo: GROUND_ALBEDO, refraction: 'ignored' },
    map: { size: MAP, projection: 'azimuthal equidistant about the zenith, to the horizon at the unit circle', format: 'RGBA half float' },
    below: { size: BELOW, slices: SLICES },
    light: { altitudes: LIGHT, sun: 'direct sunlight, illuminance normal to the sun', up: 'mean radiance of the upper hemisphere', down: 'mean radiance of the lower hemisphere', upIrradiance: 'illuminance on a horizontal surface from above', downIrradiance: 'from below' },
    skies,
  };
  await mkdir('public/plates/assets/same-sky', { recursive: true });
  const bytes = new Uint8Array(offset * 2);
  let at = 0;
  for (const h of halves) { bytes.set(new Uint8Array(h.buffer), at); at += h.byteLength; }
  await writeFile('public/plates/assets/same-sky/sky.bin', bytes);
  await writeFile('public/plates/assets/same-sky/sky.json', JSON.stringify(header));
  lap(`wrote sky.json and sky.bin (${(bytes.byteLength / 1024).toFixed(0)} KB), ${count} threads`);
}
