// WAKE's flight: the gull's path and its phases, frozen at one instant. A straight, gently climbing path
// at the herring gull's speed, the body rising and falling with each wingbeat's lift; the phases are the
// last two wingbeats, six to a beat, the leading one at the frozen instant.

import { GULL, loading } from './gull.ts';

export const CLIMB = 5 * (Math.PI / 180); // the path rises gently
export const BODY_PITCH = 4 * (Math.PI / 180); // nose up from the path
export const BOB = 0.015; // m, the body's rise and fall with the stroke's lift
export const FROZEN_AT = 1.4; // s after the flight entered the field
const PHASE_AT_ZERO = 1.2; // ωt at t = 0: sets which moment of the stroke the leading phase holds
const PHASES_PER_BEAT = 6; // spacing about one body length, so each phase stands clear of the next
const PHASES = 12;

/** The wingbeat's phase, ωt, at time t. */
export const phaseAt = (t: number) => 2 * Math.PI * GULL.frequency * t + PHASE_AT_ZERO;
/** The path's height at x. */
export const pathY = (x: number) => x * Math.tan(CLIMB);
/** The body's center at time t. */
export const bodyAt = (t: number): [number, number, number] =>
  [GULL.speed * t * Math.cos(CLIMB), GULL.speed * t * Math.sin(CLIMB) - BOB * loading(phaseAt(t)), 0];

export type Pose = { t: number; phase: number; position: [number, number, number]; pitch: number };
export const PHASE_INTERVAL = 1 / GULL.frequency / PHASES_PER_BEAT; // s between phases
export const POSES: Pose[] = Array.from({ length: PHASES }, (_, k) => {
  const t = FROZEN_AT - k * PHASE_INTERVAL;
  return { t, phase: phaseAt(t), position: bodyAt(t), pitch: CLIMB + BODY_PITCH };
});
/** The leading phase's x: the gull has passed everything behind it. */
export const LEAD = POSES[0].position[0];
