/**
 * Where everything lies on the album's sheet, in CSS pixels from its top left, and how long the
 * page is that plays it (stage.ts).
 *
 * The sheet is read from the top down, a view wide. At its head is the kiln's eye: one round
 * window, glazed, that Yaobian 一–三 pass behind in turn, in the kiln's fire. Below it the fire falls
 * away into the shadow where the sheet is burnt, and the focus, where the gathered day burns it.
 * Below that lies Plate I; Plates II and III are folding plates, each a view in size, tipped in to
 * its right edge and folded back behind it: they are placed here as they lie unfolded, II to the
 * right of I and III under II. Beside III, under I, the colophon, and at the foot the last word, 照.
 * Every window comes to rest with more paper above it than below, as a mount leaves more at the
 * head than at the foot.
 *
 * On a wide screen the plates' windows are 16:10, the pictures' own shape, and each label runs down
 * the margin beside its window. On a tall one a window takes nearly the width of the sheet and is
 * cut 5:4, and the label is set under it, as a print's title is pencilled under the plate. The
 * lens is a circle as tall as the plates' windows, its label beside its middle, or under it.
 */

import { ACT, SPREAD, WORD, restsOf } from './stage.ts';

export type Rect = { x: number; y: number; w: number; h: number };

export type Layout = {
  W: number;
  V: number;
  portrait: boolean;
  /** Where each leaf's picture lies: Yaobian's three all behind the lens. */
  windows: Rect[];
  /** The windows cut in the mount, one to a leaf: the lens is the first, and the two it stands for are not cut. */
  cuts: Rect[];
  /** Which windows are round: each the circle filling its square rect. */
  round: boolean[];
  labels: { x: number; y: number }[];
  /** The running head, over the lens: its left end, its width, and its middle. */
  head: { x: number; w: number; y: number };
  /** The folding plates as they lie unfolded: II hinged on its left edge to I's page, III on its top to II. */
  flaps: [Rect, Rect];
  /** How far the eye is from the sheet at rest, in CSS px; and how far back it draws to see the whole spread, over that. */
  focal: number;
  whole: number;
  /** Where the view's top is on the sheet while the lens holds, while Plate I does, at the colophon, and at the last word. */
  sheet: { lens: number; row: number; colophon: number; glyph: number };
  /** The page's scroll through each act: the lens, the burn, the day; then down to the foot, and the last word. */
  runs: { lens: [number, number]; burn: [number, number]; day: [number, number]; tail: [number, number]; word: [number, number] };
  /** The page's scroll at which each leaf is at rest. */
  rests: number[];
  /** The shadow: full within `inner` of the focus, none beyond `outer`. */
  shade: { inner: number; outer: number };
  /** The fire is full above the first of these heights, and gone below the second. */
  fire: [number, number];
  /** The point the daylight is gathered to. */
  focus: { x: number; y: number };
  colophon: { x: number; y: number };
  glyph: Rect;
  length: number;
};

export const LEAVES = 6;
const ROUND = [true, true, true, false, false, false]; // Yaobian's, in the kiln's light
const HEAD = 0.54; // the share of the free height above the window: head over foot, 54 : 46
const ASPECT = 1.6;
const TALL = 1.25; // the window on a tall screen
const CAPTION = 22; // the height of a label set under its window
const PARKED: Rect = { x: -1e5, y: -1e5, w: 0, h: 0 };

