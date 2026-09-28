# Plates: earlier concept proposals

> **Status (2026-09-23):** Superseded as the primary line by [DIRECTIONS.md](DIRECTIONS.md). These proposals remain as fallbacks; their current roles are listed there.

These are original proposals for this project, not claims of unprecedented subject matter or guaranteed superiority. Names are working titles.

The shared ambition is to make an invisible mechanism legible, then give the visitor a consequential action and a result they can keep.

## 1. WEAVE — A rule becomes material

**Recommendation:** Best initial visual flagship.

### The experience

Begin close enough to see individual fibers crossing. Pull back to reveal a fabric that is being woven. The visitor changes a small pattern grid; selected warp threads lift, the weft passes through, and the new rule becomes visible in the growing fabric. Finish by letting the visitor inspect and save their own swatch and pattern.

**Causal loop:** Pattern rule → thread selection → weaving motion → material surface.

### Visual direction

Warm paper, terracotta or deep petrol yarn, brushed brass, and a quiet gallery background. Grazing light exposes the weave. Alternate macro inspection with one composed view of the mechanism. The fabric is the main subject; the apparatus supports it.

### Signature interaction

Change one cell in the pattern and follow its consequence from the instruction grid, through a lifted thread, into a repeated motif. Use a continuous camera move to connect these scales.

### Why it could improve on the reference

- The visitor authors a visible result instead of only choosing demonstration states.
- Macro-to-object transitions can explain a causal relationship with less permanent interface clutter.
- The material palette gives the work a visual identity distinct from a dark optical laboratory.
- A generated swatch makes the experience useful for textile, pattern, and generative-design exploration.

### First build slice

One simplified loom mechanism, one editable repeating grid, two yarn colors, a believable cloth surface, and an exportable pattern image. Use procedural crossings and a controlled drape first. Full cloth simulation is not required to demonstrate the central interaction.

### Evidence and open work

Punched cards controlling thread selection are a real historical mechanism. See the Science Museum Group's [Jacquard cards](https://collection.sciencemuseumgroup.org.uk/objects/co471243) and [Jacquard Hand Loom](https://collection.sciencemuseumgroup.org.uk/objects/co8405056/jacquard-hand-loom).

Research weaving constraints before allowing arbitrary patterns: a visually appealing bit grid is not automatically a practical textile draft. The rendering challenge is convincing fibers, crossings, and directional highlights at multiple distances.

## 2. RESONANT — The shape of a note

**Recommendation:** Strongest opportunity for a combined audio and visual experience.

### The experience

A thin metal plate sits in soft light, scattered with grains. Excite it and the grains begin to migrate. Near resonant modes, a pattern resolves. Change the excitation or mode and see a new arrangement; hear a sound generated from the same underlying parameter model.

**Causal loop:** Excitation → plate vibration → nodal pattern → audible response.

### Visual direction

A single sculptural object, mineral-colored grains, restrained bronze highlights, and ample negative space. Fine motion carries the experience. A slow inspection view exposes the plate deformation separately from normal-speed sound.

### Signature interaction

Find a resonance by adjusting the drive, then freeze the visual motion and reveal the regions that move and the nodal lines that remain still. Switch between two modes to compare shape and sound.

### Why it could improve on the reference

- Two senses reinforce the same cause and effect.
- Searching for a resonance creates a small discovery, rather than a prescribed camera tour.
- The visitor can save a visual pattern with its sound as a small audiovisual composition.

### First build slice

One plate shape, a small set of documented or numerically derived vibration modes, a simple drive control, grains moving under a clearly labeled approximation, and user-initiated audio through the Web Audio API.

### Evidence and open work

