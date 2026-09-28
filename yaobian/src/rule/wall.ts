// The walls of the dome's room, from the same rule as the wall of lookdev 02 and the dome's plan.
// Every surface is composed as the Two Sisters' are: fields framed by borders, and the borders
// themselves carved. Everything carved is the rule, at some scale:
//   - a field is the rule, with a star at the field's center; its own fields are carved again
//     with the rule at a third of the size, so the rule reaches into itself;
//   - a border is layered: fillets, rows of pearls, and a strip of the rule one repeat tall, its
//     corners mitred where the strips meet;
//   - the frieze at the octagon's foot is a band of the rule between borders, with oval bosses.
// Below, a dado of cut tile, where the room's colour lives. In each window, a lattice cut from the
// same lines, lit from behind. The Two Sisters' inscriptions are not imitated: plain mouldings and
// bosses stand where they would be. The tile's palette is the Alhambra's in kind; its values are
// to be checked (research/rule.md).
//
// Coordinates: a wall's own, in mm: x across, y up from the floor, the room at −z. Heights are mm
// above the wall's face; carving goes down from 0, pearls and bosses stand a little proud.

import * as THREE from 'three/webgpu';
import type { Node } from 'three/webgpu';
import {
  abs, atan, float, fract, length, max, min, mix, mx_noise_float, normalGeometry, normalize, positionLocal, select, smoothstep,
  step, transformNormalToView, uniform, vec2, vec3,
} from 'three/tsl';
import { relief, reliefNodes, type ReliefNodes, type ReliefTextures } from './relief.ts';

type F = Node<'float'>;
type V = Node<'vec2'>;

export type Window = { x: number; bottom: number; spring: number; width: number }; // mm; the arch springs at `spring`

export type WallLayout = {
  width: number; // mm, the wall's width
  drumWidth?: number; // mm, the drum's width where it is narrower than the wall below
  height: number; // mm, floor to the dome's spring
  dado: number; // mm, top of the tile
  drum: number; // mm, where the drum starts
  split?: number; // mm, a band dividing the panel below the drum into a lower field and an upper one
  door?: { width: number; spring: number }; // mm, an arched doorway at the wall's middle, framed by an alfiz
  upper?: { width: number; sill: number; spring: number }; // mm, a window above the doorway, framed by an alfiz
  band: number; // mm, a moulding's height
  windows: Window[];
};

const color = (hex: string) => {
  const c = new THREE.Color(hex);
  return new THREE.Vector3(c.r, c.g, c.b);
};

/** The Alhambra's tile colours, in kind: to be checked against the monument. */
export const dado = {
  green: uniform(color('#2e6a52')),
  ochre: uniform(color('#b8862e')),
  blue: uniform(color('#233f78')),
  black: uniform(color('#1c1a18')),
  white: uniform(color('#ece6d8')),
};

// Ornament ------------------------------------------------------------------------------------------

export type Layer = { w: number; kind: 'fillet' | 'pearls' | 'strip' };

/** A frame's borders from the outside in, mm. */
export const BORDER: Layer[] = [
  { w: 10, kind: 'fillet' }, { w: 16, kind: 'pearls' }, { w: 6, kind: 'fillet' }, { w: 76, kind: 'strip' },
  { w: 6, kind: 'fillet' }, { w: 16, kind: 'pearls' }, { w: 10, kind: 'fillet' },
];
export const NARROW: Layer[] = [
  { w: 6, kind: 'fillet' }, { w: 12, kind: 'pearls' }, { w: 4, kind: 'fillet' }, { w: 48, kind: 'strip' },
  { w: 4, kind: 'fillet' }, { w: 12, kind: 'pearls' }, { w: 6, kind: 'fillet' },
];
/** A doorway's archivolt, from the opening out. */
const ARCHIVOLT: Layer[] = [
  { w: 8, kind: 'fillet' }, { w: 14, kind: 'pearls' }, { w: 4, kind: 'fillet' }, { w: 70, kind: 'strip' },
  { w: 4, kind: 'fillet' }, { w: 14, kind: 'pearls' }, { w: 10, kind: 'fillet' },
];
/** A band's borders from either edge in: a strip of the rule in its middle. */
const BAND: Layer[] = [{ w: 8, kind: 'fillet' }, { w: 14, kind: 'pearls' }, { w: 6, kind: 'fillet' }, { w: 60, kind: 'strip' }];
const SPLIT = 2 * (8 + 14 + 6) + 60; // mm, the band's height: the strip is shared by both halves
const widthOf = (layers: Layer[]) => layers.reduce((s, l) => s + l.w, 0);

