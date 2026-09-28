// Depth of field through a thin lens.
//
// The blur is optical and in real units. A point at depth z, seen through a lens of focal length f
// at f-number N focused at distance S, images as a disc whose diameter on the film is
//
//   c = (f² / N) · S / (S − f) · |1/S − 1/z|.
//
// Film and focal length are the camera's own (PerspectiveCamera.filmGauge and getFocalLength), so
// the disc converts to pixels and the field of view and the blur always agree.
//
// Blur is gathered at half resolution in two layers. The background layer holds what lies at or
// behind the focus: each sample spreads over its own circle (scatter as gather), and a sample behind
// a sharper center is held to twice the center's circle, so a far surface cannot wash over a nearer
// one. The near layer holds what lies in front of the focus: it spreads over whatever is behind it
// and carries its own coverage, so a blurred foreground edge is translucent, as through a real lens.
// A tile maximum of the near circle sets how far each pixel looks for foreground that reaches it.
// The composite keeps the full-resolution image wherever the circle is under about a pixel.
//
// After Jimenez, "Next Generation Post Processing in Call of Duty: Advanced Warfare" (SIGGRAPH
// 2014), and Abadie, "A Life of a Bokeh" (SIGGRAPH 2018).

import * as THREE from 'three/webgpu';
import type { Node, NodeBuilder, NodeFrame, TextureNode } from 'three/webgpu';
import {
  Fn, Loop, abs, context, convertToTexture, cos, float, floor, interleavedGradientNoise, max, min, mix,
  outputStruct, perspectiveDepthToViewZ, property, reference, screenCoordinate, select, sin, smoothstep,
  sqrt, step, texture, uniform, uv, vec2, vec3, vec4,
} from 'three/tsl';

const SAMPLES = 96; // per half-resolution pixel, on a golden-angle spiral
const TILE = 16; // half-resolution pixels per side of a near-field tile
const REACH_TILES = 2; // tiles searched in each direction for near field that reaches a pixel
const GOLDEN_ANGLE = 2.39996323;

const quad = new THREE.QuadMesh(new THREE.NodeMaterial());
let rendererState: THREE.RendererUtils.RendererState;

function renderTarget(format: THREE.PixelFormat = THREE.RGBAFormat, count = 1): THREE.RenderTarget {
  return new THREE.RenderTarget(1, 1, { depthBuffer: false, type: THREE.HalfFloatType, format, count });
}

// Internal nodes and targets are prefixed with an underscore, which three's node graph reads as
// private: they are built by this node's own passes, not as children of the output.
export class LensBlurNode extends THREE.TempNode<'vec4'> {
  /** Aperture, as an f-number. */
  fNumber = 2;
  /** Distance to the plane of focus in meters, along the view axis. */
  focusDistance = 2;
  /** Largest circle of confusion, as a radius in fractions of the image height. */
  maxRadius = 0.025;
  /** Off renders the pinhole image. */
  enabled = true;

  readonly colorNode: TextureNode;
  readonly depthNode: TextureNode;
  readonly camera: THREE.PerspectiveCamera;

  private readonly _cocScale = uniform(0); // circle radius in full-resolution pixels per diopter of defocus
  private readonly _inverseFocus = uniform(0.5);
  private readonly _radiusLimit = uniform(1);
  private readonly _fullTexel = uniform(new THREE.Vector2());
  private readonly _halfTexel = uniform(new THREE.Vector2());
  private readonly _halfSize = uniform(new THREE.Vector2());
  private readonly _tiles = uniform(new THREE.Vector2());

  private readonly _prefilterTarget = renderTarget();
  private readonly _tileTarget = renderTarget(THREE.RedFormat);
  private readonly _reachTarget = renderTarget(THREE.RedFormat);
  private readonly _gatherTarget = renderTarget(THREE.RGBAFormat, 2);
  private readonly _fillTarget = renderTarget(THREE.RGBAFormat, 2);
  private readonly _compositeTarget = renderTarget();

  private readonly _prefilterMaterial = new THREE.NodeMaterial();
  private readonly _tileMaterial = new THREE.NodeMaterial();
  private readonly _reachMaterial = new THREE.NodeMaterial();
  private readonly _gatherMaterial = new THREE.NodeMaterial();
  private readonly _fillMaterial = new THREE.NodeMaterial();
  private readonly _compositeMaterial = new THREE.NodeMaterial();

