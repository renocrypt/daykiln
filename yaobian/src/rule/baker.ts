// A rule baked in a worker that stays open: while one bake runs, only the latest request waits,
// so a hand turning the angle is followed as fast as the bakes allow and never falls behind.

import type { Pattern } from './hankin.ts';
import type { Relief } from './bake.ts';
import type { BakeRequest } from './bake.worker.ts';

export type Baked = { request: BakeRequest; pattern: Pattern; relief: Relief };

export function baker(onBaked: (baked: Baked) => void) {
  const worker = new Worker(new URL('./bake.worker.ts', import.meta.url), { type: 'module' });
  let busy = false;
  let waiting: BakeRequest | null = null;
  const send = (request: BakeRequest) => { busy = true; worker.postMessage(request); };
  worker.onmessage = (event: MessageEvent<Baked>) => {
    busy = false;
    if (waiting) { const next = waiting; waiting = null; send(next); }
    onBaked(event.data);
  };
  return {
    want(request: BakeRequest): void { if (busy) waiting = request; else send(request); },
    dispose(): void { worker.terminate(); },
  };
}