/** Ornament over a bake of the rule: every function returns a height, mm, at a wall point. */
export function ornament(n: ReliefNodes) {
  const home = relief.home; // a large tile's center in the pattern
  const strap = relief.strap;

  /** The rule at a scale (pattern mm per wall mm), a star at `center`; deeper where it is larger. */
  const rule = (p: V, center: V, scale: number) => n.sample(p.sub(center).mul(scale).add(home));

  /** The rule, its fields carved again with the rule at 1/k the size. */
  const nested = (p: V, center: V, scale: number, k: number): F => {
    const big = rule(p, center, scale);
    const inField = smoothstep(strap.mul(0.5).add(3.5), strap.mul(0.5).add(7), big.line);
    const small = rule(p, center, scale * k).height.div(scale * k);
    // The rule inside the rule is shallow: the large strapwork leads, the small is the second thing
    // seen, as the Nasrid carvers cut their infill below their bands.
    return big.height.div(scale).add(small.mul(inField).mul(0.45));
  };

  /** A border's layers across a distance d inward from its outer edge, along a coordinate. */
  const border = (d: F, along: F, layers: Layer[]): F => {
    let h: F = float(0);
    let start = 0;
    for (const l of layers) {
      const a = d.sub(start);
      let lh: F;
      if (l.kind === 'pearls') {
        const pitch = l.w * 1.05;
        const t = fract(along.div(pitch)).sub(0.5).mul(pitch);
        const r = length(vec2(t, a.sub(l.w / 2)));
        const R = l.w * 0.42;
        lh = max(float(-4), float(R * R).sub(r.mul(r)).max(0).sqrt().sub(R - 1.2));
      } else if (l.kind === 'strip') {
        const scale = 200 / l.w; // one octagon across the strip
        const q = vec2(along.mul(scale), a.sub(l.w / 2).mul(scale)).add(relief.home); // a row of large tiles along the strip
        lh = n.sample(q).height.div(scale);
      } else {
        lh = float(0);
      }
      // An incised line where one layer meets the next.
      const groove = float(1).sub(smoothstep(float(0.3), float(1.1), abs(a))).mul(-1.6);
      h = select(d.greaterThanEqual(start).and(d.lessThan(start + l.w)), lh.add(groove), h);
      start += l.w;
    }
    return h;
  };

  /** A rectangle's inward distance and the coordinate along its nearest side: mitred corners. */
  const rect = (p: V, x0: number, y0: number, x1: number, y1: number) => {
    const dl = p.x.sub(x0), dr = float(x1).sub(p.x), db = p.y.sub(y0), dt = float(y1).sub(p.y);
    const dx = min(dl, dr), dy = min(db, dt);
    const d = min(dx, dy);
    const along = select(dx.lessThan(dy), p.y, p.x);
    return { d, along };
  };

  /** A framed field: its border, and inside it whatever `field` carves. */
  const framed = (p: V, box: [number, number, number, number], layers: Layer[], field: F): { h: F; inside: F } => {
    const { d, along } = rect(p, ...box);
    const w = widthOf(layers);
    const inside = step(float(0), d);
    const fieldEdge = smoothstep(float(w), float(w + 2.5), d); // a short chamfer down into the field
    const h = select(d.lessThan(w), border(d, along, layers), mix(float(0), field, fieldEdge));
    return { h, inside };
  };

  /** Oval bosses along a line: a rounded rim, and inside it a smooth low dome. */
  const bosses = (p: V, y: number, pitch: number, rx: number, ry: number): { h: F; mask: F } => {
    const t = fract(p.x.div(pitch).add(0.5)).sub(0.5).mul(pitch);
    const e = length(vec2(t.div(rx), p.y.sub(y).div(ry)));
    const rim = float(1).sub(smoothstep(float(0.02), float(0.09), abs(e.sub(0.9)))).mul(2.6);
    const dome = float(1).sub(e.div(0.84).min(1).pow(2)).max(0).sqrt().mul(3.4);
    return { h: max(rim, dome), mask: step(e, float(1)) };
  };

  return { rule, nested, border, rect, framed, bosses };
}

