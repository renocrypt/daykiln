// Adaptive quality (DIRECTIONS.md, shared grammar 6): while anything moves, the frame is drawn at
// whatever resolution the GPU can hold at the budget; once it rests, at the screen's full resolution,
// and the still refines it. A resting frame is always the best one the machine can make; a moving
// one is as sharp as it can be and still move smoothly.
//
// How long the GPU takes is read from WebGPU itself: the time from submitting a frame to the queue
// reporting its work done. The resolution while moving steps down a quarter of a pixel ratio when
// frames run over the budget, and back up when they run well under, at most every 0.6 s.

import type * as THREE from 'three/webgpu';

export type Quality = ReturnType<typeof createQuality>;

export function createQuality(renderer: THREE.WebGPURenderer, o: { layout: () => void; budget?: number }) {
  const budget = o.budget ?? 14; // ms of GPU a frame, so a 60 Hz screen never waits
  const top = Math.min(devicePixelRatio, 2);
  const floor = Math.min(top, 1);
  let motion = top; // the pixel ratio while moving, adapted
  let resting = true;
  let average = 0, changed = 0;
  const device = (renderer.backend as unknown as { device?: { queue: { onSubmittedWorkDone(): Promise<void> } } }).device;
  const set = (ratio: number) => {
    if (Math.abs(renderer.getPixelRatio() - ratio) < 0.01) return false;
    renderer.setPixelRatio(ratio);
    o.layout();
    return true;
  };
  return {
    /**
     * Before a frame: whether it is fresh, something moving, or a still being refined. Returns whether
     * the resolution changed, in which case the frame must be drawn afresh.
     */
    frame(fresh: boolean): boolean {
      if (fresh) { resting = false; return set(motion); }
      if (!resting) { resting = true; return set(top); }
      return false;
    },
    /** After a moving frame is submitted: time the GPU's work on it, and adapt. */
    measure(): void {
      if (!device || resting) return;
      const start = performance.now();
      void device.queue.onSubmittedWorkDone().then(() => {
        const now = performance.now(), ms = now - start;
        average = average ? average * 0.85 + ms * 0.15 : ms;
        if (now - changed < 600) return;
        if (average > budget * 1.2 && motion > floor) motion = Math.max(floor, motion - 0.25);
        else if (average < budget * 0.6 && motion < top) motion = Math.min(top, motion + 0.25);
        else return;
        changed = now;
        average = 0;
      });
    },
    get motionRatio(): number { return motion; },
  };
}
