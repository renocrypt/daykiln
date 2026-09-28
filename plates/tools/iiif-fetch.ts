// Fetch a IIIF image at its native resolution by stitching full-size tiles.
//
// Some IIIF servers return soft images for scaled requests (for example `full/,8192/`), as if
// upscaled from a smaller derivative; their native tiles are sharp. Stitching native tiles and
// downsampling locally keeps the engraving intact.
//
// Usage: node plates/tools/iiif-fetch.ts <iiif-base-url> <output.jpg>
// Behind an HTTP proxy, set NODE_USE_ENV_PROXY=1 so Node's fetch honors HTTPS_PROXY.

import sharp from 'sharp';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const [base, output] = process.argv.slice(2);
if (!base || !output) {
  console.error('usage: node plates/tools/iiif-fetch.ts <iiif-base-url> <output.jpg>');
  process.exit(1);
}

const CONCURRENCY = 2; // polite to a collection server
const USER_AGENT = 'Plates (open-source, non-commercial art project) IIIF tile fetch';

type Info = { width: number; height: number; tiles?: { width: number; height?: number }[] };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Fetch with retries. A rate-limited server (429) is waited out, by its Retry-After when given. */
async function fetchWithRetry(url: string, tries = 10): Promise<Buffer> {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
      if (response.ok) return Buffer.from(await response.arrayBuffer());
      const error = new Error(`${response.status} ${url}`);
      if (attempt >= tries) throw error;
      const retryAfter = Number(response.headers.get('retry-after'));
      await sleep(retryAfter > 0 ? retryAfter * 1000 : Math.min(2000 * 2 ** (attempt - 1), 60000));
    } catch (error) {
      if (attempt >= tries) throw error;
      await sleep(Math.min(2000 * 2 ** (attempt - 1), 60000));
    }
  }
}

const info = JSON.parse((await fetchWithRetry(`${base}/info.json`)).toString()) as Info;
const tileW = info.tiles?.[0]?.width ?? 1024;
const tileH = info.tiles?.[0]?.height ?? tileW;
const cacheDir = `${output}.tiles`;
await mkdir(cacheDir, { recursive: true });

const jobs: { x: number; y: number; w: number; h: number; file: string }[] = [];
for (let y = 0; y < info.height; y += tileH) {
  for (let x = 0; x < info.width; x += tileW) {
    const w = Math.min(tileW, info.width - x);
    const h = Math.min(tileH, info.height - y);
    jobs.push({ x, y, w, h, file: join(cacheDir, `${x}_${y}.jpg`) });
  }
}

let done = 0;
async function worker(): Promise<void> {
  for (let job = jobs.shift(); job; job = jobs.shift()) {
    const cached = await access(job.file).then(() => true, () => false);
    if (!cached) {
      // `full` size at scale factor 1: the server returns native pixels.
      const tile = await fetchWithRetry(`${base}/${job.x},${job.y},${job.w},${job.h}/full/0/default.jpg`);
      await writeFile(job.file, tile);
    }
    tiles.push({ input: job.file, left: job.x, top: job.y });
    done++;
    if (done % 10 === 0) console.log(`${done} tiles`);
  }
}

const tiles: { input: string; left: number; top: number }[] = [];
const total = jobs.length;
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(`${total} tiles fetched; stitching ${info.width} × ${info.height}`);

await mkdir(dirname(output), { recursive: true });
await sharp({ create: { width: info.width, height: info.height, channels: 3, background: '#808080' }, limitInputPixels: false })
  .composite(tiles)
  .jpeg({ quality: 97, chromaSubsampling: '4:4:4' })
  .toFile(output);
console.log(`wrote ${output}`);
await readFile(output).then((b) => console.log(`${(b.length / 1e6).toFixed(1)} MB`));