/** A surface's shading from a height field over its own coordinates: normal, occlusion, and tone. */
function shade(m: THREE.MeshStandardNodeMaterial, n: ReliefNodes, w: V, height: (p: V) => F) {
  // The normal from the height, by central differences at about half a pixel.
  const e = max(float(0.2), n.footprint.mul(0.5));
  const hx = height(w.add(vec2(e, 0))).sub(height(w.sub(vec2(e, 0))));
  const hy = height(w.add(vec2(0, e))).sub(height(w.sub(vec2(0, e))));
  const face = step(normalGeometry.z, float(-0.5)); // the inner face; reveals and ends stay plain
  const local = vec3(hx.negate().div(e.mul(2)), hy.negate().div(e.mul(2)), float(-1)).normalize();
  m.normalNode = transformNormalToView(normalize(mix(normalGeometry, local, face)));
  const here = height(w);
  const pmm = positionLocal.mul(1000);
  const grain = mx_noise_float(pmm.mul(1 / 0.4)).mul(0.02).add(mx_noise_float(pmm.mul(1 / 4)).mul(0.015));
  // Plaster, a shade darker the deeper it is cut; the hollows see less of the room.
  // Carved plaster reads as its lines against a ground in shadow: the photographs' lace.
  const tone = mix(float(1), smoothstep(float(-9), float(-1), here).mul(0.16).add(0.84), face);
  const occlusion = mix(float(1), smoothstep(float(-9), float(-0.5), here).mul(0.62).add(0.38), face);
  return { face, here, plaster: vec3(0.8, 0.76, 0.67).mul(grain.add(1)).mul(tone), occlusion };
}

// Walls ---------------------------------------------------------------------------------------------

