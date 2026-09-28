/**
 * The two lights of the door, and what the album is made of, in linear RGB.
 *
 * A fire at 1850 K lies on Yaobian 一–三; daylight lies on Plates I–III, 5600 K at noon, warmer
 * in the morning and warmer still in the evening. The eye adapts to each only in part, and less
 * in the dim than in the day, so the day reads nearly white and the fire amber, as a room lit by
 * a kiln does. Every light is normalized to luminance 1: its intensity is a separate number.
 */

export type RGB = [number, number, number];

const luminance = (c: RGB) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const scale = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];

export const linear = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
export const encode = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);

export function hex(h: string): RGB {
  const n = parseInt(h.replace('#', ''), 16);
  return [linear(((n >> 16) & 255) / 255), linear(((n >> 8) & 255) / 255), linear((n & 255) / 255)];
}

type M3 = [RGB, RGB, RGB];
const mul = (m: M3, v: RGB): RGB => m.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]) as RGB;

// CIE 1931 colour matching, after the fit of Wyman, Sloan and Shirley (2013).
const lobe = (l: number, mu: number, below: number, above: number) => Math.exp(-0.5 * ((l - mu) / (l < mu ? below : above)) ** 2);
const match = (l: number): RGB => [
  1.056 * lobe(l, 599.8, 37.9, 31.0) + 0.362 * lobe(l, 442.0, 16.0, 26.7) - 0.065 * lobe(l, 501.1, 20.4, 26.2),
  0.821 * lobe(l, 568.8, 46.9, 40.5) + 0.286 * lobe(l, 530.9, 16.3, 31.1),
  1.217 * lobe(l, 437.0, 11.8, 36.0) + 0.681 * lobe(l, 459.0, 26.0, 13.8),
];
const XYZ_TO_RGB: M3 = [[3.2406, -1.5372, -0.4986], [-0.9689, 1.8758, 0.0415], [0.0557, -0.204, 1.057]];
const BRADFORD: M3 = [[0.8951, 0.2664, -0.1614], [-0.7502, 1.7135, 0.0367], [0.0389, -0.0685, 1.0296]];
const BRADFORD_INVERSE: M3 = [[0.9869929, -0.1470543, 0.1599627], [0.4323053, 0.5183603, 0.0492912], [-0.0085287, 0.0400428, 0.9684867]];
const D65 = mul(BRADFORD, [0.95047, 1, 1.08883]);

/**
 * A black body at `k` kelvin, as the eye takes it once it has adapted to it by `amount` (von Kries,
 * in Bradford's cone space), in linear RGB at luminance 1.
 */
export function kelvin(k: number, amount = 0): RGB {
  const xyz: RGB = [0, 0, 0];
  for (let l = 380; l <= 780; l += 2) {
    const m = l * 1e-9;
    const p = 1 / (m ** 5 * (Math.exp(1.4388e-2 / (m * k)) - 1));
    match(l).forEach((v, i) => (xyz[i] += p * v));
  }
  const cone = mul(BRADFORD, scale(xyz, 1 / xyz[1]));
  const seen = cone.map((v, i) => v * (D65[i] / v) ** amount) as RGB;
  const c = mul(XYZ_TO_RGB, mul(BRADFORD_INVERSE, seen)).map((v) => Math.max(v, 0)) as RGB;
  return scale(c, 1 / luminance(c));
}

export const DAY = kelvin(5600, 0.6); // noon
export const FIRE = kelvin(1850, 0.4);
export const EMBERS = kelvin(2700, 0.4); // the fire's fill: the kiln's walls, not its flame
export const AMBIENT: RGB = scale(kelvin(4200, 0.6), 0.018);
export const GLOW: RGB = kelvin(1250); // what a burning edge gives off; not adapted, it is seen, not lit by
export const HEAT: RGB = kelvin(1700); // its hottest, where it has only just caught

/** The mount as it looks under full daylight, which is the colour the page shows before it is drawn. */
export const PAPER = '#e9e3d6';
export const ALBEDO: RGB = hex(PAPER).map((v, i) => v / (DAY[i] + AMBIENT[i])) as RGB;
/** The same, taken as a rubbing: the ink as it looks under full daylight, and what it is. */
export const RUBBING = '#181614';
export const INK: RGB = hex(RUBBING).map((v, i) => v / (DAY[i] + AMBIENT[i])) as RGB;
/** The line a leaf reached by the keyboard is ruled round with. */
export const RULE: RGB = hex('#221b14');
export const CORE: RGB = ALBEDO.map((v) => Math.min(v * 1.05, 0.92)) as RGB; // a fresh cut shows the sheet's inside
export const BACKING: RGB = [0.083, 0.074, 0.064]; // the board behind the mount, where no picture is laid
export const SCORCH: RGB = [0.36, 0.2, 0.085];
export const CHAR: RGB = [0.021, 0.017, 0.014];

