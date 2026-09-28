# Plates: look

How the three directions in [DIRECTIONS.md](DIRECTIONS.md) look, move, and sound. DIRECTIONS.md says what each piece is and why; this document says how it is rendered.

Every value here is a starting anchor for look development, written to be reacted against in rendered frames. A value changes when a rendered frame shows a better one; update this document when it does. Where a direction's [operational criteria](DIRECTIONS.md#operational-criteria) conflict with the shared grammar, the criteria win; those exceptions are written into the sections below.

## Register

**Corrected 2026-09-24, see the [origin](README.md#origin).** The series is an explanatory instrument by its substance and a work of design by its standard. Each plate makes a mechanism visible, and the picture carries the explanation: light, glass, color, and motion, not diagrams and numbers. The reference is geeky and its look ordinary; the series takes its ideal and none of its look. The notes below on registers still hold for taste; where they put explanation after the experience, the correction wins: seeing the mechanism is the experience.

Interactive web work sits in roughly four registers: a technical demo; a tasteful widget; a crafted explanatory instrument, where the reference and Bartosz Ciechanowski's essays sit; and a work of art, which takes a position and changes how one sees something afterwards. The series' ideas belong to the fourth. The shared grammar, drawn from an explanatory instrument, pulls toward the third.

The rule that lifts each piece: **experience first, then the record.** The visitor is inside the piece before anything is explained; explanation comes when asked for; the kept result is the record.

- **SAME SKY:** Fully the fourth register. The inside act is the experience; the reveal and the outside act come after.
- **UNFOLD:** Between the third and the fourth. Its mathematics is its beauty: the precision of Tissot's plates over the density of Coronelli's print, not the emptiness of a minimal field.
- **WAKE:** The fourth in the experience, inside the field. The record, a Marey plate and a sculpture, comes after.

The cost is some usefulness: the pieces explain less up front. The kept results hold what the visitor takes away, and the colophon holds the evidence.

At this register, beauty comes mostly from subtraction. A decision that adds something moves a piece toward the middle; a decision that removes something moves it up.

## Series invariants

The reference is recognizable from one frame. The three palettes differ, so these rules carry the identity across them:

1. **The held opening.** Every piece opens on a composed still frame and holds it before the camera breathes. The first frame must work as a photograph. There is no automatic tour.
2. **One label system.** One monospace for every label, readout, and caption, at every size. Hairline leader lines, one device pixel wide, end in a 3 px dot on the anchored part. Label text takes the label value in the direction's palette: ink on UNFOLD's field and on WAKE's mid-key air, a light value on the black of WAKE's record. Only the active label is set at full contrast. Labels are drawn after depth of field, so they never blur, and they therefore appear only on parts inside the focal plane; a label whose part leaves focus fades out. A sharp label pointing at a blurred part reads as interface, not annotation. Inside SAME SKY's room there are no labels until the visitor calls the probe.
3. **The kept-result card.** Every kept result uses the same frame: the artifact, one monospace caption line beneath it (plate · parameters · date, for example `Plate I · cut and pull · 2026-10-02`), and the series mark. Titles appear here, not during the experience. Two formats: A3 print, vector where possible, and a 2400 × 1260 px image for sharing.

4. **Text after the experience.** No title and no movement name on screen during the experience. Sources, method, and honesty statements live in a colophon. On screen, experience principle 9 is kept by conventions that already exist, never by invented codes:
   - **Default:** everything on screen is computed by the stated model, and the colophon says so once. Only departures are marked, in both directions.
   - **Measured or reported values** carry their source. Nautical-chart abbreviations are borrowed only where their chart meaning holds literally: `PA`, position approximate, for a modeled vortex core; `Rep`, reported, for a value taken from the literature.
   - **Illustrative motion** is drawn in the phantom line of engineering drawing (ISO 128 line type 05.1, long-dashed double-dotted; ASME Y14.2's phantom line), which exists to show a position that does not claim to be the current state. No words.
   - **Design intent** uses the museum's attribution words: *after* Marey for the procedural gull sculpture, *reconstruction* for the room model, *facsimile* for the white-balanced Coronelli.
   - **Blank is the strongest mark.** The picture stops where the data stops. The wake fades to nothing beyond the simulation's history; the sky table refuses elevations it does not cover; Tissot's circles appear only where the Jacobian was computed. Nothing is extrapolated.

   SAME SKY's probe is itself the honesty device and needs no mark.

**No light or dark mode.** Each piece is a lit scene. The system color scheme changes nothing inside it, and the host page takes the piece's ground color, so the frame always matches the picture.

**The series mark: a vermilion seal, after completion.** In East Asian painting, calligraphy, and prints, the one touch of color is often the seal: vermilion on white paper and black ink, a signature and a discipline, the same one that reserves a single notation hue for marks. The seal text is 版. A seal signs a finished work, so it appears only on the kept results of a completed plate: never in the experience, and never on look-development frames. It must be designed to the standard of seal carving; a generic digital seal is kitsch. Until that standard is met, use a blind stamp, pressed without ink, or no mark at all.

## Refusals

Rules that forbid are easier to keep than rules that encourage. Every rendered frame is checked against these:

- No glow and no additive blending.
- No slider that is not the object itself. Each piece has one primary gesture on the object, and every gesture has a keyboard equivalent.
- No title and no movement name on screen during the experience.
- No automatic tour.
- No patina as style: materials age only where they would really age.
- No material texture below 4K, and no pick decided from a thumbnail.
- No sound that does not come from the scene.
- No decorative blur: every blur has a physical cause.
- No screen-space charts: explanation happens in the scene.
- No navy and cyan, the reference's signature.
- Nothing below the quality bar enters the repository.

## Type

- **No Google Fonts.** Every face comes from the Indian Type Foundry's Fontshare, or from jsDelivr.
- **Labels:** Commit Mono, one monospace for every label and readout.
- **Titles:** each plate owns its face and its type scale. UNFOLD: Stardom, engraved capitals, very large. WAKE: Bevellier, italic and heavy, too big for the frame, its weight axis animated. SAME SKY: Tabular, light and widely spaced, small.

Candidates and licenses are in [research/shared-assets.md](research/shared-assets.md).

## Palettes

Anchors are sRGB display targets for rendered frames, not material albedos. Each palette has one sentence of discipline, which overrides any individual value.

### UNFOLD

High-key.

*Ink is the structure and the field is light. Nothing carries hue as style.*

| Role | Anchor |
|---|---|
| Field | `#ecebe7` |
| Paper, lit | `#f4eee0` |
| Paper, turning away | `#cbc2ae` |
| Ink | `#1f1d1a` |
| Brass | `#a88a52`, only where the object is brass |
| Label | Ink, `#1f1d1a` |

The print keeps its own faded color. Brass appears where the instrument is brass and is never an accent; nothing else is added, except the notation color below if the frame proves it necessary. Tissot's field and the two out-of-register graticules are drawn in ink.

**Coronelli's print, white-balanced.** The scan's yellow is old paper under scanner light, not paper under scene light. Sample an unprinted margin, map it to the scene's white point with a diagonal white balance, and keep every color that remains: it is real pigment, and removing it would violate the refusal of patina as style. Remove water stains and collection stamps; keep the plate tone. Skipping this step turns the whole frame cream and brings heritage back.

**A notation color, only if the frame needs it.** Coronelli's beauty is density. If Tissot's field and the second graticule, drawn in ink, cannot be separated from the print's own rhumb lines and graticule in the look-development frame, give the diagnostic layer one notation color rather than changing the print. Nautical charts use magenta for lights, cautions, and hand corrections. It would be the only hue in the frame that does not come from the object, and it marks the layer as diagnosis rather than document. The rendered frame decides.

A dark room with a warm lamp on paper and brass is the language of heritage branding; high-key moves UNFOLD toward the white field and drawing precision of Deconstructivist architectural drawings.

### WAKE

Two keys, one per act. The key tells the visitor which act they are in.

**Inside the field: mid-key.** *The air has the color of a real hour. Smoke is matter in the air, both brighter and darker than it. Nothing glows.*

| Role | Anchor |
|---|---|
| Air, upper | `#8d8f95` |
| Air, near the horizon | `#b9ad98` |
| Smoke, lit | `#f1ede6` |
| Smoke, shadow side | `#5a5854`, darker than the air: the proof that the smoke is lit |
| Label | Ink, `#1f1d1a` |

The field is open air, not a giant wind tunnel. A herring gull is a coastal bird, so the air is a desaturated sea sky: cool grey above, faintly ochre near the horizon. This takes Balla's principle, not his violet and ochre. Mid-key is also the stricter test of lit smoke: on black, additive smoke can pass; in mid-key air, a thread must show a lit side brighter than the air and a shadow side darker than it. The bird's material in this act is decided in look development.

**The record: low-key.** *Marey's conditions: black velvet, one hard light, smoke the only light.*

| Role | Anchor |
|---|---|
| Ground | `#0a0a0b` |
| Smoke, lit | `#ece8e0` |
| Smoke, self-shadowed | `#4d4b47` |
| Bronze | `#5f4631`, highlights toward `#c89c64` |
| Label | `#9a968e` |

Series rule: saturated sky belongs to SAME SKY. WAKE's sky is grey.

### SAME SKY

Mid-key, with one saturated field: the sky.

*The room has no hue of its own. Color comes only from the light program and the sky.*

| Role | Anchor |
|---|---|
| Plaster under neutral light | `#eeebe5` |
| Plaster, far wall | `#bcb8b0` |
| Exterior at dusk | `#16171b` |
| Label | `#6f6c66` |
| Sky | The sky model's output, never graded |

Interior surfaces are continuous and untextured, with coved corners. Plaster texture appears only on the room model in the explanation views.

The inside act stays dim, at the level of dusk. In the first perception test the shift read more strongly at lower display brightness; see [the results](lab/same-sky-perception/README.md#results).

## Lighting

Lighting will separate the three pieces more than their materials.

| Direction | Setup |
|---|---|
| UNFOLD | Broad, soft north light keeps the field high-key. A low raking key, about one stop above the fill, brings up engraving and fiber. Neutral daylight, about 5,000 K. A strip light gives each brass ring one long continuous highlight. |
| WAKE | **Inside the field:** a low, hard side light, like a low sun, with the grey sky as the only fill. **The record:** lit like a Marey plate, one hard side light perpendicular to the camera axis, against black, no fill. In both acts smoke is lit, with forward scattering and self-shadowing, never additive or emissive. Bronze takes the key and a thin rim. |
| SAME SKY | No key light. Only the hidden cove wash, which is the light program, and the skylight falling through the aperture. The ceiling's gradient toward the aperture is the composition. |

## Lens and postprocessing

| Direction | Rules |
|---|---|
| UNFOLD | A long lens with a narrow field of view: 105 mm on full frame at f/2, about 2.6 m from the globe's center, as the first look-development frame. Depth of field through a thin lens ([src/post/lens-blur.ts](src/post/lens-blur.ts)), with the circle of confusion computed from focal length, film, f-number, and focus distance, so every blur has its optical size. Focus sits on the peeled sheet, where Tissot's circles have become ellipses, and holds to that spot of paper as it moves. Ambient occlusion on, for engraving and rings. No bloom. Fine grain. |
| WAKE | **Phases are sharp; smoke is the exposure.** The frozen phases stay separate, in focus, and unblurred, and the smoke carries the accumulated time. Motion blur appears only on the live wing, never in frozen time. Phases are countable, about a dozen per wingbeat at most. The flight crosses the frame on a diagonal and leaves it. The smoke rake, the tubes the threads leave from, may stay in frame as their source, but not as a ruler: nothing on the picture that is hung reads as a scale. **Two cameras, one per act.** Inside the field: a wide lens, the camera among the filaments, at least one thread nearer than the bird and partly covering it. The record: Marey's fixed camera, a long lens or orthographic projection, side or top view, black ground, no smoke in front of the bird. No bloom. Fine grain. |
| SAME SKY | Two states. **During the experience:** fixed exposure with no automatic adjustment; no depth of field, bloom, halation, vignette, grain, or ambient occlusion within about 2° of the aperture; full scale; no labels or emissive objects until the visitor calls the probe; the knife edge stays perfectly sharp. Output is dithered so slow gradients do not band, with an HDR canvas where supported. The probe reads the final framebuffer. **In the explanation views:** halation and depth of field return. |

**Between plates.** Retired with the table of plates; its optics are kept in [src/lens/](../src/lens/). The cut was traced through each plate's own lens: three wavelengths per pixel through real glasses, so color fringes, distortion, and vignetting are optical. While the camera is inside the lens, the picture is thrown out of focus, wider in blue. Past the picture's edges, the world is the same camera's wider view, never a mirror or a painted falloff. The pictures themselves are never altered: the cut begins and ends on the exact frame.

**Tone mapping for SAME SKY.** Three.js applies tone mapping per pixel at a fixed exposure, so the curve alone does not shift the sky as the surround brightens. The risks are automatic exposure and any spatial effect that crosses the aperture edge. ACES filmic, which the reference uses, does shift the hue of saturated colors, so SAME SKY should use a hue-preserving curve such as Khronos PBR Neutral (`NeutralToneMapping` in three.js). UNFOLD and WAKE choose their curves in look development.

## Acceptance tests

Tests run on rendered frames. For WAKE, the first three decide success; the last three are thresholds.

| Test | Layer | Pass |
|---|---|---|
| Overlay | Marey: what is drawn | Render a debug frame of only the simulated filament polylines and the phase skeletons, and lay it over the beauty frame. Every stroke in the beauty frame falls on a debug line; an extra stroke is decoration and fails. A debug line missing from the beauty frame may be hidden only by light or occlusion, never deleted. |
| Crop | Futurism: how it is composed | Crop to the bird's bounding box plus ten percent. If the crop is still the picture, the frame is a specimen and fails. The wake's main line leaves the frame through at least two edges; the bird sits outside the central third both horizontally and vertically; the dominant vector is diagonal. |
| Two cameras | The two acts | The inside act and the record share neither a projection nor a key: mid-key air inside, Marey's black in the record. A single three-quarter view at 35–50 mm for both is neither inside the field nor a record, and fails. |
| Spacing | Marey | With the smoke hidden, the distance between adjacent poses equals speed times the phase interval. Render two speeds and measure; spacing that does not change with speed is fake. |
| Occlusion | Lit smoke | At four times magnification, where two threads cross, the nearer covers the farther, and each thread has a lit side and a shadow side. A crossing where both threads are equally bright is additive and fails. |
| Plinth | Futurism | In the inside act, no ground, horizon, or base appears under the frozen poses. The record may have them. |

## Looking list

Before building, look at these at full resolution for an hour and write down what is seen, not what was read; then compare with these documents. Four works per direction:

| Direction | Works |
|---|---|
| UNFOLD | Coronelli's 1688 terrestrial gores; the plates of Tissot's 1881 *Mémoire*, ellipse fields over graticules in ink on white; Eisenman's Wexner Center plans and axonometrics, 1983–89, two grids drawn on one sheet at an offset; Tschumi's *The Manhattan Transcripts*, 1976–81, as a notation system. Boundary markers, which UNFOLD must not resemble: Libeskind's *Micromegas* (1979) and Hadid's paintings for The Peak (1982–83), where dislocation becomes gesture. |
| WAKE | Marey's 1901 smoke photographs; Marey's gull chronophotographs; Balla's *Swifts: Paths of Movement + Dynamic Sequences* (1913); Boccioni's *Unique Forms of Continuity in Space* (1913) |
| SAME SKY | Turrell's *Twilight Epiphany*; Turrell's *Aten Reign* (Guggenheim, 2013); an Irwin scrim installation; an Albers *Homage to the Square* |

**Web works for calibrating register**, in the browser, not from descriptions: Rafaël Rozendaal's intotime.com; Studio Moniker's clickclickclick.click (2016); Way to Go by AATOAA and the NFB (2015); Tyler Hobbs's *Fidenza* (2021). Two ceiling markers for the third register, which Plates must clear: Bartosz Ciechanowski's *Mechanical Watch*, which the series should exceed in experience without falling below in craft, and Anders Hoff's inconvergent.net, for the quality of UNFOLD's ink line. On 2026-09-24 every address responded; Way to Go loaded its canvas but its walk needs pointer lock, so check it by hand.

First look, 2026-09-24, at *Swifts* only: rigid vertical bars run the full height and stay still; sinuous pale lines, the paths of movement, cross the whole canvas and leave both side edges; the birds repeat as dense rows of phases, countable in the lower band; there is no ground or horizon. The paths read almost exactly like a lattice of threads deflected by passage. The key is mid-tone (violet, ochre, and brown) rather than black, an open question for WAKE's inside act.

## Tempo

Held, fast, and slow, in numbers. The reference's constants come from its [source](references/plane-of-focus.source.html.txt). Damping half-life *h* converts to the reference's rate constant as *k* = ln 2 / *h*.

| | Reference | UNFOLD (held) | WAKE (fast) | SAME SKY (slow) |
|---|---|---|---|---|
| Opening hold | Drifts from the first frame | 4 s | 2 s | 8 s |
| Explanatory camera move | Automatic shots of 8–11 s | 3–5 s | 2–3 s | 15–30 s, from inside the room to outside |
| Camera drift | Yaw 0.23–0.69°/s, sway ±1.4° over about 50 s, dolly-in 0.8% of distance per second | ≤ 0.2°/s, sway ±0.6° over 60 s | Follows the bird; 3–5°/s orbit in frozen time | None during the experience; 0.3°/s when explaining |
| State half-life | 0.17 s (*k* = 4.2); 35 ms while dragging | 0.3 s; 40 ms while dragging | 0.12 s | 0.8 s for the wash, because adaptation takes time |
| Other | | | Real time at cruise (herring gull, 3.13 Hz); inspection at 1/8 speed | Programmed steps crossfade over one to two minutes; the visitor's own changes settle within seconds |
| The cut into it | | 1.5 s out through the lens, 0.56 s for the iris to close and as long to open, 1.5 s in | 0.8 of UNFOLD's times | To be set with its lens |

## Kept results

| Direction | Artifact |
|---|---|
| UNFOLD | An A3 sheet of the visitor's gores, laid out to cut and fold back into a paper globe, or of the flattened map with its Tissot field. Vector linework; imagery at print resolution. Caption: projection or cuts, and what was preserved. |
| WAKE | A print of the frozen flight, lit as a Marey plate, and a 3D-printable model of the sculpture: the bronze the visitor could cast. Caption: speed, wingbeat frequency, amplitude. |
| SAME SKY | A sequence strip: the same sky square set inside each ceiling color of the visitor's program, side by side, like a plate from *Interaction of Color*. The illusion survives on paper. Caption: the sky's single value and each wash. |

## Sound

Sound is off until the visitor turns it on.

| Direction | Sound |
|---|---|
| UNFOLD | Paper and brass, sparse: the tear, the settling sheet, a ring's click. |
| WAKE | Wingbeats and moving air, synthesized from the same kinematics as the picture. Frozen time is silent. |
| SAME SKY | Room tone only. The exterior view adds distant evening air. |
| Between plates | A J-cut: the next plate's sound comes in under the closing iris, before its picture. |

## Joy

The reference is playful. Each plate needs a moment that makes someone smile:

- **UNFOLD:** Greenland shrinking as the visitor changes what to preserve; the paper globe folding back together.
- **WAKE:** A bird with character, conveyed through the mechanics of real flight rather than performance: the head held level while the body moves, a bank into the turn. The bird never looks at the camera; the picture lives in the whole sweep, not in the bird.
- **SAME SKY:** The probe's reveal that the sky never changed.

## Performance

Beauty first, then performance. When they conflict, beauty wins on capable devices, and performance work adapts the frame on weaker ones; it never removes what makes the frame beautiful where the device can afford it.

- **Render on demand.** A settled frame is drawn once; the GPU idles until something changes. The SAME SKY test does this: zero frames while still.
- **An adaptive ladder, set per plate.** When the frame rate drops, quality steps down in an order chosen in look development. Each plate names what never degrades: UNFOLD's ink line and Tissot's field; WAKE's lit, self-shadowing smoke, never swapped for additive smoke; SAME SKY's knife edge, fixed exposure, and dither.
- **Measure on the slowest target first.** Before an effect is kept, time it on a mid-range phone, using GPU timestamp queries where the backend offers them.
- **Payload.** No model downloads for the main scenes; KTX2 textures; each plate loads only its own code and assets. The three.js WebGPU build alone is about 245 kB gzipped.

## Mobile

- **SAME SKY:** Portrait, looking straight up at the aperture. The phone becomes the ceiling.
- **UNFOLD:** Portrait frames a single gore mid-tear.
- **WAKE:** Landscape is preferred. In portrait, the flight climbs through the frame.