export function measure(W: number, V: number, colophonHeight: number): Layout {
  const portrait = W / V < 0.9;

  let ww: number, wh: number, x: number, labelGap: number, under: number;
  if (portrait) {
    wh = Math.min((W - 2 * Math.max(20, W * 0.06)) / TALL, V * 0.46);
    ww = wh * TALL;
    x = (W - ww) / 2;
    labelGap = 18;
    under = labelGap + CAPTION;
  } else {
    wh = Math.min(V * 0.6, (W * 0.62) / ASPECT);
    ww = wh * ASPECT;
    x = (W - ww) / 2;
    labelGap = Math.max(26, ww * 0.034);
    under = 0;
  }

  // The lens's top, and the row's: as far apart as Yaobian 三 and Plate I were when every leaf had
  // its own window, so the fire, the burn and the gathered day have the same room.
  const first = HEAD * (V - wh - under);
  const leaf = portrait ? Math.max(wh + under + V * 0.4, V * 0.7) : V;
  const hinge = V * (portrait ? 2.0 : 2.2);
  const lensTop = first;
  const rowTop = first + leaf + hinge;
  const R = rowTop - first; // the view's top on the sheet at Plate I

  const lens = { x: (W - wh) / 2, y: lensTop, w: wh, h: wh };
  const row = [{ x, y: rowTop, w: ww, h: wh }, { x: x + W, y: rowTop, w: ww, h: wh }, { x: x + W, y: rowTop + V, w: ww, h: wh }];
  const flaps: [Rect, Rect] = [{ x: W, y: R, w: W, h: V }, { x: W, y: R + V, w: W, h: V }];
  const windows = [lens, lens, lens, ...row];
  const cuts = [lens, PARKED, PARKED, ...row];

  const lensLabel = portrait ? { x: W / 2, y: lensTop + wh + labelGap } : { x: W / 2 + wh / 2 + labelGap, y: lensTop + wh / 2 };
  const labels = [lensLabel, lensLabel, lensLabel, ...row.map((r) => (portrait ? { x: r.x, y: r.y + wh + labelGap } : { x: r.x + ww + labelGap, y: r.y + 1 }))];
  const head = { x, w: ww, y: Math.max(22, Math.min(first * 0.36, 70)) };

  const bottom = lensTop + wh;
  const focusY = (bottom + rowTop) / 2;
  // Wide enough to take in the whole view when the focus is in the middle of it; its soft edge
  // clear of Plate I.
  const inner = Math.max(0.46 * Math.hypot(W, V), 0.5 * W + 40);
  const outer = Math.max(Math.min(inner + 0.4 * V, rowTop - focusY - V * 0.04), inner + 0.15 * V);
  const fire: [number, number] = [bottom + V * 0.08, focusY - V * 0.12];

  // The colophon lies under Plate I, beside III, its head level with III's window.
  const colophon = { x: 0, y: rowTop + V };
  // The last word, at the foot: written, not set, and so larger than a seal. Its texture has a
  // margin for the shoulder, so the character itself is 84 % of this.
  const g = Math.min(V * 0.62, W * 0.78, 560);
  const glyphCentre = colophon.y + colophonHeight + V * 0.9;
  const glyph = { x: (W - g) / 2, y: glyphCentre - g / 2, w: g, h: g };

  // The page: the lens's act, the sheet's run down to Plate I, the unfolding, and the rest of the sheet.
  const sheet = { lens: 0, row: R, colophon: colophon.y - 0.12 * V, glyph: glyphCentre - V / 2 };
  const act = ACT * V;
  const runs = {
    lens: [0, act] as [number, number],
    burn: [act, act + R] as [number, number],
    day: [act + R, act + R + SPREAD * V] as [number, number],
    tail: [0, 0] as [number, number],
    word: [0, 0] as [number, number],
  };
  runs.tail = [runs.day[1], runs.day[1] + (sheet.glyph - sheet.colophon)];
  runs.word = [runs.tail[1], runs.tail[1] + WORD * V];
  const within = restsOf(V);
  const rests = [...within.lens.map((u) => runs.lens[0] + u), ...within.plates.map((u) => runs.day[0] + u)];
  const length = Math.ceil(runs.word[1] + V);

  return {
    W, V, portrait, windows, cuts, round: [...ROUND], labels, head, flaps, focal: 1.4 * V, whole: 2.35, sheet, runs, rests,
    shade: { inner, outer }, fire, focus: { x: W / 2, y: focusY },
    colophon, glyph, length,
  };
}
