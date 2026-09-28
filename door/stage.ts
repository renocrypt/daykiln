/**
 * The score: where the reader is in the album, from how far the page is scrolled.
 *
 * The page's scroll is not the sheet's. The album is played in acts:
 *
 *   I    the kiln's eye. The eye holds on the lens; KILN, RULE and PLUMB pass behind it on a
 *        strip, each coming to rest in turn.
 *   II   the burn. The sheet runs on down, out of the fire, through the burn and the gathered day.
 *   III  展, the unfolding. Plate I lies on the page. Plates II and III are folding plates, tipped in
 *        and folded back behind it: II is unfolded out to the right, III down from under II, and
 *        the eye draws back to watch each leaf turn and comes in again as it lies flat. The day
 *        goes over them from morning to evening. Then the eye draws right back, to see the whole
 *        of it opened out, and comes down to the colophon beside the last plate.
 *   and  the colophon, as the sheet runs on down to its foot; there the eye holds, and the last word,
 *        照, is written into the sheet, stroke by stroke: 日 and 召 pressed, the fire of 灬 burnt in.
 *
 * Every move is scrubbed: the scroll is its easing, and its ends are only rounded, so a thing comes
 * to rest and leaves it without a jolt. Between moves the work holds.
 */

import type { Layout } from './layout.ts';

export type Stage = {
  /** The middle of the view on the sheet, and how far back the eye is: 1 at rest, further back above. */
  camera: { x: number; y: number; k: number };
  /** How far each folding plate is turned back from flat: 0 flat, π folded behind the page. */
  fold: [number, number];
  /** Which of the lens's pictures is behind it: 0 KILN, 1 RULE, 2 PLUMB, and between. */
  strip: number;
  /** 1 while the lens's strip is at rest, 0 while it moves. */
  settled: number;
  /** Which plate the eye is on (0, 1, 2), and 1 while it rests there, flat, at arm's length. */
  plate: number;
  still: number;
  /** The time of day: 0 morning, 0.5 noon, 1 evening. */
  sun: number;
  /** How far the last word is written: 0 not begun, 1 its last stroke, 1.08 its last ember out. */
  write: number;
};

/** The lens's act, in views: rest, move, rest, move, rest. */
export const HOLD = 0.35, MIDDLE = 0.5, MOVE = 1;
export const ACT = 2 * HOLD + MIDDLE + 2 * MOVE;
/** The unfolding, in views: rest on I, unfold II, rest, unfold III, rest, then the whole and down to the colophon. */
const UNFOLD = 1.4, LAST = 0.4, WHOLE = 1.7;
export const SPREAD = HOLD + UNFOLD + MIDDLE + UNFOLD + LAST + WHOLE;
const BACK = 0.55; // how far the eye draws back while a leaf turns, over its distance at rest
/** How far back a leaf is turned as it starts out: past square, so it is still hidden behind the page. */
const TUCKED = 0.58 * Math.PI;
const ROUND = 0.15; // the share of a move at each end over which it is rounded
const LANDING = 0.3; // in views: how long the sheet takes to come to a hold, or to leave one
/** The last word, in views: the brush's run through it, and the whole of its hold, with a rest after. */
const WRITE = 1.9;
export const WORD = 2.3;

/** A move from 0 to 1, straight through its middle and rounded over `k` of it at each end (C¹). */
function move(t: number, k = ROUND): number {
  const s = 1 / (1 - k);
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  if (t < k) return (s * t * t) / (2 * k);
  if (t > 1 - k) return 1 - (s * (1 - t) * (1 - t)) / (2 * k);
  return s * (t - k / 2);
}

/** 0 at both ends of a move and 1 in its middle, level at the ends: how far back the eye has drawn. */
const away = (t: number) => Math.sin(Math.PI * Math.min(Math.max(t, 0), 1)) ** 2;

/** Through the lens's act, `u` pixels in: which of its three pictures is in place, and between. */
function played(u: number, V: number): number {
  const a = HOLD * V, m = MOVE * V, h = MIDDLE * V;
  if (u < a + m) return move((u - a) / m);
  return 1 + move((u - a - m - h) / m);
}

/** Where each work comes to rest, `u` pixels into its act: in the lens's, then in the unfolding. */
export function restsOf(V: number): { lens: number[]; plates: number[] } {
  return {
    lens: [0, (HOLD + MOVE + MIDDLE / 2) * V, (ACT - HOLD / 2) * V],
    plates: [(HOLD / 2) * V, (HOLD + UNFOLD + MIDDLE / 2) * V, (HOLD + UNFOLD + MIDDLE + UNFOLD + LAST / 2) * V],
  };
}

