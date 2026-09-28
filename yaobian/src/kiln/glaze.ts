// The glaze as a material. Nothing here is painted:
//   - Color is computed from thickness, a Kubelka–Munk layer over the body: where the glaze is
//     thin the body shows; where it pools, its own scattering and absorption take over.
//   - The crackle is read from the fracture model (crackField.ts) as sheets standing in the glaze.
//     The view ray is refracted into the glaze and the field is sampled along it, so a crack shows
//     its mouth at the surface, its root at the body, and the sheet between, displaced with depth.
//     Where a sheet turns the key's light toward the eye by internal reflection, it glints.
//   - Sparse bubbles sit in the glaze and are found along the same refracted ray.
//   - The surface is fired glass: orange peel, and the potter's throwing lines under the glaze.
// Where the glaze is absent (spur marks, the worn sole of the foot) the body shows, rough.

import * as THREE from 'three/webgpu';
import type { Node } from 'three/webgpu';
import {
  Fn, If, abs, atan, attribute, cameraPosition, clamp, cos, cross, dFdx, dFdy, dot, float, floor, fract, length, max,
  min, mix, modelWorldMatrix, mx_noise_float, normalView, normalWorldGeometry, positionLocal, positionView, positionWorld, refract, select, sin, smoothstep, step,
  texture, uniform, vec2, vec3, vec4,
} from 'three/tsl';
import { bumpNormal } from '../core/bump.ts';
import type { Profile, Side } from './bowl.ts';
import { SPURS } from './bowl.ts';
import type { CrackField } from './crackField.ts';
import { DMAX } from './crackField.ts';

const linear = (hex: string) => new THREE.Color(hex);
const v3 = (c: THREE.Color) => new THREE.Vector3(c.r, c.g, c.b);

/** Values to react against in look development, shared by both surfaces. */
export const glaze = {
  // Kubelka–Munk: the glaze's reflectance at infinite thickness, its scattering per mm, and the
  // reflectance of the body beneath it, wet with glaze. Linear.
  infinite: uniform(new THREE.Vector3(0.17, 0.3, 0.38)),
  scattering: uniform(new THREE.Vector3(0.38, 0.5, 0.72)),
  body: uniform(new THREE.Vector3(0.43, 0.39, 0.34)),
  // The bare body where no glaze covers it: grey-buff stoneware, LOOK.md #8f8577 as a display value.
  bare: uniform(v3(linear('#a39886'))),
  roughness: uniform(0.26), // Ru's sheen is soft; sharper, the highlight clips and hides the crackle in it
  // Crackle, widths in mm.
  mouthWidth: uniform(0.012),
  sheetWidth: uniform(0.016),
  rootWidth: uniform(0.02),
  mouthDark: uniform(0.2),
  sheetLight: uniform(0.12), // 0.05 hid the crackle at 1×; 0.2 drew it, and got worse at 4×
  rootDark: uniform(0.25),
  glint: uniform(1),
  glintSharpness: uniform(60),
  crackle: uniform(1), // 0 hides it, for comparison
  // The firing, as the piece runs it; the lab leaves all three at 1.
  thicknessScale: uniform(1), // the dip: 0 no glaze … 1 the lab's bowl
  wet: uniform(0), // raw glaze just out of the tub, glossy with water, 1 … dried by the body, 0
  fired: uniform(1), // 0 raw glaze, a dry chalky coat … 1 fired glass
  tension: uniform(1), // the cooling: a stretch of crack shows once the tension reaches the tension it opened at
  // The piece shows the crackle to a visitor at full size: each crack at least a pixel wide, and a
  // stretch just opened catching the light, so the crackle can be seen running. The lab keeps 0.
  legible: uniform(0),
  fresh: uniform(0.05), // tension units over which a new crack's light fades
  heat: uniform(new THREE.Vector3()), // the bowl's own light in the kiln, linear, before tone mapping
  // Ge ware's 金丝铁线, gold thread and iron wire: the crackle stained, the first generation of
  // cracks dark, the later gold. `glow` lights the stained cracks in the dark as they open; `stain`
  // is how much of the stain shows by day.
  glow: uniform(0),
  stain: uniform(0),
  ironWire: uniform(new THREE.Vector3(0.035, 0.024, 0.018)),
  goldThread: uniform(new THREE.Vector3(0.5, 0.36, 0.16)), // yellow-brown, as the Palace Museum describes Ge ware's 金丝
  bubbles: uniform(1),
  keyPosition: uniform(new THREE.Vector3()),
};

