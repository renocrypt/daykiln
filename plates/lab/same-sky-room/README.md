# SAME SKY · the room

The first frame of Plate III's inside act: a Skyspace, seen from its bench, in two plans. One is a square room with a square aperture; the other a round room with a round one. The ceiling floats above the walls on a slot of hidden light, and the aperture is cut to a knife edge.

The frame plays a sunset through. In the afternoon the sun comes in: its patch lies on the far wall, and dust in the air shows the beam. As the sun sets, the patch climbs the wall into the slot and lights the ceiling from there, and the strip comes up to wash it. The visitor changes the wash; the sky's value never changes, and the probe reads it from the finished frame.

Open <http://127.0.0.1:5196/plates/lab/same-sky-room/> with the project's dev server running.
- **The wash:** keys 1–6 change it (neutral, amber, rose, violet, green, dark); ↑ ↓ change its strength. By day they switch the strip on; from 10° the program brings it up by itself.
- **The sun:** S goes to the next of six places in the sunset: afternoon, golden hour, sunset, afterglow, twilight, and deep dusk. P plays the sunset through from where the sun stands; [ and ] move it half a degree. T holds the sky's clock.
- **The plan:** O switches between square and round.
- **The view:** L looks straight up; drag to look around.
- **The panel:** H shows it, with the probe.

`?webgl` forces the WebGL 2 backend.

## The room

[room.ts](room.ts) builds both plans with one construction. Every curve in plan is the set of points at a distance from a spine square, and a spine of no size gives a circle. A parameter runs round every curve alike, so the ceiling is a ring from the aperture's edge out to its own, and the edge is exact in either plan.

- **Walls:** 7.2 m across, standing to 3.8 m.
  - The lower wall, to 2.2 m, is lime tinted slate blue; above it, white lime.
  - The square room's corners are eased to 12 cm, a plastered arris.
- **Ceiling:** flat, at 4.4 m. It runs 30 cm past the walls, so it floats over a slot. The strip lies in the slot, hidden behind the wall's top.
- **Aperture:** cut to a knife edge; 1.8 m square, or 2 m round.
- **Bench:** runs round the walls, 0.45 m high, upholstered in slate felt. Its front is a curve of its own, so its corners can be sharper than the walls'.
- **Carpet:** a charcoal long pile, 3.5 cm deep, in 24 levels. Its tufts, 3 to 5 mm across, lean the way the pile lies. It is drawn as one plane at the pile's top, from which each view ray is followed down through the levels to the first tuft it meets.
- **Plaster:** matte, untextured, with a hint of velvet where it is seen at a glance.

**Why it looks like this.** In review, the first room read as a paper model, and its ceiling as paper pasted over a frame.
- **The first room:** a white box with every edge coved 0.9 m, every surface the same white, and nothing to give scale.
- **The references:** real Skyspaces keep the light above and the room below dark. The ceiling is lit from a slot and floats; the walls and benches are dark. The two plans follow them.

## Light coming in

At dusk, with the strip on, the sky's own light on the floor is about a hundredth of the sky's radiance through a 1.8 m aperture. Beside the wash, it cannot be seen, as in a real Skyspace. The photographs in which a Skyspace fills with light are taken by day.

So the frame begins in the afternoon, with the sun 25° up and the strip off.
- **The patch:** the sun's patch is drawn per pixel. From each surface a ray toward the sun either leaves through the aperture or does not. Its edge is soft over the penumbra of the sun's disc, 0.53°.
- **Its bounce:** the patch's light on the room is solved with the rest, for the sun at eight elevations.
- **The beam:** along each view ray, as far as the ceiling, the room's air scatters 3% of the beam per meter toward the eye. A phase for dust scatters mostly forward, and some back. The stretch of each view ray inside the beam is found exactly, as a ray against the aperture swept along the sun, and only that stretch is marched.
- **Dust:** 4,000 motes wander through the room and rise slowly. They are seen only where the beam lights them, and each glints as it turns.

The afternoon is exposed for the room, at 2.5 on the zenith, so the sky and the patch are bright, as in a photograph of an interior.

## The passage

P plays the sunset from the afternoon to the end of civil twilight. The sun falls 0.4° a second, so the passage takes about eighty seconds.

