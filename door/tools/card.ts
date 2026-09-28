// Make the door's share card, 1200 × 630, from a capture of the door in Chrome: the paper edition
// at rest, once the first leaf is laid in and labelled, at 1200 × 630 and 2×, with the edition's
// buttons hidden, so the card is the sheet as printed: the name, the first leaf in its window, its label.
// The capture is kept in $TMPDIR/daykiln/renders/card-2x.png, or named on the command line.
//
// Usage, from the project's root: node door/tools/card.ts [capture.png]

import sharp from 'sharp';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const CARD = { width: 1200, height: 630 };
const OUT = 'public/door/card.jpg';
const capture = process.argv[2] ?? resolve(process.env.TMPDIR ?? tmpdir(), 'daykiln', 'renders', 'card-2x.png');

const { width, height } = await sharp(capture).metadata();
if (width !== CARD.width * 2 || height !== CARD.height * 2) {
  throw new Error(`${capture} is ${width}×${height}; capture the door at ${CARD.width}×${CARD.height} and 2×`);
}
const info = await sharp(capture)
  .resize({ ...CARD, kernel: 'lanczos3' })
  .jpeg({ quality: 86, mozjpeg: true })
  .toFile(OUT);
console.log(`${OUT}  ${info.width}×${info.height}  ${(info.size / 1024).toFixed(0)} kB  (from ${capture})`);
