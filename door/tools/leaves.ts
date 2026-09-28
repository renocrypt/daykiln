// Prepare the six leaves of the door: one still of each work, cut to the album's window.
//
// The Plates' leaves share one window, 16:10, as the leaves of an album do; on a tall screen the
// page cuts that window down to 5:4 from the middle. Their stills are already 16:10. Yaobian's
// three are seen through round lenses, so their leaves are square, each composed for its circle:
// KILN is its look-development bowl drawn back from the camera until it sits whole inside the
// circle (door/assets-src/kiln-round.png); RULE is the middle of its dome, looked up into; PLUMB
// is its room's opening frame with the net brought to the middle (door/assets-src/plumb-round.png).
// Both captures are 2000 × 2000, with the room's words hidden.
//
// Each work's share card, 1200 × 630, is cut from the middle of a 16:10 window on its still, as
// JPEG, which every reader of cards takes. PLUMB's still is a capture of its room's opening frame
// at 3200 × 2000 (door/assets-src/plumb.png), cut to move the net toward the middle.
//
// Usage, from the project's root: node door/tools/leaves.ts

import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const OUT = 'public/door/leaves';
const CARDS = 'public/door/cards';
const CARD = { width: 1200, height: 630 };
const WIDTHS = [1280, 2160]; // the window at 1× and 2×; 2160 is the widest the 16:9 sources allow
const ROUND = [1080, 1440];  // a round window, 540 px across at most, at 2×; and on the tallest screens
const ASPECT = 1.6;

/**
 * A crop as fractions of the source: the window's left edge and its top, the rest follows from
 * 16:10. A round leaf is cut, square, from the middle of `round` instead; the card is still cut from `src`.
 */
type Leaf = { id: string; src: string; left?: number; top?: number; width?: number; round?: string };

const LEAVES: Leaf[] = [
  { id: 'unfold', src: 'public/plates/assets/plates/unfold.webp' },
  { id: 'wake', src: 'public/plates/assets/plates/wake.webp' },
  { id: 'same-sky', src: 'public/plates/assets/plates/same-sky.webp' },
  { id: 'kiln', src: 'public/yaobian/entrance/kiln.jpg', round: 'door/assets-src/kiln-round.png' },
  { id: 'rule', src: 'public/yaobian/entrance/rule-below.jpg', round: 'public/yaobian/entrance/rule-below.jpg' },
  { id: 'plumb', src: 'door/assets-src/plumb.png', left: 0.2, top: 0.12, width: 0.8, round: 'door/assets-src/plumb-round.png' },
];

await mkdir(OUT, { recursive: true });
await mkdir(CARDS, { recursive: true });

for (const leaf of LEAVES) {
  const meta = await sharp(leaf.src).metadata();
  const w = meta.width!, h = meta.height!;
  // The largest 16:10 window the source holds at the requested width, centred where unspecified.
  let cw = Math.round(w * (leaf.width ?? 1));
  let ch = Math.round(cw / ASPECT);
  if (ch > h) { ch = h; cw = Math.round(h * ASPECT); }
  const left = Math.round(leaf.left !== undefined ? w * leaf.left : (w - cw) / 2);
  const top = Math.round(leaf.top !== undefined ? h * leaf.top : (h - ch) / 2);

  if (leaf.round) {
    const r = await sharp(leaf.round).metadata();
    const side = Math.min(r.width!, r.height!);
    const box = { left: Math.round((r.width! - side) / 2), top: Math.round((r.height! - side) / 2), width: side, height: side };
    for (const width of ROUND) {
      const out = `${OUT}/${leaf.id}-${width}.webp`;
      const info = await sharp(leaf.round)
        .extract(box)
        .resize({ width, height: width, kernel: 'lanczos3' })
        .webp({ quality: 84, effort: 6, smartSubsample: true })
        .toFile(out);
      console.log(`${out}  ${info.width}×${info.height}  ${(info.size / 1024).toFixed(0)} kB  (from ${side}×${side} of ${r.width}×${r.height})`);
    }
  }

  for (const width of leaf.round ? [] : WIDTHS) {
    const out = `${OUT}/${leaf.id}-${width}.webp`;
    const info = await sharp(leaf.src)
      .extract({ left, top, width: cw, height: ch })
      .resize({ width, height: Math.round(width / ASPECT), kernel: 'lanczos3' })
      .webp({ quality: 84, effort: 6, smartSubsample: true })
      .toFile(out);
    console.log(`${out}  ${info.width}×${info.height}  ${(info.size / 1024).toFixed(0)} kB  (from ${cw}×${ch} of ${w}×${h})`);
  }

  // The card keeps the window's width and loses its top and bottom equally.
  const kh = Math.round((cw * CARD.height) / CARD.width);
  const card = `${CARDS}/${leaf.id}.jpg`;
  const info = await sharp(leaf.src)
    .extract({ left, top: top + Math.round((ch - kh) / 2), width: cw, height: kh })
    .resize({ ...CARD, kernel: 'lanczos3' })
    .jpeg({ quality: 84, mozjpeg: true })
    .toFile(card);
  console.log(`${card}  ${info.width}×${info.height}  ${(info.size / 1024).toFixed(0)} kB`);
}
