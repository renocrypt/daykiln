// Noise from a table, for surfaces whose noise is two-dimensional: a board's grain, a wall's grain
// in its own plane. Evaluating MaterialX's Perlin noise costs a hundred instructions a call, and a
// board of wood calls it eleven times a pixel; looking it up costs one filtered read. The table is
// the same noise, Ken Perlin's improved gradient noise, on a lattice that wraps every 32 cells so it
// tiles, sampled 32 texels a cell, four independent fields in four channels. Mipmapped, so noise
// finer than a pixel averages away instead of aliasing.
//
// `noise2(p, field)` stands in for `mx_noise_float(vec3(p, z))`: the same range and statistics, a
// different realization.

import * as THREE from 'three/webgpu';
import type { Node } from 'three/webgpu';
import { float, texture, vec2 } from 'three/tsl';

const CELLS = 32; // lattice period
const SIZE = 1024; // texels across: 32 a cell
const MATERIALX = 0.982; // mx_noise_float's scale of the raw improved noise

let table: THREE.DataTexture | null = null;

function build(): THREE.DataTexture {
  // A permutation for the lattice, from a fixed seed.
  let s = 0x9e3779b9;
  const rand = () => { s = (s ^ (s << 13)) >>> 0; s = (s ^ (s >>> 17)) >>> 0; s = (s ^ (s << 5)) >>> 0; return s / 4294967296; };
  const perm = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  const hash = (x: number, y: number, z: number) => perm[(perm[(perm[x & 255] + y) & 255] + z) & 255];
  const grad = (h: number, x: number, y: number, z: number) => {
    const u = (h & 15) < 8 ? x : y;
    const v = (h & 15) < 4 ? y : (h & 15) === 12 || (h & 15) === 14 ? x : z;
    return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
  };
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  // Improved noise at (x, y, z), its lattice wrapped in x and y.
  const noise = (x: number, y: number, z: number) => {
    const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
    const fx = x - X, fy = y - Y, fz = z - Z;
    const x0 = ((X % CELLS) + CELLS) % CELLS, y0 = ((Y % CELLS) + CELLS) % CELLS;
    const x1 = (x0 + 1) % CELLS, y1 = (y0 + 1) % CELLS;
    const u = fade(fx), v = fade(fy), w = fade(fz);
    const g = (xi: number, yi: number, zi: number, dx: number, dy: number, dz: number) => grad(hash(xi, yi, Z + zi), dx, dy, dz);
    return lerp(
      lerp(lerp(g(x0, y0, 0, fx, fy, fz), g(x1, y0, 0, fx - 1, fy, fz), u), lerp(g(x0, y1, 0, fx, fy - 1, fz), g(x1, y1, 0, fx - 1, fy - 1, fz), u), v),
      lerp(lerp(g(x0, y0, 1, fx, fy, fz - 1), g(x1, y0, 1, fx - 1, fy, fz - 1), u), lerp(g(x0, y1, 1, fx, fy - 1, fz - 1), g(x1, y1, 1, fx - 1, fy - 1, fz - 1), u), v),
      w,
    );
  };
  // Four fields: slices of the noise at four depths, between lattice planes.
  const depths = [0.31, 3.57, 7.13, 11.79];
  const data = new Uint16Array(SIZE * SIZE * 4);
  const step = CELLS / SIZE;
  for (let j = 0; j < SIZE; j++) for (let i = 0; i < SIZE; i++) {
    const x = (i + 0.5) * step, y = (j + 0.5) * step, at = (j * SIZE + i) * 4;
    for (let c = 0; c < 4; c++) data[at + c] = THREE.DataUtils.toHalfFloat(noise(x, y, depths[c]) * MATERIALX);
  }
  const t = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat, THREE.HalfFloatType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8; // grain is sampled stretched, eighty times longer than wide
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Gradient noise at a point in noise cells, one of four independent fields: about −1 … 1. */
export function noise2(p: Node<'vec2'>, field = 0): Node<'float'> {
  table ??= build();
  const sample = texture(table, p.div(CELLS));
  return [sample.x, sample.y, sample.z, sample.w][field % 4] as unknown as Node<'float'>;
}

/** Fractal gradient noise, as `mx_fractal_noise_float`: octaves at a lacunarity of 2, each half as strong. */
export function fractal2(p: Node<'vec2'>, octaves: number, field = 0): Node<'float'> {
  let sum: Node<'float'> = float(0), amplitude = 1, q = p;
  for (let i = 0; i < octaves; i++) {
    // Each octave from its own offset, so octaves do not share lattice lines.
    sum = sum.add(noise2(q.add(vec2(i * 7.31, i * 3.17)), field).mul(amplitude));
    q = q.mul(2);
    amplitude *= 0.5;
  }
  return sum;
}
