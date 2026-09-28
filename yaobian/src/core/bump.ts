import type { Node } from 'three/webgpu';
import { abs, cross, dot, faceDirection, normalView, positionView, sign } from 'three/tsl';

/**
 * Bump from a procedural height, in meters, by screen-space derivatives (Mikkelsen's
 * perturbNormalArb). three's bumpMap re-samples a texture at offset UVs, which a procedural
 * height does not follow. As in Plates' UNFOLD look development.
 */
export function bumpNormal(height: Node<'float'>) {
  const sx = positionView.dFdx();
  const sy = positionView.dFdy();
  const r1 = cross(sy, normalView);
  const r2 = cross(normalView, sx);
  const det = dot(sx, r1).mul(faceDirection);
  const grad = sign(det).mul(r1.mul(height.dFdx()).add(r2.mul(height.dFdy())));
  return normalView.mul(abs(det)).sub(grad).normalize();
}