  private readonly _output = texture(this._compositeTarget.texture);

  constructor(colorNode: TextureNode, depthNode: TextureNode, camera: THREE.PerspectiveCamera) {
    super('vec4');
    this.colorNode = colorNode;
    this.depthNode = depthNode;
    this.camera = camera;
    this.updateBeforeType = THREE.NodeUpdateType.FRAME;
  }

  getTextureNode(): TextureNode {
    return this._output;
  }

  setSize(width: number, height: number): void {
    const halfWidth = Math.max(1, Math.round(width / 2));
    const halfHeight = Math.max(1, Math.round(height / 2));
    const tilesX = Math.ceil(halfWidth / TILE);
    const tilesY = Math.ceil(halfHeight / TILE);
    this._fullTexel.value.set(1 / width, 1 / height);
    this._halfTexel.value.set(1 / halfWidth, 1 / halfHeight);
    this._halfSize.value.set(halfWidth, halfHeight);
    this._tiles.value.set(tilesX, tilesY);
    this._prefilterTarget.setSize(halfWidth, halfHeight);
    this._tileTarget.setSize(tilesX, tilesY);
    this._reachTarget.setSize(tilesX, tilesY);
    this._gatherTarget.setSize(halfWidth, halfHeight);
    this._fillTarget.setSize(halfWidth, halfHeight);
    this._compositeTarget.setSize(width, height);
  }

  updateBefore(frame: NodeFrame): undefined {
    const renderer = frame.renderer as THREE.Renderer;
    const image = (this.colorNode.value as THREE.Texture).image as { width: number; height: number };
    this.setSize(image.width, image.height);

    // The lens, in meters.
    const f = this.camera.getFocalLength() / 1000;
    const S = Math.max(this.focusDistance, f * 1.05);
    const film = this.camera.getFilmHeight() / 1000;
    this._cocScale.value = this.enabled ? 0.5 * ((f * f) / this.fNumber) * (S / (S - f)) * (image.height / film) : 0;
    this._inverseFocus.value = 1 / S;
    this._radiusLimit.value = this.maxRadius * image.height;

    rendererState = THREE.RendererUtils.resetRendererState(renderer, rendererState);
    renderer.setClearColor(0x000000, 0);
    const passes: [THREE.NodeMaterial, THREE.RenderTarget, string][] = [
      [this._prefilterMaterial, this._prefilterTarget, 'Lens [ prefilter ]'],
      [this._tileMaterial, this._tileTarget, 'Lens [ near tiles ]'],
      [this._reachMaterial, this._reachTarget, 'Lens [ near reach ]'],
      [this._gatherMaterial, this._gatherTarget, 'Lens [ gather ]'],
      [this._fillMaterial, this._fillTarget, 'Lens [ fill ]'],
      [this._compositeMaterial, this._compositeTarget, 'Lens [ composite ]'],
    ];
    for (const [material, target, name] of passes) {
      quad.material = material;
      quad.name = name;
      renderer.setRenderTarget(target);
      quad.render(renderer);
    }
    THREE.RendererUtils.restoreRendererState(renderer, rendererState);
    return undefined;
  }

