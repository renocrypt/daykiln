// Zoomed crops of chosen gore corners with a coordinate grid, for reading corner positions by eye.
// Usage: node plates/tools/lookdev/corner-zoom.ts 1bl 2tl ...  (writes assets-src/lookdev/zoom-<id>.png)
import sharp from 'sharp';
import { readFileSync } from 'node:fs';

const SIZE = 240, SCALE = 3, STEP = 20;
for (const id of process.argv.slice(2)) {
  const n = Number(id.slice(0, -2)), which = id.slice(-2);
  const name = `gore-${String(n).padStart(2, '0')}`;
  const { width, height, border } = JSON.parse(readFileSync(`public/plates/assets/unfold/${name}.json`, 'utf8')) as { width: number; height: number; border: Record<string, [number, number][]> };
  const pick = { tl: border.top[0], tr: border.top[border.top.length - 1], bl: border.bottom[0], br: border.bottom[border.bottom.length - 1] }[which]!;
  const cx = Math.round(pick[0] * width), cy = Math.round(pick[1] * height);
  const left = Math.max(0, Math.min(width - SIZE, cx - SIZE / 2)), top = Math.max(0, Math.min(height - SIZE, cy - SIZE / 2));
  let grid = '';
  for (let g = Math.ceil(left / STEP) * STEP; g < left + SIZE; g += STEP) {
    const x = (g - left) * SCALE;
    grid += `<line x1="${x}" y1="0" x2="${x}" y2="${SIZE * SCALE}" stroke="#00a0ff" stroke-opacity="0.35"/>`;
    if (g % 40 === 0) grid += `<text x="${x + 2}" y="12" font-size="11" font-family="Menlo" fill="#0050ff">${g}</text>`;
  }
  for (let g = Math.ceil(top / STEP) * STEP; g < top + SIZE; g += STEP) {
    const y = (g - top) * SCALE;
    grid += `<line x1="0" y1="${y}" x2="${SIZE * SCALE}" y2="${y}" stroke="#00a0ff" stroke-opacity="0.35"/>`;
    if (g % 40 === 0) grid += `<text x="2" y="${y - 2}" font-size="11" font-family="Menlo" fill="#0050ff">${g}</text>`;
  }
  const dot = `<circle cx="${(cx - left) * SCALE}" cy="${(cy - top) * SCALE}" r="5" fill="none" stroke="#ff0000" stroke-width="2"/>`;
  const svg = `<svg width="${SIZE * SCALE}" height="${SIZE * SCALE}">${grid}${dot}<text x="${SIZE * SCALE - 150}" y="${SIZE * SCALE - 8}" font-size="14" font-family="Menlo" fill="#ff0000">${id} ${cx},${cy}</text></svg>`;
  await sharp(`public/plates/assets/unfold/${name}-${height}.webp`).extract({ left, top, width: SIZE, height: SIZE }).flatten({ background: '#ff00ff' })
    .resize(SIZE * SCALE, SIZE * SCALE, { kernel: 'nearest' }).composite([{ input: Buffer.from(svg), left: 0, top: 0 }]).png().toFile(`plates/assets-src/lookdev/zoom-${id}.png`);
}
