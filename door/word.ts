/**
 * The last word: 照, made ready for the mount to write it into the foot of the album as a brush
 * writes it, stroke by stroke (mount.frag).
 *
 * 照 is 日 over 召 over 灬: the sun, and fire. Its strokes are Make Me a Hanzi's, from Arphic's
 * regular script, as hanzi-writer-data publishes them (public/door/zhao/, kept as published, with
 * their licence, ARPHICPL.TXT): each stroke's outline, and its median, the line the brush runs along.
 * They are drawn here into a texture:
 *
 *   R  where the character is, blurred as a plate's shoulder is when it is pressed into a sheet;
 *   G  when the brush comes to each point, 0 to 1 through the whole character: the strokes in their
 *      order, each from where the brush comes down, the brush lifted a moment between them; the
 *      shoulder takes its time from the nearest stroke;
 *   B  how much of what lies there is fire, the four dots of 灬, which are burnt in, not pressed.
 */

type Strokes = { strokes: string[]; medians: [number, number][][] };

const FIRE = 9; // the strokes from here on are 灬
const PAUSE = 60; // the brush lifted between strokes, in the character's units of length
const BURN = 1.8; // a dot takes this much longer to burn in than a stroke of its length to press
const SHOULDER = 7; // texels: how far a stroke's time is carried out over its shoulder

export async function word(size: number): Promise<Float32Array | null> {
  let data: Strokes;
  try {
    const r = await fetch('/door/zhao/zhao.json');
    if (!r.ok) return null;
    data = await r.json();
  } catch {
    return null;
  }

  // The character's 1024-unit box, y up, into the texture, with a margin for the shoulder.
  const s = (size * 0.84) / 1024, o = size * 0.08;
  const lengths = data.medians.map((m) => m.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - m[i][0], p[1] - m[i][1]), 0));
  const takes = lengths.map((l, k) => (k >= FIRE ? l * BURN : l));
  const starts: number[] = [];
  let clock = 0;
  for (const t of takes) { starts.push(clock); clock += t + PAUSE; }
  const total = clock - PAUSE;

  const n = size * size;
  const cover = new Float32Array(n), fire = new Float32Array(n), when = new Float32Array(n).fill(1);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
  data.strokes.forEach((path, k) => {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, size, size);
    g.setTransform(s, 0, 0, -s, o, o + 900 * s);
    g.fillStyle = '#fff';
    g.fill(new Path2D(path));
    const px = g.getImageData(0, 0, size, size).data;
    const median = data.medians[k].map(([x, y]) => [o + x * s, o + (900 - y) * s] as [number, number]);
    for (let i = 0; i < n; i++) {
      const a = px[i * 4 + 3] / 255;
      if (a <= 0) continue;
      cover[i] = Math.max(cover[i], a);
      if (k >= FIRE) fire[i] = Math.max(fire[i], a);
      if (when[i] < 1) continue; // an earlier stroke has been here
      when[i] = (starts[k] + along(median, (i % size) + 0.5, Math.floor(i / size) + 0.5) * takes[k]) / total;
    }
  });

  // Three box blurs, a near-Gaussian: the shoulder a plate leaves when it is pressed into a sheet.
  let r: Float32Array = cover, b: Float32Array = fire;
  for (let pass = 0; pass < 3; pass++) {
    r = blur(blur(r, size, 2, 1), size, 2, size);
    b = blur(blur(b, size, 2, 1), size, 2, size);
  }
  const t = least(least(when, size, SHOULDER, 1), size, SHOULDER, size);

  // In half floats: the brush's time wants finer steps than a byte has, or its front bands.
  const out = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    out[i * 4] = r[i];
    out[i * 4 + 1] = t[i];
    out[i * 4 + 2] = Math.min(b[i] / Math.max(r[i], 1e-3), 1);
    out[i * 4 + 3] = 1;
  }
  return out;
}

/** How far along its median the brush is at (x, y), 0 where it comes down and 1 where it lifts. */
function along(m: [number, number][], x: number, y: number): number {
  let best = Infinity, at = 0, run = 0;
  const segments: number[] = [];
  for (let i = 1; i < m.length; i++) segments.push(Math.hypot(m[i][0] - m[i - 1][0], m[i][1] - m[i - 1][1]));
  const length = segments.reduce((a, b) => a + b, 0) || 1;
  for (let i = 1; i < m.length; i++) {
    const [ax, ay] = m[i - 1], [bx, by] = m[i];
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
    const u = Math.min(Math.max(((x - ax) * dx + (y - ay) * dy) / l2, 0), 1);
    const d = Math.hypot(ax + u * dx - x, ay + u * dy - y);
    if (d < best) { best = d; at = run + u * segments[i - 1]; }
    run += segments[i - 1];
  }
  return at / length;
}

function blur(src: Float32Array, size: number, r: number, step: number): Float32Array {
  const out = new Float32Array(src.length);
  const across = step === 1 ? size : 1;
  for (let line = 0; line < size; line++) {
    const base = line * across;
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += src[base + Math.min(Math.max(k, 0), size - 1) * step];
    for (let j = 0; j < size; j++) {
      out[base + j * step] = sum / (2 * r + 1);
      sum += src[base + Math.min(j + r + 1, size - 1) * step] - src[base + Math.max(j - r, 0) * step];
    }
  }
  return out;
}

/** The least value within `r` texels along one axis. */
function least(src: Float32Array, size: number, r: number, step: number): Float32Array {
  const out = new Float32Array(src.length);
  const across = step === 1 ? size : 1;
  for (let line = 0; line < size; line++) {
    const base = line * across;
    for (let j = 0; j < size; j++) {
      let m = 1;
      for (let k = Math.max(j - r, 0); k <= Math.min(j + r, size - 1); k++) m = Math.min(m, src[base + k * step]);
      out[base + j * step] = m;
    }
  }
  return out;
}
