// Tone-mapping helpers.

import * as THREE from 'three/webgpu';

/** Khronos PBR Neutral, as three's NeutralToneMapping applies it, on linear RGB. */
export function neutral(c: number[]): number[] {
  const x = Math.min(...c);
  const offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  let out = c.map((v) => v - offset);
  const peak = Math.max(...out);
  const start = 0.8 - 0.04, d = 1 - start;
  if (peak < start) return out;
  const newPeak = 1 - (d * d) / (peak + d - start);
  out = out.map((v) => (v * newPeak) / peak);
  const g = 1 - 1 / (0.15 * (peak - newPeak) + 1);
  return out.map((v) => v + (newPeak - v) * g);
}

/**
 * The linear color that Neutral tone mapping turns into `target`, so a flat field reaches the
 * screen as the value a document names, not a compressed one. Solved by fixed-point iteration.
 */
export function beforeNeutral(target: THREE.Color): THREE.Color {
  const goal = [target.r, target.g, target.b];
  let c = [...goal];
  for (let i = 0; i < 40; i++) {
    const out = neutral(c);
    c = c.map((v, k) => v + (goal[k] - out[k]));
  }
  return new THREE.Color().setRGB(c[0], c[1], c[2]);
}