export function wallMaterial(textures: ReliefTextures, L: WallLayout): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial();
  const w = positionLocal.xy.mul(1000); // wall mm
  const tile = step(w.y, float(L.dado)); // 1 in the dado
  const DW = L.drumWidth ?? L.width;
  // The dado's pattern and colours are read at the wall's own point; its octagons are about 90 mm.
  const TILE = 2.2;
  const n = reliefNodes(textures, {
    coord: w.mul(TILE).add(relief.home),
    mode: tile,
    toObject: (v) => vec3(v.x, v.y, v.z.negate()),
  });
  const o = ornament(n);

  // The panel between the dado and the octagon; the drum above it; the window pair's frame.
  const panel: [number, number, number, number] = [-L.width / 2, L.dado + L.band / 2, L.width / 2, L.drum - L.band / 2];
  const panelCenter = vec2(0, (panel[1] + panel[3]) / 2);
  const drum: [number, number, number, number] = [-DW / 2, L.drum + L.band / 2, DW / 2, L.height];
  const pair: [number, number, number, number] | null = L.windows.length
    ? [Math.min(...L.windows.map((v) => v.x - v.width / 2)) - 150, Math.min(...L.windows.map((v) => v.bottom)) - 120,
      Math.max(...L.windows.map((v) => v.x + v.width / 2)) + 150, Math.max(...L.windows.map((v) => v.spring + v.width / 2)) + 150]
    : null;
  const drumCenter = vec2(0, pair ? (pair[1] + pair[3]) / 2 : (drum[1] + drum[3]) / 2);

  const door = L.door ? (() => {
    const r = L.door.width / 2, aw = widthOf(ARCHIVOLT);
    const alfiz: [number, number, number, number] = [-(r + aw + 190), -1, r + aw + 190, L.door.spring + r + aw + 170];
    return { r, aw, alfiz, spring: L.door.spring };
  })() : null;
  /** Inside the alfiz: the archivolt around the opening, and the spandrels beyond it. */
  const doorField = (p: V): F => {
    if (!door) return float(0);
    const dy = p.y.sub(door.spring);
    const up = dy.greaterThan(0);
    const d = select(up, length(vec2(p.x, dy)).sub(door.r), abs(p.x).sub(door.r));
    // Along the archivolt: up the jambs, then around the arch from either side to its crown.
    const around = float(Math.PI / 2).sub(abs(float(Math.PI / 2).sub(atan(dy, p.x)))).mul(door.r).add(door.spring);
    const along = select(up, around, p.y);
    const spandrel = o.nested(p, vec2(0, door.spring), 2.4, 3);
    return select(d.lessThan(door.aw), o.border(d.max(0), along, ARCHIVOLT), mix(float(0), spandrel, smoothstep(float(door.aw), float(door.aw + 2.5), d)));
  };

  const moulding = (p: V, at: number) => {
    const t = p.y.sub(at).div(L.band / 2); // −1 … 1 across the band
    return { mask: step(abs(t), float(1)), h: float(4).mul(max(float(0), float(1).sub(t.mul(t))).sqrt()).sub(1) };
  };

  const height = (p: V): F => {
    // The dado: the tile's own surface.
    let h: F = n.heightAt(p.mul(TILE).add(relief.home)).div(TILE);
    // The panel: a border, and the rule nested in itself, a star at the panel's center.
    if (L.split) {
      // Two fields, the upper one finer, and between them a band of pearls and the rule, where
      // the Two Sisters has its inscription.
      const lower: [number, number, number, number] = [panel[0], panel[1], panel[2], L.split - SPLIT / 2];
      const upper: [number, number, number, number] = [panel[0], L.split + SPLIT / 2, panel[2], panel[3]];
      const lo = o.framed(p, lower, BORDER, o.nested(p, vec2(0, (lower[1] + lower[3]) / 2), 1.4, 3));
      const up = o.framed(p, upper, NARROW, o.nested(p, vec2(0, (upper[1] + upper[3]) / 2), 2, 3));
      const d = float(SPLIT / 2).sub(abs(p.y.sub(L.split)));
      const band = o.border(d, p.x, BAND);
      h = mix(h, lo.h, lo.inside.mul(step(float(L.dado), p.y)));
      h = mix(h, up.h, up.inside);
      h = mix(h, band, step(float(0), d));
    } else {
      const pa = o.framed(p, panel, BORDER, o.nested(p, panelCenter, 1.4, 3));
      h = mix(h, pa.h, pa.inside.mul(step(float(L.dado), p.y)));
    }
    // The drum: a narrow border; the rule finer; around the pair of windows, a border of its own.
    let drumField: F = o.nested(p, drumCenter, 2.2, 3);
    if (pair) {
      const alfiz = o.framed(p, pair, NARROW, drumField);
      drumField = mix(drumField, alfiz.h, alfiz.inside);
    }
    const dr = o.framed(p, drum, NARROW, drumField);
    h = mix(h, dr.h, dr.inside);
    // The dado's top row of teeth is flat tile.
    const ty = float(L.dado - L.band / 2 - 6).sub(p.y);
    h = mix(h, float(0), step(float(0), ty).mul(step(ty, float(46))));
    // Mouldings over the joints between zones.
    for (const at of [L.dado, L.drum]) {
      const mo = moulding(p, at);
      h = mix(h, mo.h, mo.mask);
    }
    // The doorway: its archivolt, and around it an alfiz whose spandrels are carved finer.
    if (door) {
      const al = o.framed(p, door.alfiz, NARROW, doorField(p));
      h = mix(h, al.h, al.inside);
    }
    // The upper window: an alfiz of its own, the rule finer inside it.
    if (L.upper) {
      const r = L.upper.width / 2;
      const box: [number, number, number, number] = [-r - 150, L.upper.sill - 110, r + 150, L.upper.spring + r + 150];
      const al = o.framed(p, box, NARROW, o.nested(p, vec2(0, L.upper.spring), 2.4, 3));
      h = mix(h, al.h, al.inside);
    }
    return h;
  };
  const s = shade(m, n, w, height);

  // Tile by piece in the dado, set in mortar: white ribbons; green stars, blue kites, ochre only
  // in the small stars.
  const c = n.pieceClass;
  const field = select(c.lessThan(0.5), vec3(dado.green), select(c.lessThan(1.5), vec3(dado.blue), select(c.lessThan(2.5), vec3(dado.ochre), vec3(dado.black))));
  const glazeColor = select(n.onStrap, vec3(dado.white), field).mul(n.random(1).sub(0.5).mul(0.12).mul(select(n.onStrap, float(0), float(1))).add(1));
  const inJoint = float(1).sub(smoothstep(relief.joint.mul(0.5), relief.joint.mul(0.5).add(0.25), n.here.tileJoint));
  const tileColor = mix(glazeColor, vec3(relief.mortar), inJoint);
  const inDadoMoulding = step(abs(w.y.sub(L.dado)), float(L.band / 2));
  const inAlfiz = door ? step(float(door.alfiz[0]), w.x).mul(step(w.x, float(door.alfiz[2]))).mul(step(w.y, float(door.alfiz[3]))) : float(0);
  const isTile = tile.mul(float(1).sub(inDadoMoulding)).mul(s.face).mul(float(1).sub(inAlfiz));
  // The dado's top: a row of black triangles on white, as the Two Sisters' dado ends.
  const teethTop = L.dado - L.band / 2 - 6, teeth = 46;
  const ty = float(teethTop).sub(w.y).div(teeth); // 0 at the top of the row … 1 at its foot
  const inTeeth = step(float(0), ty).mul(step(ty, float(1)));
  const tooth = step(ty, float(1).sub(abs(fract(w.x.div(teeth)).mul(2).sub(1))));
  const toothColor = mix(vec3(dado.white), vec3(dado.black), float(1).sub(tooth));
  const tileTone = mix(tileColor, toothColor, inTeeth);
  m.colorNode = mix(s.plaster, tileTone, isTile);
  m.roughnessNode = mix(float(0.86), mix(n.random(4).mul(0.05).add(0.1), float(0.92), inJoint), isTile);
  m.metalnessNode = float(0);
  m.aoNode = mix(s.occlusion, n.tileOcclusion, isTile);
  return m;
}