- **The patch climbs.** At 25° the patch lies on the far wall, between 2.2 and 3.1 m. As the sun sets it climbs, and from about 9° it lies in the slot. There it lights the slot's back wall, which throws its light across the ceiling from the far side: a golden glow, which the strip later takes over. At sunset its last light is a red sliver in the slot.
- **The bounce, solved eight times.** The room's light from the patch is solved for the sun at 25°, 21.5°, 18°, 15°, 11.5°, 7.5°, 4°, and 1°; between each, the patch climbs a quarter of a meter. The renderer blends the two solutions either side of the sun.
  - The patch is sharp, so each coarse patch's share of the sun is found over its own area, from 64 samples. Sampled only at its middle, the share flickered from patch to patch as the sun set.
  - At first the bounce was solved for the afternoon's sun alone and scaled. When the patch had moved into the slot, it left a warm glow on the wall with nothing to cast it.
- **The program.** The strip comes up from 10°, about forty minutes before sunset, as the real programs begin. It is full a degree below the horizon.
- **Exposure by day.** The room below is far darker than the sky above. From 25° to 1.5° the light on the room's white surfaces falls sixty times, and the aperture's less than six.
  - No single exposure shows both. Held at the afternoon's, the room went black by 5°, and an exposure for the room turns the aperture white.
  - The eye adapts to each as it looks at it, much as an architectural photographer exposes a window apart from the room. So by day the room and the aperture each have their own exposure, adapted to their own light three quarters of the way, in log; as the sun sets, both dim a little.
  - The room's exposure follows the mean light on its upper walls and ceiling, leaving out the sun's patch, which the eye takes as a highlight.
- **White by day.** The eye's white follows the light on the room's surfaces a third of the way, in log. That light includes the strip's but not the aperture's, which the eye sees as a source. Without this, the ceiling in the sun's warm bounce read as brown, not as white in warm light.
- **The hand-over.** As the program comes up, both exposures and the white hand over, in log, to the dusk's: one exposure for room and sky alike, set by eye for each sky; and a neutral white, since the wash's color is the visitor's to adapt to.
- **Between the baked skies,** the clear sky and the sun's light are blended in log. The sun's light near the horizon falls roughly exponentially as it sinks, and a linear blend held its color at the brighter sky's until the last moment.

| The sun | The aperture's exposure | The room's | The zenith, as displayed |
|---|---|---|---|
| 25°, afternoon | 1.65 × 10⁻³ | 1.65 × 10⁻³ | 2.54 |
| 12° | 2.27 × 10⁻³ | 3.60 × 10⁻³ | 2.31 |
| 9°, the patch reaching the slot | 2.68 × 10⁻³ | 6.20 × 10⁻³ | 2.15 |
| 5°, golden hour | 2.40 × 10⁻³ | 5.12 × 10⁻³ | 1.40 |
| 1.5°, sunset | 1.78 × 10⁻³ | 2.25 × 10⁻³ | 0.50 |
| −1°, afterglow | 1.48 × 10⁻³ | the same | 0.142 |
| −4°, twilight | 1.90 × 10⁻² | the same | 0.159 |
| −6.5°, deep dusk | 0.157 | the same | 0.070 |

These are the square plan's; the round plan's room exposures are within 3% of them.

## The sky

In review, a constant sky read as a painted panel, not as sky. The aperture now shows a real one.

**The clear sky** is baked by [tools/sky-bake.ts](../../tools/sky-bake.ts) from a spectral model of the atmosphere.
- **Model:** Bruneton's (2017), with ozone, a clean continental aerosol load, and a thin stratospheric layer; 48 wavelengths.
- **Scattering:** single scattering is integrated in the Earth's shadow, and higher orders follow Hillaire (2020).

Ten skies are baked, from the afternoon to deep dusk.

| Sky | Sun | Zenith | Illuminance on the ground: from the sky | from the sun, normal to it |
|---|---|---|---|---|
| afternoon | 25° up | 1,520 cd/m² | 12,900 lx | 76,100 lx |
| late afternoon | 12° | 996 cd/m² | 8,160 lx | 43,900 lx |
| golden hour | 5° | 569 cd/m² | 4,010 lx | 12,100 lx |
| sunset | 1.5° | 272 cd/m² | 1,660 lx | 582 lx |
| sundown | 0° | 156 cd/m² | 901 lx | 0.67 lx |
| afterglow | 1° below the horizon | 94.7 cd/m² | 537 lx | |
| dusk | 2.5° below | 34.2 cd/m² | 194 lx | |
| twilight | 4° below | 8.44 cd/m² | 48.8 lx | |
| late twilight | 5.25° below | 2.06 cd/m² | 11.9 lx | |
| deep dusk | 6.5° below, past the end of civil twilight | 0.447 cd/m² | 2.76 lx | |

