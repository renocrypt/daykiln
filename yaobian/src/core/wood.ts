// Unfinished wood as a procedural surface: flat-sawn figure, growth rings, fiber, and open pores,
// kept low in relief: at a table's distance wood reads by color more than by texture. KILN's table,
// PLUMB's workbench and posts.

import type { Node } from 'three/webgpu';
import { float, fract, mix, smoothstep, vec2 } from 'three/tsl';
import { fractal2, noise2 } from './noise.ts';

/** Wood of a base color at a point on the board, mm, the grain along x: its color, and its relief in meters. */
export function wood(base: Node<'vec3'>, p: Node<'vec2'>): { color: Node<'vec3'>; height: Node<'float'> } {
  // Flat-sawn figure: growth rings cut at a slant, so their spacing and path wander along the board.
  const figure = fractal2(vec2(p.x.mul(0.0012), p.y.mul(0.006)), 3, 0);
  const drift = fractal2(vec2(p.x.mul(0.0025), p.y.mul(0.012)), 3, 1).mul(22)
    .add(fractal2(vec2(p.x.mul(0.012), p.y.mul(0.04)), 2, 2).mul(3));
  const spacing = noise2(vec2(p.x.mul(0.001), p.y.mul(0.004)), 3).mul(2.2).add(6);
  const ring = fract(p.y.add(drift).div(spacing));
  const late = smoothstep(0.62, 0.86, ring).mul(smoothstep(1, 0.9, ring));
  const fiber = noise2(vec2(p.x.mul(0.02), p.y.mul(1.6)).add(11.3), 0);
  const pore = smoothstep(0.62, 0.9, noise2(vec2(p.x.mul(0.12), p.y.mul(3)).add(5.9), 1));
  const color = base
    .mul(figure.mul(0.12).add(1))
    .mul(mix(float(1.03), float(0.9), late))
    .mul(fiber.mul(0.025).add(1))
    .mul(float(1).sub(pore.mul(0.08)));
  return { color, height: fiber.mul(0.0006).sub(pore.mul(0.0015)).div(1000) };
}
