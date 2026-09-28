// Prepare Coronelli's 1688 gores and polar calottes for UNFOLD.
//
// For each native-resolution master in assets-src/coronelli/:
// 1. Mask out the scanner background by flood-filling its neutral grey inward from the border.
// 2. White-balance: map the paper, measured from the brightest printed-sheet pixels, to a neutral
//    albedo with a diagonal gain in linear light. The ink and any pigment keep their relation to
//    the paper; the scanner-light cream goes. LOOK.md: "Coronelli's print, white-balanced."
// 3. Downsample with Lanczos to each texture level, locally: the collection server's own scaled
//    output is soft. The levels let the plate load what the view needs and no more.
// 4. Find the sheet's printed borders, which map the print onto the sphere: a gore's four border
//    rules, or a calotte's printed 70° circle. The paper's margins lie outside them and are
//    trimmed. See lab/unfold-lookdev/README.md, "Printed borders".
//
// Pieces 1–12 are the southern gores, 13–24 the northern gores, 25 the north polar calotte, and
// 26 the south polar calotte, numbered as in the David Rumsey Map Collection.
//
// Usage: node --max-old-space-size=12288 plates/tools/prepare-gores.ts 11 12
//        node --max-old-space-size=12288 plates/tools/prepare-gores.ts all

import sharp from 'sharp';
import { access, mkdir, writeFile } from 'node:fs/promises';

const GORE_LEVELS = [1024, 2048, 4096, 8192]; // texture heights; 8192 is WebGPU's default limit
const CALOTTE_LEVELS = [512, 1024, 2048, 4096]; // about the same paper resolution, level for level
const MASK_SCALE = 0.5; // flood fill at half the native resolution
const PAPER_ALBEDO = 0.8; // linear reflectance of clean laid paper
const OUT = 'public/plates/assets/unfold';
const SOURCE = 'Vincenzo Coronelli, terrestrial globe, 1688. David Rumsey Historical Map Collection, CC BY-NC-SA 3.0. White-balanced facsimile.';

const toLinear = new Float32Array(256).map((_, i) => {
  const c = i / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
});
function toSRGB8(linear: number): number {
  const c = Math.min(Math.max(linear, 0), 1);
  const s = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(s * 255);
}

type Mask = { mask: Uint8Array; width: number; height: number };

/** Background mask at reduced resolution: 1 where the scanner bed shows. */
async function backgroundMask(file: string): Promise<Mask> {
  const meta = await sharp(file, { limitInputPixels: false }).metadata();
  const width = Math.round(meta.width! * MASK_SCALE);
  const height = Math.round(meta.height! * MASK_SCALE);
  const { data } = await sharp(file, { limitInputPixels: false })
    .resize(width, height, { kernel: 'lanczos3' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // The bed's color: median of a thin border strip.
  const border: number[][] = [];
  for (let x = 0; x < width; x += 7) for (const y of [2, height - 3]) border.push(pixel(x, y));
  for (let y = 0; y < height; y += 7) for (const x of [2, width - 3]) border.push(pixel(x, y));
  const bed = [0, 1, 2].map((c) => median(border.map((p) => p[c])));

  function pixel(x: number, y: number): number[] {
    const i = (y * width + x) * 3;
    return [data[i], data[i + 1], data[i + 2]];
  }
  function isBed(i: number): boolean {
    const r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2];
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    return chroma < 18 && Math.abs((r + g + b) / 3 - (bed[0] + bed[1] + bed[2]) / 3) < 30;
  }

  const mask = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0, tail = 0;
  const seed = (i: number) => { if (!mask[i] && isBed(i)) { mask[i] = 1; queue[tail++] = i; } };
  for (let x = 0; x < width; x++) { seed(x); seed((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { seed(y * width); seed(y * width + width - 1); }
  while (head < tail) {
    const i = queue[head++];
    const x = i % width;
    if (x > 0) seed(i - 1);
    if (x < width - 1) seed(i + 1);
    if (i >= width) seed(i - width);
    if (i < width * (height - 1)) seed(i + width);
  }
  console.log(`  bed rgb(${bed.join(', ')}), ${((100 * tail) / (width * height)).toFixed(1)}% of the scan`);
  return { mask, width, height };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

// Printed borders ---------------------------------------------------------------------------------
//
// A gore is printed inside border lines: a meridian line or a graduated band down each side, and a
// parallel along each end, drawn as an arc. The paper was cut outside them with an uneven margin,
// and a globe maker trims to the borders, so the borders, not the paper edges, carry the gore's
// meridians and parallels. Each border is found as the first dark printed line inward from the
// paper's edge, sampled along the edge, and fitted with a smooth curve that rejects stray marks.

type Luminance = { lum: Uint8Array; width: number; height: number };

const LINE_CONTRAST = 30; // levels of 255 below the paper

/**
 * Corners read by eye, where artwork crowds a corner and the detector goes astray: a text frame
 * over gore 2's equator, the ecliptic's band across the equator of gores 17 to 19, creases and
 * platemarks at the ends of others. Read from gridded zooms (tools/lookdev/corner-zoom.ts), in
 * pixels of the top texture level, to within about 2 px.
 */
const CORNERS: Record<number, Partial<Record<'tl' | 'tr' | 'bl' | 'br', [number, number]>>> = {
  1: { bl: [1350, 8014] },
  2: { tl: [282, 330], tr: [3688, 223] },
  7: { br: [2555, 8007] },
  17: { br: [3665, 7942] },
  18: { bl: [271, 7954], br: [3636, 7961] },
  19: { bl: [267, 7951] },
};

/**
 * Distance from the start of a profile to the first printed line, past `skip` pixels of cut edge. A
 * line is anything 30 levels darker than the profile's paper: engraved rules thin out to grey in
 * places, so an absolute threshold loses them.
 */
function firstLine(profile: number[], skip: number): number | null {
  const sorted = [...profile].sort((a, b) => a - b);
  const threshold = sorted[Math.floor(sorted.length * 0.8)] - LINE_CONTRAST;
  for (let i = skip; i < profile.length - 1; i++) {
    if (profile[i] >= threshold) continue;
    let best = i;
    for (let j = i; j < Math.min(i + 6, profile.length); j++) if (profile[j] < profile[best]) best = j;
    return best;
  }
  return null;
}

/** Least-squares polynomial y(x), refitted without points far from the curve. */
function robustFit(points: [number, number][], degree: number, tolerance: number): (x: number) => number {
  const xs = points.map((p) => p[0]);
  const lo = Math.min(...xs), hi = Math.max(...xs);
  const norm = (x: number) => (2 * (x - lo)) / (hi - lo) - 1;
  let kept = points;
  let coef: number[] = [];
  for (let pass = 0; pass < 6; pass++) {
    const n = degree + 1;
    const A = Array.from({ length: n }, () => new Array<number>(n + 1).fill(0));
    for (const [x, y] of kept) {
      const powers = Array.from({ length: n }, (_, k) => norm(x) ** k);
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) A[r][c] += powers[r] * powers[c];
        A[r][n] += powers[r] * y;
      }
    }
    for (let c = 0; c < n; c++) { // Gauss-Jordan elimination
      let pivot = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[pivot][c])) pivot = r;
      [A[c], A[pivot]] = [A[pivot], A[c]];
      for (let r = 0; r < n; r++) {
        if (r === c) continue;
        const f = A[r][c] / A[c][c];
        for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k];
      }
    }
    coef = A.map((row, r) => row[n] / row[r]);
    const f = (x: number) => coef.reduce((sum, a, k) => sum + a * norm(x) ** k, 0);
    const residuals = kept.map(([x, y]) => Math.abs(y - f(x)));
    const spread = median(residuals) * 4;
    const next = kept.filter((_, i) => residuals[i] <= Math.max(tolerance, spread));
    if (next.length === kept.length) break;
    kept = next;
  }
  return (x: number) => coef.reduce((sum, a, k) => sum + a * norm(x) ** k, 0);
}