/**
 * The frieze at the octagon's foot: a band of the rule between borders, and a row of oval bosses
 * along its middle, where the Two Sisters has cartouches. Its own coordinates: x along, y up from
 * the band's foot, mm; the room at −z.
 */
export function friezeMaterial(textures: ReliefTextures, height: number): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial();
  const w = positionLocal.xy.mul(1000);
  const n = reliefNodes(textures, { coord: w.mul(2).add(relief.home), mode: float(0), toObject: (v) => vec3(v.x, v.y, v.z.negate()) });
  const o = ornament(n);
  const layers: Layer[] = [{ w: 6, kind: 'fillet' }, { w: 14, kind: 'pearls' }, { w: 4, kind: 'fillet' }, { w: 40, kind: 'strip' }, { w: 5, kind: 'fillet' }];
  const bw = widthOf(layers);
  const mid = height / 2;
  const h = (p: V): F => {
    const d = min(p.y, float(height).sub(p.y));
    const b = o.bosses(p, mid, 330, 95, 58);
    const field = mix(o.nested(p, vec2(165, mid), 2.2, 3), b.h, b.mask);
    return select(d.lessThan(bw), o.border(d, p.x, layers), mix(float(0), field, smoothstep(float(bw), float(bw + 2), d)));
  };
  const s = shade(m, n, w, h);
  m.colorNode = s.plaster;
  m.roughnessNode = float(0.86);
  m.metalnessNode = float(0);
  m.aoNode = s.occlusion;
  return m;
}

/**
 * A window's lattice: the same lines, cut through a plaster screen and lit from behind. Holes glow
 * with the sky; a few, by the pieces they are, with blue glass, as the Two Sisters' windows do.
 */
export function latticeMaterial(textures: ReliefTextures, patternScale: number, bar: number): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide });
  const w = positionLocal.xy.mul(1000);
  const n = reliefNodes(textures, { coord: w.mul(patternScale).add(relief.home), mode: float(0) });
  const aa = n.footprint.mul(patternScale).max(0.5);
  const solid = float(1).sub(smoothstep(float(bar).sub(aa), float(bar).add(aa), n.here.line));
  const glass = step(n.pieceClass, float(0.5)); // the stars
  const sky = vec3(1, 0.96, 0.88).mul(1.7);
  const blue = vec3(0.22, 0.38, 1).mul(1.5);
  m.colorNode = mix(vec3(0), vec3(0.36, 0.33, 0.28), solid);
  m.emissiveNode = mix(sky, blue, glass).mul(float(1).sub(solid));
  m.roughnessNode = float(0.85);
  m.maskShadowNode = solid.greaterThan(0.5); // the sun comes through the holes: the rule, cast in light
  return m;
}

/**
 * An upper window's lattice: wooden, dark, the same lines cut through it at a larger bar, the room
 * beyond dim and cool.
 */
export function woodLattice(textures: ReliefTextures, patternScale: number, bar: number): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide });
  const w = positionLocal.xy.mul(1000);
  const n = reliefNodes(textures, { coord: w.mul(patternScale).add(relief.home), mode: float(0) });
  const aa = n.footprint.mul(patternScale).max(0.5);
  const solid = float(1).sub(smoothstep(float(bar).sub(aa), float(bar).add(aa), n.here.line));
  m.colorNode = mix(vec3(0), vec3(0.16, 0.1, 0.06), solid);
  m.emissiveNode = vec3(0.62, 0.7, 0.86).mul(float(1).sub(solid));
  m.roughnessNode = float(0.7);
  return m;
}
