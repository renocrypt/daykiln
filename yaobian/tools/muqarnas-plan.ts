// Reads the plan of the Two Sisters' muqarnas dome from Jones and Goury's Plate X (1842, public
// domain) into pieces, and raises them into the dome's underside.
//
//   node yaobian/tools/muqarnas-plan.ts [scan] [out-dir]
//
// In the engraving the pieces are black and the joints between them white. Each black region is
// one piece. A piece's tier is its distance, in pieces, from the dome's rim: the rule the plan
// encodes, since each tier hangs from the one below. Seen from below every surface of a muqarnas
// faces down or stands vertical, so the underside is a height over the plan: inside each piece it
// rises along the pieces' common curve, a quarter circle, from the edge it shares with the tier
// below to the edge it shares with the tier above. The tiers' heights follow a profile; that
// profile is a model, not a survey.
//
// Outputs, all over the plan's pixels: the piece of every pixel (joints included, grown from the
// nearest piece), the joint mask, each piece's tier, and the height in tiers. Plus a JSON summary
// and debug images.

import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';

const scan = process.argv[2] ?? 'yaobian/assets-src/jones/p99.jpg';
const out = process.argv[3] ?? 'yaobian/assets-src/jones/plan';
await mkdir(out, { recursive: true });

// 1. The plan's region of the page, in grey.
const page = sharp(scan).greyscale();
const meta = await page.metadata();
const W0 = meta.width!, H0 = meta.height!;
const full = await page.raw().toBuffer();
// The plan is the large dark block in the lower half, away from the binding's shadow.
let bx0 = W0, bx1 = 0, by0 = H0, by1 = 0;
{
  const step = 4;
  for (let y = Math.round(H0 * 0.5); y < H0 * 0.95; y += step) {
    for (let x = Math.round(W0 * 0.2); x < W0 * 0.8; x += step) {
      // A dark pixel with dark neighbours: inside the plan, not a speck.
      let dark = 0;
      for (let dy = -8; dy <= 8; dy += 8) for (let dx = -8; dx <= 8; dx += 8) if (full[(y + dy) * W0 + x + dx] < 90) dark++;
      if (dark >= 7) { bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y); }
    }
  }
}
const pad = 12;
bx0 -= pad; by0 -= pad; bx1 += pad; by1 += pad;
const W = bx1 - bx0, H = by1 - by0;
const grey = new Uint8Array(W * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) grey[y * W + x] = full[(y + by0) * W0 + x + bx0];
console.log(`plan ${W} × ${H} px at (${bx0}, ${by0})`);

// The plan is drawn in halves, a convention: the upper half shows the pieces, the lower half a
// coarser plan of the level below. The dome has the octagon's symmetry, eight mirrors, so one
// wedge of the upper half, 22.5° from the vertical axis toward the upper left corner, is folded
// out into the whole. The fold also averages away the engraver's hand where the halves of a
// mirrored piece disagree.
const FOLD = !process.argv.includes('--no-fold');

// 2. The octagon: the dark region's extent along the eight directions, trimmed of outliers.
const dirs: [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1], [Math.SQRT1_2, Math.SQRT1_2], [-Math.SQRT1_2, Math.SQRT1_2], [-Math.SQRT1_2, -Math.SQRT1_2], [Math.SQRT1_2, -Math.SQRT1_2]];
const extent = dirs.map(([dx, dy]) => {
  const values: number[] = [];
  for (let y = 0; y < H; y += 3) for (let x = 0; x < W; x += 3) if (grey[y * W + x] < 90) values.push(x * dx + y * dy);
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length * 0.9995)];
});
const cx = (extent[0] - extent[2]) / 2, cy = (extent[1] - extent[3]) / 2;
const across = (extent[0] + extent[2] + extent[1] + extent[3]) / 2; // mean width across the flats
console.log(`octagon center (${cx.toFixed(0)}, ${cy.toFixed(0)}), across the flats ${across.toFixed(0)} px`);
// A regular octagon about the center, so the fold is exact.
const apothem = across / 2;
const insideOctagon = (x: number, y: number, margin = 0) => dirs.every(([dx, dy]) => (x - cx) * dx + (y - cy) * dy <= apothem - margin);
if (FOLD) {
  const src = Uint8Array.from(grey);
  const bilinear = (x: number, y: number) => {
    const x0 = Math.max(0, Math.min(W - 2, Math.floor(x))), y0 = Math.max(0, Math.min(H - 2, Math.floor(y)));
    const fx = x - x0, fy = y - y0, k = y0 * W + x0;
    return (src[k] * (1 - fx) + src[k + 1] * fx) * (1 - fy) + (src[k + W] * (1 - fx) + src[k + W + 1] * fx) * fy;
  };
  const deg = Math.PI / 180;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = x - cx, dy = cy - y; // y up
    const r = Math.hypot(dx, dy);
    const phi = Math.atan2(dy, dx) / deg; // 90 is up
    let a = (((phi - 90 + 22.5) % 45) + 45) % 45 - 22.5; // into [-22.5, 22.5)
    a = Math.abs(a); // mirror
    const phiSource = (90 + a) * deg; // the wedge from up toward the upper left
    grey[y * W + x] = bilinear(cx + r * Math.cos(phiSource), cy - r * Math.sin(phiSource));
  }
  console.log('folded the upper-left wedge into eightfold symmetry');
}

