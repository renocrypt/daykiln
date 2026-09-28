# Plates

A workspace for developing an original interactive visual experience: a mechanism you can see, manipulate, and understand.

## Origin

The project began on 2026-09-23 with a question about The Plane of Focus, an interactive optical bench that shows why one distance in a photograph is sharp and the rest blurred: *"what are other projects we can create [like a new design/concept/domain etc] but inspired by the visual/ideal/presentation but obviously better than that?"*

- **Taken from it: its ideal, and nothing of its look.** Its ideal is to make an invisible mechanism visible: a process hidden inside a lens, known only from its photographs, becomes a space one can watch, operate, and understand. Its look is geeky and ordinary, and is not followed.
- **The purpose:** a showcase of taste and craft in three.js, WebGPU, and Anime.js. Beauty comes first; a mechanism made visible is the substance.
- **Lenses are part of it:** the lens and its color, dispersion, chromatic aberration, and the achromat, as the language the exhibition is presented in. Decided the same day: each plate is seen through its own lens, and moving from one plate to the next is changing the lens, traced through real glass. The lens cut was retired with the table of plates; the lenses' optics are kept in [src/lens/](src/lens/), for the album's door.

**Course correction, 2026-09-24.** The three plates stand: their subjects are well chosen. What drifted was the execution. The register moved from explanatory instrument to artwork, and the work went into realistic rendering, materials, skies, and light, while no plate yet makes its mechanism visible. Each plate is now an exhibit whose mechanism is seen, operated, and understood. The explanation is carried by the picture itself, light, glass, color, and motion, rather than by diagrams and numbers, at the highest standard of taste.

## Current state

