// Solves the room's light off the main thread (room.ts), one of a pool. Asked, it solves the coarse
// radiosity for a plan; finds the direct light at a run of fine vertices, which needs no coarse
// solution; holds a coarse solution; solves a run's light under it; or puts the room together.

import { assemble, directRun, solveCoarse, solveRun } from './room.ts';
import type { Coarse, Run, Shape, Surface } from './room.ts';

export type Task =
  | { task: 'coarse'; shape: Shape; suns: number[][] }
  | { task: 'direct'; shape: Shape; surface: Surface; from: number; to: number }
  | { task: 'hold'; shape: Shape; coarse: Coarse }
  | { task: 'run'; surface: Surface; from: number; to: number; direct: Float64Array }
  | { task: 'assemble'; runs: Run[] };

let held: { shape: Shape; coarse: Coarse } | undefined;

onmessage = (event: MessageEvent<Task>) => {
  const m = event.data;
  if (m.task === 'coarse') {
    postMessage(solveCoarse(m.shape, m.suns));
  } else if (m.task === 'direct') {
    const direct = directRun(m.shape, m.surface, m.from, m.to);
    postMessage(direct, { transfer: [direct.buffer] });
  } else if (m.task === 'hold') {
    held = { shape: m.shape, coarse: m.coarse };
  } else if (m.task === 'run') {
    const run = solveRun(held!.shape, held!.coarse, m.surface, m.from, m.to, m.direct);
    postMessage(run, { transfer: [run.light.buffer] });
  } else {
    const light = assemble(held!.shape, held!.coarse, m.runs, 0);
    const parts = [light.white, light.dado, light.felt, light.carpet];
    postMessage(light, { transfer: parts.flatMap((p) => [p.positions.buffer, p.normals.buffer, p.strip.buffer, p.sky.buffer, p.sun.buffer, p.index.buffer]) });
  }
};
