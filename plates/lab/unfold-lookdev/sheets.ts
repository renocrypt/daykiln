// Coronelli's sheets on the globe: 24 gores and 2 polar calottes, where each lies on the sphere, and
// their prints, which load at the resolution the view needs.
//
// Placement follows the collection's numbering. Southern gores 1–12 run eastward with the equator at
// the top of the print; northern gore 12 + k lies above southern gore k, with the equator at the
// bottom of its print. Gore 12 spans 0°–30° of the scene's longitude. A gore's printed borders are
// its bounding meridians and parallels, and a Coons patch between them (coons.ts) places every
// point in between. A calotte is taken as an azimuthal equidistant disc from its pole to its
// printed 70° circle. The paper's margins, outside the borders, are trimmed as a globe maker would.

import * as THREE from 'three/webgpu';
import type { Node } from 'three/webgpu';
import { mix, texture, uniform } from 'three/tsl';
import { damp } from '../../src/core/damp.ts';
import { coons } from './coons.ts';
import type { Borders, Point } from './coons.ts';

export const deg = THREE.MathUtils.degToRad;

export const R = 0.535; // m: Coronelli's 42-inch globe is about 1.07 m across
export const PAPER = R + 0.0004; // the paper's radius, a little proud of the plaster
export const GORE_SPAN = deg(30);
export const GORE_DEPTH = deg(70); // from the equator to the edge of the polar calotte
export const CALOTTE_DEPTH = deg(20); // from the pole to 70°

export type SheetInfo = {
  piece: number;
  kind: 'gore' | 'calotte';
  hemisphere: 'north' | 'south';
  width: number; // pixels at the top level
  height: number;
  levels: number[]; // texture heights, one file each
  border?: Borders; // gores: printed borders, in fractions of the texture with v down
  disc?: { center: [number, number]; radius: number }; // calottes: the printed 70° circle, in fractions of the texture
};

export function sphere(lat: number, lon: number, radius: number): THREE.Vector3 {
  return new THREE.Vector3(radius * Math.cos(lat) * Math.sin(lon), radius * Math.sin(lat), radius * Math.cos(lat) * Math.cos(lon));
}

export function sheetName(piece: number): string {
  return piece > 24 ? `calotte-${piece}` : `gore-${String(piece).padStart(2, '0')}`;
}

/** West edge of a gore: southern gore k and northern gore 12 + k share a span, gore 12 at 0°–30°. */
export function goreWest(piece: number): number {
  return ((((piece - 1) % 12) + 1) - 12) * GORE_SPAN;
}