- **Name and location:** Plates (图版), a series in 照 Daykiln, in its `plates/`, served under `/plates/`. It was built as a project of its own at `../plates`, now archived. Renamed from Chroma on 2026-09-24: the old name collided with ChromaDB and Razer Chroma, and the series' palettes are paper, smoke, and plaster. The plates are numbered: Plate I, UNFOLD; Plate II, WAKE; Plate III, SAME SKY.
- **Stage:** Building, first frames of all three plates before review. The SAME SKY flat-plane test passed on the first display: the constant sky visibly shifted under four of five surrounds ([results](lab/same-sky-perception/README.md#results)). The UNFOLD look-development frame wraps Coronelli's whole globe and has optical depth of field ([lab/unfold-lookdev](lab/unfold-lookdev/README.md)). The WAKE frozen still flies a bronze gull through a lattice of lit smoke threads, a wall of them through each phase, which its simulated wake winds into curls; the simulation takes a few seconds on the GPU ([lab/wake-still](lab/wake-still/README.md)). The SAME SKY room comes in a square plan and a round one. It shows a modeled sky with a drifting cloud and lets the afternoon sun in as a patch and a dusty beam. It plays the sunset through: the patch climbs into the slot as the program comes up, and the wash takes over while the sky's value holds ([lab/same-sky-room](lab/same-sky-room/README.md)). UNFOLD's first slice cuts the globe, unfolds it onto Mercator's map, and pulls it toward equal area with Tissot's field changing in real time ([lab/unfold-pull](lab/unfold-pull/README.md)). The plates are entered from the album's door, 照 Daykiln; their own front page, the table of plates, and the lens cut between them are retired, and the lenses' optics remain in [src/lens/](src/lens/). Next, after review: the one-stroke cut; WAKE's record act; a perception test of the room against the flat plane.
- **Reference:** [The Plane of Focus](https://lens.lab.sael.net/), which currently redirects to `https://sael.net/plane-of-focus/`. On 2026-09-23 the served HTML matched the saved snapshot byte for byte.
- **Confirmed direction:** Pursue new subjects and art directions inspired by the reference's causal interaction, procedural construction, and cinematic presentation.
- **Selected directions:** UNFOLD (Deconstructivism), WAKE (Futurism), and SAME SKY (Light and Space), sharing one presentation grammar derived from the reference. See [DIRECTIONS.md](DIRECTIONS.md).
- **Decided 2026-09-24:** Rename to Plates; make materials in-house; start building in the recommended order; archive the old studies. Later that day: return to the origin (see above), keeping the three plates; lenses become part of the presentation; Anime.js authors the choreography. The entry is a table of plates. Between plates, the cut is made in the lens, with film editing's devices serving the plates rather than any director's style ([DIRECTIONS.md](DIRECTIONS.md#between-the-plates-the-lens-cut-added-2026-09-24)).
- **Build order:** SAME SKY perceptual test, UNFOLD look-development frame, WAKE frozen still, UNFOLD prototype. Every frame is checked against the refusals in [LOOK.md](LOOK.md#refusals).

## Start here

| File | Purpose |
|---|---|
| [DIRECTIONS.md](DIRECTIONS.md) | The three selected directions, their aesthetic languages and operational criteria, the shared grammar, and asset selection |
| [LOOK.md](LOOK.md) | The visual system: series invariants, type, palettes, lighting, postprocessing, tempo, kept results, and sound |
| [research/](research/) | Asset and fact-check research per direction, and a beauty-first [second pass](research/beauty-pass.md) |
| [CONCEPTS.md](CONCEPTS.md) | The earlier four proposals, now fallbacks |
| [Reference analysis](references/plane-of-focus.md) | Verified implementation of the reference and the principles worth carrying forward |
| [Reference source snapshot](references/plane-of-focus.source.html.txt) | The publicly served HTML captured during the inspection, stored as text |
| [src/lens/](src/lens/) | The three lenses' optics: the glasses, the ray trace, the prescriptions; kept for the door's lenses |
| [lab/](lab/) | Tests and look-development frames |

## Experience principles

1. One meaningful action should visibly change both the mechanism and its result.
2. Compose a strong, readable stationary image before adding camera movement.
3. Let people create, compare, or diagnose something worth keeping.
4. Use a restrained material palette and deliberate lighting specific to the subject.
5. Reveal controls and explanations when relevant. Keep the main object readable.
6. Use guided camera movement to explain a transition; allow immediate manual control.
7. Share one state model between interaction, geometry, sound where applicable, and explanatory graphics.
8. Treat mobile composition, reduced motion, and stable performance as part of the design.
9. Distinguish observed behavior, physical approximation, illustrative animation, and design intent.

## Archived studies

The Canvas 2D motion sketches of the four earlier proposals are archived in [studies/archive/](studies/archive/). They depict the fallbacks in CONCEPTS.md and a retired grammar, not the selected directions. They are not maintained, and their known defects will not be fixed.

## Implementation direction

Every plate is a 3D scene in three.js 0.186.0, using `WebGPURenderer` and TSL: WebGPU first, with an automatic WebGL 2 fallback from the same code. The SAME SKY test produces identical output values on both backends. Vite 7.3.6 and TypeScript 5.9.3 are pinned in the project's `package.json`. Tests and look-development frames live in [lab/](lab/), one page each.

Wherever a plate shows depth of field, it is optical: [src/post/lens-blur.ts](src/post/lens-blur.ts) computes each pixel's circle of confusion from the camera's focal length and film, an f-number, and a focus distance, by the thin-lens equation, and gathers the blur in a background layer and a translucent near layer.

Motion has two owners. Continuous state (every value the visitor or a simulation drives) lives in one state model and eases toward its targets through exponential damping, in [src/core/damp.ts](src/core/damp.ts); this is where the reference's expensive feel comes from. Anime.js 4, the version `duo/stage` uses, will author discrete transitions: an explanatory camera move the visitor caused, a label's arrival and departure, the pacing of a reveal. Its timelines set targets; the frame loop still eases toward them. It enters the project with the first plate that needs it.

Priority: beauty first, then performance. See [Performance in LOOK.md](LOOK.md#performance).

Code, documentation, and code comments are written in English. Discussion can use Chinese with English technical terminology.

## Next decision

Approve the first builds recommended in [DIRECTIONS.md](DIRECTIONS.md#the-set-as-a-whole) and choose the materials route. Every rendered frame follows [LOOK.md](LOOK.md); where it shows a better value than the documents, update the documents. Verify the flagged historical and scientific statements before writing public copy.

## Session record

- **2026-09-23:** Inspected the live reference, its served source, resources, renderer, and controls.
- **2026-09-23:** Proposed WEAVE, RESONANT, AFTER RAIN, and TRACE; prepared illustrative motion studies.
- **2026-09-23:** User requested `./chroma` as the location for project context and contents.
- **2026-09-23:** Confirmed the reference URL redirect and that the served HTML matches the snapshot hash. Inspected the motion studies in a browser.
- **2026-09-23:** Compared Deconstructivism, Futurism, and Light and Space. Selected UNFOLD, WAKE, and SAME SKY with a shared grammar derived from the reference; the earlier proposals became fallbacks. Started asset research.
- **2026-09-24:** Catalogued assets and checked facts for the shared scope and all three directions ([research/](research/)). Applied corrections to [DIRECTIONS.md](DIRECTIONS.md); nothing downloaded.
- **2026-09-24:** The project is non-profit and open source. Asset selection became beauty-first with a strict quality bar; licenses are recorded but no longer exclude a candidate. See [DIRECTIONS.md](DIRECTIONS.md#selection).
- **2026-09-24:** Completed the beauty-first asset pass. Applied two external design reviews: added operational criteria per language, the rule that they take precedence over the shared grammar, and [LOOK.md](LOOK.md) for the visual system.
- **2026-09-24:** Third review: kept Futurism as WAKE's language, reframed as Futurist composition over Marey-honest data, with Balla's *Swifts* as calibration. Adopted two rules: public copy names works and people, not movements; look before naming.
- **2026-09-24:** Fourth review, on register: added experience first, then the record; a refusal list; photographic key per piece, with UNFOLD moved to high-key; the camera no longer tours. See [LOOK.md](LOOK.md#register).
- **2026-09-24:** Fifth review round: UNFOLD's interaction became one stroke with a continuous pull from conformal toward equal area; WAKE gained six acceptance tests, two cameras, and the smoke rake as a still reference; LOOK.md gained a looking list, chart-style honesty marks, and a white-balance rule for Coronelli's print. Viewed Balla's *Swifts* and checked the web calibration works in a browser.
- **2026-09-24:** Sixth review round and decisions: renamed Chroma to Plates; materials made in-house; WAKE given two keys (mid-key open air inside the field, Marey's black in the record); honesty marks rebuilt on existing conventions; the series mark is a vermilion seal reading 版. Archived the old studies. Started building.
- **2026-09-24:** Scaffolded the project (three.js 0.186 WebGPU with WebGL 2 fallback, Vite, TypeScript) and built the SAME SKY perception test: a flat wash around constant sky pixels, rendered on demand, with a probe that confirmed the sky value unchanged on both backends. Applied the third review: WAKE's bird no longer looks at the camera; the seal signs only completed plates; the flat test comes before the room. Recorded beauty-first priority, the performance rules, and Anime.js's role.
- **2026-09-24:** Ran the SAME SKY flat-plane test on a MacBook Pro XDR display: dark and violet strong, amber and rose slight, green at threshold. Accepted the flat plane; phone panels are deferred until the room exists.
- **2026-09-24:** Reviewed the SAME SKY room: the constant sky read as a painted panel, and the room as a paper model. The aperture now shows a dusk sky baked from a spectral atmosphere model, checked against measured frames, with a drifting cloud layer. A felt bench and a long-pile carpet below, lime plaster above; the room is seen on the diagonal from its bench.
- **2026-09-24:** Second review of the room, against photographs of real Skyspaces. The room became dark below and light above, with a ceiling floating over a light slot. It now comes in square and round plans, and has an afternoon with the sun's patch, a beam, and dust. The strip gained a wash lens, and its shadow a penumbra. The indirect light is carried smoothly. Edges are supersampled with SMAA, where 4× MSAA had left the aperture stepped.
- **2026-09-24:** The room plays the sunset through, from the afternoon to deep dusk, over ten baked skies. The sun's bounce is solved at eight elevations, so its light follows the patch into the slot. By day the room and the aperture adapt apart, and the white follows the room's light; both hand over to the dusk calibration as the program comes up, and the sky's value still holds on both backends.
- **2026-09-24:** The room ran the Mac hot: it drew every frame at the display's rate while the cloud drifted. It now draws continuous change at 30 frames a second and nothing while held. It reads the canvas back only while the probe counts, marches the beam only inside it, and walks the carpet's 24 levels in one pass. Measured with GPU timestamps (`?timing`); the picture is unchanged. By day, the wash keys now switch the strip on.
- **2026-09-24:** Built the lens cut between UNFOLD and WAKE. Each plate has its own lens, traced per wavelength through real glass: a 105 mm double Gauss for UNFOLD and a 22 mm retrofocus for WAKE. The camera backs out of the picture through the lens, and the iris closes to a point; the next lens's iris opens from that point at the same speed, so the cut falls in the one dark frame. Past each picture's edges, the world goes on in a wider view taken from the same camera. A frame is drawn only while a cut plays.
- **2026-09-25:** Built the front page, the table of plates, in place of the lab list at the root. The plates develop out of the paper as prints do. Under the pointer, a plate's camera eases into its front glass. Choosing one carries it through its own lens to the full screen: its iris closes to a point, the point travels to the middle of the dark screen, and there the iris opens on the plate. SAME SKY gained its lens, a 14 mm ultra-wide retrofocus, and its picture, the room from its bench. The lens view became one module, shared by the page and the lens cut.
- **2026-09-25:** Review of the pair, Plates and Yaobian: a work's value is an image only its process could produce, one that stops you before you know why, not a process shown with a sentence beside it. On the table of plates, the captions came down to numeral and name, and the iris passage was paused for passages that keep the picture on screen. WAKE is tested first: a region at four times round the tightest curl its wake leaves, with the bird not in the picture. The smoke became an optically thin column after the first attempt read as tubing, and the simulation now resolves the curls. The table's pictures change only after each plate passes.
- **2026-09-25:** Second review of WAKE's four times: not passed, and not to be excused as quieter than the kiln's. The thin column read as a stroke, even along its length and lit on one side only; the curl was too complete, a logo; the combs' nozzles read as a new Marey scale. The smoke was rebuilt as lit matter: each segment draws its exact share of the smoke along the ray and is laid far to near over what is behind it, so a thread can be darker than the air as well as brighter; it shades itself and takes the combs' shadows; the sun became LOOK.md's low side light; and the smoke now writes depth, so the lens no longer blurs it as the sky behind it. The nozzles are gone, the threads leaving through holes in a plain tube. The smoke carries its own time as puffs. Not yet passed: on a smooth laminar thread every setting of the puffs reads as beads, stitches, or leaves, or vanishes, and a thread dense enough for a shadow side reads as rope or cream. Where the puffs' intervals open, the wake has only the tips' curls. See [lab/wake-still](lab/wake-still/README.md#status-2026-09-25).
