// A contact sheet of every gore's four detected corners, drawn over the top-level texture.
// Usage: node plates/tools/lookdev/corner-sheet.ts 1 12 out.png
import sharp from 'sharp';
import { readFileSync } from 'node:fs';

const [first, last, out] = process.argv.slice(2);
const size = 200, gap = 6;
const tiles = [];
let row = 0;
for (let n = Number(first); n <= Number(last); n++, row++) {
  const name = `gore-${String(n).padStart(2, '0')}`;
  const { width, height, border } = JSON.parse(readFileSync(`public/plates/assets/unfold/${name}.json`, 'utf8')) as { width: number; height: number; border: Record<string, [number, number][]> };
  const file = `public/plates/assets/unfold/${name}-${height}.webp`;
  const corners = [border.top[0], border.top[border.top.length - 1], border.bottom[0], border.bottom[border.bottom.length - 1]];
  for (const [i, [u, v]] of corners.entries()) {
    const left = Math.max(0, Math.min(width - size, Math.round(u * width - size / 2)));
    const top = Math.max(0, Math.min(height - size, Math.round(v * height - size / 2)));
    const lines = Object.values(border).map((points: [number, number][]) => `<polyline fill="none" stroke="#ff0000" stroke-width="1" points="${points.map(([pu, pv]) => `${(pu * width - left).toFixed(1)},${(pv * height - top).toFixed(1)}`).join(' ')}"/>`).join('');
    const svg = `<svg width="${size}" height="${size}">${lines}<text x="4" y="14" font-size="12" font-family="Menlo" fill="#0000ff">${n}${['tl', 'tr', 'bl', 'br'][i]}</text></svg>`;
    tiles.push({ input: await sharp(file).extract({ left, top, width: size, height: size }).flatten({ background: '#ff00ff' }).composite([{ input: Buffer.from(svg), left: 0, top: 0 }]).png().toBuffer(), left: i * (size + gap), top: row * (size + gap) });
  }
}
await sharp({ create: { width: 4 * (size + gap), height: row * (size + gap), channels: 3, background: '#ffffff' } }).composite(tiles).png().toFile(out);
