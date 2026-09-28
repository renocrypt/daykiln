# UNFOLD · look development

The first frame of Plate I in the real renderer. Coronelli's 1688 terrestrial globe, all 24 gores and both polar calottes, on the globe's plaster core; gore 12 peels from its southern tip and relaxes toward its flat printed shape. Tissot's circles are drawn on the sphere, so they stay round where the paper is glued and become ellipses as it flattens. A brass meridian ring with engraved, wax-filled degree ticks stands beside the tear.

Open <http://127.0.0.1:5196/plates/lab/unfold-lookdev/> with the project's dev server running. Controls are in the panel (H). Dragging orbits the globe's own center and scrolling dollies toward it; a click focuses on what it lands on.

## Lens

A full-frame camera with a 105 mm lens at f/2, about 2.6 m from the globe's center. Keys − and = step the aperture from f/1.4 to f/16; 1, 2, and 3 change to 50, 105, or 200 mm and move the camera to keep the magnification at the plane of focus, so the framing holds and only the perspective changes.

Depth of field is computed, not styled. [src/post/lens-blur.ts](../../src/post/lens-blur.ts) takes the focal length and film from the camera and gives each pixel the circle of confusion of a thin lens, (f² / N) · S / (S − f) · |1/S − 1/z|, in pixels. At the default lens, the globe's limb blurs by about 22 px of radius at 1800 px of image height, and the sheet lifting toward the camera blurs in front of the focus with a translucent edge.

Focus is a spot on a surface, held by the triangle and barycentric coordinates the click landed on, so it moves with the paper as the sheet peels. It starts on the peeled sheet at 35°S, the row of circles that have become ellipses. A new focus racks over a 0.3 s half-life, and the iris eases in stops. While the focused spot is behind the globe or out of the frame, the lens focuses on the surface facing the camera.

## Prints

Every sheet's print comes in four levels, 1024 to 8192 px tall for a gore and 512 to 4096 px for a calotte, and the view decides which it needs. Each sheet is sampled on a grid of points, and its level is the coarsest whose paper resolution matches the screen's where the sheet is in view. The globe opens on its base levels (3.6 MB in all) with the opening frame's sheets at theirs. A finer level fades in over about a third of a second when the view comes closer, and a level the view no longer needs is released after 8 s. The top levels are 96 MB together, so they load only sheet by sheet, at macro range.

## Assets

```sh
# Masters: every gore (1–24) and calotte (25, 26), stitched from native IIIF tiles.
for n in {1..26}; do
  a=$((288578 + n)); b=$((90060316 - n))
  if (( n <= 24 )); then name=$(printf "gore-%02d" $n); else name="calotte-$n"; fi
  NODE_USE_ENV_PROXY=1 node plates/tools/iiif-fetch.ts "https://www.davidrumsey.com/luna/servlet/iiif/RUMSEY~8~1~$a~$b" "plates/assets-src/coronelli/$name-native.jpg"
done
node --max-old-space-size=12288 plates/tools/prepare-gores.ts all
node --max-old-space-size=8192 plates/tools/lookdev/calotte-rotation.ts
```

The collection server's scaled output (for example `full/,8192/`) is soft, as if upscaled from a smaller derivative; it was rejected. `iiif-fetch.ts` stitches native tiles instead and waits out the server's rate limit. `prepare-gores.ts` masks the scanner background, white-balances the paper to a neutral albedo in linear light, downsamples with Lanczos to each level, and finds each sheet's printed borders. Masters stay in `assets-src/`, which is not committed. The textures are a white-balanced facsimile of the David Rumsey Historical Map Collection's scans, CC BY-NC-SA 3.0.

The collection numbers the pieces. Southern gores 1–12 run eastward with the equator at the top of the print; northern gore 12 + k lies above southern gore k, with the equator at the bottom; 25 is the north polar calotte and 26 the south. Gore k spans Coronelli's longitudes 30(k − 1)° to 30k°, printed on its borders. The scene's longitude is Coronelli's minus 330°, which puts gore 12 at 0°–30°.

## Printed borders

A gore is printed inside four borders: a meridian rule or a graduated band down each side, and a parallel along each end, drawn as an arc. The paper was cut outside them with an uneven margin, so the borders, not the paper's edges, carry the gore's meridians and parallels, and a globe maker trims to them. Trimming closes the white seams that the margins left between sheets.