/** The glaze's own lighting: the physical model, plus the crack sheets' glint of the key. */
class GlazeLightingModel extends THREE.PhysicalLightingModel {
  private readonly material: GlazeMaterial;
  constructor(material: GlazeMaterial) {
    super();
    this.material = material;
  }
  directRectArea(input: THREE.LightingModelDirectRectAreaInput, builder: THREE.NodeBuilder) {
    super.directRectArea(input, builder);
    const glint = this.material.glintNode;
    if (glint) (input.reflectedLight.directSpecular as Node<'vec3'>).addAssign((input.lightColor as Node<'vec3'>).mul(glint));
  }
}

export class GlazeMaterial extends THREE.MeshPhysicalNodeMaterial {
  glintNode: Node<'float'> | null = null;
  setupLightingModel() {
    return new GlazeLightingModel(this);
  }
}

/** Kubelka–Munk reflectance of a layer X mm thick over a background of reflectance Rg. */
function kubelkaMunk(X: Node<'float'>, Rinf: Node<'vec3'>, S: Node<'vec3'>, Rg: Node<'vec3'>) {
  const a = Rinf.add(float(1).div(Rinf)).mul(0.5);
  const b = a.mul(a).sub(1).max(1e-6).sqrt();
  const x = b.mul(S).mul(X.max(1e-4)).min(20);
  const e2 = x.mul(2).exp();
  const coth = e2.add(1).div(e2.sub(1));
  return float(1).sub(Rg.mul(a.sub(b.mul(coth)))).div(a.sub(Rg).add(b.mul(coth)));
}

const hash3 = (c: Node<'vec3'>) =>
  fract(sin(vec3(dot(c, vec3(127.1, 311.7, 74.7)), dot(c, vec3(269.5, 183.3, 246.1)), dot(c, vec3(113.5, 271.9, 124.6)))).mul(43758.5453));

/** Mirrors bowl.ts bare(): the spur marks and the worn sole, 1 where the body is bare. */
function bareMask(p: Profile, sMM: Node<'float'>, phi: Node<'float'>, rMM: Node<'float'>, edge: Node<'float'>) {
  if (p.side !== 'outside') return float(0);
  const m = p.marks;
  const stepAngle = (Math.PI * 2) / SPURS.count;
  const k = floor(phi.sub(SPURS.phase).div(stepAngle).add(0.5));
  const dphi = phi.sub(SPURS.phase).sub(k.mul(stepAngle));
  const e = length(vec2(dphi.mul(rMM).div(SPURS.width), rMM.sub(SPURS.radius).div(SPURS.length))).sub(1);
  const spur = float(1).sub(smoothstep(edge.negate(), edge, e.mul(SPURS.width))).mul(step(sMM, m.footInner));
  const mid = (m.footSoleIn + m.footSoleOut) / 2;
  const halfBand = float(1.2).add(sin(phi.mul(7).add(1.3)).mul(0.25)).add(sin(phi.mul(23).add(0.2)).mul(0.12));
  const sole = float(1).sub(smoothstep(halfBand.sub(edge), halfBand.add(edge), abs(sMM.sub(mid))));
  return max(spur, sole);
}

export type GlazeNodes = { thickness: Node<'float'>; coverage: Node<'float'> };

