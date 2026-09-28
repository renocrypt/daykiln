# WAKE · frozen still

A herring gull's frozen phases, cast in bronze, sweeping through a lattice of smoke threads, a wall of them through each phase, which its wake bends down and winds into curls at the wingtips.

- Open <http://127.0.0.1:5196/plates/lab/wake-still/> with the project's dev server running.
- Keys: H panel, S the hour, O overlay test, B bird, D depth of field, R reset view.
- Console: `plates.view(from, to, mm)`, `plates.aimSun(x, y, z)`.

The smoke is simulated by `node plates/tools/wake-sim.ts`, a vortex-lattice wake carrying the threads, on the GPU in a few seconds; it writes `public/assets/wake/threads.bin` (0.4 MB), which [threads.ts](threads.ts) draws. Run it where nothing sandboxes the GPU away from Node. The scene is in [main.ts](main.ts), the cast in [bird.ts](bird.ts). The sky is SAME SKY's ([src/same-sky/sky.ts](../../src/same-sky/sky.ts)). The gull is Julian Johnson-Mortimer's "seagull v1" (CC BY 4.0), prepared by `node plates/tools/gull-asset.ts <seagull_v1.glb>`.