- **Sides** are traced by dynamic programming: the path down each long edge of the paper that collects the most thin-line response while moving at most a pixel per row. Stray marks answer the same filter, but only in short runs. A side ends where its rule stops being present in most rows, so a platemark or a crease crossing the trace does not extend it.
- **Ends** are arcs through their corners, because every parallel on these gores is an arc centred on the pole's side. The equator bows out from the gore by about 1.4 % of its chord; the 70° end bows in, toward the equator, by about 5 %. Each end's arc is searched within the range measured across all 24 gores, for the one lying along a printed line over most of its length. The rule itself is then traced within 25 px of that arc, since sheets stretched on the scanner bow their rules unevenly. A corner whose side rule is hidden is found by following its end's rule until the rule stops.
- **Eight corners were read by eye**, where artwork crowds them: a text frame over gore 2's equator, the ecliptic's band across the equator of gores 17 to 19, and creases and platemarks elsewhere. They are listed in `CORNERS` in `prepare-gores.ts`, read to within about 2 px from gridded zooms made by `tools/lookdev/corner-zoom.ts`. `tools/lookdev/corner-sheet.ts` draws every gore's four corners for checking.

Between the borders a Coons patch ([coons.ts](coons.ts)) places each point, exact on every border and blended inside. A calotte's printed 70° circle is found along 720 rays and fitted as a circle, and its print is taken as an azimuthal equidistant disc from the pole to that circle. Its rotation comes from matching its rim to the gores' ends at 70°, then from the phase of its meridians, ruled every 5° just inside the rim. On the north calotte, the graduated meridian continues the seam at 0°, which confirms 90.1°. The south calotte's 86.26° rests on the phase alone.

## Approximations

- **Inside a gore.** The borders are exact. Between them the Coons patch blends, so a parallel inside a gore can sit a fraction of a degree off Coronelli's.
- **Gore 2's equator** runs unevenly on its sheet, and its traced rule is within a few pixels of the print, not exact.
- **The peel.** South of the hinge the sheet becomes a cylinder, which keeps the print's flat geometry; a 4 cm band blends it into the sphere.
- **Paper relief.** Laid lines, chain lines, and fiber are procedural bump, faded where a pixel cannot hold them.
- **Blur.** Gathered at half resolution from one layer of depth, so what a foreground edge hides is estimated from the background beside it. The in-focus band stays at full resolution.

## Light

The globe stands in a studio built as its own environment ([studio.ts](studio.ts)), prefiltered for image-based light: a broad north window high on one side, a white room and a paler table whose bounce fills the underside, and a tall strip for the brass. A low raking key over the tear brings up the engraving and the paper's relief. Values were set by measurement in the whole-globe view, against LOOK.md's palette: lit paper at 244 of 255, above the field so the silhouette holds; paper turning away at about 178; the far limb at about 145. The field itself is set before tone mapping so it reaches the screen as #ecebe7, not a compressed value. `plates.light({ ... })` in the console rebuilds the studio with changed values.

Tissot's field is drawn where the paper is diagnosed: full within 40° of arc of the tear's middle, fading out over the next 20°, so the rest of the globe stays Coronelli's. `plates.uTissotReach` sets the reach.

## Status, 2026-09-24

Working: the whole globe is wrapped, to the calottes at both poles, with seams that close and coastlines that run on across them. The studio keeps the field high-key and gives the sphere its form. Prints resolve as the view needs them; the print holds at macro range; the peel reads as paper, and its eased motion reads as weight; Tissot's circles turn into ellipses as the sheet flattens; depth of field is optical and visible, and focus can be placed and racked.

Fixed in the second pass. The first frame's depth of field was effectively off: three's `dof()` takes its bokeh scale as a maximum radius in pixels, and 0.5 meant half a pixel. Its second pass also takes a maximum over neighbors, which whitens a high-key frame by eating dark ink. The thin-lens blur replaced it. The view orbited a point on the tear's surface, so the globe swung about that point; it now orbits the globe's center, and focus is separate from the orbit.

Not yet at the bar: the raking key and the strip's highlight on the brass are placed but not yet judged; the brass edge sparkles; the Tissot line weight competes with the print near the tear; at f/1.4, a blurred near edge shows a faint regular texture from the half-resolution upsample. A focus left on the tear stays there when the tear turns to the limb, which blurs the rest of the frame until a click moves it. On a 30° gore the ellipses are only slightly out of round, which is a question for the prototype's pull toward equal area rather than for this frame.
