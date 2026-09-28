// KILN's scene, as the piece shows it: the Ru-type bowl on its table under one strip
// softbox, and the kiln it is fired in.
//
// The bowl can be fired at any time: the glaze's thickness is the dip, the crackle is simulated in
// two workers as the glaze cools (fracture.ts), and the fired fields are swapped into the glaze.
// The piece stages the firing in layers: the table and the room go to black and leave the bowl
// alone; the bowl's light goes; in the dark the bowl glows with its own heat, its blackbody color
// (glaze.heat). The camera is placed by the piece, from a few named views.

import * as THREE from 'three/webgpu';
import type { Node } from 'three/webgpu';
import { Fn, builtinAOContext, mrt, normalView, pass, renderOutput, screenUV, uniform } from 'three/tsl';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { focus } from '../core/focus.ts';
import { createStill } from '../core/still.ts';
import { lathe, profile, type Side } from './bowl.ts';
import { FRACTURE_DEFAULTS, type Crack, type FractureStats } from './fracture.ts';
import { crackField, rasterize, type CrackRaster } from './crackField.ts';
import type { Mode, Ping } from './ring.ts';
import { section, surfaceOcclusion, tableOcclusion } from './occlusion.ts';
import { glaze, glazeMaterial } from './glaze.ts';
import { Softbox } from '../core/softbox.ts';
import { fill, presence, room, seated, studio, table } from './stage.ts';
import { buildTub, TUB } from './tub.ts';
import type { Loupe } from '../core/loupe.ts';

export type Fired = { side: Side; cracks: Crack[]; stats: FractureStats; raster: CrackRaster; pings: Ping[] };
export type KilnScene = Awaited<ReturnType<typeof buildKiln>>;

const deg = THREE.MathUtils.degToRad;
/** Where the camera stands: degrees, meters, around the bowl's center. */
export type View = { elevation: number; azimuth: number; distance: number; tx: number; ty: number; tz: number; shift: number };
export const VIEWS = {
  table: { elevation: 33, azimuth: 8, distance: 0.74, tx: 0, ty: 0.024, tz: 0.004, shift: 0 }, // lookdev 01's
  aside: { elevation: 24, azimuth: -34, distance: 0.86, tx: 0, ty: 0.026, tz: 0, shift: 0.24 }, // turned, the bowl to the right of the words
  body: { elevation: 10, azimuth: -62, distance: 0.74, tx: 0, ty: 0.03, tz: 0, shift: 0.26 }, // low and close: the unglazed body, the foot
  well: { elevation: 58, azimuth: 8, distance: 0.82, tx: 0, ty: 0.016, tz: -0.004, shift: 0.16 }, // down into the well, where the crackle runs
  tub: { elevation: 21, azimuth: 16, distance: 1.45, tx: TUB.x, ty: 0.125, tz: TUB.z, shift: 0 }, // the glaze tub, the bowl held over it
} satisfies Record<string, View>;
const FOV = 13;
const KEY = { azimuth: -140, elevation: 12, distance: 0.8, intensity: 26 };
const ENVIRONMENT = 2;

/** A blackbody's color at a temperature, linear, brightest channel 1 (Tanner Helland's fit). */
export function blackbody(celsius: number, out = new THREE.Color()): THREE.Color {
  const t = (celsius + 273.15) / 100;
  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const c = (v: number) => Math.min(1, Math.max(0, v / 255));
  return out.setRGB(c(r), c(g), c(b), THREE.SRGBColorSpace);
}