export function stage(L: Layout, page: number): Stage {
  const { W, V } = L;
  const { lens, burn, day } = L.runs;
  const flat = { strip: 2, settled: 1, plate: 0, still: 0, sun: 0, write: 0, fold: [Math.PI, Math.PI] as [number, number] };
  const at = (y: number) => ({ x: W / 2, y: y + V / 2, k: 1 });

  if (page < lens[1]) {
    const strip = played(page - lens[0], V);
    const off = Math.abs(strip - Math.round(strip));
    return { ...flat, camera: at(L.sheet.lens), strip, settled: 1 - smooth(0, 0.12, off) };
  }
  if (page < burn[1]) {
    // From the lens's hold down to the plates', leaving the one and coming to the other gently.
    const t = (page - burn[0]) / (burn[1] - burn[0]);
    const y = L.sheet.lens + (L.sheet.row - L.sheet.lens) * move(t, Math.min((LANDING * V) / (burn[1] - burn[0]), 0.3));
    return { ...flat, camera: at(y) };
  }

  const R = L.sheet.row;
  const one = { x: W / 2, y: R + V / 2 }, two = { x: 1.5 * W, y: R + V / 2 }, three = { x: 1.5 * W, y: R + 1.5 * V };
  let u = (page - day[0]) / V;
  if (u < HOLD) return { ...flat, camera: { ...one, k: 1 }, plate: 0, still: 1 };
  u -= HOLD;
  if (u < UNFOLD) {
    const t = u / UNFOLD, m = move(t);
    return {
      ...flat, camera: { x: one.x + (two.x - one.x) * m, y: one.y, k: 1 + BACK * away(t) },
      fold: [TUCKED * (1 - m), Math.PI], plate: m < 0.5 ? 0 : 1, sun: 0.5 * m,
    };
  }
  u -= UNFOLD;
  if (u < MIDDLE) return { ...flat, camera: { ...two, k: 1 }, fold: [0, Math.PI], plate: 1, still: 1, sun: 0.5 };
  u -= MIDDLE;
  if (u < UNFOLD) {
    const t = u / UNFOLD, m = move(t);
    return {
      ...flat, camera: { x: two.x, y: two.y + (three.y - two.y) * m, k: 1 + BACK * away(t) },
      fold: [0, TUCKED * (1 - m)], plate: m < 0.5 ? 1 : 2, sun: 0.5 + 0.5 * m,
    };
  }
  u -= UNFOLD;
  if (u < LAST) return { ...flat, camera: { ...three, k: 1 }, fold: [0, 0], plate: 2, still: 1, sun: 1 };
  u -= LAST;
  const end = { x: W / 2, y: L.sheet.colophon + V / 2 };
  if (u < WHOLE) {
    // Back to see the whole of it opened out, and in again to the colophon, on one curve through
    // the middle of the spread.
    const t = u / WHOLE, m = move(t, 0.25);
    const mid = { x: W, y: R + V };
    const cx = 2 * mid.x - (three.x + end.x) / 2, cy = 2 * mid.y - (three.y + end.y) / 2;
    const b = (p: number, c: number, q: number) => (1 - m) * (1 - m) * p + 2 * m * (1 - m) * c + m * m * q;
    return { ...flat, camera: { x: b(three.x, cx, end.x), y: b(three.y, cy, end.y), k: 1 + (L.whole - 1) * away(t) }, fold: [0, 0], plate: 2, sun: 1 };
  }
  // Down through the colophon to the foot, and there the eye holds while the last word is written.
  const { tail, word } = L.runs, foot = L.sheet.glyph + V / 2;
  if (page < tail[1]) {
    const t = (page - tail[0]) / (tail[1] - tail[0]);
    const y = end.y + (foot - end.y) * move(t, Math.min((LANDING * V) / (tail[1] - tail[0]), 0.3));
    return { ...flat, camera: { x: end.x, y, k: 1 }, fold: [0, 0], plate: 2, sun: 1 };
  }
  // It runs a little past the end of the last stroke, so the last ember has time to go out.
  const write = Math.min(Math.max((page - word[0]) / (WRITE * V), 0), 1) * 1.08;
  return { ...flat, camera: { x: end.x, y: foot, k: 1 }, fold: [0, 0], plate: 2, sun: 1, write };
}

/** The page's place as act and share of it, to be found again when the view is measured afresh. */
export function locate(L: Layout, page: number): number {
  const runs = [L.runs.lens, L.runs.burn, L.runs.day, [L.runs.day[1], L.length - L.V] as [number, number]];
  for (let i = 0; i < runs.length; i++) {
    const [a, b] = runs[i];
    if (page < b || i === runs.length - 1) return i + Math.min(Math.max((page - a) / Math.max(b - a, 1), 0), 1);
  }
  return 0;
}

export function pageAt(L: Layout, place: number): number {
  const runs = [L.runs.lens, L.runs.burn, L.runs.day, [L.runs.day[1], L.length - L.V] as [number, number]];
  const i = Math.min(Math.floor(place), runs.length - 1);
  const [a, b] = runs[i];
  return a + (b - a) * (place - i);
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};