function gridIndex(cols: number, lines: number): number[] {
  const index: number[] = [];
  for (let j = 0; j < lines; j++) {
    for (let i = 0; i < cols; i++) {
      const a = j * (cols + 1) + i, b = a + 1, c = a + cols + 1, d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }
  return index;
}

export type Hinge = { C: THREE.Vector3; N: THREE.Vector3; east: THREE.Vector3; south: THREE.Vector3 };

export type GoreShape = {
  geometry: THREE.BufferGeometry;
  /** Meters of paper per unit of texture coordinate, across and down the sheet. */
  metersPerUV: THREE.Vector2;
  /** Vertices spread evenly over the sheet, for judging how much of the print the view needs. */
  samples: number[];
  /** For a gore that peels: vertex positions on the sphere and laid flat, and distance past the hinge. */
  peel?: { sphere: Float32Array; flat: Float32Array; along: Float32Array; hinge: Hinge };
};

/**
 * A gore on the sphere. A gore that peels also gets its flat print, laid in the plane tangent at
 * the hinge latitude: x across the sheet, y down it, toward the pole, in the print's own geometry.
 */
export function goreShape(info: SheetInfo, options: { cols: number; lines: number; hinge?: number }): GoreShape {
  const border = info.border!;
  const north = info.hemisphere === 'north';
  const pixels = ([u, v]: Point) => new THREE.Vector2(u * info.width, v * info.height); // print pixels, y down
  // Scale: a gore's central meridian is printed true to length, 70° of arc.
  const metersPerPixel = (R * GORE_DEPTH) / pixels(coons(border, 0.5, 0)).distanceTo(pixels(coons(border, 0.5, 1)));
  const { cols, lines } = options;
  const count = (cols + 1) * (lines + 1);
  const position = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const geo = new Float32Array(count * 2);
  const west = goreWest(info.piece);

  let peel: GoreShape['peel'];
  let hinge: Hinge | undefined;
  let hingePrint = new THREE.Vector2(), right = new THREE.Vector2(), down = new THREE.Vector2();
  if (options.hinge !== undefined) {
    const lonC = west + GORE_SPAN / 2;
    const C = sphere(options.hinge, lonC, PAPER);
    const N = C.clone().normalize();
    const east = new THREE.Vector3(Math.cos(lonC), 0, -Math.sin(lonC));
    const south = new THREE.Vector3().crossVectors(east, N).normalize(); // east × up points south
    hinge = { C, N, east, south };
    // The print's own frame at the hinge: down its central meridian, and across to the east.
    const tHinge = options.hinge / -GORE_DEPTH;
    hingePrint = pixels(coons(border, 0.5, tHinge));
    down = pixels(coons(border, 0.5, tHinge + 0.01)).sub(pixels(coons(border, 0.5, tHinge - 0.01))).normalize();
    right = new THREE.Vector2(-down.y, down.x).negate(); // down turned a quarter toward the east side
    if (pixels(coons(border, 1, tHinge)).sub(hingePrint).dot(right) < 0) right.negate();
    peel = { sphere: position, flat: new Float32Array(count * 3), along: new Float32Array(count), hinge };
  }

  const flat = new THREE.Vector3(), q = new THREE.Vector2();
  for (let j = 0; j <= lines; j++) {
    const t = j / lines;
    const lat = north ? GORE_DEPTH * (1 - t) : -GORE_DEPTH * t;
    for (let i = 0; i <= cols; i++) {
      const s = i / cols;
      const k = j * (cols + 1) + i;
      const lon = west + s * GORE_SPAN;
      const [u, v] = coons(border, s, t);
      sphere(lat, lon, PAPER).toArray(position, k * 3);
      uvs.set([u, 1 - v], k * 2);
      geo.set([lon, lat], k * 2);
      if (peel && hinge) {
        q.copy(pixels([u, v])).sub(hingePrint);
        const x = q.dot(right) * metersPerPixel;
        const y = q.dot(down) * metersPerPixel;
        peel.along[k] = y;
        flat.copy(hinge.C).addScaledVector(hinge.east, x).addScaledVector(hinge.south, y).toArray(peel.flat, k * 3);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(peel ? position.slice() : position, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute('geo', new THREE.BufferAttribute(geo, 2));
  geometry.setIndex(gridIndex(cols, lines));
  geometry.computeVertexNormals();
  const samples: number[] = [];
  for (const fj of [0, 0.15, 0.3, 0.5, 0.7, 0.85, 1]) for (const fi of [0, 0.25, 0.5, 0.75, 1]) samples.push(Math.round(fj * lines) * (cols + 1) + Math.round(fi * cols));
  return { geometry, metersPerUV: new THREE.Vector2(info.width, info.height).multiplyScalar(metersPerPixel), peel, samples };
}

/**
 * A polar calotte: a disc from the pole to 70°, printed face out. Seen from outside, longitude runs
 * counterclockwise around the north pole and clockwise around the south; `rotation` is the angle
 * in the print, counterclockwise from its +x axis, where the scene's longitude 0 falls.
 */
export function calotteShape(info: SheetInfo, rotation: number, rings = 40, segments = 360): GoreShape {
  const { center, radius } = info.disc!;
  const north = info.hemisphere === 'north';
  const sign = north ? 1 : -1;
  const count = 1 + rings * (segments + 1);
  const position = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const geo = new Float32Array(count * 2);
  const put = (k: number, lat: number, lon: number, rho: number) => {
    sphere(lat, lon, PAPER).toArray(position, k * 3);
    const r = (rho / CALOTTE_DEPTH) * radius;
    const angle = rotation + sign * lon;
    // Print coordinates run right and down; texture v runs up.
    uvs.set([center[0] + r * Math.cos(angle), 1 - (center[1] - r * Math.sin(angle))], k * 2);
    geo.set([lon, lat], k * 2);
  };
  put(0, sign * Math.PI / 2, 0, 0);
  for (let i = 1; i <= rings; i++) {
    const rho = (i / rings) * CALOTTE_DEPTH;
    for (let s = 0; s <= segments; s++) put(1 + (i - 1) * (segments + 1) + s, sign * (Math.PI / 2 - rho), (s / segments) * Math.PI * 2, rho);
  }
  const index: number[] = [];
  for (let s = 0; s < segments; s++) {
    const a = 1 + s, b = 2 + s;
    index.push(...(north ? [0, a, b] : [0, b, a]));
  }
  for (let i = 1; i < rings; i++) {
    for (let s = 0; s < segments; s++) {
      const a = 1 + (i - 1) * (segments + 1) + s, b = a + 1, c = a + segments + 1, d = c + 1;
      index.push(...(north ? [a, c, b, b, c, d] : [a, b, c, b, d, c]));
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute('geo', new THREE.BufferAttribute(geo, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  const metersPerUV = (R * 2 * CALOTTE_DEPTH) / (2 * radius);
  const samples = [0];
  for (const fr of [0.25, 0.5, 0.75, 1]) for (let a = 0; a < 12; a++) samples.push(1 + (Math.round(fr * rings) - 1) * (segments + 1) + Math.round((a / 12) * segments));
  return { geometry, metersPerUV: new THREE.Vector2(metersPerUV, metersPerUV), samples };
}

// Prints --------------------------------------------------------------------------------------------

const EMPTY = new THREE.DataTexture(new Uint8Array(4), 1, 1); // transparent until a print arrives
EMPTY.needsUpdate = true;
const FADE_HALF_LIFE = 0.08; // s: a new level resolves in about a third of a second
const RELEASE_AFTER = 8; // s a level stays resident after the view stops needing it

/**
 * One sheet's print. The base level stays resident; a finer level loads when the view needs it and
 * fades in over the one shown, like a lens resolving, and is released some seconds after the view
 * stops needing it.
 */
export class Print {
  readonly name: string;
  readonly info: SheetInfo;
  /** The print as the material samples it. */
  readonly node: Node<'vec4'>;
  shown = -1;
  wanted = 0;

  private readonly slotA = texture(EMPTY);
  private readonly slotB = texture(EMPTY);
  private readonly fade = uniform(0);
  private incoming = -1;
  private readonly textures = new Map<number, Promise<THREE.Texture>>();
  private neededAt = 0;
  private readonly anisotropy: number;

  constructor(info: SheetInfo, anisotropy: number) {
    this.info = info;
    this.name = sheetName(info.piece);
    this.anisotropy = anisotropy;
    this.node = mix(this.slotA, this.slotB, this.fade);
  }

  private load(level: number): Promise<THREE.Texture> {
    let texture = this.textures.get(level);
    if (!texture) {
      // Decoded off the main thread and flipped at decode, which both backends honor.
      texture = fetch(`/plates/assets/unfold/${this.name}-${this.info.levels[level]}.webp`)
        .then((response) => response.blob())
        .then((blob) => createImageBitmap(blob, { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' }))
        .then((bitmap) => {
          const t = new THREE.Texture(bitmap);
          t.flipY = false;
          t.colorSpace = THREE.SRGBColorSpace;
          t.anisotropy = this.anisotropy;
          t.generateMipmaps = true;
          t.minFilter = THREE.LinearMipmapLinearFilter;
          t.needsUpdate = true;
          return t;
        });
      this.textures.set(level, texture);
    }
    return texture;
  }

  /** Show a level at once, without a fade, for the first frame; the base level loads as well. */
  async showNow(level: number): Promise<void> {
    const [t] = await Promise.all([this.load(level), this.load(0)]);
    this.slotA.value = t;
    this.shown = level;
  }

  /** Ask for the level the view needs. Finer levels load at once; coarser ones after a while. */
  request(level: number, now: number): void {
    if (level >= this.shown) this.neededAt = now;
    this.wanted = level;
    const target = level > this.shown ? level : now - this.neededAt > RELEASE_AFTER ? level : this.shown;
    if (target === this.shown || this.incoming !== -1) return;
    this.incoming = target;
    this.load(target).then((t) => {
      this.slotB.value = t;
      this.fade.value = 0;
    });
  }

  /** Advance a fade. Returns true while the picture is changing. */
  step(dt: number): boolean {
    if (this.incoming === -1 || this.slotB.value === EMPTY) return false;
    this.fade.value = damp(this.fade.value, 1, FADE_HALF_LIFE, dt);
    if (this.fade.value < 0.995) return true;
    const previous = this.shown;
    this.slotA.value = this.slotB.value;
    this.slotB.value = EMPTY;
    this.fade.value = 0;
    this.shown = this.incoming;
    this.incoming = -1;
    if (previous > 0 && previous !== this.shown) this.release(previous); // the base level stays
    return true;
  }

  private release(level: number): void {
    const texture = this.textures.get(level);
    this.textures.delete(level);
    texture?.then((t) => {
      t.dispose();
      (t.image as ImageBitmap).close();
    });
  }
}