type Borders = { top: [number, number][]; bottom: [number, number][]; left: [number, number][]; right: [number, number][] };

/**
 * A gore's four printed borders, as polylines in texture fractions (v from the top): the ends from
 * the left corner to the right, the sides from the top corner to the bottom.
 *
 * The sides are found first, traced down each long edge of the paper; each side rule ends at a
 * corner. The ends are drawn as
 * arcs, since a gore's parallels are circular arcs: each end is the arc through its two corners
 * whose sag puts it on the darkest line. A straight rule in the margin, such as a platemark, does
 * not pass through the corners and is never taken for the border.
 */
function goreBorders(image: Luminance, alpha: Uint8Array, piece: number): Borders {
  const north = piece >= 13;
  const { lum, width, height } = image;
  const at = (x: number, y: number) => lum[Math.min(height - 1, Math.max(0, Math.round(y))) * width + Math.min(width - 1, Math.max(0, Math.round(x)))];
  const inside = (x: number, y: number) => alpha[y * width + x] > 200;

  // Paper rows: those where the sheet is at least a fifth of its typical width, which drops specks
  // of mask beyond its ends. Each row's edges are a running median, so torn fibres do not jump.
  const rawEdges = (y: number): [number, number] => {
    let l = 0, r = width - 1;
    while (l < width - 1 && !inside(l, y)) l++;
    while (r > 0 && !inside(r, y)) r--;
    return [l, r];
  };
  const raw = Array.from({ length: height }, (_, y) => rawEdges(y));
  const counts = Array.from({ length: height }, (_, y) => {
    let n = 0;
    for (let x = 0; x < width; x++) if (alpha[y * width + x] > 200) n++;
    return n;
  });
  const typical = median(counts.filter((n) => n > 0));
  let yFirst = 0, yLast = height - 1;
  while (yFirst < height - 1 && counts[yFirst] < typical * 0.2) yFirst++;
  while (yLast > 0 && counts[yLast] < typical * 0.2) yLast--;
  const edgeFit = (pick: (e: [number, number]) => number) => {
    const points: [number, number][] = [];
    for (let y = yFirst; y <= yLast; y += 8) points.push([y, pick(raw[y])]);
    return robustFit(points, 4, 12);
  };
  const leftEdge = edgeFit(([l]) => l), rightEdge = edgeFit(([, r]) => r);
  const rowEdges = (y: number): [number, number] => [Math.round(leftEdge(y)), Math.round(rightEdge(y))];

  // Sides. A thin printed rule answers a line filter (paper on both sides, dark in the middle);
  // the paper's cut edge, dirt, and pencil answer it too, but only in short runs. The side border is
  // the path down the paper's long edge that collects the most line response while moving at most
  // a pixel per row, found by dynamic programming. Where the response along it dies, the rule ends:
  // those are the corners.
  const BAND = Math.round(width * 0.04); // how far in from the paper's edge the border may lie
  const smooth = (x: number, y: number) => (at(x, y - 3) + at(x, y - 2) + at(x, y - 1) + at(x, y) + at(x, y + 1) + at(x, y + 2) + at(x, y + 3)) / 7;
  const response = (x: number, y: number) => {
    const c = Math.min(smooth(x - 1, y), smooth(x, y), smooth(x + 1, y));
    const around = (smooth(x - 5, y) + smooth(x - 4, y) + smooth(x + 4, y) + smooth(x + 5, y)) / 4;
    return Math.max(0, around - c);
  };
  const trace = (fromLeft: boolean): { path: Float64Array; strength: Float64Array } => {
    const rows = yLast - yFirst + 1;
    const lo = new Int32Array(rows), hi = new Int32Array(rows);
    for (let k = 0; k < rows; k++) {
      const [l, r] = rowEdges(yFirst + k);
      lo[k] = fromLeft ? l + 4 : r - BAND;
      hi[k] = fromLeft ? l + BAND : r - 4;
    }
    const xMin = Math.min(...lo), xMax = Math.max(...hi), span = xMax - xMin + 1;
    let score = new Float64Array(span).fill(-Infinity);
    let next = new Float64Array(span);
    const back = new Int8Array(rows * span);
    const gain = new Float64Array(rows * span);
    for (let k = 0; k < rows; k++) {
      const y = yFirst + k;
      next.fill(-Infinity);
      for (let x = lo[k]; x <= hi[k]; x++) {
        const i = x - xMin;
        const g = response(x, y);
        gain[k * span + i] = g;
        if (k === 0) { next[i] = g; continue; }
        let best = -Infinity, from = 0;
        for (const d of [-1, 0, 1]) {
          const j = i + d;
          if (j < 0 || j >= span) continue;
          const s = score[j] - (d === 0 ? 0 : 0.5); // a small cost for bending
          if (s > best) { best = s; from = d; }
        }
        if (best === -Infinity) {
          // The band has moved away from every state of the row before: continue from its nearest one.
          const j = Math.min(Math.max(i, lo[k - 1] - xMin), hi[k - 1] - xMin);
          best = score[j] - 2;
          from = Math.max(-127, Math.min(127, j - i));
        }
        next[i] = best + g;
        back[k * span + i] = from;
      }
      [score, next] = [next, score];
    }
    let i = 0;
    for (let j = 1; j < span; j++) if (score[j] > score[i]) i = j;
    const path = new Float64Array(rows), strength = new Float64Array(rows);
    for (let k = rows - 1; k >= 0; k--) {
      path[k] = xMin + i;
      strength[k] = gain[k * span + i];
      i = Math.max(0, Math.min(span - 1, i + back[k * span + i]));
    }
    return { path, strength };
  };
  /**
   * The run of rows where the traced rule is present, as its first and last row. Present means at
   * least a third of the rule's own typical strength, which the paper's cut edge and stray marks in
   * the margin beyond the corners do not reach.
   */
  const rule = (strength: Float64Array): [number, number] => {
    const rows = strength.length, window = 20;
    const middle = Array.from(strength.subarray(Math.round(rows * 0.2), Math.round(rows * 0.8)));
    const floor = median(middle) * 0.35;
    const present = new Uint8Array(rows);
    let sum = 0;
    for (let k = 0; k < rows + window; k++) {
      if (k < rows) sum += strength[k];
      if (k >= 2 * window) sum -= strength[k - 2 * window];
      const c = k - window;
      if (c >= 0 && c < rows) present[c] = sum / (2 * window) > floor ? 1 : 0;
    }
    let bestStart = 0, bestEnd = 0, start = -1, gap = 0;
    for (let k = 0; k <= rows; k++) {
      if (k < rows && present[k]) { if (start < 0) start = k; gap = 0; continue; }
      if (start >= 0 && ++gap > 400) { // rules fade for a stretch, or pass under the ecliptic's band
        const end = k - gap;
        if (end - start > bestEnd - bestStart) { bestStart = start; bestEnd = end; }
        start = -1; gap = 0;
      }
    }
    if (start >= 0 && rows - 1 - start > bestEnd - bestStart) { bestStart = start; bestEnd = rows - 1; }
    // Refine each end to the last row where the rule is present in most of the rows before it. A
    // platemark or crease in the margin crosses the trace in a few rows only and is not taken.
    const dense = (r: number, inward: number) => {
      let hits = 0;
      for (let i = 0; i < 40; i++) if (strength[Math.min(rows - 1, Math.max(0, r + inward * i))] > floor) hits++;
      return hits >= 24 && strength[r] > floor;
    };
    while (bestStart < bestEnd && !dense(bestStart, 1)) bestStart++;
    while (bestEnd > bestStart && !dense(bestEnd, -1)) bestEnd--;
    return [yFirst + bestStart, yFirst + bestEnd];
  };
  const typicalStrength = (t: { strength: Float64Array }) => median(Array.from(t.strength.subarray(Math.round(t.strength.length * 0.2), Math.round(t.strength.length * 0.8))));
  const leftTrace = trace(true), rightTrace = trace(false);
  const [leftTop, leftBottom] = rule(leftTrace.strength);
  const [rightTop, rightBottom] = rule(rightTrace.strength);
  // A side drawn as a graduated band is traced along whichever of its two rules answers best; the
  // gore's edge is the outer one, so the trace is moved out to it.
  const outerShift = (traced: { path: Float64Array; strength: Float64Array }, top: number, bottom: number, outward: number) => {
    let best = 0, bestResponse = 0;
    for (let d = 4; d <= 18; d++) {
      let sum = 0, n = 0;
      for (let y = top + 50; y <= bottom - 50; y += 16) { sum += response(traced.path[y - yFirst] + outward * d, y); n++; }
      if (sum / n > bestResponse) { bestResponse = sum / n; best = d; }
    }
    return bestResponse > typicalStrength(traced) * 0.5 ? outward * best : 0;
  };
  const leftShift = outerShift(leftTrace, leftTop, leftBottom, -1);
  const rightShift = outerShift(rightTrace, rightTop, rightBottom, 1);
  const sideCurve = (traced: { path: Float64Array; strength: Float64Array }, shift: number, top: number, bottom: number, pins: [number, number][] = []) => {
    const floor = typicalStrength(traced) * 0.35;
    const points: [number, number][] = [];
    for (let y = top; y <= bottom; y += 4) if (traced.strength[y - yFirst] > floor) points.push([y, traced.path[y - yFirst] + shift]);
    for (const [x, y] of pins) for (let k = 0; k < 60; k++) points.push([y, x]); // a pinned corner outweighs the trace
    return robustFit(points, 5, 2);
  };
  let leftAt = sideCurve(leftTrace, leftShift, leftTop, leftBottom);
  let rightAt = sideCurve(rightTrace, rightShift, rightTop, rightBottom);
  const tl: [number, number] = [leftAt(leftTop), leftTop], bl: [number, number] = [leftAt(leftBottom), leftBottom];
  const tr: [number, number] = [rightAt(rightTop), rightTop], br: [number, number] = [rightAt(rightBottom), rightBottom];

  // Ends: the arc through two corners that lies along a printed line for as much of its length as
  // possible. Counting coverage rather than summing response keeps a line of lettering or a coast,
  // strong but short, from outweighing the thin rule that runs the whole width.
  const arc = (a: [number, number], b: [number, number], sag: number, s: number): [number, number] => {
    const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
    const bulge = 4 * sag * s * (1 - s);
    return [a[0] + dx * s - (dy / length) * bulge, a[1] + dy * s + (dx / length) * bulge];
  };
  const onPaper = (x: number, y: number) => inside(Math.round(x), Math.round(y));
  const across = (x: number, y: number) => {
    if (!onPaper(x, y - 6) || !onPaper(x, y + 6)) return 0;
    const column = (dy: number) => (at(x - 1, y + dy) + at(x, y + dy) + at(x + 1, y + dy)) / 3;
    return Math.max(0, (column(-5) + column(-4) + column(4) + column(5)) / 4 - Math.min(column(-1), column(0), column(1)));
  };
  const ruleFloor = Math.min(typicalStrength(leftTrace), typicalStrength(rightTrace)) * 0.35;
  // Within a few pixels either side: a rule on a sheet stretched unevenly strays from any one arc.
  const coverage = (a: [number, number], b: [number, number], sag: number) => {
    let hits = 0, sum = 0;
    for (let k = 0; k <= 160; k++) {
      const [x, y] = arc(a, b, sag, 0.03 + 0.94 * (k / 160));
      let r = 0;
      for (let dy = -6; dy <= 6; dy += 2) r = Math.max(r, across(x, y + dy));
      if (r > ruleFloor) hits++;
      sum += r;
    }
    return hits + sum / 1e5; // coverage first, total response to break ties
  };
  // Every end of every gore bows the same way: parallels are arcs centred on the pole's side, so the
  // equator bows out from the gore and the 70° end bows in, toward the equator. Sags, as fractions
  // of the chord, are held to the range measured across all 24 gores, which keeps lettering and
  // engraving that crowd an end from drawing the arc to them. Sag is positive downward.
  let sagRange: [number, number] = [-0.12, 0.12];
  const bestSag = (a: [number, number], b: [number, number]) => {
    const chord = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let best = 0, bestValue = -Infinity;
    for (let sag = sagRange[0] * chord; sag <= sagRange[1] * chord; sag += 1) {
      const value = coverage(a, b, sag);
      if (value > bestValue) { best = sag; bestValue = value; }
    }
    for (let sag = best - 1; sag <= best + 1; sag += 0.1) {
      const value = coverage(a, b, sag);
      if (value > bestValue) { best = sag; bestValue = value; }
    }
    return { sag: best, value: bestValue };
  };
  /**
   * One end. Where one side's rule is hidden near the end (under a cartouche, say), its traced end
   * falls short, well past its partner; that corner is found again along its side, as the one whose
   * arc from the trusted corner lies best on a printed line.
   */
  const end = (left: [number, number], right: [number, number], paperEnd: number) => {
    const tolerance = height * 0.03;
    if (Math.abs(left[1] - right[1]) > tolerance) {
      const leftSuspect = Math.abs(left[1] - paperEnd) > Math.abs(right[1] - paperEnd);
      const trusted = leftSuspect ? right : left;
      const side = leftSuspect ? leftAt : rightAt;
      let best = { corner: leftSuspect ? left : right, sag: 0, value: -Infinity };
      for (let y = trusted[1] - tolerance; y <= trusted[1] + tolerance; y += 2) {
        const corner: [number, number] = [side(y), y];
        const [a, b] = leftSuspect ? [corner, trusted] : [trusted, corner];
        const found = bestSag(a, b);
        if (found.value > best.value) best = { corner, sag: found.sag, value: found.value };
      }
      console.log(`  ${leftSuspect ? 'left' : 'right'} corner found again at ${best.corner.map((v) => v.toFixed(0)).join(',')}`);
      return leftSuspect ? { left: best.corner, right, sag: best.sag } : { left, right: best.corner, sag: best.sag };
    }
    return { left, right, sag: bestSag(left, right).sag };
  };
  // The equator is the top of a southern gore and the bottom of a northern one.
  const EQUATOR: [number, number] = [0.0, 0.022], SEVENTY: [number, number] = [0.035, 0.065]; // outward, inward
  const range = (atTop: boolean): [number, number] => {
    const equator = atTop !== north;
    const [a, b] = equator ? EQUATOR : SEVENTY;
    const down = equator ? !atTop : atTop; // the equator bows away from the gore; 70° bows into it
    return down ? [a, b] : [-b, -a];
  };
  sagRange = range(true);
  const topEnd = end(tl, tr, yFirst);
  sagRange = range(false);
  const bottomEnd = end(bl, br, yLast);

  // A corner is where its end's rule stops. Follow each end's arc past its corner while the rule
  // goes on, which finds a corner whose side rule is hidden or faded near the end.
  const extend = (a: [number, number], b: [number, number], sag: number, fromStart: boolean): [number, number] => {
    const chord = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let last = fromStart ? a : b, gap = 0;
    for (let d = 1; d < 0.2 * chord && gap < 12; d++) {
      const s = fromStart ? -d / chord : 1 + d / chord;
      const [x, y] = arc(a, b, sag, s);
      let found = false;
      for (let dy = -2; dy <= 2 && !found; dy++) if (across(x, y + dy) > ruleFloor) { last = [x, y + dy]; found = true; }
      gap = found ? 0 : gap + 1;
    }
    return last;
  };
  for (const e of [topEnd, bottomEnd]) {
    e.left = extend(e.left, e.right, e.sag, true);
    e.right = extend(e.left, e.right, e.sag, false);
  }
  sagRange = range(true);
  topEnd.sag = bestSag(topEnd.left, topEnd.right).sag;
  sagRange = range(false);
  bottomEnd.sag = bestSag(bottomEnd.left, bottomEnd.right).sag;
  // The equator on a northern gore is a graduated band; its edge is the band's outer rule. Move an
  // end out to a parallel rule just beyond it that runs the whole width.
  const outward = (e: { left: [number, number]; right: [number, number]; sag: number }, sign: number) => {
    const shifted = (d: number): [[number, number], [number, number]] => {
      const dx = e.right[0] - e.left[0], dy = e.right[1] - e.left[1], length = Math.hypot(dx, dy);
      const nx = (-dy / length) * sign * d, ny = (dx / length) * sign * d;
      return [[e.left[0] + nx, e.left[1] + ny], [e.right[0] + nx, e.right[1] + ny]];
    };
    const base = coverage(e.left, e.right, e.sag);
    let best = 0;
    for (let d = 6; d <= 20; d++) {
      const [a, b] = shifted(d);
      if (coverage(a, b, e.sag) > base * 0.6) best = d;
    }
    if (best > 0) [e.left, e.right] = shifted(best);
  };
  if (north) outward(bottomEnd, 1); // the bottom end's outside is down, the arc normal's direction
  // Corners read by eye replace the detector's, and their ends are fitted again.
  const fix = CORNERS[piece] ?? {};
  if (fix.tl) topEnd.left = fix.tl;
  if (fix.tr) topEnd.right = fix.tr;
  if (fix.bl) bottomEnd.left = fix.bl;
  if (fix.br) bottomEnd.right = fix.br;
  if (fix.tl || fix.tr) { sagRange = range(true); topEnd.sag = bestSag(topEnd.left, topEnd.right).sag; }
  if (fix.bl || fix.br) { sagRange = range(false); bottomEnd.sag = bestSag(bottomEnd.left, bottomEnd.right).sag; }

  // Sides refitted through the corners.
  leftAt = sideCurve(leftTrace, leftShift, leftTop, leftBottom, [topEnd.left, bottomEnd.left]);
  rightAt = sideCurve(rightTrace, rightShift, rightTop, rightBottom, [topEnd.right, bottomEnd.right]);
  [tl[0], tl[1]] = topEnd.left; [tr[0], tr[1]] = topEnd.right;
  [bl[0], bl[1]] = bottomEnd.left; [br[0], br[1]] = bottomEnd.right;
  const topSag = topEnd.sag, bottomSag = bottomEnd.sag;
  console.log(`  corners (${[tl, tr, bl, br].map(([x, y]) => `${x.toFixed(0)},${y.toFixed(0)}`).join(' ')}), end sags ${topSag.toFixed(1)} and ${bottomSag.toFixed(1)} px`);

  /**
   * The end rule itself, traced column by column within 25 px of its fitted arc and pinned at its
   * corners. The arc is only a prior: a sheet stretched or cockled on the scanner bows its rules
   * unevenly, and the trace follows them.
   */
  const traceEnd = (a: [number, number], b: [number, number], sag: number): [number, number][] => {
    const BAND = 25;
    const x0 = Math.round(a[0]), x1 = Math.round(b[0]), columns = x1 - x0 + 1;
    const prior = (x: number) => {
      const s = (x - a[0]) / (b[0] - a[0]);
      return arc(a, b, sag, s)[1];
    };
    const smoothRow = (x: number, y: number) => (at(x - 3, y) + at(x - 2, y) + at(x - 1, y) + at(x, y) + at(x + 1, y) + at(x + 2, y) + at(x + 3, y)) / 7;
    const lineResponse = (x: number, y: number) => {
      if (!inside(Math.round(x), Math.round(y - 6)) || !inside(Math.round(x), Math.round(y + 6))) return 0;
      const c = Math.min(smoothRow(x, y - 1), smoothRow(x, y), smoothRow(x, y + 1));
      return Math.max(0, (smoothRow(x, y - 5) + smoothRow(x, y - 4) + smoothRow(x, y + 4) + smoothRow(x, y + 5)) / 4 - c);
    };
    const states = 2 * BAND + 1;
    let score = new Float64Array(states), next = new Float64Array(states);
    const back = new Int8Array(columns * states);
    const gain = new Float64Array(columns * states);
    for (let k = 0; k < columns; k++) {
      const x = x0 + k, center = prior(x);
      for (let i = 0; i < states; i++) {
        const g = lineResponse(x, center - BAND + i);
        gain[k * states + i] = g;
        if (k === 0) { next[i] = g - Math.abs(i - BAND) * 50; continue; } // start at the corner
        let best = -Infinity, from = 0;
        for (const d of [-1, 0, 1]) {
          const j = i + d;
          if (j < 0 || j >= states) continue;
          const s = score[j] - (d === 0 ? 0 : 0.5);
          if (s > best) { best = s; from = d; }
        }
        next[i] = best + g;
        back[k * states + i] = from;
      }
      [score, next] = [next, score];
    }
    let i = BAND; // end at the corner
    const path: [number, number][] = [];
    for (let k = columns - 1; k >= 0; k--) {
      const x = x0 + k;
      path.push([x, prior(x) - BAND + i]);
      i = Math.max(0, Math.min(states - 1, i + back[k * states + i]));
    }
    path.reverse();
    // Smooth, keeping only columns where the rule answered, and pin the corners.
    const floor = ruleFloor;
    const points: [number, number][] = path.filter((_, k) => gain[k * states + Math.round(path[k][1] - (prior(path[k][0]) - BAND))] > floor);
    for (let k = 0; k < 80; k++) points.push([a[0], a[1]], [b[0], b[1]]);
    const fit = robustFit(points, 4, 2);
    return Array.from({ length: 65 }, (_, n) => { const x = a[0] + ((b[0] - a[0]) * n) / 64; return [x, fit(x)] as [number, number]; });
  };

  const toUV = ([x, y]: [number, number]): [number, number] => [x / width, y / height];
  const steps = (n: number) => Array.from({ length: n }, (_, i) => i / (n - 1));
  return {
    top: traceEnd(tl, tr, topSag).map(toUV),
    bottom: traceEnd(bl, br, bottomSag).map(toUV),
    left: steps(129).map((t) => { const y = tl[1] + t * (bl[1] - tl[1]); return toUV([leftAt(y), y]); }),
    right: steps(129).map((t) => { const y = tr[1] + t * (br[1] - tr[1]); return toUV([rightAt(y), y]); }),
  };
}

