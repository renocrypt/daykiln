// Measuring sound, for checking Yaobian's against recordings (tools/sound-references.ts): decoding a
// file with ffmpeg, spectra, strikes and the decay of each resonance, band levels, texture.

import { execFileSync } from 'node:child_process';

export const RATE = 48000;

/** A sound file as mono samples at RATE, by ffmpeg. */
export function decode(file: string): Float32Array {
  const raw = execFileSync('ffmpeg', ['-v', 'quiet', '-i', file, '-ac', '1', '-ar', String(RATE), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  return new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
}

function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const p = i + k, q = p + len / 2;
        const vr = re[q] * cr - im[q] * ci, vi = re[q] * ci + im[q] * cr;
        re[q] = re[p] - vr; im[q] = im[p] - vi; re[p] += vr; im[p] += vi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

/** Power in dB per bin, n (a power of two) samples from `from`, Hann-windowed. */
export function spectrum(y: Float32Array, from: number, n: number): Float64Array {
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = (y[from + i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  fft(re, im);
  const db = new Float64Array(n / 2);
  for (let k = 0; k < n / 2; k++) db[k] = 10 * Math.log10(re[k] * re[k] + im[k] * im[k] + 1e-20);
  return db;
}

/** Where strikes begin: a 5 ms frame 12 dB over the 50 ms before it, within 30 dB of the loudest. */
export function onsets(y: Float32Array): number[] {
  const frame = 240, e: number[] = [];
  for (let i = 0; i + frame < y.length; i += frame) { let s = 0; for (let j = 0; j < frame; j++) s += y[i + j] ** 2; e.push(10 * Math.log10(s / frame + 1e-12)); }
  const top = Math.max(...e), out: number[] = [];
  for (let f = 10; f < e.length; f++) {
    const before = Math.max(...e.slice(f - 10, f - 1));
    if (e[f] > top - 30 && e[f] - before > 12 && (!out.length || f * frame - out[out.length - 1] > RATE * 0.12)) out.push(f * frame);
  }
  return out;
}

export type Resonance = { f: number; level: number; t60: number; eta: number };

/**
 * A strike's resonances: the strongest spectral peaks from 4 ms after it, and each one's decay,
 * fitted from its peak down 35 dB or to the noise, as T60 and loss factor η = 2.2 / (f · T60).
 */
export function resonances(y: Float32Array, at: number, until: number, count = 10): Resonance[] {
  const n = 16384, start = at + Math.round(0.004 * RATE), low = 150;
  const db = spectrum(y, start, n);
  const lo = Math.round((low * n) / RATE);
  const top = Math.max(...db.slice(lo));
  const peaks: { f: number; level: number }[] = [];
  for (let k = lo; k < n / 2 - 1; k++) {
    if (db[k] > top - 35 && db[k] > db[k - 1] && db[k] >= db[k + 1] && db[k] === Math.max(...db.slice(Math.max(0, k - 6), k + 7))) {
      const a = db[k - 1], b = db[k], c = db[k + 1];
      peaks.push({ f: ((k + (0.5 * (a - c)) / (a - 2 * b + c)) * RATE) / n, level: b - top });
    }
  }
  const chosen = peaks.sort((a, b) => b.level - a.level).slice(0, count).sort((a, b) => a.f - b.f);
  const w = 2048, hop = 256, frames: Float64Array[] = [];
  for (let s = start; s + w < Math.min(until, y.length); s += hop) frames.push(spectrum(y, s, w));
  return chosen.map((p) => {
    const k = Math.round((p.f * w) / RATE);
    const track = frames.map((fr) => Math.max(fr[k - 1], fr[k], fr[k + 1]));
    const peak = Math.max(...track.slice(0, 6)), i0 = track.indexOf(peak), noise = Math.min(...track.slice(-6));
    let i1 = i0;
    while (i1 + 1 < track.length && track[i1 + 1] > Math.max(peak - 35, noise + 6)) i1++;
    if (i1 - i0 < 3) return { ...p, t60: NaN, eta: NaN };
    let sx = 0, sy = 0, sxx = 0, sxy = 0, m = 0;
    for (let i = i0; i <= i1; i++) { const x = (i * hop) / RATE; sx += x; sy += track[i]; sxx += x * x; sxy += x * track[i]; m++; }
    const slope = (m * sxy - sx * sy) / (m * sxx - sx * sx);
    const t60 = slope < 0 ? -60 / slope : NaN;
    return { ...p, t60, eta: 2.2 / (p.f * t60) };
  });
}

/** Band levels in dB relative to their mean, averaged over the file from `skip` samples in. */
export function bands(y: Float32Array, centers: number[], width = Math.pow(2, 1 / 6), skip = RATE / 2): number[] {
  const n = 4096, acc = new Float64Array(centers.length);
  let frames = 0;
  for (let s = skip; s + n < y.length; s += n) {
    const db = spectrum(y, s, n);
    centers.forEach((c, i) => { let e = 0; for (let k = Math.round(((c / width) * n) / RATE); k <= Math.round(((c * width) * n) / RATE); k++) e += 10 ** (db[k] / 10); acc[i] += e; });
    frames++;
  }
  const lv = [...acc].map((e) => 10 * Math.log10(e / frames));
  const mean = lv.reduce((a, b) => a + b, 0) / lv.length;
  return lv.map((l) => l - mean);
}

/** Texture: how the level wanders from 10 ms to 10 ms (the spread of short-frame dB), and peak over RMS, dB. */
export function texture(y: Float32Array, skip = RATE / 2): { wander: number; crest: number } {
  const f = 480, e: number[] = [];
  for (let s = skip; s + f < y.length; s += f) { let q = 0; for (let i = 0; i < f; i++) q += y[s + i] ** 2; e.push(10 * Math.log10(q / f + 1e-20)); }
  const mean = e.reduce((a, b) => a + b, 0) / e.length;
  const wander = Math.sqrt(e.reduce((a, b) => a + (b - mean) ** 2, 0) / e.length);
  let peak = 0, sq = 0;
  for (let i = skip; i < y.length; i++) { peak = Math.max(peak, Math.abs(y[i])); sq += y[i] ** 2; }
  return { wander, crest: 20 * Math.log10(peak / Math.sqrt(sq / (y.length - skip))) };
}

/** Transients above 2 kHz a second: 2 ms frames 12 dB over the median of the 100 ms around them. */
export function crackles(y: Float32Array): number {
  const k = Math.exp((-2 * Math.PI * 2000) / RATE);
  let hp = 0, last = 0;
  const h = new Float32Array(y.length);
  for (let i = 0; i < y.length; i++) { hp = k * (hp + y[i] - last); last = y[i]; h[i] = hp; }
  const f = 96, e: number[] = [];
  for (let s = 0; s + f < h.length; s += f) { let q = 0; for (let i = 0; i < f; i++) q += h[s + i] ** 2; e.push(10 * Math.log10(q / f + 1e-20)); }
  let count = 0;
  for (let i = 25; i < e.length - 25; i++) {
    const around = e.slice(i - 25, i + 25).sort((a, b) => a - b)[25];
    if (e[i] > around + 12 && e[i] >= e[i - 1] && e[i] > e[i + 1]) count++;
  }
  return count / (y.length / RATE);
}
