// Draws and bakes a rule off the main thread: the tiling, Hankin's segments at the contact angle,
// and the relief's fields. A bake at a tenth of a millimeter takes a second or more; at 0.6 mm,
// about a tenth of a second. The request comes back with the result.

import { TILINGS, type TilingName } from './tiling.ts';
import { hankin } from './hankin.ts';
import { bake, type ReliefOptions } from './bake.ts';

export type BakeRequest = { tiling: TilingName; across: number; angle: number; options: ReliefOptions };

self.onmessage = (event: MessageEvent<BakeRequest>) => {
  const request = event.data;
  const pattern = hankin(TILINGS[request.tiling](request.across), request.angle);
  const relief = bake(pattern, request.options);
  (self as unknown as Worker).postMessage({ request, pattern, relief }, [relief.fields.buffer as ArrayBuffer, relief.ids.buffer as ArrayBuffer]);
};
