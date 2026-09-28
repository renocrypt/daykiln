# Yaobian: score

How Three.js and Anime.js share the motion without fighting. The runtime is [src/core/score.ts](src/core/score.ts).

## One rule

Three.js runs a continuous loop on `dt`; Anime.js runs keyframed timelines. Left apart they ease twice, fight the visitor's drag, and jump when a timeline ends. So: **Anime.js writes targets. Damping writes currents. The renderer reads currents.**

| Layer | Owns | Writes |
|---|---|---|
| Simulation | Fracture, the fire front, the net | World state, on a fixed step |
| Damping | Camera, focus, fades, flip, scale | Currents chasing targets, on `dt` clamped to 50 ms |
| Timelines (Anime.js) | Act changes, reveals, the turn, the growth | Targets only |
| Gestures | Pointer and keys | Targets; they pause the active timeline |

- **One tick.** `engine.useDefaultMainLoop = false`; the render loop calls `engine.update()`, and draws only while something moves.
- **Anime.js does nothing continuous.** It never drives cracks, fire, or nets per frame; it changes their targets.
- **Any frame can be interrupted.** A touch pauses the timeline; damping keeps the picture continuous.
- **One scalar can move thousands of things.** RULE's fire is one number, `front`, that every surface compares its distance to.
- **Prologues are scrolled, not played.** The camera follows the scroll's progress as a target.
- **Reduced motion.** Timelines collapse to cuts; simulations still run; the held opening stays.
- **Sound** (KILN only) is heard a steady two frames after the frame that shows its event, on the output's clock ([src/core/sound.ts](src/core/sound.ts)).
