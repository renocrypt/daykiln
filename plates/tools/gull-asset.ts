// Prepare WAKE's gull from Julian Johnson-Mortimer's "seagull v1" (Sketchfab, CC BY 4.0).
//
// The source is a gull in flight, its wings raised in a V: a head, a body, a wing surface, and the
// flight and tail feathers as cards cut out by their textures' alpha. The cast needs its shapes and
// those cut-outs, nothing else: the feet (tucked in flight, and half the file), the colors, and the
// eye's texture go. What is kept is moved into the gull's body frame (src/wake/gull.ts: +x forward,
// +y up, +z to the right wing; meters), split into what the wingbeat moves and what it does not, and
// the three cut-outs are packed into one image, one channel each.
//
// Usage: node plates/tools/gull-asset.ts <seagull_v1.glb>
// Writes public/assets/wake/gull.glb and public/assets/wake/gull-alpha.webp.

import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';

const [source] = process.argv.slice(2);
if (!source) {
  console.error('usage: node plates/tools/gull-asset.ts <seagull_v1.glb>');
  process.exit(1);
}

// The source's units, to meters: its wing, flattened, spans a herring gull's 1.35 m. Its chord at
// the arm then comes to 0.2 m, as a herring gull's does.
const UNIT = 0.0395;
// Where the source's shoulder joints sit, in its units: at the quarter chord of the wing's root
// (+z forward) and the root's height (+y up), 1.0 either side of the midline (x).
const SOURCE_SHOULDER = { forward: 0.7, up: -0.3 };
// Where they sit in the body frame (src/wake/gull.ts, SHOULDER).
const SHOULDER = { x: 0.03, y: 0.03 };

// Source meshes by index, and which channel of the packed cut-out each reads: 0 feathers, 1 wing,
// 2 body; −1 for none.
const FEATHERS = 0, HEAD = 1, WING = 2, BODY = 3, EYE = 6;
const CUTOUT: Record<number, number> = { [FEATHERS]: 0, [HEAD]: -1, [WING]: 1, [BODY]: 2, [EYE]: -1 };

// --- Read the source -------------------------------------------------------------------------------

const glb = await readFile(source);
const jsonLength = glb.readUInt32LE(12);
const gltf = JSON.parse(glb.subarray(20, 20 + jsonLength).toString());
const bin = glb.subarray(20 + jsonLength + 8);

function accessor(i: number): Float32Array | Uint32Array | Uint16Array {
  const a = gltf.accessors[i], view = gltf.bufferViews[a.bufferView];
  const n = ({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 } as Record<string, number>)[a.type];
  const T = a.componentType === 5126 ? Float32Array : a.componentType === 5125 ? Uint32Array : Uint16Array;
  const offset = bin.byteOffset + (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
  if (view.byteStride && view.byteStride !== n * T.BYTES_PER_ELEMENT) throw new Error('interleaved attributes are not handled');
  return new T(bin.buffer.slice(offset, offset + a.count * n * T.BYTES_PER_ELEMENT));
}

type Part = { positions: number[]; normals: number[]; uvs: number[]; indices: number[]; channel: number };
const parts = { still: new Map<number, Part>(), beating: new Map<number, Part>() };
const partOf = (group: Map<number, Part>, channel: number) => {
  let p = group.get(channel);
  if (!p) group.set(channel, (p = { positions: [], normals: [], uvs: [], indices: [], channel }));
  return p;
};

/** Source coordinates to the body frame. */
const toBody = (x: number, y: number, z: number): [number, number, number] =>
  [(z - SOURCE_SHOULDER.forward) * UNIT + SHOULDER.x, (y - SOURCE_SHOULDER.up) * UNIT + SHOULDER.y, -x * UNIT];
const toBodyDirection = (x: number, y: number, z: number): [number, number, number] => [z, y, -x];

for (const mesh of [FEATHERS, HEAD, WING, BODY, EYE]) {
  const primitive = gltf.meshes[mesh].primitives[0];
  const P = accessor(primitive.attributes.POSITION) as Float32Array;
  const N = accessor(primitive.attributes.NORMAL) as Float32Array;
  const UV = accessor(primitive.attributes.TEXCOORD_0) as Float32Array;
  const I = accessor(primitive.indices);

  // Cards and shells, as connected pieces: a piece goes with the wingbeat or stays with the body as
  // a whole, so no feather is torn between the two. The tail's cards lie low and near the midline.
  const count = P.length / 3;
  const parent = Int32Array.from({ length: count }, (_, i) => i);
  const find = (i: number): number => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  for (let t = 0; t < I.length; t += 3) {
    const a = find(I[t]), b = find(I[t + 1]), c = find(I[t + 2]);
    parent[b] = a; parent[find(c)] = a;
  }
  const centre = new Map<number, [number, number, number, number]>();
  for (let i = 0; i < count; i++) {
    const r = find(i), c = centre.get(r) ?? [0, 0, 0, 0];
    c[0] += P[3 * i]; c[1] += P[3 * i + 1]; c[2] += P[3 * i + 2]; c[3]++;
    centre.set(r, c);
  }
  const beats = (root: number) => {
    if (mesh === HEAD || mesh === BODY || mesh === EYE) return false;
    if (mesh === WING) return true;
    const [x, y, , n] = centre.get(root)!;
    return !(Math.abs(x / n) < 3 && y / n < -1.5); // the tail
  };

  const channel = CUTOUT[mesh];
  const remap = new Map<string, number>();
  for (let t = 0; t < I.length; t += 3) {
    const tri = [I[t], I[t + 1], I[t + 2]];
    const group = beats(find(tri[0])) ? parts.beating : parts.still;
    const part = partOf(group, channel);
    for (const v of tri) {
      const key = `${group === parts.beating ? 'b' : 's'}${channel}:${mesh}:${v}`;
      let k = remap.get(key);
      if (k === undefined) {
        k = part.positions.length / 3;
        part.positions.push(...toBody(P[3 * v], P[3 * v + 1], P[3 * v + 2]));
        part.normals.push(...toBodyDirection(N[3 * v], N[3 * v + 1], N[3 * v + 2]));
        part.uvs.push(UV[2 * v], UV[2 * v + 1]);
        remap.set(key, k);
      }
      part.indices.push(k);
    }
  }
}

// --- The cut-outs, one channel each -------------------------------------------------------------------

const SIZE = 1024;
const alphas = await Promise.all([FEATHERS, WING, BODY].map(async (mesh) => {
  const image = gltf.images[gltf.textures[gltf.materials[gltf.meshes[mesh].primitives[0].material].pbrMetallicRoughness.baseColorTexture.index].source];
  const view = gltf.bufferViews[image.bufferView];
  const bytes = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
  return sharp(bytes).ensureAlpha().extractChannel('alpha').resize(SIZE, SIZE).raw().toBuffer();
}));
const packed = Buffer.alloc(SIZE * SIZE * 3);
for (let i = 0; i < SIZE * SIZE; i++) for (let c = 0; c < 3; c++) packed[3 * i + c] = alphas[c][i];
await sharp(packed, { raw: { width: SIZE, height: SIZE, channels: 3 } }).webp({ lossless: true }).toFile('public/plates/assets/wake/gull-alpha.webp');

// --- Write the glb ----------------------------------------------------------------------------------------

const chunks: Buffer[] = [];
const views: object[] = [], accessors: object[] = [];
let byteLength = 0;
function push(data: Float32Array | Uint16Array | Uint32Array, type: string, componentType: number, target: number, minmax = false): number {
  const bytes = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  const pad = (4 - (bytes.length % 4)) % 4;
  views.push({ buffer: 0, byteOffset: byteLength, byteLength: bytes.length, target });
  chunks.push(bytes, Buffer.alloc(pad));
  byteLength += bytes.length + pad;
  const n = ({ SCALAR: 1, VEC2: 2, VEC3: 3 } as Record<string, number>)[type];
  const acc: Record<string, unknown> = { bufferView: views.length - 1, componentType, count: data.length / n, type };
  if (minmax) {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < data.length; i++) { min[i % 3] = Math.min(min[i % 3], data[i]); max[i % 3] = Math.max(max[i % 3], data[i]); }
    Object.assign(acc, { min, max });
  }
  accessors.push(acc);
  return accessors.length - 1;
}

