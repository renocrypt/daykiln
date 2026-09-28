# Plates: selected directions

Selected on 2026-09-23 as the working set: three directions, each built on a distinct aesthetic language. Names are working titles. The build order and first prototype have not been decided.

This document supersedes [CONCEPTS.md](CONCEPTS.md) as the primary line. The earlier proposals remain as fallbacks; see [Earlier proposals](#earlier-proposals).

## Three languages, three questions

Each direction starts from the central question of one aesthetic language, then takes a subject that already contains that tension. Applying two languages to one subject was set aside: one of them would always read as a surface treatment.

| | Deconstructivism | Futurism | Light and Space |
|---|---|---|---|
| Central concern | Structure and its hidden contradictions | Time and force | Light and perception |
| Tempo | Held | Fast | Slow |
| Rendering budget | Geometry: partitioning, cuts, clipping | Time: simulation, history buffers | Light: lighting, material, reflection |
| Direction | UNFOLD | WAKE | SAME SKY |

Three is deliberate: enough to compare, few enough to hold in mind at once.

### Terms, used precisely

**Deconstructivism** does not mean dismantling. Derrida's deconstruction reads a text for the contradictions and hierarchies it already contains. The 1988 MoMA exhibition *Deconstructivist Architecture* borrowed the name; its curator Mark Wigley wrote that a deconstructive architect is one who "locates the inherent dilemmas within buildings" rather than one who dismantles them. In Plates, a deconstructive direction must expose a real dilemma inside its subject. Dislocation, sectioning, and misregistered grids are its visual vocabulary. Exploded views and cutaways belong to technical illustration; the series uses them in every direction as part of the [shared grammar](#shared-grammar).

**Futurism** means the Italian movement launched by Marinetti's 1909 manifesto, not the *futuristic* style of dark backgrounds, cyan glow, and heads-up displays. Its core idea is dynamism: time and force as one phenomenon, rendered through repetition, trails, and lines of force. The movement also glorified war, and its Italian leadership joined Fascism. Walter Benjamin's 1936 essay on mechanical reproduction named the mechanism: force presented as beauty, with its consequences removed from the picture. Plates takes time and physical force from Futurism and leaves the cult of force behind. Two rules follow:

1. **Force appears with its consequence.** *Make force legible, not heroic.*
2. **Temporal honesty follows Étienne-Jules Marey.** Every trail corresponds to a simulated or observed path, never an expressive flourish. Marey's chronophotography measured motion in separate phases; Futurism responded to it in pursuit of sensation and continuous form.

The two rules divide the work. Marey governs what is drawn: every line of force is a simulated path. Futurism governs how it is composed and felt: diagonals, a subject the frame cannot contain, and the spectator placed inside the field. Sensation comes from the camera and the composition, never from invented trails. The lineage is direct: [MoMA](https://www.moma.org/collection/works/79347) notes that Marey's photographs of birds in flight directly influenced Giacomo Balla's *Swifts: Paths of Movement + Dynamic Sequences* (1913).

**Public copy names works and people, never movements.** The movement names are internal compasses. Used publicly, they invite expert objections and, for Futurism, a historical disclaimer; Marey, Balla, Turrell, and Waldseemüller need neither.

**Light and Space** is a loosely affiliated Southern California movement of the 1960s, including James Turrell, Robert Irwin, Doug Wheeler, and Mary Corse, that treated light and perception as the material of the work. Its tempo is slow; its surfaces are continuous and whole. It opposes Futurism's speed and Deconstructivism's fracture, which is why it completes the set.

### Operational criteria

What each language requires in practice, the works to calibrate against, and how it usually fails:

| | Deconstructivism | Futurism | Light and Space |
|---|---|---|---|
| Form is | Diagnosis, not styling | The trajectory itself | Perception itself; the material is light |
| Calibration works | Eisenman's Wexner Center and House VI; the voids of Libeskind's Jewish Museum Berlin; Tschumi's three superimposed systems at Parc de la Villette | Balla's *Swifts: Paths of Movement + Dynamic Sequences* and *Dynamism of a Dog on a Leash*; Boccioni's *Unique Forms of Continuity in Space*; Bragaglia's photodynamism; before them, Marey's chronophotography | Turrell's Skyspaces and Ganzfelds; Wheeler's infinity environments; Irwin's scrims; Corse's glass-microsphere paintings |
| Criteria | Every dislocation traces to a reading of the subject; remove it and meaning is lost. Displacements are exact and designed, never randomized. The whole stays recognizable and each fragment keeps its identity. The tension stays open; there is no comfortable final state. Visually restrained, often cold: monochrome, with drawing precision. The drama is in the geometry. | Lines of force extend from the object and deform its surroundings. Superimposed phases are dense but countable; the legs of Balla's dog can be counted. Speed comes from composition (diagonals, radiating lines, a subject the frame cannot contain), not from blur alone. Object and environment interpenetrate, and the spectator is placed inside the picture. | Surfaces are absolutely continuous, with no seams, corners, or texture, and nothing that gives away scale; hence coved corners and the knife edge. Change is measured in minutes, and the viewer's adaptation is part of the work. Nothing is represented: one looks into light. Calibration is exact. |
| Common failure | Shatter and glitch: fragmentation used as an effect | *Futuristic* rather than Futurist: cyan glow, heads-up displays, additive particle trails | Gradient wallpaper; minimalism as a style rather than as perception; bloom. On screens, banding in slow 8-bit gradients |

## Shared grammar

The reference, [The Plane of Focus](references/plane-of-focus.md), sets the quality bar. Its character:

> *A precious mechanism, opened in mid-air and filmed like a miniature.*

Plates borrows the craft, not the register. Precious and miniature are charming registers, and earth, air, and sky shrunk to jewelry lose their scale. The series aims one register higher: each piece is first experienced at its subject's own scale, then explained, then kept. See [Register in LOOK.md](LOOK.md#register).

All three directions share this grammar:

1. **An opened object.** A real object, taken apart along its own logic; the reference separates a lens along its optical axis. Parts hang in space with visible gaps, each still recognizable.
2. **True scale, and blur with a reason.** Each piece is seen at its subject's scale: the globe as an object on a table, the air at the bird's scale, the sky at full scale. Depth of field and every other blur appear only where a real lens or a real exposure would produce them.
3. **The camera explains; it never tours.** It holds still until the visitor acts and moves only to explain a transition the visitor caused. Any input takes over immediately. The reference's automatic six-shot tour is not reused. Parallax between suspended parts explains spatial relationships without extra diagrams.
4. **Explanation inside the scene.** Explanatory elements are objects in the scene, lit like everything else and never glowing. Labels are anchored to parts rather than drawn as screen-space charts, and they appear only when needed.
5. **Everything eases.** Every state value approaches its target through the same exponential damping; nothing jumps.
6. **Smoothness through adaptation.** Procedural geometry, no model downloads for the main scene, and automatic quality reduction (pixel ratio, reflections, ambient occlusion) when the frame rate drops.

**Precedence.** The grammar was drawn from an optical bench, so it favors technical illustration: it suits Deconstructivism, is neutral to Futurism, and works against Light and Space. Each language's [operational criteria](#operational-criteria) come first; the grammar applies only where it does not conflict with them. The exceptions are written into each direction below and into [LOOK.md](LOOK.md).

**Keep the grammar; change the vocabulary.** The reference's navy background and cyan glow are its signature and are not reused. Each direction has its own materials and palette, and a kind of blur that matches its concern:

| Direction | Opened object | Key camera move | Blur | Materials and palette |
|---|---|---|---|---|
| UNFOLD | A globe taken apart: gores peeled from the sphere; meridian ring, horizon ring, and stand suspended around it | From the whole globe, in to the tear, out to the flattened map | Depth of field, focused on the tear | Warm paper, ink line, brass |
| WAKE | The air itself: a lattice of parallel smoke threads, opened by the bird's passage, with the bird's successive phases suspended inside it | Inside the lattice, through the frozen wake with time held still | Long exposure in the smoke; the frozen phases stay sharp | Charcoal ground, smoke white, bronze |
| SAME SKY | A model of the room taken apart: walls, ceiling, knife-edge aperture, hidden interior light | From inside the room to outside it | None inside the room; halation only in the explanation views | Plaster white and the sky's own color |

Palette anchors, lighting, lens, tempo, type, and sound are specified in [LOOK.md](LOOK.md).

## The lens and its color (working title), added 2026-09-24

*White light is many colors, and glass bends each a little differently.*

A candidate for how lenses enter the series, after the [course correction](README.md#origin); the three plates stand. Lenses entered first between the plates ([the lens cut](#between-the-plates-the-lens-cut-added-2026-09-24)), where dispersion shows in every rim; this remains a candidate for a fuller exhibit of the achromat.

### The mechanism

Glass bends short wavelengths more than long ones: its index falls with wavelength, which is dispersion. A single lens therefore brings blue to a focus before red. No screen position holds every color sharp, and every image carries colored rims: chromatic aberration.

Two glasses correct it. A strong converging lens of crown glass, low in dispersion, is cemented to a weaker diverging lens of flint, high in dispersion. The flint undoes the crown's spread of colors while the pair still converges, so red and blue meet at one focus: the achromat. Chester Moor Hall made the first around 1730, and John Dollond patented it in 1758. A trace of color remains, the secondary spectrum.

### The experience

It reads along the light: white light, then the lens, opened, then the image on a screen.
- **Moving the screen:** the spot's rims turn blue, then red; no position holds every color.
- **The flint slides onto the crown:** the colors gather into one white point.

The key visual is the light itself, in a faint haze: it splits into color behind the lens and gathers again when the flint joins. It is traced per wavelength through the glasses' measured dispersion, from Schott's Sellmeier coefficients for N-BK7 and N-F2.

### Taste

Not a laboratory. A dark, quiet space, with glass, light, and color. The camera moves only to show what the visitor caused, choreographed in Anime.js. No numbers unless asked for.

## Between the plates: the lens cut, added 2026-09-24

Retired with the table of plates, 2026-09-27: the plates are entered from the album's door, 照 Daykiln. The lenses' optics are kept in [src/lens/](src/lens/).

*Moving from one plate to the next is changing the lens.*

Each plate is seen through its own lens, the one its camera would have used: a 105 mm double Gauss for UNFOLD, a 22 mm retrofocus wide angle for WAKE, and SAME SKY's to come. The cut between two plates is made inside the lenses, traced per wavelength through their real glass.

Film editing's devices serve the plates here, not any one director's style:
- **One shot through the glass.** The camera backs out of the picture through its lens, element by element, to behind it, where the iris frames the picture.
- **A match on action.** The iris closes to a point, and at that point the next lens's iris opens at the same speed, on the next picture. The cut falls in the one dark frame; the two lenses are black around the point, so nothing jumps.
- **A graphic match.** Nine blades close and seven open, two polygons of the same size in the same place.
- **Rhythm.** Each plate sets the pace of the cut into it.
- **A J-cut, planned.** The next plate's sound comes in under the closing iris, before its picture.

On the front page, the table of plates (retired), the iris is paused (2026-09-25): closing to a point, it came too close to a shutter icon and showed the lens off rather than the picture. The page's passages keep the picture on screen throughout, and the lens shows only as what its glass does to the picture. The transition is the frame, not a plate.

The lens's own faults are the visual material: the rims split into color, a wide lens bends straight lines, and dispersion flashes along the glass's edges. None of it is laid on; it is what the traced glass does.

## UNFOLD — Deconstructivism

*The world cannot lie flat.*

### The dilemma

No piece of a sphere, however small, can be laid flat without stretching; cutting only moves the distortion around. The impossibility was known in antiquity, and Gauss's *Theorema Egregium* (1827) gives the reason: curvature belongs to the surface itself. Every world map is therefore a choice: it may preserve local angles or areas, never both, and never all distances. On a Mercator map Greenland looks comparable to Africa, which is about fourteen times larger. "North up" is also a convention. A seemingly neutral image carries a suppressed hierarchy.

### The experience

The visitor draws a cut in one stroke and releases it. The globe tears along the cut and relaxes into a conformal map: given the cut and a fixed boundary rule, the conformal flattening is unique, so the cut alone decides where the distortion goes. The same pointer then keeps pulling away from the cut, and the map moves continuously toward equal area: Tissot's circles, round but unequal in size, grow equal in area and shear in shape. Wherever the pull stops, that is the map. No position is both conformal and equal-area, and Tissot's field shows it in real time; in between, both distortions appear, marked honestly as a compromise, the family of Robinson and Winkel Tripel. The visitor can also discover that more cuts leave less shear at the equal-area end, which is why interrupted projections such as Goode's homolosine (1923) were invented. The cut and the pull are one decision seen from two sides. One primary gesture with a continuous tail; arrow keys adjust the parameter and Enter commits. Tissot's indicatrix, a field of identical tiny circles on the globe that the projection enlarges, stretches, or both, shows what was sacrificed and where. On a conformal projection the circles stay round and only their size changes.

Diagnosis wins over preciousness. The heritage object is the setting; the misregistration between sphere and plane is the subject. The spherical graticule and the flattened graticule are drawn together, visibly out of register, and Tissot's field works as the diagnostic instrument. Every displacement is computed from the projection, never randomized. No state is free of distortion, so the piece never offers a comfortable resolution.

- **Still frame:** Tissot's field mid-tear: identical circles becoming ellipses as the paper stretches, with the two graticules out of register. The peeling gores and brass rings are its setting, seen through a long lens with a narrow field of view that approaches axonometric projection.
- **Kept result:** The visitor's own projection, printable as a map or as gores that fold back into a paper globe.
- **Lineage:** Martin Waldseemüller's gores of 1507, thought to be the first printed globe gores; with his wall map of the same year, they are where the name America first appears on a map. Buckminster Fuller's Dymaxion map, which projects the Earth onto a polyhedron (a cuboctahedron in 1943, an icosahedron in 1954) and unfolds it flat. "Dymaxion" is a claimed trademark and is not used as a name here.

### Evidence and open work

Named projections are exact formulas, which makes this the most rigorous of the three directions. The first slice fixes a single meridian cut and implements the pull within the cylindrical family: interpolate the northing function from Mercator's to Lambert's cylindrical equal-area, clipping latitude near the poles where Mercator diverges, and compute Tissot's indicatrix exactly from the Jacobian. No JavaScript library computes it. Free cuts follow in a second stage, with numerical flattening that minimizes a weighted sum of conformal energy and area distortion, whose weight is the same pull parameter; the distortion remains measurable on the mesh, so the Tissot display stays truthful.

## WAKE — Futurism

*The air remembers every wingbeat.*

### The mechanism

Each wingbeat pushes air downward and leaves rotating vortices behind. The force of flight is invisible; its consequence remains in the air. Measured wakes change gradually with speed. At the slow extreme they approach separate closed vortex loops; at the fast extreme, vorticity is shed continuously and tip vortices trail behind. Most speeds produce an intermediate structure.

### The experience

The visitor changes wingbeat frequency and amplitude, or sweeps flight speed from slow to fast. Rows of smoke filaments across the flight path roll up into the wake, which shifts continuously from closed loops toward trailing vortices. A continuous control suits this better than a switch between two modes.

Fast lives in the live flight: the wingbeat, the speed sweep, and the camera. The still frame is held. Speed comes from composition as well as blur: the flight crosses the frame on a diagonal and leaves it, and the frozen phases break the frame edge. The smoke rake may stay in frame as the still source of the threads, as the window's verticals stand in Balla's *Swifts*; unlike the obstacle and ruler in Marey's plates, it carries no scale on a picture that is hung: with the bird out of such a picture, a ruler left standing would turn it back into Marey's diagram.

The field is open air at a real hour, in mid-key; the record is Marey's black. The key tells the visitor which act they are in. The smoke rake reads as apparatus, a metal comb standing in the air: the diagnostic instrument brought into the world, as Tissot's circles are drawn onto the globe. Phases are dense but countable, about a dozen per wingbeat at most. Smoke is lit, self-shadowing matter, never emissive; this rule separates a Marey plate from a particle demo.

WAKE is Futurist in composition and Marey-honest in data. Its calibration work is Balla's *Swifts*: a bird's flight painted as repeated phases and the paths they cut through space. Marey's sculpture on a plinth becomes the kept result, not the hero image. Under the precedence rule, WAKE departs from the miniature: the camera sits inside the field at the bird's scale.

- **Still frame:** Time frozen inside the field: the bird's successive phases sweep diagonally through the lattice of smoke threads, which bends and rolls up around them, and the flight runs past the frame edge. No plinth.
- **Kept result:** A print of the frozen flight and a 3D-printable model of the sculpture, Marey's own form of record; see [LOOK.md](LOOK.md#kept-results).
- **Lineage:** Marey photographed bird flight in sequence. In 1887 he modeled a gull's successive wing positions as sculptures; bronze casts survive, one of them held by the Collège de France. From 1899 to 1901 he built a series of smoke wind tunnels; the last sent 57 parallel threads of smoke past obstacles, photographed in an instant. Umberto Boccioni's *Unique Forms of Continuity in Space* (1913) belongs to the Futurist response to chronophotography, although Boccioni denied any debt to photography and sought one continuous form rather than Marey's separate phases. WAKE's frozen phases stay separate, as in Marey and in Balla's *Swifts*, rather than fusing into Boccioni's continuous form.

### Evidence and open work

The aerodynamics require a simplified vortex model, labeled as an approximation. Measured bird wakes can check the qualitative form, not the numbers. No gull wake has been measured; the closest references are small passerines and a swift, so a gull built from published kinematics can match measured wakes only in form. No licensed gull model is good enough for close-up; build the bird procedurally. WAKE carries the highest engineering and performance risk: procedural wing kinematics, shed vortex elements, advected smoke filaments, and a history buffer. Plan a lower-cost path for weak devices, such as a precomputed wake that is replayed and labeled as recorded.

## SAME SKY — Light and Space

*The sky did not change. You did.*

### The mechanism

In James Turrell's Skyspaces, the color of the sky seen through a ceiling aperture depends partly on the sky and partly on the lit ceiling around it: the eye judges the sky against its surround, and the sky appears to shift away from the ceiling's color. Color exists in relationships, so the mechanism is perception itself. Josef Albers demonstrated the same principle in *Interaction of Color* (1963).

### The experience

A quiet room with an opening in the ceiling. The visitor changes the color and intensity of the interior light, and the sky appears to turn bluer, violet, or darker. A probe then shows that the sky's displayed value never changed. Moving from inside the room to outside it explains the illusion: the aperture edge is a thin blade, and a hidden source lights the ceiling.

The piece has two acts. Inside the room is Light and Space; outside it, the room model is technical illustration. The inside shot is an explicit exception to the shared grammar: full scale rather than miniature; no depth of field, vignette, grain, or bloom; no emissive explanatory objects, and no labels until the visitor calls the probe. Interior surfaces are continuous and untextured, with coved corners, so nothing gives away scale. The knife edge is load-bearing: the ceiling within about one degree of the aperture does most of the work, and a dark reveal or gap at the edge nearly abolishes the effect.

- **Still frame:** A square of sky framed by a knife-edge aperture, reading as flat color.
- **Kept result:** A light sequence composed by the visitor, in the spirit of the sunrise and sunset light programs that several Skyspaces run, such as *Twilight Epiphany* at Rice University, kept as a sequence strip: the same sky square inside each ceiling color.
- **Camera discipline:** Hold the camera still while the visitor experiences the effect; move only to explain it, following experience principle 6.

### Evidence and open work

Perception varies with the person, the display, and ambient light. Show both the emitted value and the perceived effect, and never claim a universal percept. The probe must read the final displayed value after tone mapping and postprocessing; otherwise the claim that the sky never changed is false. Simultaneous contrast is robust on monitors, and most of it comes from the surround within about one degree of the edge, which makes the aperture edge the critical detail. The adaptation component may be weaker on a screen than in a physical room, where the surround fills the visual field. Test this early. Color appearance models such as CAM16 do not predict hue shifts induced by a colored surround, so the perceived effect cannot be computed and displayed as fact; demonstrate it and let the visitor judge. Slow gradients band visibly on 8-bit displays; dither the output, and use an HDR canvas where the browser and display support it.

First evidence, 2026-09-24: in the flat-plane test on a MacBook Pro XDR display, dark and violet surrounds shifted the constant sky strongly, amber and rose slightly, and green only at threshold. Near-hue surrounds and dimming carry the effect; see [the test results](lab/same-sky-perception/README.md#results).

Review of the room, 2026-09-24:
- **The sky must read as sky.** A constant sky read as a painted panel on the ceiling, not as sky: the knife edge did its work, and nothing said otherwise. The aperture now shows a modeled dusk sky with a layer of cloud drifting across it. The probe counts with the sky's clock held. See [the room](lab/same-sky-room/README.md#the-sky).
- **The room is seen from its bench,** obliquely, so the frame reads as a room in depth rather than a flat plane. Looking straight up remains the still frame.
- **Dark below, light above.** In review the coved white room read as a paper model, its ceiling as paper pasted over a frame. Real Skyspaces keep the light above and the room below dark: the ceiling floats over a slot of hidden light, and walls and benches are dark. The room now does the same: white lime above a slate-blue lime dado, a slate felt bench, and a charcoal long-pile carpet. The aperture stays a seamless knife edge. This replaces "continuous and untextured, with coved corners". Built in [the room](lab/same-sky-room/README.md#the-room).
- **Square and circle, a duality.** The room comes in two plans, each with its aperture: the square, Albers's, and the round oculus. Turrell built both.
- **Light coming in.** At dusk the sky's own light in the room is too weak to see beside the wash, as in a real Skyspace. The room also has an afternoon, with the sun's patch on the wall and dust showing its beam. It plays the sunset through: the patch climbs the wall into the slot and lights the ceiling from there as the program comes up, until the wash takes over. See [the passage](lab/same-sky-room/README.md#the-passage).

## The set as a whole

The three subjects form ground, air, and sky: the ground flattened, the air disturbed, the sky seen again. This is the series' thread and the order of its plates: Plate I, UNFOLD; Plate II, WAKE; Plate III, SAME SKY.

Estimated engineering difficulty, lowest first: SAME SKY, UNFOLD, WAKE. SAME SKY is geometrically simple; its difficulty lies in perceptual calibration.

**Recommendation, not a decision:** Look first, then two small tests, then one prototype.

1. **Look first.** Four works per direction, twelve in all, viewed at full resolution for an hour. Write down what is seen, not what was read, then compare it with these documents. The vocabulary should grow from the looking.
2. **SAME SKY perceptual test: light before the room.** A full-screen ceiling wash around a square of sky pixels whose displayed value never changes, with fixed exposure and no spatial effects, judged on a laptop, a phone, and an external display. If this flat plane fails, no plaster, cove, or room model can rescue the piece. Built in [lab/same-sky-perception/](lab/same-sky-perception/); the room follows only if it passes.
3. **UNFOLD look-development frame.** A globe segment and a brass ring under UNFOLD's high-key lighting from [LOOK.md](LOOK.md#lighting), with the depth-of-field stack and Tissot's field on the paper. Paper and brass are judged here, not in thumbnails.
4. **UNFOLD prototype.** It exercises the shared grammar with exact mathematics and moderate engineering risk.

## Assets to source

The shared grammar favors procedural geometry, so most assets are data, reference imagery, materials, and libraries rather than finished models. Record every asset's source, license, and role: **in the piece** (ships with the experience) or **reference only** (informs design, never shipped).

Quality bar, in priority order:

1. **Beauty first.** Choose the most beautiful source that fits the direction. Between equally beautiful options, take the more permissive license. Licenses are recorded and respected; they do not rule out the best option. Beauty is checked in a look-development render under the direction's lighting, not asserted:
   - No baked lighting or shadow in the albedo.
   - No visible tiling across three repeats in frame.
   - Roughness varies at the micro scale; a flat roughness map fails.
   - Fiber, grain, or tool marks read at a real-world scale of 2 mm.
   - Normal detail survives at 4K without smearing or compression blocks.
   - A scan carries at least as many source pixels per centimeter of the object as the closest planned framing displays, with no compression blocking, moiré, or halftone in the framed region.
2. **Nothing below the bar enters the repository.** Garbage in, garbage out. An asset that would not hold up under macro framing is rejected, not kept as a placeholder. Prototypes use procedural greyboxes instead of low-quality stand-ins.
3. **Fidelity:** The full resolution the holder offers, never a thumbnail or a web-page copy. Material textures at 4K where available, with complete physically based rendering maps. Look-development renders, not thumbnails, decide final picks.
4. **Provenance:** The holding institution or original publisher, not a re-upload.
5. **Credits:** Record source, author, and license for every asset. Commercial texture and model libraries may forbid committing raw files to a public repository; note this per asset.
6. **Web budget:** Compress at build time (KTX2 textures, Draco or Meshopt geometry) from full-resolution masters.

| Scope | Needs |
|---|---|
| Shared | Typefaces for titles and labels; studio or gallery environment maps; paper, brass, bronze, plaster, and charcoal materials |
| UNFOLD | Coastline and graticule data; a projection library including polyhedral and interrupted projections; high-resolution scans of historical globe gores; photographs of antique globes and stands |
| WAKE | Measured bird wake studies; wingbeat kinematics for a gull or similar bird; Marey's chronophotographs, gull sculpture, and smoke apparatus; a bird model or reference suitable for procedural reconstruction |
| SAME SKY | A physically based sky model or measured dusk sky colors; a color appearance model implementation to estimate perceived shifts; Skyspace architecture and aperture details (reference only); literature on simultaneous contrast |

### Research findings

Catalogued on 2026-09-24; nothing has been downloaded. Full tables, licenses, and sources are in [research/](research/): [shared](research/shared-assets.md), [UNFOLD](research/unfold-assets.md), [WAKE](research/wake-assets.md), [SAME SKY](research/same-sky-assets.md), and the beauty-first [second pass](research/beauty-pass.md). Top picks from the first pass:

| Scope | Top picks |
|---|---|
| Shared | IBM Plex Mono (provisional) as the single label face, with a title face per direction (see [LOOK.md](LOOK.md#type)); Poly Haven `monochrome_studio_03` environment map (CC0) for material calibration; materials in [Selection](#selection); glTF-Transform for KTX2, Meshopt, and pmndrs/postprocessing 6.39.5 with N8AO |
| UNFOLD | Natural Earth coastlines, land, and graticules (public domain); Tom Patterson's world relief; d3-geo-polygon (ISC) for polyhedral projections and fold hinges; Coronelli's 1688 gores (David Rumsey), with Hondius's 1615 gores (Library of Congress) second; Gerhard Emmoser's 1579 clockwork globe (The Met) and the Rijksmuseum Blaeu globe for the object and its brass |
| WAKE | Johansson et al. 2018 flycatcher wakes at 1–9 m/s (data CC0, 17 GB) as a qualitative reference; a two-joint gull wing model scaled to herring gull wingbeat at 3.13 Hz; Marey's smoke photographs and gull chronophotographs at full resolution; The Met's CC0 photographs of Boccioni's sculpture; a procedural bird |
| SAME SKY | `@takram/three-atmosphere`, an implementation of Bruneton's sky model (MIT; model code BSD-3); Poly Haven dusk environment maps (CC0) and the Laval HDR sky database; Color.js CAM16 (MIT); *Twilight Epiphany* documentation |

### Selection

Plates is non-profit and open source. On 2026-09-24 the picks were re-ranked for beauty; licensing no longer excludes a candidate. Per-asset terms remain in the research files.

Promoted:

| Direction | Asset | Why |
|---|---|---|
| UNFOLD | Coronelli's 42-inch terrestrial gores, 1688, via David Rumsey | Among the largest printed gores, densely engraved with cartouches and ships: the most beautiful set found. Replaces Hondius as the primary gores. |
| UNFOLD | Gerhard Emmoser's celestial globe with clockwork, 1579 (The Met) | Gilded brass and silver in 32 views: a literal precious mechanism, and the material reference for aged gilt under a macro lens |
| UNFOLD | Coronelli floor globe, sphere 1,080 mm | The grand form of the object, with brass and gilt ring details |
| WAKE | Marey's 1901 smoke photographs at full resolution | The visual target: evenly spaced white threads on black, deflected by an obstacle |
| WAKE | Collège de France gull chronophotographs; Musée d'Orsay photographs of the gull sculpture | The best primary sources for gull poses and for the sculpture's form |
| WAKE | KleinHeerenbrink et al. 2017, multi-cored tip vortices; Padilla et al. 2019, bubble rings and ink chandeliers | Close-up detail for the frozen sculpture; how a thread thickens as it rolls into a vortex |
| SAME SKY | Laval HDR sky database | Radiometrically calibrated HDR skies to anchor the sky's look. Twilight coverage is unconfirmed, and only three days download directly. |
| SAME SKY | Turrell Skyspace documentation, *Twilight Epiphany* first | Primary design reference. Model an original room, not a copy of a Skyspace. |

Rejected as below the bar:

- Wikimedia Commons copies of Marey's smoke photographs: web-page copies of about 1,000 × 1,600 px.
- The free rigged "Seagull" model: its author rates it for medium and distant shots only.
- The shared paper, brass, and bronze picks: no visible paper fiber at 2K or more, and brass made by re-tinting gold. The plaster and charcoal picks stand pending look development.
- The three.js `Sky` addon for twilight: without ozone, its dusk turns grey.

Materials, from the [beauty pass](research/beauty-pass.md):

| Material | Best found | Notes |
|---|---|---|
| Paper | Megascans "Drawing Paper": a rag-paper scan with an 8K transmission map | No texture library has laid or chain lines. A period-true surface needs an in-house capture of a blank antique flyleaf. |
| Aged, brushed, and gilded brass | Poliigon 7137, 3155, and 7136 | No library searched has a true photoscan of brass. Engraving is procedural, after Emmoser's globe. |
| Patinated bronze | Poliigon 7249 as a dark base | Verdigris is placed procedurally by curvature and occlusion. |
| Plaster | Poliigon 12053 | Only for the room model in SAME SKY's explanation views; inside the room, surfaces are untextured. |
| Charcoal ground | Megascans "Black Slate" | |
| Gull | Procedural | No model good enough for close-up permits an open-source web piece. |

None of the paid picks may be committed to a public repository. Fab requires shipped projects to prevent extraction, which a public web page may not satisfy; Poliigon's and Textures.com's terms appear to exclude open-source works entirely.

Open decisions raised by the research:

- **Full-resolution Marey scans.** Only the holders supply them: the Cinémathèque française for the smoke plates and the Collège de France for the gull plates, which also requires authorization for public use. Sending these requests is the user's decision.
- **Materials route: made in-house (decided 2026-09-24).** Paper albedo is the white-balanced Coronelli scan; laid-paper chain lines and fiber are procedural, since paper of 1688 is laid paper. Brass, bronze, engraving, and verdigris are procedural physically based materials, with Emmoser's globe as the target. Paid picks are bought at the personal tier only as look-development benchmarks and never shipped. If the look-development frame shows procedural fiber falling short at macro range, capture a blank antique flyleaf by photometric stereo.
- **Renderer.** WebGL or WebGPU. The picked postprocessing stack works with three.js r186 on WebGL; the pmndrs version 7 beta does not.
- **Environment maps.** The reference ships none and lights procedurally. Decide whether to ship an environment map or use one only for calibration.
- **Chinese type.** IBM Plex has CJK siblings if Chinese text is needed.

## Earlier proposals

The four proposals in [CONCEPTS.md](CONCEPTS.md) came from an earlier research pass and are retained as fallbacks:

| Earlier proposal | Role now |
|---|---|
| WEAVE | Deconstructivism fallback. Its dilemma: a pattern exists only as the relation between warp and weft, and in a two-color single cloth the back is the color inverse of the front. Separate the two thread systems in space; the pattern dissolves and returns as they close. |
| RESONANT | Futurism fallback. Grain migration paths accumulated as long exposure draw the vibration's lines of force; sound from the same model connects to Luigi Russolo's *The Art of Noises* (1913). |
| AFTER RAIN | Light and Space fallback. Read the hydrology through light: wet surfaces darken and gloss, impermeable ground holds mirror puddles, and permeable ground returns to matte as it absorbs water. |
| TRACE | A separate practical line outside this set. Its deconstructive move is exposing the gap between chronology and causality in an agent run. |

## Fact status

On 2026-09-24 the scientific and historical claims in the three directions were checked against sources; corrections are applied above, and evidence is in the research files. Still unverified, and to be checked before public use:

- Wording and source page of the Wigley quotation.
- The historical summary of Futurism and Benjamin's essay in [Terms, used precisely](#terms-used-precisely).
- Where Marey's gull bronzes are held. A bronze at the Collège de France is documented, lent to the Design Museum Den Bosch in 2023; the Beaune bronze and the 1887 date rest on secondary sources.
- Any measurement of the color shift inside a Skyspace; none was found.
- Calibration facts from the external design review, if they reach public copy: the 12.25° offset between the grids of Eisenman's Wexner Center; magenta as the nautical-chart color for corrections; the meanings of the IHO chart abbreviations `PA` and `Rep`; the 1923 date of Goode's homolosine.