/** A calotte's printed rim: the first dark circle inward from the paper's edge, fitted as a circle. */
function calotteRim(image: Luminance, alpha: Uint8Array, guess: { x: number; y: number; r: number }): { x: number; y: number; r: number } {
  const { lum, width, height } = image;
  const at = (x: number, y: number) => lum[Math.min(height - 1, Math.max(0, Math.round(y))) * width + Math.min(width - 1, Math.max(0, Math.round(x)))];
  const paperAt = (x: number, y: number) => {
    const xi = Math.round(x), yi = Math.round(y);
    return xi >= 0 && yi >= 0 && xi < width && yi < height && alpha[yi * width + xi] > 200;
  };
  const points: [number, number][] = []; // relative to the guessed center, for a well-conditioned fit
  for (let k = 0; k < 720; k++) {
    const a = (k / 720) * Math.PI * 2;
    const dx = Math.cos(a), dy = Math.sin(a);
    // The paper's edge along this ray, then inward.
    let r = guess.r * 1.1;
    while (r > guess.r * 0.8 && !paperAt(guess.x + dx * r, guess.y + dy * r)) r--;
    const profile = Array.from({ length: Math.round(guess.r * 0.12) }, (_, i) => at(guess.x + dx * (r - i), guess.y + dy * (r - i)));
    const d = firstLine(profile, 10);
    if (d !== null) points.push([dx * (r - d), dy * (r - d)]);
  }
  // Kasa's algebraic circle fit, refitted without stray points.
  let kept = points;
  let fit = { x: 0, y: 0, r: guess.r };
  for (let pass = 0; pass < 6; pass++) {
    let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, sz = 0;
    for (const [x, y] of kept) {
      const z = x * x + y * y;
      sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sxz += x * z; syz += y * z; sz += z;
    }
    const n = kept.length;
    // Solve [sxx sxy sx; sxy syy sy; sx sy n] · [a b c] = [sxz syz sz]; center (a/2, b/2).
    const M = [[sxx, sxy, sx, sxz], [sxy, syy, sy, syz], [sx, sy, n, sz]];
    for (let c = 0; c < 3; c++) {
      for (let r = 0; r < 3; r++) {
        if (r === c) continue;
        const f = M[r][c] / M[c][c];
        for (let k = c; k < 4; k++) M[r][k] -= f * M[c][k];
      }
    }
    const [a, b, c] = M.map((row, i) => row[3] / row[i]);
    fit = { x: a / 2, y: b / 2, r: Math.sqrt(c + (a * a + b * b) / 4) };
    const residuals = kept.map(([x, y]) => Math.abs(Math.hypot(x - fit.x, y - fit.y) - fit.r));
    const next = kept.filter((_, i) => residuals[i] <= Math.max(3, median(residuals) * 4));
    if (next.length === kept.length) break;
    kept = next;
  }
  console.log(`  rim from ${kept.length} of ${points.length} rays`);
  return { x: guess.x + fit.x, y: guess.y + fit.y, r: fit.r };
}