  setup(builder: NodeBuilder): Node {
    const shared = context((builder as unknown as { getSharedContext(): object }).getSharedContext());
    const near = reference('near', 'float', this.camera);
    const far = reference('far', 'float', this.camera);

    /** Depth in meters along the view axis. */
    const depthAt = (p: Node<'vec2'>) => perspectiveDepthToViewZ(this.depthNode.sample(p).r, near, far).negate();
    /** Signed circle-of-confusion radius in full-resolution pixels: negative in front of the focus. */
    const cocAt = (z: Node<'float'>) =>
      this._cocScale.mul(this._inverseFocus.sub(float(1).div(z))).clamp(this._radiusLimit.negate(), this._radiusLimit);

    // 1. Half resolution: color, and the circle of the nearest of the four depths it covers.
    const prefilter = Fn(() => {
      const p = uv();
      const o = this._fullTexel.mul(0.5);
      const z = min(
        min(depthAt(p.add(vec2(o.x.negate(), o.y.negate()))), depthAt(p.add(vec2(o.x, o.y.negate())))),
        min(depthAt(p.add(vec2(o.x.negate(), o.y))), depthAt(p.add(o))),
      );
      return vec4(this.colorNode.sample(p).rgb, cocAt(z).mul(0.5));
    });
    const prefiltered = texture(this._prefilterTarget.texture);

    // 2. Near field per tile: the largest near circle, in half-resolution pixels.
    const tile = Fn(() => {
      const origin = floor(uv().mul(this._tiles)).mul(TILE);
      const reach = float(0).toVar();
      Loop({ start: 0, end: TILE, type: 'int' }, { start: 0, end: TILE, type: 'int' }, ({ i, j }) => {
        const q = origin.add(vec2(float(i), float(j))).add(0.5).mul(this._halfTexel);
        reach.assign(max(reach, prefiltered.sample(q).a.negate()));
      });
      return vec4(reach, 0, 0, 1);
    });
    const tiles = texture(this._tileTarget.texture);

    // 3. How far each tile must look: the largest near circle among its neighbors.
    const reach = Fn(() => {
      const tileTexel = vec2(1).div(this._tiles);
      let r: Node<'float'> = float(0);
      for (let y = -REACH_TILES; y <= REACH_TILES; y++) {
        for (let x = -REACH_TILES; x <= REACH_TILES; x++) {
          r = max(r, tiles.sample(uv().add(vec2(x, y).mul(tileTexel))).r);
        }
      }
      return vec4(r, 0, 0, 1);
    });
    const reached = texture(this._reachTarget.texture);

    // 4. Gather both layers.
    const background = property('vec4');
    const foreground = property('vec4');
    const gather = Fn(() => {
      const p = uv();
      const center = prefiltered.sample(p);
      const c0 = center.a;
      const centerFar = max(c0, 0);
      const centerNear = c0.lessThan(-0.5);
      const radius = max(max(centerFar, reached.sample(p).r), 0.5);
      const spin = interleavedGradientNoise(screenCoordinate.xy).mul(Math.PI * 2);
      const areaPerSample = radius.mul(radius).div(SAMPLES); // over π
      const bgSum = vec3(0).toVar();
      const bgWeight = float(0).toVar();
      const fgSum = vec3(0).toVar();
      const fgAlpha = float(0).toVar();
      Loop(SAMPLES, ({ i }) => {
        const k = float(i);
        const d = radius.mul(sqrt(k.add(0.5).div(SAMPLES)));
        const angle = k.mul(GOLDEN_ANGLE).add(spin);
        const s = prefiltered.sample(p.add(vec2(cos(angle), sin(angle)).mul(d).mul(this._halfTexel)));
        const c = s.a;
        // Background: at or behind the focus. Under a near center, every visible background sample
        // stands in for what the foreground hides.
        const r = select(c.greaterThan(centerFar), min(c, centerFar.mul(2).add(1)), c).max(0);
        const covers = select(centerNear, float(1), r.sub(d).add(1).clamp(0, 1));
        const wb = covers.mul(step(-0.5, c)).div(max(r, 1).pow(2));
        bgSum.addAssign(s.rgb.mul(wb));
        bgWeight.addAssign(wb);
        // Near field: spreads over its own circle, with coverage in proportion to its area.
        const rn = c.negate();
        const wf = rn.sub(d).add(1).clamp(0, 1).mul(step(0.5, rn)).mul(areaPerSample).div(max(rn, 1).pow(2));
        fgSum.addAssign(s.rgb.mul(wf));
        fgAlpha.addAssign(wf);
      });
      const alpha = fgAlpha.clamp(0, 1);
      background.assign(vec4(select(bgWeight.greaterThan(1e-6), bgSum.div(max(bgWeight, 1e-6)), center.rgb), c0));
      foreground.assign(vec4(fgSum.div(max(fgAlpha, 1e-6)).mul(alpha), alpha));
      return float(0);
    });
    const gatheredBackground = texture(this._gatherTarget.textures[0]);
    const gatheredForeground = texture(this._gatherTarget.textures[1]);

    // 5. A 3 × 3 tent over both layers takes out the spiral's sampling noise. The background only
    // averages neighbors with a similar circle, so sharp and blurred regions do not mix.
    const filledBackground = property('vec4');
    const filledForeground = property('vec4');
    const fill = Fn(() => {
      const p = uv();
      const c0 = gatheredBackground.sample(p).a;
      let bg: Node<'vec3'> = vec3(0);
      let bgWeight: Node<'float'> = float(0);
      let fg: Node<'vec4'> = vec4(0);
      for (let y = -1; y <= 1; y++) {
        for (let x = -1; x <= 1; x++) {
          const q = p.add(vec2(x, y).mul(this._halfTexel));
          const tent = (2 - Math.abs(x)) * (2 - Math.abs(y));
          const b = gatheredBackground.sample(q);
          const similar = float(1).sub(abs(b.a.sub(c0)).div(max(abs(c0).mul(0.5), 1))).clamp(0, 1);
          bg = bg.add(b.rgb.mul(similar).mul(tent));
          bgWeight = bgWeight.add(similar.mul(tent));
          fg = fg.add(gatheredForeground.sample(q).mul(tent / 16));
        }
      }
      filledBackground.assign(vec4(bg.div(max(bgWeight, 1e-6)), c0));
      filledForeground.assign(fg);
      return float(0);
    });
    const finalBackground = texture(this._fillTarget.textures[0]);
    const finalForeground = texture(this._fillTarget.textures[1]);

    // 6. Composite at full resolution. The background is upsampled from the four nearest texels,
    // weighted toward those whose circle matches this pixel's, so a sharp silhouette keeps its edge.
    const composite = Fn(() => {
      const p = uv();
      const sharp = this.colorNode.sample(p);
      const c = cocAt(depthAt(p));
      const texel = p.mul(this._halfSize).sub(0.5);
      const base = floor(texel);
      const f = texel.sub(base);
      let bg: Node<'vec3'> = vec3(0);
      let weight: Node<'float'> = float(0);
      for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
        const b = finalBackground.sample(base.add(vec2(x, y)).add(0.5).mul(this._halfTexel));
        const bilinear = (x ? f.x : f.x.oneMinus()).mul(y ? f.y : f.y.oneMinus());
        const w = bilinear.mul(float(1).div(abs(b.a.sub(c.mul(0.5))).add(0.25)));
        bg = bg.add(b.rgb.mul(w));
        weight = weight.add(w);
      }
      const blurred = mix(sharp.rgb, bg.div(max(weight, 1e-6)), smoothstep(1, 2.5, abs(c)));
      const fg = finalForeground.sample(p);
      return vec4(blurred.mul(fg.a.oneMinus()).add(fg.rgb), 1);
    });