The Exploratorium's [Visible Vibrations research](https://www.exploratorium.edu/sites/default/files/pdfs/visible-vibrations.pdf) provides a relevant exhibit precedent. Bartosz Ciechanowski's [Sound](https://ciechanow.ski/sound/) is a useful primary reference for explanatory interaction.

Plate vibration, airborne sound, and particle transport are different mechanisms. The model must connect them explicitly rather than treat every attractive wave pattern as physically interchangeable. Audio and visual time scales also need clear treatment.

## 3. AFTER RAIN — Follow the water beneath a city

**Recommendation:** Strongest spatial narrative and environmental-design direction.

### The experience

Rain falls on a small, carefully composed city block. Follow one drop across a roof, into a gutter, over a street, and beneath the surface. Replace an impermeable area with a rain garden or permeable paving, then replay the same storm to inspect the changed route and storage.

**Causal loop:** Rainfall → surface choice → runoff or infiltration → downstream result.

### Visual direction

A warm architectural model with muted green planting, blue water, wet highlights, and visible soil strata. The ground separates into a sectional view only when needed. Quiet weather audio could support the spatial transitions.

### Signature interaction

Keep the storm fixed, change one surface, and compare two recorded outcomes. Follow a tagged parcel of water between the surface and the subsurface.

### Why it could improve on the reference

- The visitor changes the system and compares a consequence.
- The sectional reveal has a clear explanatory purpose.
- A spatial story connects an everyday observation to an otherwise hidden process.

### First build slice

One fictional block, one rainfall scenario, two surface types, a transparent water-balance model, and a before/after replay. Stylized flow markers can explain movement without a full fluid simulation.

### Evidence and open work

The US Environmental Protection Agency describes [green infrastructure types](https://www.epa.gov/green-infrastructure/types-green-infrastructure) and their role in [mitigating flooding](https://www.epa.gov/green-infrastructure/mitigate-flooding).

Performance depends on rainfall, soil, storage, drainage, and saturation. A green surface must not be shown as guaranteeing flood prevention. Keep the first version educational and clearly state its assumptions.

## 4. TRACE — One change. Every consequence.

**Recommendation:** Closest fit to agentic coding and knowledge work; greatest potential for repeated practical use.

### The experience

Open a recorded agent run as a spatial sequence of inspected files, tool calls, edits, checks, and produced artifacts. Replay it, stop at a failing check, inspect the relevant change, and compare a later successful run.

**Causal loop:** Task → observed actions → changed artifacts → verification evidence.

### Visual direction

An editorial technical instrument: paper-like artifact surfaces, fine structural lines, quiet typography, and one color for active execution. Reserve depth and motion for revealing dependency or sequence. Keep detailed code, diffs, and logs in readable two-dimensional panels.

### Signature interaction

Select a failed test and highlight the observable chain of edits and tool events that led to it. Compare two recorded runs from a shared checkpoint. A true rerun is a separate action; a replay must not invent an alternate result.

### Why it could improve on the reference

- It can explain the user's own work instead of a fixed exhibit.
- A visual moment leads directly to inspectable evidence.
- The same system can support debugging, review, demos, and knowledge transfer.

### First build slice

One sanitized, recorded run with a documented event schema; a replay timeline; file and diff inspection; a failing check; and its subsequent correction. Build data semantics before adding complex spatial presentation.

### Evidence and open work

This proposal is based on the stated work domain, not on a selected framework or inspected agent data source. Data ingestion remains undecided.

Display observable execution and explicit artifacts. Do not portray private model reasoning as measured data, infer causal certainty from chronology alone, or label fixture events as live telemetry.

## What would make the finished project better

1. **A memorable interaction:** One action that explains the whole idea within a few seconds.
2. **A designed result:** A fabric swatch, audiovisual pattern, scenario comparison, or inspectable run.
3. **Compositional discipline:** A strong still frame, selective labels, and legible transitions.
4. **Continuity:** Preserve the visitor's orientation as the camera moves between scales.
5. **Evidence:** Distinguish exact data, modeled behavior, and artistic representation.
6. **Usability:** Direct manipulation, immediate override of guided motion, keyboard operation, reduced motion, and a real mobile composition.

These are evaluation criteria for the build. The current motion studies demonstrate only a small part of the proposed art direction and interaction.
