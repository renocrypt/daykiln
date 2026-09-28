// A herring gull in flight, as numbers: its size and pace, and its wingbeat.
//
// Pace and size are Pennycuick's field measurements of herring gulls (J. Exp. Biol. 204: 3283,
// 2001): 0.925 kg, span 1.35 m, 11.8 m/s, 3.13 wingbeats per second. The stroke is Liu et al.'s
// seagull model (AIAA Journal 44: 954, 2006), as reproduced openly in "Longitudinal Trim and Dynamic
// Stability Analysis of a Seagull-Based Model", Applied Sciences 12: 5440 (2022), CC BY: the wing as
// two rigid jointed rods whose three angles are Fourier series in time. That model was fitted to a
// common gull; it is scaled here to a herring gull's span, and its joint position is an assumption,
// marked below.
//
// Body frame: +x forward, +y up, +z to the right wing. Meters, seconds, radians.

export const GULL = {
  mass: 0.925, // kg
  span: 1.35, // m
  speed: 11.8, // m/s, observed equivalent air speed
  frequency: 3.13, // wingbeats per second
  bodyLength: 0.6, // m, bill to tail; herring gulls measure 55–64 cm
};

// Liu's kinematic coefficients, degrees (Applied Sciences 12: 5440, Table 2).
// ψ1: flapping of the inner wing; ψ2: flapping of the outer wing relative to the inner; φ2: sweep
// of the outer wing relative to the inner. angle(ωt) = C0 + Σn [Cn sin(nωt) + Bn cos(nωt)].
const PSI1 = { c0: 8.4654, c: [-8.5368, 1.0898], b: [17.8798, -4.588] };
const PSI2 = { c0: 17.3083, c: [-11.0122, 1.3128], b: [-9.6131, -3.0183] };
const PHI2 = { c0: 38.4179, c: [-28.0553, -4.1032], b: [0.7664, 3.0125] };

// Assumed: the wrist sits at 45% of the wing's length from the shoulder, from gull wing skeletons
// (Blackburn Lab's CT scan of Larus canus), and the shoulders sit 5.5 cm either side of the axis.
export const SHOULDER = { x: 0.03, y: 0.03, z: 0.055 };
export const WING_LENGTH = GULL.span / 2 - SHOULDER.z;
export const WRIST = 0.45; // fraction of the wing's length

const deg = Math.PI / 180;

function fourier(k: { c0: number; c: number[]; b: number[] }, phase: number): number {
  let v = k.c0;
  for (let n = 1; n <= 2; n++) v += k.c[n - 1] * Math.sin(n * phase) + k.b[n - 1] * Math.cos(n * phase);
  return v * deg;
}

/** The stroke's three angles at a phase ωt of the wingbeat. */
export function stroke(phase: number): { psi1: number; psi2: number; phi2: number } {
  return { psi1: fourier(PSI1, phase), psi2: fourier(PSI2, phase), phi2: fourier(PHI2, phase) };
}

export type Vec = [number, number, number];
const add = (a: Vec, b: Vec, s = 1): Vec => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** Rotate v about a unit axis by an angle (Rodrigues). */
function rotate(v: Vec, axis: Vec, angle: number): Vec {
  const c = Math.cos(angle), s = Math.sin(angle);
  const d = axis[0] * v[0] + axis[1] * v[1] + axis[2] * v[2];
  const k = cross(axis, v);
  return [v[0] * c + k[0] * s + axis[0] * d * (1 - c), v[1] * c + k[1] * s + axis[1] * d * (1 - c), v[2] * c + k[2] * s + axis[2] * d * (1 - c)];
}

export type WingFrame = { origin: Vec; forward: Vec; span: Vec; up: Vec; length: number };

/**
 * The two rods of the right wing (side 1) or the left (side −1) at a phase: each an origin, a
 * spanwise direction, and the section's forward and up directions, in the body frame.
 */
export function wing(phase: number, side: 1 | -1): { inner: WingFrame; outer: WingFrame } {
  const { psi1, psi2, phi2 } = stroke(phase);
  const shoulder: Vec = [SHOULDER.x, SHOULDER.y, side * SHOULDER.z];
  const forward: Vec = [1, 0, 0];
  const span: Vec = [0, Math.sin(psi1), side * Math.cos(psi1)];
  const up: Vec = side > 0 ? cross(span, forward) : cross(forward, span);
  const inner: WingFrame = { origin: shoulder, forward, span, up, length: WING_LENGTH * WRIST };
  const wrist = add(shoulder, span, inner.length);
  // The outer rod: raised by ψ2 about the section's forward axis, then swept back by φ2 about
  // its up axis. Both angles are relative to the inner rod.
  let span2 = rotate(span, forward, -side * psi2);
  let up2 = rotate(up, forward, -side * psi2);
  const forward2 = rotate(forward, up2, side * -phi2);
  span2 = rotate(span2, up2, side * -phi2);
  up2 = side > 0 ? cross(span2, forward2) : cross(forward2, span2);
  return { inner, outer: { origin: wrist, forward: forward2, span: span2, up: up2, length: WING_LENGTH * (1 - WRIST) } };
}

/**
 * How hard the wing is working at a phase, in [−1, 1]: positive in the downstroke, when the inner
 * wing's flapping angle falls. Drives the circulation the wing sheds (a quasi-steady assumption).
 */
export function loading(phase: number): number {
  const h = 1e-3;
  const rate = (stroke(phase + h).psi1 - stroke(phase - h).psi1) / (2 * h);
  const peak = 0.5; // rad per radian of phase, a little above the model's steepest downstroke
  return Math.max(-1, Math.min(1, -rate / peak));
}