/** The glaze material for one surface of the bowl, reading that surface's crack field. */
export function glazeMaterial(p: Profile, field: CrackField): { material: GlazeMaterial; nodes: GlazeNodes } {
  const material = new GlazeMaterial();
  const side: Side = p.side;
  const R = field.radius;

  const thick = attribute('thick', 'float'); // mm, before the bare features
  const chart = attribute('chart', 'vec2'); // m
  const tanS = attribute('tanS', 'vec3');

  // Shading is in the world; where on the bowl, in the bowl's own space, since the visitor carries it
  // to the tub and back. At rest on the table the two agree.
  const P = positionWorld, PL = positionLocal;
  const N = normalWorldGeometry.normalize();
  const V = cameraPosition.sub(P).normalize();
  const footprint = max(length(dFdx(P)), length(dFdy(P))).mul(1000); // mm per pixel

  const chartMM = chart.mul(1000);
  const sMM = length(chartMM);
  const phi = atan(chartMM.y, chartMM.x);
  const rMM = length(PL.xz).mul(1000);
  const bare = bareMask(p, sMM, phi, rMM, max(footprint, 0.06));
  const h = thick.mul(glaze.thicknessScale).mul(float(1).sub(bare));
  const coverage = smoothstep(0.004, 0.03, h);

  // The view ray refracted into the glaze, and how far it travels across the chart per mm of
  // depth: along the profile exactly, around it stretched by 1 / k.
  const T = refract(V.negate(), N, 1 / 1.5);
  const cosT = dot(T, N).negate().max(0.2);
  const tau = T.add(N.mul(cosT)).div(cosT);
  const toWorld = (d: Node<'vec3'>) => modelWorldMatrix.mul(vec4(d, 0)).xyz;
  const tanSW = toWorld(tanS);
  const eS = tanSW.sub(N.mul(dot(tanSW, N))).normalize();
  const eP = toWorld(vec3(PL.z, 0, PL.x.negate())).normalize();
  const k = rMM.div(sMM.max(1e-3)).min(1);
  const er = chartMM.div(sMM.max(1e-6));
  const ec = vec2(er.y.negate(), er.x);
  const delta = er.mul(dot(tau, eS)).add(ec.mul(dot(tau, eP).div(k)));

  // Crackle. Each crack's age sets how far it has opened: the first to form have been under strain
  // longest. The sheet is seen through the glaze above it, so it fades with depth.
  const distanceAt = (q: Node<'vec2'>) => texture(field.distance, q.div(2 * R).add(0.5)).r.mul(DMAX);
  // A line of half-width w; legible, never thinner than about a pixel, where cracks are far enough
  // apart on screen to be told apart. Inside, on the walls seen at a slant, a pixel spans up to about
  // 0.7 mm of glaze, still a fraction of the cracks' spacing, so they stay drawn there; beyond that,
  // as on the outer wall seen edge-on, the network would thicken into dark blots, so there the cracks
  // keep their true width, and fade.
  const legible = glaze.legible.mul(smoothstep(1.0, 0.7, footprint));
  const line = (d: Node<'float'>, w0: Node<'float'>) => {
    const w = max(w0, footprint.mul(0.55).mul(legible));
    return clamp(w.sub(d).div(footprint).add(0.5), 0, 1).mul(min(1, w.mul(2).div(footprint)));
  };
  const midq = chartMM.add(delta.mul(h.mul(0.5)));
  const oriented = texture(field.orientation, midq.div(2 * R).add(0.5));
  // A stretch's age, the tension it opened at, is kept only within half a millimetre of a crack; seen
  // at a slant, the refracted ray runs farther than that between the crack's mouth and its root. So
  // it is read at the mouth, halfway down, and at the root, and averaged by where it is kept (w):
  // texels beyond hold nothing, and filtering toward them scales z and w alike. Where none is near a
  // crack, the age is the last, so nothing shows before its time.
  const at = (q: Node<'vec2'>) => texture(field.orientation, q.div(2 * R).add(0.5));
  const atMouth = at(chartMM), atRoot = at(chartMM.add(delta.mul(h)));
  const kept = atMouth.w.add(oriented.w).add(atRoot.w);
  const age = select(kept.greaterThan(0.02), atMouth.z.add(oriented.z).add(atRoot.z).div(kept.max(0.02)), float(1));
  const openness = mix(1, 0.35, age).mul(max(oriented.w, atMouth.w)); // w is 0 far from any crack
  const opened = smoothstep(age.sub(0.015), age, glaze.tension); // has this stretch cracked yet: whole at its own tension, so the last show cold
  const fresh = glaze.tension.sub(age).div(glaze.fresh).max(0).negate().exp().mul(opened).mul(legible); // 1 as it opens
  const mouth = line(distanceAt(chartMM), glaze.mouthWidth.mul(openness.max(0.35)));
  const root = line(distanceAt(chartMM.add(delta.mul(h))), glaze.rootWidth.mul(openness.max(0.35)));
  const K = 6;
  const spacing = length(delta).mul(h).div(K);
  let sheet: Node<'float'> = float(0);
  for (let i = 0; i < K; i++) {
    const z = (i + 0.5) / K;
    const q = chartMM.add(delta.mul(h.mul(z)));
    sheet = max(sheet, line(distanceAt(q), max(glaze.sheetWidth, spacing.mul(0.5))).mul(1 - 0.6 * z));
  }
  const crackle = glaze.crackle.mul(coverage).mul(glaze.fired).mul(opened);
  const mouthC = mouth.mul(crackle), rootC = root.mul(crackle), sheetC = sheet.mul(crackle).mul(openness);

  const bubbles = Fn(() => {
    const cell = 0.0009; // m
    const len = h.div(cosT).div(1000);
    const mid = P.add(T.mul(len.mul(0.5)));
    const base = floor(mid.div(cell));
    const inside = float(0).toVar();
    const rim = float(0).toVar();
    for (let dz = -1; dz <= 1; dz++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const c = base.add(vec3(dx, dy, dz));
          const r1 = hash3(c), r2 = hash3(c.add(17.31));
          const present = step(r1.x, 0.05);
          const center = c.add(vec3(r1.y, r1.z, r2.x)).mul(cell);
          const radius = mix(0.00003, 0.00013, r2.y.mul(r2.y));
          const t = clamp(dot(center.sub(P), T), 0, len);
          const x = length(center.sub(P.add(T.mul(t)))).div(radius);
          const soft = footprint.div(radius.mul(1000)).max(0.05);
          const disc = float(1).sub(smoothstep(float(1).sub(soft), 1, x)).mul(present);
          inside.assign(max(inside, disc));
          rim.assign(max(rim, disc.mul(smoothstep(0.55, 0.95, x))));
        }
      }
    }
    return vec2(inside, rim);
  });
  // Bubbles: a sparse jittered lattice in the glaze, found along the refracted ray. They are under
  // a pixel until the view is magnified, so they are looked for only where a pixel is small enough.
  const bubble = Fn(() => {
    const found = vec2(0).toVar();
    If(footprint.lessThan(0.06), () => { found.assign(bubbles()); });
    return found;
  })().mul(glaze.bubbles.mul(coverage).mul(glaze.fired));


  // Color.
  const mottle = mx_noise_float(PL.mul(1000 / 6)).mul(0.025).add(1); // uneven phase separation
  let color: Node<'vec3'> = kubelkaMunk(h, glaze.infinite, glaze.scattering, glaze.body).mul(mottle);
  color = color.mul(float(1).add(bubble.x.mul(0.06))).add(bubble.y.mul(0.1));
  color = color.mul(float(1).sub(rootC.mul(glaze.rootDark))).mul(float(1).sub(mouthC.mul(glaze.mouthDark)));
  color = color.add(sheetC.mul(glaze.sheetLight.mul(mix(float(1), float(2.2), legible))));
  // The stain, in the crack's mouth: iron wire for the first cracks, gold thread for the later.
  const later = smoothstep(0.38, 0.62, age);
  const stainColor = mix(vec3(glaze.ironWire), vec3(glaze.goldThread), later);
  const stained = line(distanceAt(chartMM), glaze.mouthWidth.mul(1.4).mul(openness.max(0.5))).mul(crackle);
  // The later cracks, narrower, take less of the stain: a fine yellow-brown thread, not a gold line.
  color = mix(color, stainColor, stained.mul(glaze.stain).mul(mix(float(0.95), float(0.72), later)));

  // The bare body: grain, iron specks, and the trimming marks of the foot.
  const pmm = PL.mul(1000);
  const fade = (wavelength: number) => float(1).sub(smoothstep(wavelength * 0.25, wavelength * 0.6, footprint));
  // Fired clay: a soft mottle, fine grain kept faint, and iron specks with a warm dark core, so
  // the sole reads as stoneware and not as noise at 4×.
  const mottle2 = mx_noise_float(pmm.mul(1 / 1.6).add(2.3)).mul(0.05);
  const grain = mx_noise_float(pmm.mul(1 / 0.12)).mul(0.025).mul(fade(0.12)).add(mx_noise_float(pmm.mul(1 / 0.4)).mul(0.035).mul(fade(0.4))).add(mottle2);
  const speck = smoothstep(0.66, 0.8, mx_noise_float(pmm.mul(1 / 0.16).add(7.1))).mul(fade(0.16));
  const iron = vec3(0.32, 0.2, 0.12);
  const body = mix(vec3(glaze.bare).mul(grain.add(1)), iron, speck.mul(0.55));
  // Raw glaze, before the fire: a dry mineral coat, pale, through which the body shows where it is thin.
  // Wet from the tub it is darker, as any wet mineral is, until the body draws the water in: the thin
  // coat at the rim first, the pooled glaze in the well last. `glaze.wet` runs 1 … 0 as the drying
  // goes on; a point is dry once it has gone past the point's own thickness.
  const front = h.div(2).clamp(0, 1).mul(0.8);
  const wetHere = float(1).sub(smoothstep(front, front.add(0.18), float(1).sub(glaze.wet)));
  const raw = mix(vec3(glaze.bare), vec3(0.6, 0.58, 0.53), smoothstep(0, 0.6, h)).mul(mottle).mul(float(1).sub(wetHere.mul(0.34)));
  material.colorNode = vec4(mix(body, mix(raw, color, glaze.fired), coverage), 1);

  // Surface relief, in mm: orange peel, throwing lines inside, the open mouths of cracks; grain
  // and trimming marks where the body is bare. Detail finer than a pixel fades out.
  const peel = mx_noise_float(pmm.mul(1 / 1.3)).mul(0.0012).mul(fade(1.3));
  const throwing = side === 'inside'
    ? sin(sMM.mul((Math.PI * 2) / 7.5).add(mx_noise_float(vec3(cos(phi).mul(3), sin(phi).mul(3), sMM.mul(0.05))).mul(1.6)))
      .mul(0.004).mul(smoothstep(p.marks.well, p.marks.well + 12, sMM)).mul(fade(7.5))
    : float(0);
  const glazeRelief = peel.add(throwing).sub(mouthC.mul(0.0008));
  // The trimming tool's concentric marks, uneven in depth as the hand pressed.
  const trim = sin(rMM.mul((Math.PI * 2) / 0.6)).mul(mx_noise_float(pmm.mul(1 / 3)).mul(0.5).add(0.7)).mul(0.006).mul(fade(0.6));
  const bodyRelief = grain.mul(0.015).add(trim);
  material.normalNode = bumpNormal(mix(bodyRelief, glazeRelief, coverage).div(1000));
  const rawRough = mix(float(0.95), float(0.12), wetHere.pow(2)); // dry chalk, or wet slip's sheen, which goes before the color does
  material.roughnessNode = mix(float(0.84), mix(rawRough, glaze.roughness.add(mx_noise_float(pmm.mul(1 / 4)).mul(0.03)).add(mouthC.mul(0.35)), glaze.fired), coverage);
  material.metalnessNode = float(0);
  // Where a crack reaches the surface the glaze is no longer one mirror: its mouth breaks the
  // reflection, and a crack crossing the highlight shows as a dark hairline. This, more than
  // anything in the glaze below, is how crackle is seen.
  const breakWidth = glaze.mouthWidth.mul(1.6).mul(openness.max(0.35));
  material.specularIntensityNode = float(1).sub(line(distanceAt(chartMM), breakWidth).mul(crackle).mul(0.85)).mul(mix(mix(float(0.3), float(1), wetHere), float(1), glaze.fired));
  material.aoNode = attribute('occlusion', 'float'); // the bowl's own shadow on the fill (occlusion.ts)
  // In the kiln the bowl is its own light: a hot surface emits as its emissivity allows, which for
  // glass falls where reflection rises, at grazing angles, so the glowing bowl keeps its shape.
  // (In the emissive stage the geometry's world normal reads as zero; the view-space normal holds.)
  const facing = dot(normalView, positionView.normalize().negate()).abs().clamp(0, 1);
  // Softened from glass's own curve, so the glowing form reads: bright facing the eye, falling away at the edges.
  const emissivity = float(1).sub(float(1).sub(facing).pow(1.8).mul(0.82));
  // The stained cracks' light in the dark: gold, and brightest in the moment a stretch opens.
  const glowColor = mix(vec3(1, 0.62, 0.22), vec3(1, 0.86, 0.55), later);
  // Lit for the moment it opens, then down to a trace, so the cooling is seen drawing and the network
  // already drawn stays faintly in view (LOOK.md: the one heightening).
  const glowing = stained.mul(glaze.glow).mul(fresh.mul(2.4).add(0.1));
  material.emissiveNode = vec3(glaze.heat).mul(emissivity).add(glowColor.mul(glowing));

  // The glint. The broken edges of a crack's mouth are tiny facets tilted toward the crack's normal,
  // one on each side; where one of them bisects the key and the eye, the crack flashes as a
  // hairline. (Light reflected by the sheet itself travels on down into the body, so it never
  // reaches the eye in one bounce.)
  const L = glaze.keyPosition.sub(P).normalize();
  const H = L.add(V).normalize();
  const psi = atan(oriented.y.mul(2).sub(1), oriented.x.mul(2).sub(1)).mul(0.5);
  const tChart = vec2(cos(psi), sin(psi));
  const tWorld = eS.mul(dot(tChart, er)).add(eP.mul(dot(tChart, ec)));
  const nCrack = cross(N, tWorld).normalize();
  // The facets are chips, not a bevel: their tilt and extent change every fraction of a millimeter.
  const chip = mx_noise_float(pmm.mul(1 / 0.35).add(3.7));
  const tilt = chip.mul(0.35).add(0.6); // tan of the tilt, about 15° to 42°
  const facet = max(dot(N.add(nCrack.mul(tilt)).normalize(), H), dot(N.sub(nCrack.mul(tilt)).normalize(), H)).max(0);
  const chipped = smoothstep(-0.35, 0.45, mx_noise_float(pmm.mul(1 / 0.6).add(11.3)));
  const edges = line(distanceAt(chartMM), glaze.mouthWidth.mul(2.5)).mul(crackle).mul(openness).mul(chipped);
  material.glintNode = edges.mul(facet.pow(glaze.glintSharpness)).mul(glaze.glint).mul(0.04);

  return { material, nodes: { thickness: h, coverage } };
}

