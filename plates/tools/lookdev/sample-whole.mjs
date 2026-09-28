import sharp from 'sharp';
const file = process.argv[2];
const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const px = (x, y) => { x = Math.round(x * 1.44); y = Math.round(y * 1.44); const i = (y * info.width + x) * 3; return [data[i], data[i + 1], data[i + 2]]; };
const avg = (x0, y0, w, h) => { const s = [0, 0, 0]; let n = 0; for (let y = y0; y < y0 + h; y += 2) for (let x = x0; x < x0 + w; x += 2) { const p = px(x, y); s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; n++; } return s.map((v) => Math.round(v / n)).join(','); };
console.log(`field ${avg(200, 200, 60, 60)} · lit ${avg(605, 700, 20, 20)} · mid ${avg(640, 330, 20, 16)} · away ${avg(1290, 880, 24, 24)} · limb ${avg(1395, 620, 10, 20)}`);