    this._prefilterMaterial.contextNode = shared;
    this._prefilterMaterial.fragmentNode = prefilter();
    this._tileMaterial.contextNode = shared;
    this._tileMaterial.fragmentNode = tile();
    this._reachMaterial.contextNode = shared;
    this._reachMaterial.fragmentNode = reach();
    this._gatherMaterial.contextNode = shared;
    this._gatherMaterial.colorNode = gather();
    this._gatherMaterial.outputNode = outputStruct(background, foreground);
    this._fillMaterial.contextNode = shared;
    this._fillMaterial.colorNode = fill();
    this._fillMaterial.outputNode = outputStruct(filledBackground, filledForeground);
    this._compositeMaterial.contextNode = shared;
    this._compositeMaterial.fragmentNode = composite();
    for (const material of [this._prefilterMaterial, this._tileMaterial, this._reachMaterial, this._gatherMaterial, this._fillMaterial, this._compositeMaterial]) {
      material.needsUpdate = true;
    }
    return this._output;
  }

  dispose(): void {
    super.dispose();
    for (const target of [this._prefilterTarget, this._tileTarget, this._reachTarget, this._gatherTarget, this._fillTarget, this._compositeTarget]) target.dispose();
    for (const material of [this._prefilterMaterial, this._tileMaterial, this._reachMaterial, this._gatherMaterial, this._fillMaterial, this._compositeMaterial]) material.dispose();
  }
}

/** Depth of field through a thin lens, from a scene pass's color and depth. */
export function lensBlur(color: Node, depth: TextureNode, camera: THREE.PerspectiveCamera): LensBlurNode {
  return new LensBlurNode(convertToTexture(color), depth, camera);
}