**Checks.**
- **Illuminance:** at the end of civil twilight, with the sun 6° down, the model gives 4.96 lx on the ground, against the conventional 3.4 lx for a clear sky. That is the right order, a little bright.
- **Measured frames:** against Poly Haven's *Qwantani Dusk 1* and *2*, the model's zenith is bluer and its brightening toward the sun gentler.
  - More aerosol moves neither much.
  - The gap grows as the zenith darkens against the horizon, which points at the camera's glare.
  - [tools/lookdev/sky-zenith.ts](../../tools/lookdev/sky-zenith.ts) reads a panorama as the aperture sees it.
- **Cost:** the bake takes 23 s on 12 threads and writes 1,760 KB. Its output is the same on every run, and its values are fixed, so the probe can read them.

**The cloud** is a layer of altocumulus, marched only where the aperture shows it ([src/same-sky/sky.ts](../../src/same-sky/sky.ts)).
- **Shape:** rounded masses 150 to 600 m across, drifting at 17 m/s and slowly changing shape.
- **Direct light:** the sun's light at the layer's altitude, reddened by its path past the Earth's limb. In twilight and deep dusk the layer is in the Earth's shadow and gets none.
- **Sky light:** the sky's illuminance through the layer's level faces.
- **Higher orders:** Wrenninge's octaves.
- **The air below:** it dims the cloud and lays its own light over it.

The afterglow is shown at 0.14, so its sunlit cloud keeps its color below the tone curve's shoulder.

## The light, solved

Light is solved at load, and again for the other plan when it is asked for, by a pool of workers. It is solved for a unit of each source: the strip, the sky through the aperture, and the sun at each of eight elevations, by its bounce alone.
- **The strip:** it lights through a wash lens.
  - Four fifths of its light go into a narrow lobe (cos⁶) aimed 76° from the vertical, far across the ceiling. The rest spill round the slot.
  - With the first lens, aimed at 55°, the ceiling by the walls was 5.7 times as bright as at the aperture's edge. Now it is about 2.2.
  - The strip is 3 cm tall, so the shadow the wall's top casts from it has a penumbra. As a line source, its edge was a hard step that the vertices sampled into a staircase.
- **Direct light** from the strip and the sky is integrated at every vertex; the sun's, over each coarse patch's area.
- **Light between the surfaces** is a radiosity solution on a coarse grid of the same surfaces, about 2,500 patches, each with its own reflectance: plaster 0.85, the slate lower wall 0.13, felt 0.11, and the carpet's pile 0.16.
  - The form factors are kept as sparse rows: 3.8 million in the square plan.
  - Gauss–Seidel runs until no source changes by more than a hundred-thousandth of its brightest direct light, which takes ten sweeps.
- **Carrying it to the fine surfaces:** on walls and ceiling, a Gaussian weighting of each surface's patches round each vertex, 0.3 m wide. Interpolating across the ring's grid had left creases where its fans met its straight runs. At the bench and the carpet, it is gathered afresh at every vertex.
- **Obstructions:** the bench and the wall's top are the only ones, and light is tested against both.
- **Neutral surfaces:** every surface is neutral in the solve, so the room under any wash, sky, and sun is the sum of the three solutions, scaled.

At the aperture's edge, seven tenths of the ceiling's light from the strip has bounced.

**Cost.** The solve is shared out among up to eight workers, two fewer than the machine has threads.
- **The steps:** one worker solves the coarse radiosity while the others find the direct light at the fine vertices, which needs none. Then all of them share out the rest of the fine vertices' light in runs, each worker taking the next as it finishes. One puts the room together.
- **Identical results:** the pooled result is bit for bit the one a single thread gives.
- **Times:** in the browser the square plan takes 2.2 s at load, with every worker cold, and 1.8 s after; the round one takes 1.1 to 1.3 s. In one thread, in Node, they take 3.0 and 2.0 s.
- **Before:** in one worker the square plan took 5.6 s in the browser. Besides the pool, two things brought it down:
  - Gauss–Seidel sums five sources at a time in local variables, which halved the coarse solve.
  - The inner loops use square roots and multiplication in place of `Math.hypot` and `**`, which V8 runs several times slower.

## Edges

Four samples a pixel left the aperture's long, shallow, high-contrast edges visibly stepped: at most one intermediate pixel per column crossed. The frame is now drawn at one and a half times the display's resolution, up to about eight million pixels. SMAA runs after the tone curve, and the browser scales the frame down; the aperture's edge is clean at four times magnification. The carpet's shells keep their tufts by an alpha test, since there are no samples to cover.

## The probe