// 3. Pieces and joints. Black is piece; white inside the octagon is joint, or a white-filled
// piece where it is too wide to be a line.
const inside = new Uint8Array(W * H);
const black = new Uint8Array(W * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const k = y * W + x;
  inside[k] = insideOctagon(x, y, 2) ? 1 : 0;
  black[k] = inside[k] && grey[k] < 128 ? 1 : 0;
}
// Distance from each white pixel to the nearest black one, by two chamfer passes.
const INF = 1e9;
function chamfer(seed: (k: number) => boolean, within: (k: number) => boolean): Float32Array {
  const d = new Float32Array(W * H).fill(INF);
  for (let k = 0; k < W * H; k++) if (seed(k)) d[k] = 0;
  const a = 1, b = Math.SQRT2;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = y * W + x;
    if (!within(k) || d[k] === 0) continue;
    let v = d[k];
    if (x > 0) v = Math.min(v, d[k - 1] + a);
    if (y > 0) { v = Math.min(v, d[k - W] + a); if (x > 0) v = Math.min(v, d[k - W - 1] + b); if (x < W - 1) v = Math.min(v, d[k - W + 1] + b); }
    d[k] = v;
  }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
    const k = y * W + x;
    if (!within(k) || d[k] === 0) continue;
    let v = d[k];
    if (x < W - 1) v = Math.min(v, d[k + 1] + a);
    if (y < H - 1) { v = Math.min(v, d[k + W] + a); if (x < W - 1) v = Math.min(v, d[k + W + 1] + b); if (x > 0) v = Math.min(v, d[k + W - 1] + b); }
    d[k] = v;
  }
  return d;
}
const toBlack = chamfer((k) => black[k] === 1, (k) => inside[k] === 1);
// A joint is at most this many pixels from a piece on either side; wider white is a piece.
const lineHalf = 5;
const whiteFill = new Uint8Array(W * H);
{
  // White pixels far from black seed white-filled regions; grow them back by the same distance.
  const core = new Uint8Array(W * H);
  for (let k = 0; k < W * H; k++) if (inside[k] && !black[k] && toBlack[k] > lineHalf) core[k] = 1;
  const toCore = chamfer((k) => core[k] === 1, (k) => inside[k] === 1);
  for (let k = 0; k < W * H; k++) if (inside[k] && !black[k] && toCore[k] <= lineHalf - 1) whiteFill[k] = 1;
}

// Connected components, 4-connected, of black pieces and of white-filled pieces separately.
const label = new Int32Array(W * H).fill(-1);
const pieceArea: number[] = [];
const pieceWhite: number[] = [];
{
  const stack = new Int32Array(W * H);
  const fill = (mask: Uint8Array, white: number) => {
    for (let s = 0; s < W * H; s++) {
      if (!mask[s] || label[s] >= 0) continue;
      const id = pieceArea.length;
      let top = 0, area = 0;
      stack[top++] = s; label[s] = id;
      while (top) {
        const k = stack[--top];
        area++;
        const x = k % W;
        const ns = [x > 0 ? k - 1 : -1, x < W - 1 ? k + 1 : -1, k - W, k + W];
        for (const m of ns) if (m >= 0 && m < W * H && mask[m] && label[m] < 0) { label[m] = id; stack[top++] = m; }
      }
      pieceArea.push(area);
      pieceWhite.push(white);
    }
  };
  fill(black, 0);
  fill(whiteFill, 1);
}
// Specks are not pieces: merge them into joints.
const MIN_AREA = 60; // px²
for (let k = 0; k < W * H; k++) if (label[k] >= 0 && pieceArea[label[k]] < MIN_AREA) label[k] = -1;
const pieces = pieceArea.filter((a) => a >= MIN_AREA).length;
console.log(`pieces ${pieces} (${pieceWhite.filter((w, i) => w && pieceArea[i] >= MIN_AREA).length} white-filled), specks dropped ${pieceArea.length - pieces}`);

