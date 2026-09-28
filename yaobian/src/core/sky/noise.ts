// Tileable noise for the sky's cloud (sky.ts), generated once at load in a worker: cellular noise
// for the cloudlets' billows, gradient noise for the patches they gather in and for the warp that
// breaks the cells' regularity, and a small volume of cellular noise that frays their edges.
// From Plates (SAME SKY).
//
// Pure arithmetic, no three.js: the images are made into textures where they are used.

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const wrap = (i: number, n: number) => ((i % n) + n) % n;

/**
 * Cellular noise over a tile with period `cells`: F1 and F2, the distances in cell units to the
 * nearest and second-nearest feature points, and a random tag carried by the nearest.
 */
function cellular(size: number, cells: number, seed: number, dims: 2 | 3): { f1: Float32Array; f2: Float32Array; tag: Float32Array } {
  const rand = mulberry32(seed);
  const points = Float32Array.from({ length: cells ** dims * dims }, rand);
  const tags = Float32Array.from({ length: cells ** dims }, rand);
  const f1 = new Float32Array(size ** dims), f2 = new Float32Array(size ** dims), tag = new Float32Array(size ** dims);
  const scale = cells / size;
  const depth = dims === 3 ? size : 1, reach = dims === 3 ? 1 : 0;
  for (let z = 0; z < depth; z++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const fx = (x + 0.5) * scale, fy = (y + 0.5) * scale, fz = (z + 0.5) * scale;
        const cx = Math.floor(fx), cy = Math.floor(fy), cz = Math.floor(fz);
        let best = Infinity, second = Infinity, nearest = 0;
        for (let dz = -reach; dz <= reach; dz++) {
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const gx = cx + dx, gy = cy + dy, gz = cz + dz;
              const cell = dims === 3 ? (wrap(gz, cells) * cells + wrap(gy, cells)) * cells + wrap(gx, cells) : wrap(gy, cells) * cells + wrap(gx, cells);
              const px = gx + points[cell * dims] - fx, py = gy + points[cell * dims + 1] - fy;
              const pz = dims === 3 ? gz + points[cell * dims + 2] - fz : 0;
              const d = px * px + py * py + pz * pz;
              if (d < best) { second = best; best = d; nearest = cell; } else if (d < second) second = d;
            }
          }
        }
        const i = (z * size + y) * size + x;
        f1[i] = Math.sqrt(best);
        f2[i] = Math.sqrt(second);
        tag[i] = tags[nearest];
      }
    }
  }
  return { f1, f2, tag };
}

/** Round billows, 1 − F1: 1 at each feature point. */
const billows = (size: number, cells: number, seed: number, dims: 2 | 3) => cellular(size, cells, seed, dims).f1.map((d) => 1 - Math.min(d, 1));
/** Gradient noise with a quintic fade, about ±0.7. Tiles with period `period`. */
function gradient(size: number, period: number, seed: number): Float32Array {
  const rand = mulberry32(seed);
  const angles = Float32Array.from({ length: period * period }, () => rand() * 2 * Math.PI);
  const out = new Float32Array(size * size);
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = ((x + 0.5) / size) * period, fy = ((y + 0.5) / size) * period;
      const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      const dot = (ix: number, iy: number) => {
        const a = angles[wrap(iy, period) * period + wrap(ix, period)];
        return Math.cos(a) * (fx - ix) + Math.sin(a) * (fy - iy);
      };
      const u = fade(tx), v = fade(ty);
      const top = dot(x0, y0) + (dot(x0 + 1, y0) - dot(x0, y0)) * u;
      const bottom = dot(x0, y0 + 1) + (dot(x0 + 1, y0 + 1) - dot(x0, y0 + 1)) * u;
      out[y * size + x] = top + (bottom - top) * v;
    }
  }
  return out;
}

/** Octaves summed with halving weights and normalized to [0, 1]. */
function octaves(layers: Float32Array[]): Float32Array {
  const out = new Float32Array(layers[0].length);
  let weight = 1, total = 0;
  for (const layer of layers) {
    for (let i = 0; i < out.length; i++) out[i] += layer[i] * weight;
    total += weight;
    weight /= 2;
  }
  let lo = Infinity, hi = -Infinity;
  for (const v of out) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  for (let i = 0; i < out.length; i++) out[i] = (out[i] - lo) / (hi - lo);
  return out;
}

/** A tileable image: 8 bits a channel, square or cubic. */
export type Image = { size: number; channels: number; data: Uint8Array };
function image(channels: Float32Array[], size: number): Image {
  const n = channels[0].length, c = channels.length;
  const data = new Uint8Array(n * c);
  for (let i = 0; i < n; i++) for (let k = 0; k < c; k++) data[i * c + k] = Math.round(channels[k][i] * 255);
  return { size, channels: c, data };
}

/** A cloud field: gradient octaves for irregular masses, blended with round billows for their rounded edges. */
function field(size: number, seed: number): Float32Array {
  const smooth = octaves([gradient(size, 4, seed), gradient(size, 8, seed + 1), gradient(size, 16, seed + 2), gradient(size, 32, seed + 3)]);
  const round = octaves([billows(size, 8, seed + 4, 2), billows(size, 16, seed + 5, 2), billows(size, 32, seed + 6, 2)]);
  return octaves([smooth.map((v, i) => 0.55 * v + 0.45 * round[i])]);
}


export type NoiseData = { billows: Image; patches: Image; detail: Image };

/**
 * - billows (512², RGBA): r, a cloud field of gradient octaves from period 4 blended with round
 *   billows from 8 cells per tile, rounded masses of every size that merge and part; g, round
 *   billows at 24, 48, 96 cells, the small cells a mass breaks into where it thins; b and a,
 *   gradient octaves from period 6, the warp.
 * - patches (256², RG): r, gradient octaves from period 3, where cloud gathers; g, from period 2.
 * - detail (48³, R): round billows at 4, 8, 16 cells per tile, the fraying.
 */
export function noiseData(): NoiseData {
  const B = 512, P = 256, D = 48;
  return {
    billows: image([
      field(B, 11),
      octaves([billows(B, 24, 21, 2), billows(B, 48, 22, 2), billows(B, 96, 23, 2)]),
      octaves([gradient(B, 6, 31), gradient(B, 12, 32), gradient(B, 24, 33), gradient(B, 48, 34)]),
      octaves([gradient(B, 6, 41), gradient(B, 12, 42), gradient(B, 24, 43), gradient(B, 48, 44)]),
    ], B),
    patches: image([
      octaves([gradient(P, 3, 51), gradient(P, 6, 52), gradient(P, 12, 53), gradient(P, 24, 54)]),
      octaves([gradient(P, 2, 61), gradient(P, 4, 62), gradient(P, 8, 63)]),
    ], P),
    detail: image([octaves([billows(D, 4, 71, 3), billows(D, 8, 72, 3), billows(D, 16, 73, 3)])], D),
  };
}
