# UNFOLD · the cut and the pull

The first slice of Plate I's experience (DIRECTIONS.md, "Evidence and open work"): one meridian cut, and the pull within the cylindrical family. Coronelli's globe is cut along the meridian through the Pacific, between gores 6 and 7, and relaxes onto Mercator's projection; the pull then moves the map continuously toward Lambert's cylindrical equal-area projection.

Open <http://127.0.0.1:5196/plates/lab/unfold-pull/> with the project's dev server running. U cuts and unfolds the globe (again to fold it back); on the map, a vertical drag or ↑ ↓ is the pull. H shows the panel with the projection's scale factors.

## What moves, and by what formula

[src/unfold/projection.ts](../../src/unfold/projection.ts) holds the formulas; the vertex shader here repeats them, so the unfolding runs on the GPU and costs nothing on the CPU.

- **The projection.** x is the longitude from the map's central meridian, through Ferro, Coronelli's prime meridian; y is a northing interpolated from Mercator's, ln tan(π/4 + φ/2), to Lambert's, sin φ. The ends are exact; between them the map is a compromise, and the panel names it so.
- **The unfolding.** Two stages, as a globe maker would draw them. The sphere relaxes onto a cylinder that already carries the projection's northing, the textbook image of a cylindrical projection; then the cylinder unbends about the central meridian, keeping arc length, so the cut opens as the map flattens.
- **The calottes.** No cylindrical projection can hold the polar caps, so they lift off the poles and flatten into the discs they were printed as, above and below the map: an opened object, its parts suspended.
- **Tissot's field.** The circles are drawn on the paper, so the map draws its own indicatrix: on Mercator's map they stay round and swell toward the poles; toward equal area they flatten into ellipses of equal area. Nothing is computed for display; the Jacobian shows itself.
- **The graticule.** The projection's own 10° graticule in ink hairlines one device pixel wide, over Coronelli's engraved one; where his engraving strays from the true parallels, the two separate.
- **The camera.** It orbits the globe until the cut, then moves the visitor's cut out to the map, square to its face and far back through the long lens, which approaches axonometric projection. It holds still through the pull, which leaves the equator and the longitudes where they are; only the latitudes are seen to change.

## Status, 2026-09-24

A first slice, built without review. Working: the cut, the two-stage unfolding, the calottes becoming discs, the pull from conformal to equal area with Tissot's field changing in real time, on WebGPU.

Not yet: the cut is fixed, not drawn in one stroke; the pull is a drag anywhere, not a pull away from the cut; the second stage, free cuts with numerical flattening, is to come; the sheets are at the second texture level; the brass ring and the peeled flap of the look-development frame are left out; the spherical and flattened graticules are not yet drawn together as the tear opens; there are no labels, and no kept result.
