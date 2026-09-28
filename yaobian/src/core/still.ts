// A still, refined. A piece draws a frame only when something changes; once nothing does, it draws
// the same frame again from other points within each pixel and averages them, so a scene at rest is
// seen as the look-development captures see it: fine carving and edges resolved, without the
// stair-steps and crawl of one sample a pixel. Whatever changes starts it again from one sample.
//
// The pipeline's output is blended into the still (`blend` wraps its output node), drawn into one of
// two targets while the other holds what came before, and the still is shown with a trace of grain.

import * as THREE from 'three/webgpu';
import { Fn, float, interleavedGradientNoise, mix, screenCoordinate, texture, uniform, vec4 } from 'three/tsl';
import type { Node } from 'three/webgpu';

const halton = (i: number, b: number) => {
  let f = 1, r = 0;
  for (let n = i; n > 0; n = Math.floor(n / b)) { f /= b; r += f * (n % b); }
  return r;
};

export type Still = ReturnType<typeof createStill>;

export function createStill(renderer: THREE.WebGPURenderer, o = { samples: 16, grain: 1.5 }) {
  const make = () => new THREE.RenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
  const targets = [make(), make()];
  const before = texture(targets[1].texture); // what the still held
  const shown = texture(targets[0].texture);
  const uWeight = uniform(1); // of the new sample: 1 / the samples in the still
  const uGrain = uniform(1);
  const show = new THREE.RenderPipeline(renderer);
  show.outputColorTransform = false; // the still holds display colors already
  show.outputNode = Fn(() => vec4(shown.rgb.add(interleavedGradientNoise(screenCoordinate.xy).sub(0.5).mul(float(o.grain / 255).mul(uGrain))), 1))();
  const size = new THREE.Vector2();
  let count = 0;

  return {
    uGrain,
    /** The pipeline's display, blended into the still. */
    blend(display: Node<'vec4'>): Node<'vec4'> { return vec4(mix(before.rgb, display.rgb, uWeight), 1); },
    /** Whether the still has all its samples: nothing more to draw until something changes. */
    get done(): boolean { return count >= o.samples; },
    /**
     * Draw: `fresh` when anything changed, which starts the still again from one sample at the pixels'
     * centers; otherwise one more sample, the camera offset within the pixel while `render` draws,
     * over whatever offset the camera's view already has. `render` is given the sample's number.
     */
    draw(camera: THREE.PerspectiveCamera, fresh: boolean, render: (sample: number) => void): void {
      renderer.getDrawingBufferSize(size);
      for (const t of targets) if (t.width !== size.x || t.height !== size.y) t.setSize(size.x, size.y);
      count = fresh ? 1 : count + 1;
      uWeight.value = 1 / count;
      const write = targets[count % 2];
      before.value = targets[(count + 1) % 2].texture;
      const jitter = count > 1;
      const view = camera.view?.enabled ? { ...camera.view } : null;
      if (jitter) {
        const jx = halton(count, 2) - 0.5, jy = halton(count, 3) - 0.5; // drawing pixels
        if (view) camera.setViewOffset(view.fullWidth, view.fullHeight, view.offsetX + (jx * view.fullWidth) / size.x, view.offsetY + (jy * view.fullHeight) / size.y, view.width, view.height);
        else camera.setViewOffset(size.x, size.y, jx, jy, size.x, size.y);
      }
      const bound = renderer.getRenderTarget();
      renderer.setRenderTarget(write);
      render(count);
      renderer.setRenderTarget(bound);
      if (jitter) {
        if (view) camera.setViewOffset(view.fullWidth, view.fullHeight, view.offsetX, view.offsetY, view.width, view.height);
        else camera.clearViewOffset();
      }
      shown.value = write.texture;
      show.render();
    },
    /** Draw one frame straight to the bound target, blended with nothing: for a capture. */
    plain(render: () => void): void {
      const w = uWeight.value;
      uWeight.value = 1;
      render();
      uWeight.value = w;
    },
    dispose(): void { for (const t of targets) t.dispose(); show.dispose(); },
  };
}