The probe reads the canvas in the same task as each render, and counts while the sky's clock is held (T). The exposures and the white depend only on the sun and the plan, never on the wash.
- **At dusk:** with the wash moving through violet, amber, dark, and neutral, the held afterglow sky stayed 97.6 113.3 140.9 in every frame on both backends: 360 frames on WebGPU, round plan, and 270 on WebGL 2, square plan.
- **By day:** with the program partway up and the exposures and the white adapting, the wash cycled through five colors while the sky was held.
  - On WebGPU, at 5° and at 1.5°, the sky changed in none of 676 and 693 frames.
  - On WebGL 2, at 9° and at 1.5°, it changed in none of 487 and 482.
  - At 1.5° both backends read the same sky, 175.9 204.8 241.3.

The whole frame is dithered, the sky included; the dither is fixed to the screen, so a held sky reads the same in every frame.

## Calibration

This frame uses the flat-plane test's calibration (lab/same-sky-perception):
- the washed ceiling is 0.5 linear at the aperture's edge;
- the washes are the same values;
- the tone curve is Khronos PBR Neutral at a fixed exposure for each sky, from the afterglow on; before it, see [the passage](#the-passage);
- the wash eases over a 0.8 s half-life.

## Performance

**Drawing.** Drawn at the display's rate with the cloud drifting, the frame kept the GPU busy without a pause, and the MacBook Pro of the flat test ran hot. Now:
- **On demand:** a frame is drawn at once when something asks for one: a key, a drag, a resize.
- **Continuous change, at 30 frames a second:** the cloud drifting, the wash easing, the sun setting. The cloud crosses about two css pixels a second, so each frame moves it by less than a tenth of one.
- **Held:** with the sky's clock held and nothing easing, nothing is drawn.
- **The probe's readback:** the canvas is read back, which makes the CPU wait for the GPU, only while the probe counts and twice a second while the panel shows it. Before, it was read on every frame.

**Measuring.** `?timing` records each pass's time on the GPU with timestamp queries. The panel's figure is render and GPU in series, from the render call to the queue's completion; it is not the interval between frames, which is the display's. Apple's GPUs overlap passes, so a pass's own time is not meaningful; parts of the frame are timed by turning them off, in alternating blocks.

**Where the time goes.** Measured on the same MacBook Pro in Low Power Mode, at 2965 × 2697 (8.0 million pixels), dusk, seated; its clocks vary, so figures are to about 2 ms.
- **The carpet** is the largest cost: 7.3 ms of the frame, and 28 ms where it fills the view, looking down.
  - As 24 alpha-tested shells it cost 10.4 and 32 ms.
  - Walked in one pass it matches them to 0.2 levels in 255, but a group of pixels on the GPU walks as deep as its deepest, so the saving is a third, not more.
- **The beam** cost about 4.5 ms marched along every view ray, and about 1.7 ms marched only inside the beam.
- **The rest,** walls, sky, cloud, SMAA, the tone curve: about 8 ms together.

Earlier figures, at full power: a frame took 9.7 ms at 3577 × 2236 on WebGPU, render and GPU in series, with the cloud drifting; on WebGL 2 frames arrived every 13.7 ms. Each step of the sun costs 0.5 ms on the CPU. The page loads in 2.3 s, most of it the first plan's solve; the cloud's noise takes 0.5 s in another worker alongside it.

## Status, 2026-09-24

This is a first frame, reworked after two reviews: the sky, the two plans, light coming in, the edges, and the sunset played through.
- **Working:**
  - The knife edge, clean at the aperture.
  - A ceiling that floats and glows evenly.
  - A modeled sky with a drifting cloud.
  - The sun's patch, beam, and dust.
  - A sunset from afternoon to deep dusk, in which the patch climbs into the slot as the program comes up.
  - A sky that never changes while it appears to.
- **Not yet right:**
  - The bench and the carpet read as dark shapes; their materials have not been judged up close.
  - The motes are faint unless the beam is looked into.
  - By day the aperture is pale: its zenith is shown at 1.4 to 2.5, on the tone curve's shoulder.
  - Nothing is drawn for the first 2.3 s, while the first plan's light is solved.
  - The ceiling's slot reads as a reveal by day but has not been checked close up.
- **Not yet built:** an HDR canvas, which would let the aperture keep its blue by day; the phone view; the outside act.
- **Not yet tested:** perception in the room on a person; the room against the flat plane; the passage's pace.
- **Not planned:** testing on other devices (decided 2026-09-24). Should it come back, the carpet is the first cost to look at.