/**
 * Daylight over the plates, as the day goes: toward the light, and how much of it is the sun's key
 * rather than the sky's fill. Morning comes low from the left and cool of noon, noon high, evening
 * low from the right and warm. Every one is at luminance 1: the eye keeps up with the day.
 */
export type Sun = { dir: [number, number, number]; light: RGB; key: number };
const DAYS: Sun[] = [
  { dir: [-0.86, -0.3, 0.42], light: kelvin(4700, 0.6), key: 0.72 },
  { dir: [-0.1, -0.45, 0.89], light: DAY, key: 0.55 },
  { dir: [0.86, -0.3, 0.42], light: kelvin(3300, 0.6), key: 0.72 },
];

/** The sun at `t` of the day: 0 morning, 0.5 noon, 1 evening. */
export function sunAt(t: number): Sun {
  const u = Math.min(Math.max(t, 0), 1) * 2;
  const i = Math.min(Math.floor(u), 1), f = u - i;
  const a = DAYS[i], b = DAYS[i + 1];
  const mix = (p: number, q: number) => p + (q - p) * f;
  const d = a.dir.map((v, k) => mix(v, b.dir[k]));
  const n = Math.hypot(d[0], d[1], d[2]);
  const light = a.light.map((v, k) => mix(v, b.light[k])) as RGB;
  return { dir: d.map((v) => v / n) as [number, number, number], light: scale(light, 1 / luminance(light)), key: mix(a.key, b.key) };
}

/**
 * The fire lies below the viewport and moves with it: the head of the album passes over the kiln.
 * Its light falls off with distance, and rakes the sheet more the higher up the screen it reaches.
 */
export const KILN = { below: 0.55, height: 0.3, key: 1.12, fill: 0.075, falloff: 1.2 };

/** The fire breathes: a slow swell and a quicker flutter. */
export function breath(t: number): number {
  return 1 + 0.06 * Math.sin(2 * Math.PI * 0.3 * t + 1.3) + 0.025 * Math.sin(2 * Math.PI * 1.1 * t + 0.4);
}

export const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

/** The sky light that is left in the shadow of what gathers the day, as a share of the day. */
export const DUSK = 0.035;

/** How much of the day reaches a point of the sheet: the shadow is round below the focus, and runs straight up above it. */
export function daylight(x: number, y: number, focus: { x: number; y: number }, shade: { inner: number; outer: number }, fireFull: number): number {
  const lit = smoothstep(shade.inner, shade.outer, Math.hypot(x - focus.x, Math.max(y - focus.y, 0)));
  const sky = DUSK * smoothstep(fireFull, focus.y, y);
  return sky + (1 - sky) * lit;
}

/**
 * The light on a flat, unshadowed surface at a point of the document: what a picture in its
 * window receives. The mount's shader computes the same, per pixel; this is for the picture that
 * is lifted off it, which must leave in the light it was lying in.
 */
export function flat(o: {
  x: number; y: number; sheet: { x: number; y: number }; W: number; V: number;
  focus: { x: number; y: number }; shade: { inner: number; outer: number };
  fire: [number, number]; kindled: number; time: number; light: RGB;
}): RGB {
  const day = daylight(o.x, o.y, o.focus, o.shade, o.fire[0]);
  const fire = (1 - smoothstep(o.fire[0], o.fire[1], o.y)) * o.kindled;
  const fx = o.sheet.x + o.W / 2, fy = o.sheet.y + o.V * (1 + KILN.below), fz = o.V * KILN.height;
  const d0 = Math.hypot(o.V * KILN.below, fz);
  const d = Math.hypot(fx - o.x, fy - o.y, fz);
  const key = KILN.key * Math.pow(d0 / d, KILN.falloff) * breath(o.time);
  return [0, 1, 2].map((i) => o.light[i] * day + FIRE[i] * fire * key + EMBERS[i] * fire * KILN.fill + AMBIENT[i]) as RGB;
}

const shoulder = (v: number) => (v < 0.85 ? v : 0.85 + 0.15 * (1 - Math.exp(-(v - 0.85) / 0.15)));

/**
 * The mount's tone curve: straight to 0.85, then a shoulder into white. It is laid on the
 * brightest channel and the others follow it, so a bright fire stays the colour of fire; only what
 * is far past white is bleached by it, channel by channel, as the eye bleaches.
 */
export function tone(c: RGB): RGB {
  const m = Math.max(c[0], c[1], c[2]);
  if (m <= 0.85) return c;
  const k = shoulder(m) / m, w = smoothstep(1, 3, m);
  return c.map((v) => v * k * (1 - w) + shoulder(v) * w) as RGB;
}

export function css(c: RGB): string {
  const [r, g, b] = tone(c).map((v) => Math.round(encode(Math.min(v, 1)) * 255));
  return `rgb(${r} ${g} ${b})`;
}
