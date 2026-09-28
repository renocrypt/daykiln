// Make the album's icons: the kiln's eye, the spy-hole in a kiln's wall with the fire seen through
// it, the tube's hot wall, and soot where the flame licks out above. It is rendered, not drawn:
// every size at its own pixels, supersampled, so the small ones are made for their grid rather
// than shrunk, and the smallest see the eye a little closer. Proofs of the tab sizes, enlarged
// without smoothing, are written to $TMPDIR/daykiln/renders/.
//
// Usage, from the project's root: node door/tools/icon.ts

import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

type RGB = [number, number, number];

const OUT = 'public/door';
const RENDERS = resolve(process.env.TMPDIR ?? tmpdir(), 'daykiln', 'renders');
/** Tabs at 1× and 2×, search results, home screens. */
const SIZES = [16, 32, 48, 96, 180];
/** The sizes in /favicon.ico, for what asks for it there. */
const ICO = [16, 32, 48];

// ---- noise --------------------------------------------------------------------------------------

function hash(x: number, y: number, s: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function noise(x: number, y: number, s: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x: number, y: number, s: number, octaves: number): number {
  let t = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < octaves; i++) { t += a * noise(x * f, y * f, s + i * 17); n += a; f *= 2.03; a *= 0.5; }
  return t / n;
}

const smooth = (a: number, b: number, x: number) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const scale = (a: RGB, k: number | RGB): RGB => a.map((v, i) => v * (typeof k === 'number' ? k : k[i])) as RGB;
const add = (a: RGB, b: RGB): RGB => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/** The glow of a body at T kelvin, in linear RGB, against a body at 1300 K. */
function blackbody(T: number): RGB {
  // Planck's law at the sRGB primaries' rough wavelengths, in nm.
  const c2 = 14388e3; // nm·K
  const B = (l: number, t: number) => 1 / (l ** 5 * (Math.exp(c2 / (l * t)) - 1));
  const ref = B(550, 1300);
  return [B(610, T) / ref, B(550, T) / ref, B(465, T) / ref];
}

// ---- the eye ------------------------------------------------------------------------------------

/** The icon at (x, y) in −1…1, y down, where a pixel is `px` across: linear RGB. */
function eye(x: number, y: number, px: number): RGB {
  const cx = 0.02, cy = 0.14, R = 0.33;
  const r = Math.hypot(x - cx, y - cy);
  const rim = R * (1 + 0.06 * (fbm(Math.atan2(y - cy, x - cx) * 1.6 + 3, 1, 2, 3) - 0.5));
  // The wall: fired clay, mottled and pitted; soot blown up from the hole.
  const m = fbm(x * 2.6 + 2, y * 2.6 + 7, 4, 5), pit = fbm(x * 16, y * 16, 9, 3);
  let albedo = scale(mix([0.19, 0.1, 0.06], [0.33, 0.19, 0.11], m), 0.72 + 0.56 * pit);
  const up = cy - y;
  const spread = 0.22 + 0.38 * Math.max(up, 0);
  const soot = Math.exp(-(((x - cx) / spread) ** 2)) * smooth(-0.1, 0.25, up) * (0.55 + 0.6 * fbm(x * 3.5, y * 2, 12, 4));
  albedo = scale(albedo, 1 - 0.8 * Math.min(soot, 1));
  let c = scale(albedo, [0.3, 0.28, 0.26]);
  // The chamfer round the hole, lit by the fire.
  c = add(c, scale(blackbody(1150), 0.35 * smooth(rim + 0.07, rim, r) ** 2));
  // In the hole: the tube's inner wall to the lower right, cooler toward us; beyond it, the chamber.
  const inHole = 1 - smooth(rim - 0.6 * px, rim + 0.6 * px, r);
  const deep = Math.hypot(x - (cx - 0.07), y - (cy - 0.08)) / (rim * 0.86); // past 1: the tube's wall
  const wall = smooth(0.97, 1.03, deep);
  const Tw = 1420 - 380 * smooth(1.0, 1.35, deep);
  const Tc = 1500 + 300 * (fbm(x * 2.6 + 0.4 * y, y * 1.6, 31, 5) - 0.5);
  return mix(c, mix(scale(blackbody(Tc), 0.3), scale(blackbody(Tw), 1.2), wall), inHole);
}

// ---- rendering ----------------------------------------------------------------------------------

// As the door's shaders: a shoulder above 0.85, and very bright light going to white.
const shoulder = (v: number) => (v <= 0.85 ? v : 0.85 + 0.15 * (1 - Math.exp(-(v - 0.85) / 0.15)));
function tone(c: RGB): RGB {
  const m = Math.max(...c);
  if (m <= 0.85) return c;
  const t = smooth(1, 3, m);
  return c.map((v) => ((v * shoulder(m)) / m) * (1 - t) + shoulder(v) * t) as RGB;
}
const encode = (v: number) => { v = Math.min(Math.max(v, 0), 1); return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055; };

/** The icon at `size` px, as PNG. */
async function render(size: number): Promise<Buffer> {
  const n = size <= 48 ? 8 : 4;                           // samples per pixel, each way
  const zoom = size <= 32 ? 1.15 : size <= 48 ? 1.08 : 1;  // the smallest see the eye closer
  const px = 2 / size / zoom;
  const buf = Buffer.alloc(size * size * 3);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const acc: RGB = [0, 0, 0];
    for (let b = 0; b < n; b++) for (let a = 0; a < n; a++) {
      const x = (((i + (a + 0.5) / n) / size) * 2 - 1) / zoom, y = (((j + (b + 0.5) / n) / size) * 2 - 1) / zoom;
      const t = tone(eye(x, y, px));
      for (let k = 0; k < 3; k++) acc[k] += t[k];
    }
    for (let k = 0; k < 3; k++) buf[(j * size + i) * 3 + k] = Math.round(255 * encode(acc[k] / (n * n)));
  }
  return sharp(buf, { raw: { width: size, height: size, channels: 3 } }).png({ compressionLevel: 9 }).toBuffer();
}

/** An ICO holding PNGs, as every browser since 2007 reads them. */
function ico(images: { size: number; png: Buffer }[]): Buffer {
  const head = Buffer.alloc(6 + 16 * images.length);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(images.length, 4);
  let offset = head.length;
  images.forEach(({ size, png }, i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(size % 256, e);
    head.writeUInt8(size % 256, e + 1);
    head.writeUInt16LE(1, e + 4);
    head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(png.length, e + 8);
    head.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });
  return Buffer.concat([head, ...images.map((m) => m.png)]);
}

await mkdir(OUT, { recursive: true });
await mkdir(RENDERS, { recursive: true });
const made = new Map<number, Buffer>();
for (const size of SIZES) {
  const png = await render(size);
  made.set(size, png);
  await writeFile(`${OUT}/icon-${size}.png`, png);
  console.log(`${OUT}/icon-${size}.png  ${(png.length / 1024).toFixed(1)} kB`);
}
const favicon = ico(ICO.map((size) => ({ size, png: made.get(size)! })));
await writeFile('public/favicon.ico', favicon);
console.log(`public/favicon.ico  ${ICO.join(', ')}  ${(favicon.length / 1024).toFixed(1)} kB`);

// Proofs of the tab sizes, each pixel enlarged eight times.
for (const size of [16, 32]) {
  const out = resolve(RENDERS, `icon-${size}.png`);
  await sharp(made.get(size)!).resize(size * 8, size * 8, { kernel: 'nearest' }).toFile(out);
  console.log(out);
}
