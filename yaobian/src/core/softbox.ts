// A softbox, or a window: an area light with LTC shading and a shadow of its own. KILN's key is a
// strip softbox; PLUMB's is the workshop's north window.
//
// three.js area lights cast no shadow, so the softbox renders one: linear depth along its axis
// into a float target, then percentage-closer soft shadows. The penumbra grows with the distance
// from blocker to receiver and is stretched along the strip, as a strip's shadow is: sharp where
// the foot meets the table, broad where the rim throws its shadow into the bowl.

import * as THREE from 'three/webgpu';
import type { Node } from 'three/webgpu';
import {
  Fn, If, float, int, interleavedGradientNoise, ivec2, normalWorldGeometry, positionView, positionWorld, screenCoordinate,
  select, textureLoad, uniform, vec2, vec4, vogelDiskSample,
} from 'three/tsl';
import { RectAreaLightTexturesLib } from 'three/addons/lights/RectAreaLightTexturesLib.js';

let ltcReady = false;

class SoftboxShadow extends THREE.LightShadow<THREE.OrthographicCamera> {}

export class Softbox {
  readonly light: THREE.RectAreaLight;
  readonly camera: THREE.OrthographicCamera;
  readonly depth: THREE.RenderTarget;
  /** Varies the shadow's sampling pattern between accumulated frames. */
  readonly frame = uniform(0);
  private readonly depthMaterial: THREE.NodeMaterial;
  private readonly matrix = uniform(new THREE.Matrix4());
  private readonly origin = uniform(new THREE.Vector3());
  private readonly axis = uniform(new THREE.Vector3());
  private readonly size = uniform(new THREE.Vector2());
  private readonly extent: number;
  private readonly mapSize: number;

  /** Shadow samples per pixel: blockers searched, then taps filtered. Fewer for real time; a capture averages many frames. */
  private readonly samples: { blockers: number; taps: number };

  /** Depth bias, and offset along the normal, m: at least a texel of the shadow's map, or the surfaces shadow themselves in stripes. */
  private readonly bias: { depth: number; normal: number };

  /** `extent`: half the width, m, the shadow covers; `near`, `far`: its depth range along the light's axis, m. */
  constructor(options: { width: number; height: number; intensity: number; color: THREE.Color; extent?: number; near?: number; far?: number; mapSize?: number; samples?: { blockers: number; taps: number }; bias?: { depth: number; normal: number } }) {
    if (!ltcReady) {
      THREE.RectAreaLightNode.setLTC(RectAreaLightTexturesLib.init());
      ltcReady = true;
    }
    this.extent = options.extent ?? 0.24;
    this.mapSize = options.mapSize ?? 2048;
    this.samples = options.samples ?? { blockers: 16, taps: 32 };
    this.bias = options.bias ?? { depth: 0.0006, normal: 0.0003 };
    this.light = new THREE.RectAreaLight(options.color, options.intensity, options.width, options.height);
    this.camera = new THREE.OrthographicCamera(-this.extent, this.extent, this.extent, -this.extent, options.near ?? 0.02, options.far ?? 4);
    this.depth = new THREE.RenderTarget(this.mapSize, this.mapSize, {
      type: THREE.FloatType, format: THREE.RedFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true,
    });
    this.depthMaterial = new THREE.NodeMaterial();
    this.depthMaterial.side = THREE.DoubleSide;
    this.depthMaterial.blending = THREE.NoBlending; // a float red target has no alpha to blend
    this.depthMaterial.fragmentNode = vec4(positionView.z.negate(), 0, 0, 1);

    // The shadow is the light's, so the area light's diffuse, its highlight, and the glaze's glint
    // all fall off together. three applies a light's `shadow.shadowNode` to its color when set.
    const shadow = new SoftboxShadow(this.camera);
    shadow.shadowNode = this.shadowNode();
    (this.light as unknown as { shadow: SoftboxShadow }).shadow = shadow;
    this.light.castShadow = true;
  }

  get width(): number { return this.light.width; }
  get height(): number { return this.light.height; }

  /** Place the softbox at `position`, facing `target`, its width horizontal. */
  place(position: THREE.Vector3, target: THREE.Vector3): void {
    this.light.position.copy(position);
    this.light.lookAt(target);
    this.light.updateMatrixWorld();
    this.camera.position.copy(position);
    this.camera.quaternion.copy(this.light.quaternion);
    this.camera.updateMatrixWorld();
    this.origin.value.copy(position);
    this.axis.value.set(0, 0, -1).applyQuaternion(this.light.quaternion);
    this.size.value.set(this.light.width, this.light.height);
  }

