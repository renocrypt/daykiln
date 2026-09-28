// Make the entrance's wall: the kiln's bricked door that kiln.frag lights. It is Poly Haven's
// "Castle Brick 02 Red" (https://polyhaven.com/a/castle_brick_02_red, CC0), old handmade brick
// photographed, at 4K: its diffuse and displacement maps, cut to the 1536 × 1536 texels round the
// brick the eye is bored through, at 75 texels to the eye's radius. The shader takes the brick's
// slope from its height, so no normal map is sent.
//
// Usage, from the project's root: node door/tools/wall.ts

import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const ID = 'castle_brick_02_red';
const MAPS = `https://dl.polyhaven.org/file/ph-assets/Textures/jpg/4k/${ID}/${ID}`;
const OUT = 'public/door/wall';
const EYE = { x: 2107, y: 1857 }; // the middle of the brick the eye goes through, in the 4K maps
const SIZE = 1536;

const box = { left: EYE.x - SIZE / 2, top: EYE.y - SIZE / 2, width: SIZE, height: SIZE };
const get = async (map: string) => Buffer.from(await (await fetch(`${MAPS}_${map}_4k.jpg`)).arrayBuffer());

await mkdir(OUT, { recursive: true });
const albedo = await sharp(await get('diff')).extract(box).webp({ quality: 70, effort: 6 }).toFile(`${OUT}/albedo.webp`);
const height = await sharp(await get('disp')).extract(box).extractChannel(0).webp({ quality: 85, effort: 6 }).toFile(`${OUT}/height.webp`);
console.log(`${OUT}/albedo.webp  ${(albedo.size / 1024).toFixed(0)} kB`);
console.log(`${OUT}/height.webp  ${(height.size / 1024).toFixed(0)} kB`);
