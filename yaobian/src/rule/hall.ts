// The Hall of the Two Sisters, as RULE shows it: the square hall carried to the octagon by
// muqarnas, every surface carved in one rule, and the dome raised from Jones and Goury's plan.
// The lab and the piece both draw it from here.
//
// The rule on the walls can be changed at any time: a new tiling or contact angle is baked in a
// worker and swapped into every carved surface at once. The dome's assembly is one scalar.

import * as THREE from 'three/webgpu';
import {
  Fn, abs, attribute, builtinAOContext, float, fract, frontFacing, mix, mrt, mx_noise_float, normalView, pass,
  positionLocal, positionWorld, pow, renderOutput, screenUV, select, smoothstep, step, texture, uniform, vec3,
} from 'three/tsl';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { loadPieces, pieceDome } from './planDome.ts';
import { baker, type Baked } from './baker.ts';
import { relief, reliefTextures, swapRelief, type ReliefTextures } from './relief.ts';
import { friezeMaterial, latticeMaterial, wallMaterial as carvedWall, woodLattice } from './wall.ts';
import { buildRoom, type RoomOptions } from './room.ts';
import { transmuteAll, uFront, uOrigin, REACH } from './transmute.ts';
import type { TilingName, Vec } from './tiling.ts';
import type { Pattern } from './hankin.ts';
import type { Loupe } from '../core/loupe.ts';
import { createStill } from '../core/still.ts';
import type { Node } from 'three/webgpu';

/** A rule's ground: the tiling, its largest tile's width across the flats, and that tile's center. */
export type Ground = { tiling: TilingName; across: number; home: Vec };
export const GROUNDS: Record<TilingName, Ground> = {
  '4.8.8': { tiling: '4.8.8', across: 200, home: [100, 100] },
  '6.6.6': { tiling: '6.6.6', across: 200, home: [0, 0] },
  '3.12.12': { tiling: '3.12.12', across: 220, home: [0, 0] },
};
export type Rule = { tiling: TilingName; angle: number }; // angle in degrees

export type HallOptions = {
  rule: Rule;
  texel: number; // mm, the walls' bake at rest
  face?: 'quarter' | 'niches' | 'prism';
  span?: number;
  hang?: number;
  cup?: number;
  traced?: boolean;
  onStage?: (what: string) => void;
};

const RELIEF = { strap: 14, reach: 16, depth: 9, bevel: 2.4, dip: 3.4, dipLength: 14 };
const DOME = { radius: 3, spring: 7.7, rise: 2.7, cell: 0.012 }; // the octagon about as high as the hall is wide
const CARVED = 1, STAND_IN = 2;

export type Hall = Awaited<ReturnType<typeof buildHall>>;

