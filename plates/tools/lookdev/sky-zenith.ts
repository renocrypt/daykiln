// A measured sky seen as SAME SKY's aperture sees it: an equirectangular HDR panorama reprojected
// to a pinhole view straight up, exposed so the zenith lands at a chosen display value, and read out:
// the zenith's color, and the sky's luminance at zenith angles toward and away from the sun.
//
// Usage: node plates/tools/lookdev/sky-zenith.ts <panorama.hdr> <out.png> [fov=90] [zenithValue=0.19]
// The image's top points toward the sun's azimuth, found as the brightest column near the horizon.

import * as THREE from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { neutral } from '../../src/core/tone.ts';

const [file, out, fovArg, targetArg] = process.argv.slice(2);
const FOV = THREE.MathUtils.degToRad(Number(fovArg ?? 90));
const TARGET = Number(targetArg ?? 0.19);
const SIZE = 900;

const loader = new HDRLoader().setDataType(THREE.FloatType);
const buffer = readFileSync(file);
const hdr = loader.parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)) as { width: number; height: number; data: Float32Array };
const { width, height, data } = hdr;
const luminance = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** Bilinear radiance in a direction; y is up, azimuth is measured from +x toward +z. */
function sample(d: THREE.Vector3): number[] {
  const azimuth = Math.atan2(d.z, d.x), elevation = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1));
  const u = ((azimuth / (2 * Math.PI) + 1) % 1) * width - 0.5, v = (0.5 - elevation / Math.PI) * height - 0.5;
  const x0 = Math.floor(u), y0 = THREE.MathUtils.clamp(Math.floor(v), 0, height - 2), tx = u - x0, ty = THREE.MathUtils.clamp(v - y0, 0, 1);
  const c = [0, 0, 0];
  for (const [dx, dy, w] of [[0, 0, (1 - tx) * (1 - ty)], [1, 0, tx * (1 - ty)], [0, 1, (1 - tx) * ty], [1, 1, tx * ty]] as const) {
    const i = (((x0 + dx) % width + width) % width + (y0 + dy) * width) * 4;
    for (let k = 0; k < 3; k++) c[k] += data[i + k] * w;
  }
  return c;
}
const direction = (zenith: number, azimuth: number) =>
  new THREE.Vector3(Math.sin(zenith) * Math.cos(azimuth), Math.cos(zenith), Math.sin(zenith) * Math.sin(azimuth));

// The sun's azimuth: the brightest column in the band from the horizon to 10 degrees up.
let sunAzimuth = 0, brightest = -1;
for (let x = 0; x < width; x++) {
  let sum = 0;
  for (let y = Math.floor(height * 0.5 - height / 18); y < height * 0.5; y++) {
    const i = (y * width + x) * 4;
    sum += luminance(data[i], data[i + 1], data[i + 2]);
  }
  if (sum > brightest) { brightest = sum; sunAzimuth = ((x + 0.5) / width) * 2 * Math.PI; }
}

const mean = (zenith: number, azimuth: number, radius = THREE.MathUtils.degToRad(2)) => {
  const c = [0, 0, 0];
  let n = 0;
  for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
    const s = sample(direction(Math.abs(zenith + (a / 2) * radius), azimuth + (b / 2) * radius / Math.max(Math.sin(zenith), 0.05)));
    c[0] += s[0]; c[1] += s[1]; c[2] += s[2]; n++;
  }
  return c.map((v) => v / n);
};
const zenith = mean(0, 0);
const scale = TARGET / luminance(zenith[0], zenith[1], zenith[2]);

// Report: the zenith's color, and luminance relative to the zenith toward and away from the sun.
const xyz = (c: number[]) => {
  const X = 0.4124 * c[0] + 0.3576 * c[1] + 0.1805 * c[2], Y = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2], Z = 0.0193 * c[0] + 0.1192 * c[1] + 0.9505 * c[2];
  return [X / (X + Y + Z), Y / (X + Y + Z)];
};
const fixed = (c: number[]) => c.map((v) => (v * scale).toFixed(4)).join(' ');
console.log(`${file}\n  sun azimuth ${THREE.MathUtils.radToDeg(sunAzimuth).toFixed(1)}° · exposure ${scale.toExponential(3)}`);
console.log(`  zenith ${fixed(zenith)} linear · xy ${xyz(zenith).map((v) => v.toFixed(4)).join(' ')}`);
for (const z of [15, 30, 45, 60, 75]) {
  const toward = mean(THREE.MathUtils.degToRad(z), sunAzimuth), away = mean(THREE.MathUtils.degToRad(z), sunAzimuth + Math.PI);
  const side = mean(THREE.MathUtils.degToRad(z), sunAzimuth + Math.PI / 2);
  const y = (c: number[]) => (luminance(c[0], c[1], c[2]) / luminance(zenith[0], zenith[1], zenith[2])).toFixed(2);
  console.log(`  ${String(z).padStart(2)}° toward ${y(toward)} (${xyz(toward).map((v) => v.toFixed(3)).join(' ')}) · side ${y(side)} · away ${y(away)} (${xyz(away).map((v) => v.toFixed(3)).join(' ')})`);
}

// The view straight up; the image's top points toward the sun.
const pixels = Buffer.alloc(SIZE * SIZE * 3);
const toward = direction(Math.PI / 2, sunAzimuth), right = new THREE.Vector3().crossVectors(toward, new THREE.Vector3(0, 1, 0)).normalize();
const t = Math.tan(FOV / 2);
const encode = (v: number) => Math.round(255 * THREE.MathUtils.clamp(v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055, 0, 1));
for (let j = 0; j < SIZE; j++) {
  for (let i = 0; i < SIZE; i++) {
    const x = ((i + 0.5) / SIZE * 2 - 1) * t, y = (1 - (j + 0.5) / SIZE * 2) * t;
    const d = new THREE.Vector3(0, 1, 0).addScaledVector(right, x).addScaledVector(toward, y).normalize();
    const c = neutral(sample(d).map((v) => v * scale));
    const o = (j * SIZE + i) * 3;
    pixels[o] = encode(c[0]); pixels[o + 1] = encode(c[1]); pixels[o + 2] = encode(c[2]);
  }
}
await sharp(pixels, { raw: { width: SIZE, height: SIZE, channels: 3 } }).png().toFile(out);
console.log(`  wrote ${out}`);
