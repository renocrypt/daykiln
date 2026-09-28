// Draw a gore's detected printed borders over crops of its top-level texture, for checking by eye.
// Usage: node plates/tools/lookdev/border-crops.ts 12 23
import sharp from 'sharp';
import { readFileSync } from 'node:fs';

for (const n of process.argv.slice(2).map(Number)) {
  const name = `gore-${String(n).padStart(2, '0')}`;
  const info = JSON.parse(readFileSync(`public/plates/assets/unfold/${name}.json`, 'utf8'));
  const { width, height, border } = info as { width: number; height: number; border: Record<string, [number, number][]> };
  const file = `public/plates/assets/unfold/${name}-${height}.webp`;
  const size = 420;
  const spots: [string, number, number][] = [
    ['top left', border.top[0][0], border.top[0][1]],
    ['top right', border.top[border.top.length - 1][0], border.top[border.top.length - 1][1]],
    ['top middle', border.top[32][0], border.top[32][1]],
    ['left middle', border.left[64][0], border.left[64][1]],
    ['right middle', border.right[64][0], border.right[64][1]],
    ['bottom left', border.bottom[0][0], border.bottom[0][1]],
    ['bottom right', border.bottom[border.bottom.length - 1][0], border.bottom[border.bottom.length - 1][1]],
    ['bottom middle', border.bottom[32][0], border.bottom[32][1]],
  ];
  const tiles = [];
  for (const [i, [label, u, v]] of spots.entries()) {
    const left = Math.max(0, Math.min(width - size, Math.round(u * width - size / 2)));
    const top = Math.max(0, Math.min(height - size, Math.round(v * height - size / 2)));
    const lines = Object.values(border).map((points) => `<polyline fill="none" stroke="#ff0000" stroke-width="1.5" stroke-opacity="0.8" points="${points.map(([pu, pv]) => `${(pu * width - left).toFixed(1)},${(pv * height - top).toFixed(1)}`).join(' ')}"/>`).join('');
    const svg = `<svg width="${size}" height="${size}">${lines}<text x="8" y="20" font-size="16" font-family="Menlo" fill="#0000ff">${label}</text></svg>`;
    const tile = await sharp(file).extract({ left, top, width: size, height: size }).flatten({ background: '#ff00ff' }).composite([{ input: Buffer.from(svg), left: 0, top: 0 }]).png().toBuffer();
    tiles.push({ input: tile, left: (i % 4) * (size + 8), top: Math.floor(i / 4) * (size + 8) });
  }
  await sharp({ create: { width: 4 * (size + 8), height: 2 * (size + 8), channels: 3, background: '#ffffff' } }).composite(tiles).png().toFile(`plates/assets-src/lookdev/${name}-borders.png`);
  console.log(`plates/assets-src/lookdev/${name}-borders.png`);
}