  /**
   * Center the shadow's window on a point, keeping its size: for a scene whose subject moves across
   * more ground than one window covers. Takes effect at the next `renderShadow`.
   */
  aim(point: THREE.Vector3): void {
    const p = point.clone().applyMatrix4(this.camera.matrixWorldInverse);
    const e = this.extent;
    Object.assign(this.camera, { left: p.x - e, right: p.x + e, top: p.y + e, bottom: p.y - e });
    this.camera.updateProjectionMatrix();
  }

  /** Render the depth the shadow reads. Call after the softbox or the casters move. */
  renderShadow(renderer: THREE.WebGPURenderer, scene: THREE.Scene, casters: THREE.Object3D[]): void {
    const hidden: THREE.Object3D[] = [];
    scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o.visible && !casters.includes(o)) { o.visible = false; hidden.push(o); }
    });
    const previousTarget = renderer.getRenderTarget();
    const previousOverride = scene.overrideMaterial;
    const clear = renderer.getClearColor(new THREE.Color());
    const clearAlpha = renderer.getClearAlpha();
    scene.overrideMaterial = this.depthMaterial;
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(this.depth);
    renderer.render(scene, this.camera);
    renderer.setRenderTarget(previousTarget);
    renderer.setClearColor(clear, clearAlpha);
    scene.overrideMaterial = previousOverride;
    for (const o of hidden) o.visible = true;
    this.camera.updateProjectionMatrix();
    this.matrix.value.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
  }

  private shadowNode(): Node<'float'> {
    const { matrix, origin, axis, size, frame } = this;
    const extent = this.extent, mapSize = this.mapSize;
    return Fn(() => {
      const p = positionWorld.add(normalWorldGeometry.normalize().mul(this.bias.normal));
      const clip = matrix.mul(vec4(p, 1));
      const uv = vec2(clip.x.mul(0.5).add(0.5), clip.y.mul(-0.5).add(0.5));
      const z = p.sub(origin).dot(axis);
      const bias = float(this.bias.depth);
      const rotation = interleavedGradientNoise(screenCoordinate.xy).add(frame.mul(0.618034)).fract().mul(Math.PI * 2);
      const toUv = 1 / (2 * extent);
      const depthAt = (offset: Node<'vec2'>) => {
        const q = uv.add(offset.mul(toUv)).clamp(0, 0.9999);
        return textureLoad(this.depth.texture, ivec2(q.mul(mapSize))).r;
      };
      // Blockers: any depth in front of the receiver within the widest penumbra the strip can throw.
      const search = size.mul(0.1);
      const sum = float(0).toVar();
      const count = float(0).toVar();
      const { blockers: BLOCKERS, taps: TAPS } = this.samples;
      for (let i = 0; i < BLOCKERS; i++) {
        const d = depthAt(vogelDiskSample(int(i), int(BLOCKERS), rotation).mul(search));
        const blocks = d.greaterThan(0.001).and(d.lessThan(z.sub(bias)));
        sum.addAssign(select(blocks, d, 0));
        count.addAssign(select(blocks, 1, 0));
      }
      const inside = uv.x.greaterThan(0).and(uv.x.lessThan(1)).and(uv.y.greaterThan(0)).and(uv.y.lessThan(1));
      // Most of the frame has no blocker: fully lit, and the filtering is skipped.
      const lit = float(TAPS).toVar();
      If(count.greaterThan(0.5).and(inside), () => {
        // Similar triangles: the strip's size, scaled by how far the receiver sits behind the blocker.
        const blocker = sum.div(count.max(1));
        const penumbra = size.mul(z.sub(blocker).div(blocker.max(0.05))).max(0.0004);
        lit.assign(0);
        for (let i = 0; i < TAPS; i++) {
          const d = depthAt(vogelDiskSample(int(i), int(TAPS), rotation.add(1.7)).mul(penumbra.mul(0.5)));
          lit.addAssign(select(d.lessThan(0.001).or(d.greaterThanEqual(z.sub(bias))), 1, 0));
        }
      });
      return lit.div(TAPS);
    })();
  }
}