// 4. Grow every piece across the joints to the middle, so each joint pixel knows the pieces either
// side; record which pieces touch.
const owner = Int32Array.from(label);
const joint = new Uint8Array(W * H);
{
  let frontier: number[] = [];
  for (let k = 0; k < W * H; k++) {
    if (!inside[k]) continue;
    if (owner[k] < 0) joint[k] = 1;
    else frontier.push(k);
  }
  while (frontier.length) {
    const next: number[] = [];
    for (const k of frontier) {
      const x = k % W;
      for (const m of [x > 0 ? k - 1 : -1, x < W - 1 ? k + 1 : -1, k - W, k + W]) {
        if (m < 0 || m >= W * H || !inside[m] || owner[m] >= 0) continue;
        owner[m] = owner[k];
        next.push(m);
      }
    }
    frontier = next;
  }
}
const neighbors = new Map<number, Set<number>>();
const touch = (a: number, b: number) => {
  if (a === b || a < 0 || b < 0) return;
  (neighbors.get(a) ?? neighbors.set(a, new Set()).get(a)!).add(b);
  (neighbors.get(b) ?? neighbors.set(b, new Set()).get(b)!).add(a);
};
for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) {
  const k = y * W + x;
  if (!inside[k]) continue;
  touch(owner[k], owner[k + 1]);
  touch(owner[k], owner[k + W]);
}

// 5. Tiers: the number of pieces between a piece and the dome's rim, found breadth first. The
// engraving draws some pieces white: the frames of the sixteen deep cavities and the pinwheels
// around the small stars. A white piece is a steep wall, so stepping into it, or through it into
// what it encloses, counts CAVITY tiers instead of one. Pieces reachable around a frame keep
// their low count; only what a frame encloses is carried deep into the dome.
const CAVITY = 3;
const baseTier = new Int32Array(pieceArea.length).fill(-1);
const tier = new Int32Array(pieceArea.length).fill(-1);
{
  const rim: number[] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = y * W + x;
    if (inside[k] && !insideOctagon(x, y, 14) && owner[k] >= 0 && baseTier[owner[k]] < 0) { baseTier[owner[k]] = 0; rim.push(owner[k]); }
  }
  const queue = rim.slice();
  for (let head = 0; head < queue.length; head++) {
    const p = queue[head];
    for (const q of neighbors.get(p) ?? []) if (baseTier[q] < 0) { baseTier[q] = baseTier[p] + 1; queue.push(q); }
  }
  // Weighted: a bucket queue over small integer costs.
  const buckets: number[][] = [];
  for (const p of rim) { tier[p] = 0; (buckets[0] ??= []).push(p); }
  for (let c = 0; c < buckets.length; c++) {
    for (const p of buckets[c] ?? []) {
      if (tier[p] !== c) continue;
      for (const q of neighbors.get(p) ?? []) {
        const step = pieceWhite[q] || pieceWhite[p] ? CAVITY : 1;
        const t = c + step;
        if (tier[q] < 0 || t < tier[q]) { tier[q] = t; (buckets[t] ??= []).push(q); }
      }
    }
  }
}
const baseMaxTier = baseTier.reduce((m, v) => Math.max(m, v), 0);
// The frames are drawn as separate brackets, gaps at the corners, so a path around them can slip
// through a gap. What a frame encloses is known instead by its boundary: a piece whose outline
// mostly touches white pieces is a cavity's floor, carried two steps deep; the white pieces
// around it, its walls, one step.
{
  const edge = new Float64Array(pieceArea.length), whiteEdge = new Float64Array(pieceArea.length);
  for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) {
    const k = y * W + x;
    if (!inside[k]) continue;
    for (const m of [k + 1, k + W]) {
      const a = owner[k], b = owner[m];
      if (a < 0 || b < 0 || a === b || !inside[m]) continue;
      edge[a]++; edge[b]++;
      if (pieceWhite[b]) whiteEdge[a]++;
      if (pieceWhite[a]) whiteEdge[b]++;
    }
  }
  let floors = 0;
  const wall = new Uint8Array(pieceArea.length);
  for (let p = 0; p < pieceArea.length; p++) {
    if (pieceWhite[p] || !edge[p] || whiteEdge[p] / edge[p] < 0.5) continue;
    tier[p] = Math.max(tier[p], baseTier[p] + 2 * CAVITY);
    for (const q of neighbors.get(p) ?? []) if (pieceWhite[q]) wall[q] = 1;
    floors++;
  }
  for (let q = 0; q < pieceArea.length; q++) if (wall[q]) tier[q] = Math.max(tier[q], baseTier[q] + CAVITY);
  console.log(`cavity floors ${floors}, walls ${wall.reduce((a, v) => a + v, 0)}`);
}
const maxTier = tier.reduce((m, v) => Math.max(m, v), 0);
console.log(`tiers 0 … ${baseMaxTier} from the rim; ${maxTier} with the cavities' depth`);

