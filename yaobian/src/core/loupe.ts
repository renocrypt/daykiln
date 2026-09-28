// The loupe: the series' one shared tool for leaning in. A glass lens that follows the pointer and
// shows what is under it at four times, rendered, not upscaled: a second pass draws only the small
// window of the view around the pointer, magnified.
//
// The lens is glass, and shows it. Toward its edge the image compresses (barrel distortion), and
// the three colors are magnified a little differently (lateral chromatic aberration), so edges
// fringe. Its rim is a thick bevel that acts as a prism: it bends the view sharply and splits it
// into a band of color, with the one highlight the room's light makes on it.
//
// A point p on screen at offset d from the lens's center shows the magnified view at
// d · (1 + k r²), r = |d| / radius, per color channel k. With the lens camera's view offset set to
// a window of a virtual image `zoom` times the screen, centered on the pointer, the window's pixel
// for an offset d is d + half the window.

import * as THREE from 'three/webgpu';
import type { Node } from 'three/webgpu';
import { dot, float, length, max, mix, normalize, pass, renderOutput, screenUV, smoothstep, uniform, vec2, vec3, vec4 } from 'three/tsl';

export type Loupe = ReturnType<typeof createLoupe>;

export function createLoupe(scene: THREE.Scene, camera: THREE.PerspectiveCamera, o = { zoom: 4, radius: 140 }) {
  const lens = new THREE.PerspectiveCamera();
  const lensPass = pass(scene, lens);
  const uCenter = uniform(new THREE.Vector2(0.5, 0.5)); // screen uv
  const uView = uniform(new THREE.Vector2(1, 1)); // screen, CSS px
  const uWindow = uniform(new THREE.Vector2(1, 1)); // the lens window, CSS px
  const uRadius = uniform(o.radius);
  const REACH = 1.5; // the farthest the rim's prism looks, in radii

  /** Aim the lens at a point on screen, CSS px, before drawing. */
  function aim(x: number, y: number, width: number, height: number): void {
    // The window keeps the screen's aspect, since the lens pass draws at the screen's, and holds
    // everything the lens and its rim can look at; the pass's resolution is scaled to match.
    const need = 2 * o.radius * REACH;
    const w = need * Math.max(1, width / height), h = (w * height) / width;
    lens.copy(camera);
    lens.setViewOffset(width * o.zoom, height * o.zoom, x * o.zoom - w / 2, y * o.zoom - h / 2, w, h);
    lensPass.setResolutionScale(Math.min(1, (w / width) * 1.1));
    uCenter.value.set(x / width, y / height);
    uView.value.set(width, height);
    uWindow.value.set(w, h);
  }

  /** The view with the lens over it. */
  function composite(display: Node<'vec4'>): Node<'vec4'> {
    const d = screenUV.sub(uCenter).mul(uView); // CSS px from the center
    const r = length(d).div(uRadius); // 0 at the center … 1 at the rim
    const inside = float(1).sub(smoothstep(0.995, 1, r));
    // The rim's bevel: from 0.9 of the radius out, the prism.
    const bevel = smoothstep(0.88, 1, r);
    const bend = bevel.mul(bevel).mul(REACH - 1.05); // how much farther out the bevel looks
    const k = r.mul(r).mul(0.14).add(bend); // barrel, and the bevel's bend
    const spread = r.mul(r).mul(0.018).add(bevel.mul(0.09)); // chromatic, strongest in the prism
    const at = (scale: Node<'float'>) => lensPass.getTextureNode().sample(d.mul(scale).add(uWindow.mul(0.5)).div(uWindow));
    const red = at(float(1).add(k).add(spread)).r, green = at(float(1).add(k)).g, blue = at(float(1).add(k).sub(spread)).b;
    let seen: Node<'vec3'> = renderOutput(vec4(red, green, blue, 1)).rgb;
    // The glass: a slight falloff toward the rim, the bevel a little darker, one highlight arc
    // toward the upper left, and a thin dark line where the glass meets its mount.
    seen = seen.mul(float(1).sub(r.mul(r).mul(0.08))).mul(float(1).sub(bevel.mul(0.18)));
    const toward = max(dot(normalize(d.add(vec2(1e-4))), normalize(vec2(-0.62, -0.78))), 0);
    const arc = smoothstep(0.9, 0.955, r).mul(smoothstep(0.995, 0.965, r)).mul(toward.pow(6));
    seen = seen.add(vec3(1, 0.98, 0.95).mul(arc.mul(0.55)));
    const mount = smoothstep(0.985, 0.995, r).mul(smoothstep(1.012, 1.002, r));
    // Outside, the lens's shadow on what it sits over.
    const shade = smoothstep(1.12, 1, r).mul(float(1).sub(inside)).mul(0.22);
    const lit = mix(display.rgb.mul(float(1).sub(shade)), seen, inside);
    return vec4(mix(lit, vec3(0.1, 0.09, 0.08), mount.mul(0.85)), 1);
  }

  return { lens, lensPass, aim, composite, zoom: o.zoom, radius: o.radius };
}
