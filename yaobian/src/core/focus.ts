// Depth of field, as a lens gives it, in one pass. A point's blur is its circle of confusion: none
// at the focus, growing over `range` meters either side of it to `radius` pixels. Each pixel
// gathers the points around it whose circles reach it; a point behind this one reaches it no
// farther than this one's own circle, so a blurred ground does not spill over a sharp rim. The
// sampling pattern turns with each pixel and each `frame`, so a still that averages frames resolves
// the blur smoothly.
//
// three's DepthOfFieldNode draws seven passes and two 64-sample blurs; at this frame's size it cost
// more than the scene. The blur here is a few pixels wide, and this is enough for it.

import type * as THREE from 'three/webgpu';
import type { Node } from 'three/webgpu';
import {
  Fn, abs, float, int, interleavedGradientNoise, length, min, perspectiveDepthToViewZ, reference, screenCoordinate, screenSize, screenUV,
  select, smoothstep, uniform, vec4, vogelDiskSample,
} from 'three/tsl';

const TAPS = 20;

export function focus(
  scenePass: THREE.PassNode,
  camera: THREE.PerspectiveCamera,
  o: { distance: Node<'float'>; range: Node<'float'>; radius: Node<'float'> },
) {
  const color = scenePass.getTextureNode();
  const depth = scenePass.getTextureNode('depth');
  const near = reference('near', 'float', camera), far = reference('far', 'float', camera);
  const frame = uniform(0); // turns the pattern between frames a still averages
  const zAt = (uv: Node<'vec2'>) => perspectiveDepthToViewZ(depth.sample(uv).r, near, far).negate(); // m in front of the eye
  const circle = (z: Node<'float'>) => smoothstep(0, o.range, abs(z.sub(o.distance))).mul(o.radius); // px

  const node = Fn(() => {
    const uv = screenUV;
    const z0 = zAt(uv), c0 = circle(z0);
    const sum = color.sample(uv).rgb.toVar(), weight = float(1).toVar();
    const turn = interleavedGradientNoise(screenCoordinate.xy).add(frame.mul(0.618034)).fract().mul(Math.PI * 2);
    const reach = o.radius.max(0.001);
    for (let i = 0; i < TAPS; i++) {
      const offset = vogelDiskSample(int(i), int(TAPS), turn).mul(reach); // px
      const q = uv.add(offset.div(screenSize));
      const z = zAt(q);
      // Behind this point, a circle reaches here no farther than this point's own.
      const c = select(z.greaterThan(z0), min(circle(z), c0), circle(z));
      const d = length(offset);
      const w = smoothstep(d.sub(0.75), d.add(0.75), c);
      sum.addAssign(color.sample(q).rgb.mul(w));
      weight.addAssign(w);
    }
    return vec4(sum.div(weight), 1);
  })();
  return { node: node as unknown as Node<'vec4'>, frame };
}
