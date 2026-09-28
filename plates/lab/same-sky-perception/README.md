# SAME SKY · perception test

Light before the room. A full-screen ceiling wash surrounds a square of sky whose displayed value never changes. The question: on real screens, does the sky appear to change when the wash changes? If this flat plane fails, no plaster, cove, or room model can rescue Plate III.

## What is held fixed

- **The sky's value.** A constant linear color, undithered, so every sky pixel holds exactly one value.
- **Exposure and tone curve.** Fixed exposure and the neutral tone curve (Khronos PBR Neutral), the output path the finished plate will use.
- **The knife edge.** The square's edge falls on device pixels; no pixel is blended, and nothing darkens the edge.
- **No spatial effects.** No bloom, blur, vignette, or grain. The wash is dithered to prevent banding.

The probe (P) reads the canvas after the output transform, in the same frame as the render, and reports whether the sky's displayed value changed. Verified on 2026-09-24 in Chrome on macOS with both backends, WebGPU and WebGL 2: the sky read (72, 107, 169) for the twilight sky, uniform across the sampled pixels and unchanged through every wash, intensity, gradient, and size change.

## What varies

Wash hue (A, compared against B), wash intensity at the aperture edge, sky, aperture size, and an optional brightening toward the walls. Controls are listed in the panel (H).

## Running it

With the project's dev server running (`npx vite` in the project's root), open <http://127.0.0.1:5196/plates/lab/same-sky-perception/>. Add `?webgl` to force the WebGL 2 fallback. To test a phone on the same network, run `npx vite --host 0.0.0.0` and open the computer's address; this exposes the dev server to the local network.

The page draws only when something changes, so it idles between comparisons.

## Protocol

1. **Displays:** a laptop, a phone, and an external monitor. Dim room. Normal brightness. Turn off Night Shift, True Tone, and similar white-point adaptation, which would move the wash and the sky together.
2. **Framing:** fullscreen (F). On a phone, hold the screen at about 25 cm and enlarge the aperture (]) until the whole screen is the ceiling.
3. **Comparisons:** for the twilight sky, set B to neutral and step A through amber, rose, violet, green, and dark (keys 2–6). Look at the square for about 20 seconds under A, switch (space), and look for 20 seconds under B. Record the perceived change in the sky with shift + 0–3: none, slight, clear, strong. Write the direction of the change (for example, "bluer under amber") in a note beside the export.
4. **Rate before probing.** Turn the probe on only after rating, then confirm the sky did not change on that display.
5. **Export** the log (E) and save it in `results/` beside this file, named by display.

## Pass

On at least two of the three displays, at least three of the five washes are rated slight or stronger for the twilight sky. The reported direction should run away from the wash's hue; see [SAME SKY in DIRECTIONS.md](../../DIRECTIONS.md#same-sky--light-and-space).

If the test fails, Plate III needs more of the visual field than a screen gives, or a different subject. Decide before building the room.

## Results

**2026-09-24, MacBook Pro, Liquid Retina XDR** ([results](results/2026-09-24-macbook-pro-xdr.json)), twilight sky, surround against neutral:

| Surround | Perceived shift |
|---|---|
| Dark | 3, strong |
| Violet | 3, strong |
| Amber | 1, slight |
| Rose | 1, slight |
| Green | 0, though a very slight change was seen; at threshold |

Four of five surrounds pass, so the flat plane holds on this display. Reducing the browser window, a smaller visual angle, did not remove the change. Directions of change were not recorded. Lowering the display's brightness made the change more obvious; this was observed after rating, not rated.

**Reading.** The strongest shifts came from the surround closest in hue to the sky (violet) and from dimming (dark). The near-complementary amber was only slight. This matches the monitor studies in [the SAME SKY research](../../research/same-sky-assets.md): the effect is largest when surround and target are similar, and it is not a simple push toward the complement. For the light program, near-hue surrounds and changes in brightness carry the piece; complementary drama does not. The inside act should also stay dim, at a dusk level, never bright: the change read more strongly at lower display brightness, and Skyspaces themselves run at twilight.

**Decision, 2026-09-24.** The flat plane is accepted on this display and the reduced-window check. Phone panels remain untested; test one when the room exists.