// 6. Height inside each piece: from the edge it shares with the tier below (0) to the edge it shares
// with the tier above (1), along a quarter circle. A piece with no tier above is a cap and rises to
// its middle; the rim's pieces start from the rim.
const lowSeed = (k: number) => {
  if (!inside[k]) return false;
  const p = owner[k];
  if (p < 0) return false;
  const x = k % W, y = (k - x) / W;
  if (!insideOctagon(x, y, 3)) return tier[p] === 0;
  for (const m of [k - 1, k + 1, k - W, k + W]) { const q = owner[m]; if (q >= 0 && q !== p && tier[q] < tier[p]) return true; }
  return false;
};
const highSeed = (k: number) => {
  if (!inside[k]) return false;
  const p = owner[k];
  if (p < 0) return false;
  for (const m of [k - 1, k + 1, k - W, k + W]) { const q = owner[m]; if (q >= 0 && q !== p && tier[q] > tier[p]) return true; }
  return false;
};
// Distances within a piece only: chamfer passes that do not cross into another piece.
function within(seed: (k: number) => boolean): Float32Array {
  const d = new Float32Array(W * H).fill(INF);
  for (let k = 0; k < W * H; k++) if (seed(k)) d[k] = 0;
  const pass = (forward: boolean) => {
    const ys = forward ? [0, H, 1] : [H - 1, -1, -1];
    for (let y = ys[0]; y !== ys[1]; y += ys[2]) {
      for (let x = forward ? 0 : W - 1; forward ? x < W : x >= 0; x += forward ? 1 : -1) {
        const k = y * W + x;
        if (!inside[k] || d[k] === 0) continue;
        const p = owner[k];
        let v = d[k];
        const s = forward ? -1 : 1;
        const cand = [[x + s, y, 1], [x, y + s, 1], [x + s, y + s, Math.SQRT2], [x - s, y + s, Math.SQRT2]] as const;
        for (const [nx, ny, c] of cand) {
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const m = ny * W + nx;
          if (owner[m] === p) v = Math.min(v, d[m] + c);
        }
        d[k] = v;
      }
    }
  };
  pass(true); pass(false); pass(true); pass(false);
  return d;
}
const dLow = within(lowSeed);
const dHigh = within(highSeed);
const height = new Float32Array(W * H);
for (let k = 0; k < W * H; k++) {
  if (!inside[k]) { height[k] = 0; continue; }
  const p = owner[k];
  if (p < 0) { height[k] = 0; continue; }
  const lo = dLow[k], hi = dHigh[k];
  let t: number;
  if (hi >= INF / 2 && lo >= INF / 2) t = 1;
  else if (hi >= INF / 2) t = Math.min(1, lo / Math.max(8, Math.sqrt(pieceArea[label[k] >= 0 ? label[k] : p]) * 0.5)); // a cap
  else if (lo >= INF / 2) t = 1; // no tier below touches it: already at its top
  else t = lo + hi > 0 ? lo / (lo + hi) : 0.5; // a pixel touching both the tier below and above: a sharp corner
  const rise = Math.sqrt(Math.max(0, 1 - (1 - t) * (1 - t))); // quarter circle: vertical at the low edge, level at the high
  height[k] = tier[p] + rise;
}