export async function buildHall(renderer: THREE.WebGPURenderer, o: HallOptions) {
  const stage = o.onStage ?? (() => {});
  const scene = new THREE.Scene();
  scene.background = new THREE.Color().setRGB(2.2, 2.1, 1.9); // the sky through the windows, over-exposed as from inside
  scene.environmentIntensity = 1.55;

  /**
   * The room's light, as the dome receives it: the window band brightest, the sunlit side brighter
   * than the other, the floor returning warm light from below, the dome itself dim above. Area
   * lights at the windows were tried: they cost 85% of the frame and changed little.
   */
  const uSunSide = uniform(new THREE.Vector3(1, 0, 0));
  function roomLight(): THREE.Texture {
    const s = new THREE.Scene();
    const m = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide });
    const dir = positionLocal.normalize();
    const up = dir.y;
    const band = smoothstep(-0.28, -0.12, up).mul(smoothstep(0.1, -0.02, up)); // the window band, seen from the dome
    const sunward = dir.xz.normalize().dot(uSunSide.xz).mul(0.5).add(0.5);
    const floor = vec3(0.74, 0.62, 0.48).mul(smoothstep(-0.2, -0.9, up));
    const walls = vec3(0.58, 0.52, 0.44); // white plaster, lit by the windows across the room
    const sky = vec3(1.0, 0.94, 0.84).mul(mix(float(1.2), float(3.4), pow(sunward, 3)));
    m.colorNode = mix(mix(walls, floor, smoothstep(-0.25, -0.6, up)), sky, band).mul(mix(float(0.55), float(1), smoothstep(0.2, -0.2, up)));
    s.add(new THREE.Mesh(new THREE.SphereGeometry(10, 128, 64), m));
    const pmrem = new THREE.PMREMGenerator(renderer);
    const t = pmrem.fromScene(s, 0.02).texture;
    pmrem.dispose();
    return t;
  }

  // Plaster: matte, fine-grained.
  function plaster(): THREE.MeshStandardNodeMaterial {
    const m = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, roughness: 0.95 }); // gypsum: matte, no sheen
    const p = positionWorld.mul(1000);
    const grain = mx_noise_float(p.mul(1 / 0.4)).mul(0.02).add(mx_noise_float(p.mul(1 / 4)).mul(0.015));
    m.colorNode = vec3(0.8, 0.76, 0.67).mul(grain.add(1));
    return m;
  }

  /**
   * Muqarnas plaster, as it survives: each piece cast a little differently, and on some of them what
   * is left of their paint, blue, green, and a red earth, worn to patches, as the photographs show.
   * Pieces carry a `shade` attribute, a random number of their own.
   */
  function paintedPlaster(): THREE.MeshStandardNodeMaterial {
    const m = plaster();
    const shade = attribute('shade', 'float');
    const pick = fract(shade.mul(7.31).add(0.5)); // a second number of the piece's own
    const p = positionWorld.mul(1000);
    // Grain at a millimetre and more: finer, at the dome's height, the noise's lattice aliases into hatching.
    const grain = mx_noise_float(p.mul(1 / 1.2)).mul(0.02).add(mx_noise_float(p.mul(1 / 6)).mul(0.015));
    const base = vec3(0.8, 0.76, 0.67).mul(grain.add(1)).mul(shade.mul(0.06).add(1));
    const pigment = select(pick.lessThan(0.12), vec3(0.3, 0.42, 0.62), select(pick.lessThan(0.2), vec3(0.4, 0.56, 0.48), vec3(0.6, 0.38, 0.3)));
    const painted = step(pick, float(0.26)).mul(select(frontFacing, float(1), float(0))); // on the face, not its back
    const wear = smoothstep(-0.05, 0.2, mx_noise_float(p.mul(1 / 40)).add(mx_noise_float(p.mul(1 / 12)).mul(0.3)));
    m.colorNode = mix(base, pigment.mul(grain.add(1)), painted.mul(wear).mul(0.4));
    return m;
  }

  // The rule: baked in a worker that stays open, while the dome is raised here. Every carved
  // surface is drawn from the first bake's textures; later bakes are swapped into them.
  let pattern!: Pattern;
  let drawn!: ReliefTextures; // the textures the surfaces were built with
  let showing: ReliefTextures | null = null; // the bake swapped into them since, if any
  let rule: Rule = { ...o.rule };
  let firstBake!: (b: Baked) => void;
  const baked = new Promise<Baked>((resolve) => { firstBake = resolve; });
  const listeners = new Set<(rule: Rule, pattern: Pattern) => void>();
  const bakes = baker((b) => {
    pattern = b.pattern;
    const ground = GROUNDS[b.request.tiling];
    if (!drawn) { firstBake(b); return; }
    const next = reliefTextures(b.relief);
    relief.home.value.set(ground.home[0], ground.home[1]);
    swapRelief(drawn, next);
    showing?.fields.dispose(); showing?.ids.dispose();
    showing = next;
    const bakedRule = { tiling: b.request.tiling, angle: THREE.MathUtils.radToDeg(b.request.angle) };
    for (const listen of listeners) listen(bakedRule, pattern);
  });
  const request = (r: Rule, texel: number) => {
    const ground = GROUNDS[r.tiling];
    bakes.want({ tiling: r.tiling, across: ground.across, angle: THREE.MathUtils.degToRad(r.angle), options: { ...RELIEF, texel } });
  };
  request(rule, o.texel);

  // The dome ----------------------------------------------------------------------------------------

  stage('reading the plan…');
  const plan = await loadPieces('/yaobian/assets/rule/two-sisters-pieces.json');
  stage('raising the dome…');
  const built = pieceDome(plan, {
    acrossFlats: 2 * DOME.radius, spring: DOME.spring, rise: DOME.rise, cell: DOME.cell,
    span: o.span ?? 0.07, hang: o.hang ?? 0.15, cup: o.cup ?? 0.3, face: o.face ?? 'prism', regular: !o.traced,
  });
  const top = built.maxTier + 1;
  const cellMaterial = paintedPlaster();
  const cellStandIn = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide }); // what the occlusion pass sees
  const cells = new THREE.Mesh(built.geometry, cellMaterial);
  cells.castShadow = cells.receiveShadow = true;
  cells.frustumCulled = false;
  cells.layers.set(CARVED); // the view's, and the sun's; the occlusion pass draws the stand-in
  const cellsAtRest = new THREE.Mesh(built.geometry, cellStandIn);
  cellsAtRest.frustumCulled = false;
  cellsAtRest.layers.set(STAND_IN);
  cells.add(cellsAtRest);
  scene.add(cells);

  // The shell behind the cells: the structural vault from which they hang, seen only through their
  // joints, as a deep recess. It keeps the sun out of them.
  const brick = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, roughness: 0.9, color: new THREE.Color(0.1, 0.09, 0.075) });
  const shell = new THREE.Mesh(new THREE.SphereGeometry(DOME.radius + 0.6, 96, 48, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, (DOME.rise + 0.6) / (DOME.radius + 0.6), 1).translate(0, DOME.spring, 0), brick);
  shell.castShadow = true;
  scene.add(shell);

  // The room -----------------------------------------------------------------------------------------

  stage('drawing the walls…');
  const first = await baked;
  drawn = reliefTextures(first.relief);
  relief.home.value.set(GROUNDS[rule.tiling].home[0], GROUNDS[rule.tiling].home[1]);
  const roomOptions: RoomOptions = {
    radius: DOME.radius, spring: DOME.spring, wall: 0.6,
    octagon: 6.05, squinch: { bands: 14, height: 1.7, hang: 0.6 }, frieze: 0.3,
    windows: { x: [-0.52, 0.52], width: 0.46, sill: 6.5, spring: 7.09 },
    door: { width: 1.5, spring: 1.95, lobes: 7, bulge: 0.045 },
    upper: { width: 0.8, sill: 3.62, spring: 4.1, lobes: 5, bulge: 0.035 },
    cornice: { tiers: 3, step: 0.06, span: 0.16, height: 0.3, hang: 0.6 },
    cascade: { width: 2.2, tiers: 14, step: 0.016, span: 0.1, height: 1.5, hang: 0.5 },
    colonnettes: { radius: 0.024 },
    cell: 0.014, joint: 0.0006, // about 3 px from the floor: finer is sub-pixel triangles, which cost and show nothing
  };
  const side = 2 * DOME.radius * Math.tan(Math.PI / 8);
  const windowsMM = roomOptions.windows.x.map((x) => ({ x: x * 1000, bottom: roomOptions.windows.sill * 1000, spring: roomOptions.windows.spring * 1000, width: roomOptions.windows.width * 1000 }));
  const drumFoot = (roomOptions.octagon + roomOptions.frieze) * 1000;
  const walls = {
    square: carvedWall(drawn, {
      width: 2 * DOME.radius * 1000, drumWidth: side * 1000, height: DOME.spring * 1000, dado: 1300, drum: drumFoot, split: 3400,
      upper: { width: 800 + 70, sill: 3620, spring: 4100 },
      door: { width: (roomOptions.door.width + 2 * roomOptions.door.bulge) * 1000, spring: roomOptions.door.spring * 1000 },
      band: 120, windows: windowsMM,
    }),
    drum: carvedWall(drawn, { width: side * 1000, height: DOME.spring * 1000, dado: 1300, drum: drumFoot, band: 120, windows: windowsMM }),
  };
  const frieze = friezeMaterial(drawn, roomOptions.frieze * 1000);
  const court = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color().setRGB(2.0, 1.9, 1.7) });
  const windows = { lattice: latticeMaterial(drawn, 2.4, 15), wood: woodLattice(drawn, 1.6, 11) };
  const room = buildRoom(roomOptions, {
    wall: (kind) => walls[kind],
    lattice: windows.lattice,
    wood: windows.wood,
    muqarnas: paintedPlaster(),
    frieze,
    marble: (() => { const m = plaster(); m.colorNode = vec3(0.86, 0.84, 0.8); m.roughnessNode = float(0.4); return m; })(),
    beyond: court,
  });
  scene.add(room.group);
  // The carved surfaces' shading is the frame's most expensive, and they carry their own occlusion,
  // from their relief. The occlusion pass needs only where they are: it draws a plain stand-in of
  // each, sharing its geometry, which only it sees (layer 2); the view draws the carving (layer 1).
  const standIn = new THREE.MeshBasicNodeMaterial();
  const carved: THREE.Mesh[] = [];
  room.group.traverse((obj) => {
    const m = (obj as THREE.Mesh).material;
    if ((obj as THREE.Mesh).isMesh && (m === walls.square || m === walls.drum || m === frieze)) carved.push(obj as THREE.Mesh);
  });
  // The courts beyond the doorways are the view's alone: the occlusion pass, seeing a far plane through
  // a narrow opening, would darken it in bands.
  room.group.traverse((obj) => { if ((obj as THREE.Mesh).material === court) obj.layers.set(CARVED); });
  for (const mesh of carved) {
    mesh.layers.set(CARVED);
    const proxy = new THREE.Mesh(mesh.geometry, standIn);
    proxy.layers.set(STAND_IN);
    mesh.add(proxy);
  }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14).rotateX(-Math.PI / 2), (() => {
    const m = plaster();
    m.colorNode = vec3(0.78, 0.76, 0.72); // marble, pale
    m.roughnessNode = float(0.35);
    return m;
  })());
  floor.receiveShadow = true;
  scene.add(floor);

  // The plan on the floor: Jones's plan, its joints incised in the marble at full size, under the
  // dome it draws.
  {
    const [cx, cy] = plan.center;
    const span = 2 * DOME.radius / Math.cos(Math.PI / 8) + 0.2;
    const size = 4096;
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    for (const piece of plan.pieces) {
      for (const lp of piece.loops) {
        ctx.beginPath();
        lp.forEach(([px, py], i) => {
          const x = (((px - cx) * built.metersPerPixel) / span + 0.5) * size, y = (((py - cy) * built.metersPerPixel) / span + 0.5) * size;
          if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        });
        ctx.closePath();
        ctx.stroke();
      }
    }
    const lines = new THREE.CanvasTexture(canvas as unknown as HTMLCanvasElement);
    lines.minFilter = THREE.LinearMipmapLinearFilter;
    lines.generateMipmaps = true;
    lines.colorSpace = THREE.NoColorSpace;
    const m = plaster();
    m.colorNode = vec3(0.78, 0.76, 0.72).mul(float(1).sub(texture(lines).r.mul(0.45)));
    m.roughnessNode = float(0.4);
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(span, span).rotateX(-Math.PI / 2).translate(0, 0.001, 0), m);
    decal.receiveShadow = true;
    scene.add(decal);
  }

  // Crystal until the rule is let go; clay behind the front it sends out. The windows stay windows.
  transmuteAll(scene, new Set([windows.lattice, windows.wood]));

  // The sun, outside, through the drum's windows. Its shadow map is drawn when what casts it
  // changes, the sun or the dome's assembly; the camera does not change it.
  const sun = new THREE.DirectionalLight(new THREE.Color().setRGB(1, 0.95, 0.86), 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 44 }); // the whole hall, dome included
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 3;
  sun.shadow.autoUpdate = false;
  sun.shadow.camera.layers.enable(CARVED); // the carved walls cast the windows' shadows, whatever pass draws the map
  scene.add(sun, sun.target);
  const sunAt = { azimuth: 70, elevation: 32 };
  function placeSun(azimuth = sunAt.azimuth, elevation = sunAt.elevation): void {
    Object.assign(sunAt, { azimuth, elevation });
    const a = THREE.MathUtils.degToRad(azimuth), e = THREE.MathUtils.degToRad(elevation);
    const d = new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
    sun.position.copy(d).multiplyScalar(22).add(new THREE.Vector3(0, 5, 0));
    sun.target.position.set(0, 5, 0);
    uSunSide.value.set(d.x, 0, d.z).normalize();
    // The windows on the sun's side glow brighter: the room's light is drawn again for this sun.
    scene.environment?.dispose();
    scene.environment = roomLight();
    sun.shadow.needsUpdate = true;
  }
  placeSun();

  // Passes: occlusion of the room's light by the hollows, the view, output, grain ----------------------

  const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 60);
  camera.layers.enable(CARVED);
  // The occlusion pass draws with its own camera, kept in step with the view's: the renderer keeps
  // one list of what to draw per scene and camera, and this pass, which draws less, runs inside the
  // main pass's drawing.
  const preCamera = new THREE.PerspectiveCamera();
  const prePass = pass(scene, preCamera);
  prePass.setMRT(mrt({ output: normalView }));
  const aoPass = ao(prePass.getTextureNode('depth'), prePass.getTextureNode(), preCamera);
  aoPass.radius.value = 2; // wide enough to find the cavities, so they read dark as the photographs' do
  aoPass.scale.value = 1.8; // gentle: the room is white plaster, and its hollows are lit by what it returns
  aoPass.resolutionScale = 0.5; // occlusion is soft: half resolution is enough, and a quarter of the cost
  const scenePass = pass(scene, camera);
  // The room's light falls off below the windows: the dome and the drum, beside them, have the most
  // of it, the walls under them less, down to the floor. The environment is the same everywhere; this
  // places it. Outside, in the courts, the light is the sky's.
  const uFall = uniform(0.3); // at the floor, of what the dome receives
  const uFallTop = uniform(8.5); // m: from here up, all of it: the dome, over the windows
  const inside = step(abs(positionWorld.x), 3.2).mul(step(abs(positionWorld.z), 3.2));
  const fall = mix(float(1), mix(uFall, float(1), smoothstep(0.3, uFallTop, positionWorld.y)), inside);
  scenePass.contextNode = builtinAOContext(aoPass.getTextureNode().sample(screenUV).r.mul(fall));
  const still = createStill(renderer);
  const pipeline = new THREE.RenderPipeline(renderer);
  pipeline.outputColorTransform = false;
  let loupe: Loupe | null = null;
  /** The output: the view, and the loupe over it when one is in use, into the still. */
  function output(): void {
    pipeline.outputNode = Fn(() => {
      let display = renderOutput(scenePass.getTextureNode()) as Node<'vec4'>;
      if (loupe) display = loupe.composite(display);
      return still.blend(display);
    })();
    pipeline.needsUpdate = true;
  }
  output();

  /**
   * Draw the frame: `fresh` when anything has changed; otherwise the still at rest takes one more
   * sample. The occlusion pass's camera follows the view's, jitter included.
   */
  function draw(fresh = true): void {
    still.draw(camera, fresh, () => {
      preCamera.copy(camera);
      preCamera.layers.set(0); // not the carved surfaces, but their stand-ins
      preCamera.layers.enable(STAND_IN);
      pipeline.render();
    });
  }

  return {
    scene, camera, sun, aoPass, prePass, scenePass, pipeline, uGrain: still.uGrain, uFall, uFallTop, draw, placeSun, sunAt,
    dome: { ...DOME, pieces: built.pieces, tiers: top },
    /** How far the front from crystal to clay has run from where the rule was set, m; `reach` passes everything. */
    fire(front: number): void { uFront.value = front; },
    reach: REACH,
    origin: uOrigin.value,
    /** The rule on the walls now, and the pattern it draws. */
    get rule(): Rule { return rule; },
    get pattern(): Pattern { return pattern; },
    /** Redraw every carved surface in a new rule; a coarse texel while it is changing, a fine one at rest. */
    setRule(next: Rule, texel: number): void { rule = { ...next }; request(rule, texel); },
    /** Called each time a new bake is on the walls. */
    onRule(listen: (rule: Rule, pattern: Pattern) => void): () => void { listeners.add(listen); return () => listeners.delete(listen); },
    layout(width: number, height: number): void { camera.aspect = width / height; camera.updateProjectionMatrix(); },
    /** Put a loupe over the view, or take it away; while away it costs nothing. */
    setLoupe(next: Loupe | null): void { if (next !== loupe) { loupe = next; output(); } },
    /** Whether the still at rest has all its samples. */
    get refined(): boolean { return still.done; },
    dispose(): void { bakes.dispose(); still.dispose(); },
  };
}