export async function buildKiln(renderer: THREE.WebGPURenderer, o: { onStage?: (what: string) => void } = {}) {
  const stage = o.onStage ?? (() => {});
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.environment = studio(renderer);
  scene.environmentIntensity = ENVIRONMENT;

  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.02, 10);
  const target = new THREE.Vector3();
  const uFocus = uniform(0.74);
  const size = { width: 1, height: 1 };
  /** Stand the camera at a view; `shift` moves the picture across the frame, a fraction of its width. */
  const place = (v: View) => {
    target.set(v.tx, v.ty, v.tz);
    camera.position.set(Math.sin(deg(v.azimuth)) * Math.cos(deg(v.elevation)), Math.sin(deg(v.elevation)), Math.cos(deg(v.azimuth)) * Math.cos(deg(v.elevation)))
      .multiplyScalar(v.distance).add(target);
    camera.lookAt(target);
    uFocus.value = v.distance;
    // The picture moves aside for words beside it; on a narrow screen they are below it, and it stays.
    const shift = size.width / size.height < 1.2 ? 0 : v.shift;
    if (Math.abs(shift) > 1e-4) camera.setViewOffset(size.width, size.height, -shift * size.width, 0, size.width, size.height);
    else if (camera.view?.enabled) camera.clearViewOffset();
  };
  place(VIEWS.table);

  // The bowl, unfired: its glaze surfaces with no crackle yet.
  stage('throwing the bowl…');
  const profiles = { inside: profile('inside'), outside: profile('outside') };
  const bowlSection = section(profiles.inside, profiles.outside);
  const none = crackField(rasterize([], profiles.inside.length, () => 1, 16));
  const fields: Partial<Record<Side, ReturnType<typeof crackField>>> = {};
  // The bowl turns about its middle, so it can be lifted, turned over, and carried.
  const MIDDLE = 0.0275; // m above the foot
  const bowl = new THREE.Group();
  bowl.position.y = MIDDLE;
  scene.add(bowl);
  const meshes = (['inside', 'outside'] as const).map((side) => {
    const surface = lathe(profiles[side], 1024, surfaceOcclusion(bowlSection, profiles[side]));
    const mesh = new THREE.Mesh(surface.geometry, glazeMaterial(surface.profile, none).material);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.name = side;
    mesh.position.y = -MIDDLE;
    bowl.add(mesh);
    return mesh;
  });
  const tableMesh = table(tableOcclusion(bowlSection)), roomMesh = room();
  scene.add(tableMesh, roomMesh);
  const tub = buildTub();
  scene.add(tub.group, tub.drops);
  const casters: THREE.Object3D[] = [...meshes, tub.group.children[0]];

  // One strip softbox, behind and to the left, low: its strip lies along the right inner wall, and
  // the bowl's shadow falls toward the camera.
  // Its shadow's window covers the bowl's place and the whole tub, seen from the light: one window,
  // so no edge of it ever crosses the frame.
  const softbox = new Softbox({ width: 1.0, height: 0.2, intensity: KEY.intensity, color: new THREE.Color().setRGB(1, 0.96, 0.9), samples: { blockers: 8, taps: 16 }, extent: 0.34 });
  scene.add(softbox.light);
  const bowlCenter = new THREE.Vector3(0, 0.026, 0);
  {
    const a = deg(KEY.azimuth), e = deg(KEY.elevation);
    const position = new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)).multiplyScalar(KEY.distance).add(bowlCenter);
    softbox.place(position, bowlCenter);
    softbox.aim(new THREE.Vector3(TUB.x / 2, 0.06, TUB.z / 2));
    glaze.keyPosition.value.copy(position);
    const f = a + deg(165);
    fill.direction.value.set(Math.sin(f) * Math.cos(deg(30)), Math.sin(deg(30)), Math.cos(f) * Math.cos(deg(30))).normalize();
    softbox.renderShadow(renderer, scene, casters);
  }
  const home = new THREE.Vector3(0, MIDDLE, 0);

  // Passes: occlusion on the fill, the view with a little depth of field, the kiln, the loupe.
  // The occlusion pass needs only depth and normals: it draws everything plain, not in the glaze's
  // and the key's full shading.
  const prePass = pass(scene, camera);
  prePass.setMRT(mrt({ output: normalView }));
  prePass.overrideMaterial = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
  const aoPass = ao(prePass.getTextureNode('depth'), prePass.getTextureNode(), camera);
  aoPass.radius.value = 0.025;
  aoPass.thickness.value = 0.004;
  aoPass.resolutionScale = 0.5;
  const scenePass = pass(scene, camera);
  scenePass.contextNode = builtinAOContext(aoPass.getTextureNode().sample(screenUV).r);
  const uBokeh = uniform(8); // px: the widest circle of confusion
  const lens = focus(scenePass, camera, { distance: uFocus, range: uniform(0.25), radius: uBokeh });
  const still = createStill(renderer);
  const pipeline = new THREE.RenderPipeline(renderer);
  pipeline.outputColorTransform = false;
  let loupe: Loupe | null = null;
  function output(): void {
    pipeline.outputNode = Fn(() => {
      let display = renderOutput(lens.node) as Node<'vec4'>;
      if (loupe) display = loupe.composite(display);
      return still.blend(display);
    })();
    pipeline.needsUpdate = true;
  }
  output();

  const heat = new THREE.Color();
  const gold = new THREE.Color().setRGB(1, 0.5, 0.12); // linear
  return {
    scene, camera, softbox, pipeline, aoPass, uGrain: still.uGrain, uBokeh, meshes, profiles, prePass, scenePass, tub, bowl, MIDDLE,
    /**
     * Carry the bowl: its middle at a point, turned over by `flip` (0 upright … 1 rim down) and
     * tipped by `tilt` radians. The softbox's shadow is drawn again for it.
     */
    carry(at: THREE.Vector3, flip: number, tilt = 0): void {
      // Tipped side to side, as the camera sees it best, in the same plane as it is turned over.
      const turn = Math.PI * flip + tilt;
      if (bowl.position.equals(at) && bowl.rotation.z === turn) return;
      bowl.position.copy(at);
      bowl.rotation.set(0, 0, turn);
      bowl.updateMatrixWorld(true);
      seated.value = 1 - THREE.MathUtils.smoothstep(at.distanceTo(home), 0.0005, 0.008);
      softbox.renderShadow(renderer, scene, casters);
    },
    /** A point on the bowl, in its own turning frame, in the world. */
    onBowl(point: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 { return out.copy(point).applyMatrix4(bowl.matrixWorld); },
    /**
     * Draw: `fresh` when anything has changed; otherwise the still at rest takes one more sample,
     * the lens's pattern and the softbox's shadow turned for it.
     */
    draw(fresh = true): void {
      still.draw(camera, fresh, (sample) => {
        lens.frame.value = sample;
        softbox.frame.value = sample;
        pipeline.render();
      });
    },
    /** Whether the still at rest has all its samples. */
    get refined(): boolean { return still.done; },
    layout(width: number, height: number): void {
      size.width = width; size.height = height;
      camera.aspect = width / height;
      // Keep the bowl's width in frame on a narrow screen.
      camera.fov = width / height < 1.2 ? FOV * (1.2 / (width / height)) ** 0.8 : FOV;
      camera.updateProjectionMatrix();
      uBokeh.value = 8 * (renderer.domElement.width / 2400);
    },
    setLoupe(next: Loupe | null): void { if (next !== loupe) { loupe = next; output(); } },
    place,
    /**
     * The stage: `room` 1 the table and room there … 0 gone to black; `light` 1 the bowl lit … 0
     * dark; the kiln's temperature, °C, from which the bowl glows.
     */
    stage(room: number, light: number, celsius: number): void {
      presence.value = room;
      // What has gone to black is not drawn: its shading is the frame's dearest.
      tableMesh.visible = roomMesh.visible = room > 0.002;
      softbox.light.intensity = KEY.intensity * light;
      softbox.light.visible = light > 0.002;
      scene.environmentIntensity = ENVIRONMENT * light;
      // From dull red at the Draper point to a golden orange: bright, but short of where the tone
      // mapping would bleach it toward pink. As an eye grown used to the dark kiln sees it: the dull
      // red of the cooling stays in sight all the way down to where the kiln is opened (at 620 °C a
      // sixth of the peak), so the bowl never goes out and comes back.
      const glow = Math.pow(THREE.MathUtils.smoothstep(celsius, 450, 1280), 0.8) * 1.9;
      blackbody(celsius, heat);
      heat.lerp(gold, 0.35 * THREE.MathUtils.smoothstep(celsius, 900, 1280));
      glaze.heat.value.set(heat.r, heat.g, heat.b).multiplyScalar(glow);
    },
    /** Fire the bowl at a dip: the crackle of both surfaces, simulated in workers, then shown in the glaze; struck on the bowl's modes, if given, for its sound. */
    async fire(scale: number, seed: number, modes?: Mode[]): Promise<Fired[]> {
      const fire = (side: Side, size: number) => new Promise<Fired>((resolve, reject) => {
        const worker = new Worker(new URL('./fire.worker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = (event: MessageEvent<Fired>) => { resolve(event.data); worker.terminate(); };
        worker.onerror = (event) => reject(event);
        worker.postMessage({ side, params: { ...FRACTURE_DEFAULTS, seed }, size, scale, modes });
      });
      const fired = await Promise.all([fire('inside', 8192), fire('outside', 4096)]);
      for (const f of fired) {
        const mesh = meshes.find((m) => m.name === f.side)!;
        const old = mesh.material as THREE.Material, oldField = fields[f.side];
        fields[f.side] = crackField(f.raster);
        mesh.material = glazeMaterial(profiles[f.side], fields[f.side]!).material;
        old.dispose();
        oldField?.distance.dispose(); oldField?.orientation.dispose();
      }
      return fired;
    },
  };
}