/** A calotte's paper disc in the mask: centroid and the radius of a disc of equal area. */
function disc(bg: Mask): { x: number; y: number; r: number } {
  let sx = 0, sy = 0, count = 0;
  for (let y = 0; y < bg.height; y++) {
    for (let x = 0; x < bg.width; x++) {
      if (bg.mask[y * bg.width + x]) continue;
      sx += x; sy += y; count++;
    }
  }
  return { x: sx / count, y: sy / count, r: Math.sqrt(count / Math.PI) };
}

async function prepare(n: number): Promise<void> {
  const calotte = n > 24;
  const name = calotte ? `calotte-${n}` : `gore-${String(n).padStart(2, '0')}`;
  const file = `plates/assets-src/coronelli/${name}-native.jpg`;
  if (!(await access(file).then(() => true, () => false))) {
    console.log(`${name}: no master yet`);
    return;
  }
  console.log(name);
  const bg = await backgroundMask(file);
  const meta = await sharp(file, { limitInputPixels: false }).metadata();

  // The region of the scan that becomes the texture: a gore's whole scan, or the square around a
  // calotte's disc, so the pole sits at the texture's center.
  let region = { left: 0, top: 0, width: meta.width!, height: meta.height! };
  let maskRegion = { left: 0, top: 0, width: bg.width, height: bg.height };
  if (calotte) {
    const d = disc(bg);
    const half = Math.ceil(d.r * 1.02);
    const left = Math.max(0, Math.round(d.x - half)), top = Math.max(0, Math.round(d.y - half));
    const size = Math.min(2 * half, bg.width - left, bg.height - top);
    maskRegion = { left, top, width: size, height: size };
    region = {
      left: Math.round(left / MASK_SCALE), top: Math.round(top / MASK_SCALE),
      width: Math.min(Math.round(size / MASK_SCALE), meta.width! - Math.round(left / MASK_SCALE)),
      height: Math.min(Math.round(size / MASK_SCALE), meta.height! - Math.round(top / MASK_SCALE)),
    };
    region.width = region.height = Math.min(region.width, region.height);
  }

  const levels = calotte ? CALOTTE_LEVELS : GORE_LEVELS;
  const height = levels[levels.length - 1];
  const width = calotte ? height : Math.round((region.width * height) / region.height);

  const rgb = await sharp(file, { limitInputPixels: false })
    .extract(region)
    .resize(width, height, { kernel: 'lanczos3' })
    .removeAlpha()
    .raw()
    .toBuffer();

  // Alpha: the inverted bed mask, upsampled, feathered, and pulled in slightly so no grey fringe
  // survives at the paper's edge.
  const paperMask = new Uint8Array(maskRegion.width * maskRegion.height);
  for (let y = 0; y < maskRegion.height; y++) {
    for (let x = 0; x < maskRegion.width; x++) {
      paperMask[y * maskRegion.width + x] = bg.mask[(y + maskRegion.top) * bg.width + x + maskRegion.left] ? 0 : 255;
    }
  }
  const alphaSoft = await sharp(Buffer.from(paperMask), { raw: { width: maskRegion.width, height: maskRegion.height, channels: 1 } })
    .resize(width, height, { kernel: 'cubic' })
    .blur(1.2)
    .extractChannel(0) // sharp returns three channels after blur unless told otherwise
    .raw()
    .toBuffer({ resolveWithObject: true })
    .then(({ data, info }) => {
      if (info.channels !== 1) throw new Error(`alpha has ${info.channels} channels`);
      return data;
    });
  const alpha = new Uint8Array(width * height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = Math.round(Math.min(Math.max((alphaSoft[i] / 255 - 0.55) * 6, 0), 1) * 255);

  // Paper white: mean of the 92nd to 99th luminance percentile inside the sheet.
  const lum = new Float32Array(width * height);
  const inside: number[] = [];
  for (let i = 0; i < lum.length; i++) {
    if (alpha[i] < 255) continue;
    lum[i] = 0.2126 * toLinear[rgb[i * 3]] + 0.7152 * toLinear[rgb[i * 3 + 1]] + 0.0722 * toLinear[rgb[i * 3 + 2]];
    if (i % 5 === 0) inside.push(lum[i]);
  }
  inside.sort((a, b) => a - b);
  const lo = inside[Math.floor(inside.length * 0.92)];
  const hi = inside[Math.floor(inside.length * 0.99)];
  const sum = [0, 0, 0];
  let count = 0;
  for (let i = 0; i < lum.length; i++) {
    if (alpha[i] < 255 || lum[i] < lo || lum[i] > hi) continue;
    for (let c = 0; c < 3; c++) sum[c] += toLinear[rgb[i * 3 + c]];
    count++;
  }
  const paper = sum.map((s) => s / count);
  const gain = paper.map((p) => PAPER_ALBEDO / p);
  console.log(`  paper linear (${paper.map((p) => p.toFixed(3)).join(', ')}) → gain (${gain.map((g) => g.toFixed(3)).join(', ')})`);

  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    for (let c = 0; c < 3; c++) rgba[i * 4 + c] = toSRGB8(toLinear[rgb[i * 3 + c]] * gain[c]);
    rgba[i * 4 + 3] = alpha[i];
  }

  // Shape: a gore's printed borders, or a calotte's printed rim, in fractions of the texture.
  const image: Luminance = { lum: new Uint8Array(width * height), width, height };
  for (let i = 0; i < width * height; i++) image.lum[i] = Math.round(0.299 * rgb[i * 3] + 0.587 * rgb[i * 3 + 1] + 0.114 * rgb[i * 3 + 2]);
  let shape: Record<string, unknown>;
  let overlay: string;
  const s = 1024 / height; // check image scale
  if (calotte) {
    let sx = 0, sy = 0, area = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const a = alpha[y * width + x] / 255;
        sx += a * x; sy += a * y; area += a;
      }
    }
    const rim = calotteRim(image, alpha, { x: sx / area, y: sy / area, r: Math.sqrt(area / Math.PI) });
    shape = { disc: { center: [(rim.x + 0.5) / width, (rim.y + 0.5) / height], radius: rim.r / width } };
    overlay = `<circle cx="${rim.x * s}" cy="${rim.y * s}" r="${rim.r * s}" fill="none" stroke="#ff0000" stroke-width="1"/>`;
  } else {
    const border = goreBorders(image, alpha, n);
    shape = { border };
    const line = (points: [number, number][]) => `<polyline fill="none" stroke="#ff0000" stroke-width="1" points="${points.map(([u, v]) => `${(u * width * s).toFixed(1)},${(v * height * s).toFixed(1)}`).join(' ')}"/>`;
    overlay = [border.top, border.bottom, border.left, border.right].map(line).join('');
  }

  await mkdir(OUT, { recursive: true });
  const top = sharp(rgba, { raw: { width, height, channels: 4 } });
  for (const level of levels) {
    const image = level === height ? top.clone() : top.clone().resize({ height: level, kernel: 'lanczos3' });
    await image.webp({ quality: 92, alphaQuality: 100, effort: 5, smartSubsample: true }).toFile(`${OUT}/${name}-${level}.webp`);
  }
  const checkWidth = Math.round(width * s);
  await top.clone().resize({ height: 1024 }).flatten({ background: '#ff00ff' })
    .composite([{ input: Buffer.from(`<svg width="${checkWidth}" height="1024">${overlay}</svg>`), left: 0, top: 0 }])
    .png().toFile(`plates/assets-src/coronelli/${name}-check.png`);
  await writeFile(`${OUT}/${name}.json`, JSON.stringify({
    source: SOURCE,
    piece: n,
    kind: calotte ? 'calotte' : 'gore',
    hemisphere: n <= 12 || n === 26 ? 'south' : 'north',
    width, height, levels, paperLinear: paper, gain,
    ...shape,
  }));
  console.log(`  wrote ${OUT}/${name}-{${levels.join(',')}}.webp (${width} × ${height} at the top level)`);
}

const args = process.argv.slice(2);
const pieces = args[0] === 'all' ? Array.from({ length: 26 }, (_, i) => i + 1) : args.map(Number);
for (const n of pieces) await prepare(n);
