# Reference: The Plane of Focus

Inspected on 2026-09-23 through the live browser, served HTML, loaded resources, and exposed runtime objects.

- User-provided URL: <https://lens.lab.sael.net/>
- Observed destination: <https://sael.net/plane-of-focus/>
- Local source snapshot: [plane-of-focus.source.html.txt](plane-of-focus.source.html.txt)
- Snapshot size: 145,223 bytes.
- Snapshot SHA-256: `baa3e3a5c9584811a437b09090be6c338e82c004af8d569d94493d71401e0510`.
- Source line numbers below refer to that snapshot, not a guarantee about future deployments.

## What it presents

An interactive optical bench explains focus distance, aperture, the plane of focus, depth of field, and the circle of confusion. A miniature valley supplies subjects at different depths. A cutaway lens sits between the valley and ground glass showing a live generated image.

## Confirmed implementation

| Layer | Evidence |
|---|---|
| Application | Plain HTML, CSS, and a large inline JavaScript module |
| 3D | Three.js 0.183.2 through an import map and jsDelivr imports |
| Renderer | `WebGLRenderer`; running context reported WebGL 2.0 |
| Animation | `requestAnimationFrame`, explicit state targets, exponential damping, procedural updates |
| Postprocessing | `EffectComposer`, custom `ScenePass`, `GTAOPass`, `UnrealBloomPass`, custom `MacroDOF`, custom `OverlayPass`, `OutputPass` |
| Geometry | Procedural Three.js geometry and custom buffers; no model loader or GLB/glTF/FBX request found for the main scene |
| Materials | Standard and physical materials, transmission, custom GLSL, and shader patches using `onBeforeCompile` |
| Textures | Many generated using Canvas 2D and `CanvasTexture` |
| Interface | Direct DOM updates and CSS transitions; Outfit and DM Mono fonts |
| Ancillary services | Umami, a shared `sael.net/kit.js` script, and a Cloudflare beacon |

No React, Next.js, React Three Fiber, Anime.js, GSAP, or Framer Motion dependency was found in the inspected main experience. This describes the served implementation; it does not establish the author's private development tools or build history.

## Central state model

Controls and cinematic beats update targets for focus distance, aperture, and assembly amount. The frame loop smooths the current values toward those targets, then derives geometry and visual effects from the result.

The core damping form is:

```js
current += (target - current) * (1 - Math.exp(-speed * deltaTime));
```

Focus is smoothed in reciprocal-distance space. Aperture is smoothed logarithmically. Derived values drive the focus ring, gear rotation, moving glass, iris opening, focus plane, depth-of-field limits, explanatory rays, and displayed measurements.

## Camera and animation

The `SHOTS` array defines six cinematic views lasting 11, 9, 9, 10, 8, and 8 seconds. Each combines framing, slow camera drift, and timed focus/aperture/assembly changes. User interaction stops cinematic control.

Lens parts move through direct transforms. Smoke uses repeating position, scale, and opacity functions. Fireflies use time-driven paths in an `InstancedMesh`. Pointer picking uses `Raycaster`. The wheel changes zoom.

This is a time-driven and input-driven experience. It is not a scroll-progress narrative.

## Rendering relationships

The main view runs through scene rendering, ambient occlusion, bloom, custom depth of field, an explanatory overlay, and output conversion. The renderer uses ACES filmic tone mapping and shadow maps. A reflected camera render supplies a floor reflection when enabled.

A second camera at the lens entrance pupil renders the valley into an offscreen texture. A depth-based shader applies a circle-of-confusion approximation controlled by focus and aperture. The resulting image appears on the ground glass and console displays. The photographic blur supports an aperture-shaped, seven-sided kernel.

The photograph is not produced by tracing rays through every displayed curved glass element. Explanatory rays and the rendered blur share a simplified optical model.

## Public source reading map

| Approximate lines | Read for |
|---|---|
| 212–219 | Three.js and addon imports |
| 232–237 | Optical approximations and focus scale |
| 240–251 | Renderer and resolution budget |
| 287–385 | Environment, floor reflection, postprocessing, overlays |
| 390–470 | Build helpers, lathed parts, gears, lens geometry, iris shader |
| 666–765 | Lens assembly construction |
| 896–941 | Secondary photo camera, depth blur, thumbnail reuse |
| 999–1024 | State damping and mechanical updates |
| 1064–1133 | Picking, dragging, orbiting, panning, zoom, keyboard controls |
| 1135–1163 | Cinematic shots and camera updates |
| 1191–1238 | Render tuning and shortcuts |
| 1240–1273 | Responsive framing, frame loop, automatic quality adjustment |

## Observed behavior and limits

- Tested the middle-focus control, f/16 aperture, assembled housing, and view reset in the desktop browser.
- Confirmed the runtime values settled at the selected targets and the explanatory UI updated.
- Confirmed the hidden render panel opens with Command + apostrophe.
- Observed automatic quality adjustment reduce pixel ratio and disable reflections, multisample antialiasing, and ambient-occlusion intensity during the inspection. This is not a device-independent performance benchmark.
- The source includes mobile framing and some reduced-motion handling. A full mobile or accessibility audit was not performed.

## Lessons for Plates

Carry forward the shared state model, procedural construction, render-to-texture explanations, and causal relationship between control and result. Develop an independent subject, composition, material identity, and interaction objective.

The reference is a strong technical study. Plates' quality must be established through its own rendered output and user interaction, rather than by counting effects or selecting the same libraries.