const channelNames = ['feathers', 'wing', 'body'];
const materials: object[] = [];
const materialOf = (channel: number) => {
  const name = channel < 0 ? 'solid' : channelNames[channel];
  let i = materials.findIndex((m) => (m as { name: string }).name === name);
  if (i < 0) { materials.push({ name, doubleSided: true, extras: { cutout: channel } }); i = materials.length - 1; }
  return i;
};
const meshes = (['still', 'beating'] as const).map((name) => ({
  name,
  primitives: [...parts[name].values()].map((p) => {
    const vertexCount = p.positions.length / 3;
    const Index = vertexCount < 65536 ? Uint16Array : Uint32Array;
    return {
      attributes: {
        POSITION: push(new Float32Array(p.positions), 'VEC3', 5126, 34962, true),
        NORMAL: push(new Float32Array(p.normals), 'VEC3', 5126, 34962),
        TEXCOORD_0: push(new Float32Array(p.uvs), 'VEC2', 5126, 34962),
      },
      indices: push(new Index(p.indices), 'SCALAR', Index === Uint16Array ? 5123 : 5125, 34963),
      material: materialOf(p.channel),
    };
  }),
}));

const json = {
  asset: {
    version: '2.0', generator: 'Plates tools/gull-asset.ts',
    extras: { title: 'seagull v1', author: 'Julian Johnson-Mortimer', source: 'https://sketchfab.com/3d-models/seagull-v1-f3fa166ff6bd4ffe8133f6f6eed74d64', license: 'CC BY 4.0' },
  },
  scene: 0, scenes: [{ nodes: [0, 1] }],
  nodes: meshes.map((m, i) => ({ name: m.name, mesh: i })),
  meshes, materials, accessors, bufferViews: views, buffers: [{ byteLength }],
};
const jsonBytes = Buffer.from(JSON.stringify(json));
const jsonPadded = Buffer.concat([jsonBytes, Buffer.alloc((4 - (jsonBytes.length % 4)) % 4, 0x20)]);
const binBytes = Buffer.concat(chunks);
const header = Buffer.alloc(12), jsonHeader = Buffer.alloc(8), binHeader = Buffer.alloc(8);
header.write('glTF', 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + jsonPadded.length + 8 + binBytes.length, 8);
jsonHeader.writeUInt32LE(jsonPadded.length, 0); jsonHeader.write('JSON', 4);
binHeader.writeUInt32LE(binBytes.length, 0); binHeader.write('BIN\0', 4);
await writeFile('public/plates/assets/wake/gull.glb', Buffer.concat([header, jsonHeader, jsonPadded, binHeader, binBytes]));

for (const name of ['still', 'beating'] as const) {
  for (const p of parts[name].values()) console.log(`${name} ${p.channel < 0 ? 'solid' : channelNames[p.channel]}: ${p.positions.length / 3} vertices, ${p.indices.length / 3} triangles`);
}
