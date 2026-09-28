// Fires one glaze surface off the main thread: the crackle as the glaze cools, the fields the shader
// reads, and, given the bowl's modes as the voice has them, the surface's pings, each crack struck on
// them (ring.ts). The two surfaces fire in parallel, in two workers.

import { chartSurface, profile, type Side } from './bowl.ts';
import { crackle, type FractureParams } from './fracture.ts';
import { rasterize } from './crackField.ts';
import { pingsOf, type Mode } from './ring.ts';

export type FireRequest = { side: Side; params: FractureParams; size: number; scale?: number; modes?: Mode[] };

self.onmessage = (event: MessageEvent<FireRequest>) => {
  const { side, params, size, scale = 1, modes } = event.data;
  const p = profile(side);
  const surface = chartSurface(p, scale);
  const { cracks, stats } = crackle(surface, params);
  const raster = rasterize(cracks, surface.radius, surface.radiusAt, size);
  const pings = modes ? pingsOf(cracks, side, scale, modes) : [];
  const transfer: ArrayBuffer[] = [raster.distance.buffer as ArrayBuffer, raster.orientation.buffer as ArrayBuffer];
  for (const c of cracks) transfer.push(c.points.buffer as ArrayBuffer, c.pointLoads.buffer as ArrayBuffer);
  (self as unknown as Worker).postMessage({ side, cracks, stats, raster, pings }, transfer);
};
