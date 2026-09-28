// Lab captures: a frame, or a region of it at a scale, rendered at its exact pixel size and
// accumulated over jittered samples, then written outside the repository by the dev server's endpoint
// (vite.config.ts). Shared by the lab pages; KILN's page keeps its own, with its aperture.

import * as THREE from 'three/webgpu';

export type Region = { width: number; height: number; scale: number; x: number; y: number; samples: number };

export type Shooter = {
  renderer: THREE.WebGPURenderer;
  camera: THREE.PerspectiveCamera;
  /** The study's frame, px. A region is a window into this frame at some scale. */
  frame: { width: number; height: number };
  /** Render one sample of the current view into the bound render target. */
  render(): void;
  /** Called before each sample, with its index: for noise that should change between samples. */
  beforeSample?(i: number): void;
};

const halton = (i: number, b: number) => {
  let f = 1, r = 0;
  for (let n = i + 1; n > 0; n = Math.floor(n / b)) { f /= b; r += f * (n % b); }
  return r;
};
const fract = (x: number) => x - Math.floor(x);

let target: THREE.RenderTarget | null = null;

export async function shoot(s: Shooter, { width, height, scale, x, y, samples }: Region, grain = 1.5): Promise<ImageData> {
  const { renderer, camera, frame } = s;
  const saved = { ratio: renderer.getPixelRatio(), size: renderer.getSize(new THREE.Vector2()), aspect: camera.aspect };
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  camera.aspect = frame.width / frame.height;
  target ??= new THREE.RenderTarget(1, 1, { type: THREE.UnsignedByteType, depthBuffer: false });
  target.setSize(width, height);
  const full = [frame.width * scale, frame.height * scale];
  const render = () => {
    renderer.setRenderTarget(target);
    s.render();
    renderer.setRenderTarget(null);
  };
  // WebGPU compiles some passes asynchronously; the first frames after a change can be incomplete.
  camera.setViewOffset(full[0], full[1], x * scale, y * scale, width, height);
  for (let i = 0; i < 4; i++) {
    render();
    await renderer.readRenderTargetPixelsAsync(target, 0, 0, 1, 1);
  }
  const sum = new Float32Array(width * height * 4);
  const webgpu = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend === true;
  const stride = webgpu ? Math.ceil((width * 4) / 256) * 256 : width * 4; // WebGPU pads rows to 256 bytes
  for (let i = 0; i < samples; i++) {
    camera.setViewOffset(full[0], full[1], x * scale + halton(i, 2) - 0.5, y * scale + halton(i, 3) - 0.5, width, height);
    s.beforeSample?.(i);
    render();
    const pixels = (await renderer.readRenderTargetPixelsAsync(target, 0, 0, width, height)) as Uint8Array;
    for (let row = 0; row < height; row++) {
      const from = row * stride, to = row * width * 4;
      for (let c = 0; c < width * 4; c++) sum[to + c] += pixels[from + c];
    }
  }
  camera.clearViewOffset();
  camera.aspect = saved.aspect;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(saved.ratio);
  renderer.setSize(saved.size.x, saved.size.y);
  s.beforeSample?.(0);
  // WebGPU's rows run top to bottom, as an image's do; average, dither, and write.
  const image = new ImageData(width, height);
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const g = (fract(52.9829189 * fract(0.06711056 * col + 0.00583715 * row)) - 0.5) * grain;
      const i = (row * width + col) * 4;
      image.data[i] = sum[i] / samples + g;
      image.data[i + 1] = sum[i + 1] / samples + g;
      image.data[i + 2] = sum[i + 2] / samples + g;
      image.data[i + 3] = 255;
    }
  }
  return image;
}

export async function save(name: string, image: ImageData | Blob): Promise<string> {
  let blob = image as Blob;
  if (image instanceof ImageData) {
    const canvas = new OffscreenCanvas(image.width, image.height);
    canvas.getContext('2d')!.putImageData(image, 0, 0);
    blob = await canvas.convertToBlob({ type: 'image/png' });
  }
  const response = await fetch(`/__studies/${name}`, { method: 'POST', body: blob });
  return response.text();
}

/** Two frames at 50% each. */
export function blend(a: ImageData, b: ImageData): ImageData {
  const out = new ImageData(a.width, a.height);
  for (let i = 0; i < a.data.length; i++) out.data[i] = (a.data[i] + b.data[i]) / 2;
  return out;
}

/** Load a face for drawing records on a canvas. */
export async function loadFace(family: string, url: string): Promise<void> {
  const face = new FontFace(family, `url(${url})`);
  await face.load();
  document.fonts.add(face);
}
