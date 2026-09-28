// The score's runtime (SCORE.md): one clock, targets and currents.
//
// Anime.js writes targets; damping writes currents; the renderer reads currents. Anime.js does not
// run its own loop: the page's one animation loop calls `tick`, which advances the timelines and
// then lets every current approach its target.

import { engine } from 'animejs';
import { damp } from './damp.ts';

engine.useDefaultMainLoop = false;

/** A presented value: a target the score or a gesture writes, and a current that follows it. */
export type Damped<T extends Record<string, number>> = { target: T; current: T; half: number; moving(): boolean };

export function damped<T extends Record<string, number>>(initial: T, half: number): Damped<T> {
  const target = { ...initial }, current = { ...initial };
  return {
    target, current, half,
    moving() {
      for (const key in target) if (Math.abs(target[key] - current[key]) > 1e-4) return true;
      return false;
    },
  };
}

const values = new Set<Damped<Record<string, number>>>();

/** Register a damped value with the clock; returns it. */
export function follow<T extends Record<string, number>>(value: Damped<T>): Damped<T> {
  values.add(value as unknown as Damped<Record<string, number>>);
  return value;
}

export function unfollow(value: Damped<Record<string, number>>): void {
  values.delete(value);
}

let last = 0;
/**
 * Advance the score by one frame: timelines write targets, then currents approach them. Returns
 * whether anything is still moving, so a frame drawn only on change knows to draw again.
 */
export function tick(now: number): boolean {
  const dt = Math.min(0.05, last ? (now - last) / 1000 : 0); // clamped, SCORE.md rule 6
  last = now;
  engine.update();
  let moving = false;
  for (const v of values) {
    for (const key in v.target) v.current[key] = damp(v.current[key], v.target[key], v.half, dt);
    if (v.moving()) moving = true;
  }
  return moving;
}

/** Reduced motion: timelines collapse to cuts and damping stiffens (SCORE.md). */
export const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