// 7. Write the fields and the debug images.
const level = new Uint8Array(W * H);
const pieceId = new Uint16Array(W * H);
for (let k = 0; k < W * H; k++) {
  level[k] = inside[k] && owner[k] >= 0 ? Math.min(255, tier[owner[k]] + 1) : 0; // 0 outside
  pieceId[k] = inside[k] && owner[k] >= 0 ? owner[k] + 1 : 0;
}
await writeFile(`${out}/height.f32`, Buffer.from(height.buffer));
// Each piece's tier, indexed by its id in piece.u16 (0 is none).
const tiers = new Uint8Array(pieceArea.length + 1);
for (let i = 0; i < pieceArea.length; i++) tiers[i + 1] = Math.max(0, tier[i]);
await writeFile(`${out}/tier.u8`, Buffer.from(tiers.buffer));
// Whether each piece is drawn white-filled in the engraving, indexed the same way.
const whites = new Uint8Array(pieceArea.length + 1);
for (let i = 0; i < pieceArea.length; i++) whites[i + 1] = pieceWhite[i];
await writeFile(`${out}/white.u8`, Buffer.from(whites.buffer));
await writeFile(`${out}/piece.u16`, Buffer.from(pieceId.buffer));
// The pieces as drawn, joints excluded: what tools/muqarnas-pieces.ts traces into polygons.
const drawn = new Uint16Array(W * H);
for (let k = 0; k < W * H; k++) drawn[k] = inside[k] && label[k] >= 0 ? label[k] + 1 : 0;
await writeFile(`${out}/label.u16`, Buffer.from(drawn.buffer));
await writeFile(`${out}/joint.u8`, Buffer.from(joint.buffer));
await writeFile(`${out}/plan.json`, JSON.stringify({
  source: 'Jones and Goury, Plans, Elevations, Sections, and Details of the Alhambra, vol. 1 (1842), Plate X, page 99 of the Internet Archive scan Planselevations1Gour',
  width: W, height: H, center: [cx, cy], acrossFlats: across, pieces, pieceIds: pieceArea.length, maxTier, baseMaxTier, cavityStep: CAVITY, folded: FOLD,
  tierAreas: Array.from({ length: maxTier + 1 }, (_, t) => pieceArea.filter((a, i) => tier[i] === t && a >= MIN_AREA).length),
}, null, 2));

const hue = (i: number) => { const h = (i * 0.618034) % 1; return [0.5 + 0.5 * Math.cos(6.283 * h), 0.5 + 0.5 * Math.cos(6.283 * (h + 0.33)), 0.5 + 0.5 * Math.cos(6.283 * (h + 0.67))]; };
const rgbPieces = Buffer.alloc(W * H * 3), rgbTier = Buffer.alloc(W * H * 3), rgbHeight = Buffer.alloc(W * H * 3);
for (let k = 0; k < W * H; k++) {
  if (!inside[k]) continue;
  const p = owner[k];
  if (p < 0) continue;
  const c = hue(p).map((v) => (joint[k] ? 0.15 : v) * 255);
  rgbPieces.set(c, k * 3);
  const t = tier[p] / maxTier;
  const ct = [t, 0.35 + 0.5 * Math.sin(3.14 * t), 1 - t].map((v) => v * (joint[k] ? 120 : 255));
  rgbTier.set(ct, k * 3);
  // Height lit from the upper left, as a relief.
  const x = k % W;
  const hx = x < W - 1 ? height[k + 1] - height[k] : 0, hy = k + W < W * H ? height[k + W] - height[k] : 0;
  const shade = 0.55 + 0.45 * Math.max(-1, Math.min(1, (-hx - hy) * 1.5));
  const base = height[k] / (maxTier + 1);
  const v = Math.round(255 * Math.min(1, shade * (0.35 + 0.65 * base)));
  rgbHeight.set([v, v, v], k * 3);
}
for (const [name, buf] of [['pieces', rgbPieces], ['tiers', rgbTier], ['height', rgbHeight]] as const) {
  await sharp(buf, { raw: { width: W, height: H, channels: 3 } }).png().toFile(`${out}/debug-${name}.png`);
}
console.log(`wrote ${out}`);
