// Find each polar calotte's rotation: where, in its print, the scene's longitude 0 falls.
//
// Coarse: the calotte's rim, read as brightness around the circle, is matched against the gores'
// ends at 70°, read the same way along longitude, for every rotation and for both senses of
// longitude. Fine: the calotte's meridians are ruled every 10°, and the gores' 10° meridians fall on
// multiples of 10° of the scene's longitude (Coronelli's longitude is the scene's plus 330°), so the
// phase of the rim's 10° rhythm fixes the rotation within its 10° step.
//
// Usage: node --max-old-space-size=8192 plates/tools/lookdev/calotte-rotation.ts

import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { coons } from '../../lab/unfold-lookdev/coons.ts';
import type { Borders } from '../../lab/unfold-lookdev/coons.ts';

type Info = { width: number; height: number; levels: number[]; border?: Borders; disc?: { center: [number, number]; radius: number } };
const LEVEL = 2048;
const BIN = 0.1; // degrees
const BINS = Math.round(360 / BIN);
const toLinear = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };

async function load(name: string, level: number) {
  const { data, info } = await sharp(`public/plates/assets/unfold/${name}-${level}.webp`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}
function lumAt(img: { data: Buffer; width: number; height: number }, x: number, y: number): number | null {
  const xi = Math.round(x), yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= img.width || yi >= img.height) return null;
  const i = (yi * img.width + xi) * 4;
  if (img.data[i + 3] < 250) return null;
  return 0.2126 * toLinear(img.data[i]) + 0.7152 * toLinear(img.data[i + 1]) + 0.0722 * toLinear(img.data[i + 2]);
}
const goreWest = (piece: number) => ((((piece - 1) % 12) + 1) - 12) * 30;

/** Mean brightness per longitude bin over a band of latitude on one hemisphere's gores. */
async function goreProfile(north: boolean, lat0: number, lat1: number): Promise<Float64Array> {
  const sum = new Float64Array(BINS), count = new Float64Array(BINS);
  for (let k = 1; k <= 12; k++) {
    const piece = north ? 12 + k : k;
    const name = `gore-${String(piece).padStart(2, '0')}`;
    const info: Info = JSON.parse(readFileSync(`public/plates/assets/unfold/${name}.json`, 'utf8'));
    const img = await load(name, LEVEL);
    for (let lat = lat0; lat <= lat1; lat += 0.05) {
      const t = north ? 1 - lat / 70 : -lat / 70;
      for (let s = 0.001; s < 0.999; s += 0.001) {
        const [u, v] = coons(info.border!, s, t);
        const l = lumAt(img, u * img.width, v * img.height);
        if (l === null) continue;
        const lon = (((goreWest(piece) + s * 30) % 360) + 360) % 360;
        const b = Math.floor(lon / BIN) % BINS;
        sum[b] += l; count[b]++;
      }
    }
  }
  return sum.map((s, i) => (count[i] ? s / count[i] : NaN));
}

/** Mean brightness per print angle (counterclockwise from +x) over a band of colatitude. */
async function calotteProfile(piece: number, rho0: number, rho1: number): Promise<Float64Array> {
  const name = `calotte-${piece}`;
  const info: Info = JSON.parse(readFileSync(`public/plates/assets/unfold/${name}.json`, 'utf8'));
  const img = await load(name, LEVEL);
  const { center, radius } = info.disc!;
  const sum = new Float64Array(BINS), count = new Float64Array(BINS);
  for (let rho = rho0; rho <= rho1; rho += 0.05) {
    const r = (rho / 20) * radius;
    for (let b = 0; b < BINS; b++) {
      const a = ((b + 0.5) * BIN * Math.PI) / 180;
      const l = lumAt(img, (center[0] + r * Math.cos(a)) * img.width, (center[1] - r * Math.sin(a)) * img.height);
      if (l === null) continue;
      sum[b] += l; count[b]++;
    }
  }
  return sum.map((s, i) => (count[i] ? s / count[i] : NaN));
}

/** Normalized cross-correlation of calotte(rotation + sign·lon) with gores(lon), for every rotation. */
function correlate(gores: Float64Array, calotte: Float64Array, sign: number): Float64Array {
  const out = new Float64Array(BINS);
  for (let shift = 0; shift < BINS; shift += 5) {
    let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0, n = 0;
    for (let i = 0; i < BINS; i += 2) {
      const a = gores[i];
      const b = calotte[(((shift + sign * i) % BINS) + BINS) % BINS];
      if (Number.isNaN(a) || Number.isNaN(b)) continue;
      sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b; n++;
    }
    const cov = sab / n - (sa / n) * (sb / n);
    out[shift] = cov / Math.sqrt((saa / n - (sa / n) ** 2) * (sbb / n - (sb / n) ** 2));
  }
  return out;
}

/** The angle, within one period, where a profile's darkest periodic rules fall. */
function rulePhase(profile: Float64Array, period: number): number {
  let re = 0, im = 0;
  for (let i = 0; i < BINS; i++) {
    if (Number.isNaN(profile[i])) continue;
    const angle = ((i + 0.5) * BIN * 2 * Math.PI) / period;
    re += -profile[i] * Math.cos(angle); // rules are dark: weigh darkness
    im += -profile[i] * Math.sin(angle);
  }
  return ((((Math.atan2(im, re) * period) / (2 * Math.PI)) % period) + period) % period;
}

for (const [piece, north] of [[25, true], [26, false]] as const) {
  const gores = await goreProfile(north, north ? 66.5 : -69.7, north ? 69.7 : -66.5);
  const rim = await calotteProfile(piece, 16.5, 19.7);
  const sign = north ? 1 : -1; // longitude runs counterclockwise around the north pole, seen from outside
  const c = correlate(gores, rim, sign);
  let best = 0;
  for (let i = 0; i < BINS; i++) if (c[i] > c[best]) best = i;
  const coarse = best * BIN;
  // Meridians on the calotte, away from the rim's lettering and cartouches.
  const rules = await calotteProfile(piece, 6, 15);
  const phase = rulePhase(rules, 10);
  const fine = phase + 10 * Math.round((coarse - phase) / 10);
  console.log(`calotte ${piece}: coarse ${coarse.toFixed(1)}° (r ${c[best].toFixed(3)}), meridian phase ${phase.toFixed(2)}° → rotation ${fine.toFixed(2)}°`);
}