/** Thickness as a false-color map with contours every 0.25 mm, for the thickness test. */
export function thicknessMaterial(p: Profile): THREE.MeshBasicNodeMaterial {
  const material = new THREE.MeshBasicNodeMaterial();
  const chartMM = attribute('chart', 'vec2').mul(1000);
  const sMM = length(chartMM);
  const phi = atan(chartMM.y, chartMM.x);
  const rMM = length(positionLocal.xz).mul(1000);
  const footprint = max(length(dFdx(positionWorld)), length(dFdy(positionWorld))).mul(1000);
  const h = attribute('thick', 'float').mul(float(1).sub(bareMask(p, sMM, phi, rMM, max(footprint, 0.06))));
  const t = h.div(1.8).clamp(0, 1);
  // A perceptual ramp from paper to ink: thin reads light, thick reads dark, as the glaze does.
  const ramp = mix(mix(vec3(0.93, 0.9, 0.82), vec3(0.45, 0.62, 0.64), smoothstep(0, 0.5, t)), vec3(0.05, 0.16, 0.24), smoothstep(0.4, 1, t));
  const contour = h.div(0.25);
  const lineWidth = dFdx(contour).abs().add(dFdy(contour).abs());
  const iso = float(1).sub(smoothstep(0, lineWidth.mul(1.2), abs(fract(contour.add(0.5)).sub(0.5))));
  material.colorNode = mix(ramp, vec3(0.9, 0.15, 0.35), iso.mul(0.85));
  return material;
}
