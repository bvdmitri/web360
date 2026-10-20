# ADR 0024: A view is a camera inside the sphere

Status: accepted (2026-10-20)

## Context

An equirectangular 360 frame is a picture of the whole sphere. To look around in it, or to export a
flat video from it, each pixel of a flat picture needs the direction it shows. 360 editors offer
more than a rectilinear lens: a wide view that bends straight lines a little to fit more in, up to a
tiny planet that shows nearly the whole sphere around the ground. Their keyframes hold a pan, a
tilt, a roll, a field of view and a "distance" between the lens and the sphere.

## Decision

- **A view** (`packages/core/src/view/view.ts`) is a pan, tilt and roll in degrees, a field of view
  in degrees across the picture's longer side, and a distance from 0 to 1. Pan turns right about
  the vertical, tilt raises the view about the panned right, and roll leans the top of the picture
  to the right about the view's own axis, in that order.
- **The projection** (`view/project.ts`, `viewDirection`) is a pinhole camera `distance` behind
  the sphere's centre. Its rays pass through an image plane that spans the field of view, and each
  pixel shows where its ray meets the unit sphere, turned by the view's rotation. At distance 0
  that is a rectilinear lens. At 1 the camera sits on the sphere's surface, a stereographic lens
  that doubles each angle, so a field of view of 150 degrees shows 300 of the sphere. The
  distances between give the lenses in between.
- **The limits**: tilt is held to plus or minus 90, roll to plus or minus 180, the field of view to
  30 to 160 and the distance to 0 to 1; the pan wraps into `(-180, 180]` (`clampView`).
- **The presets** (`VIEW_PRESETS`) are named lenses, each wider and further back than the last:
  `linear` (80, 0), `dewarp` (100, 0.25), `ultra` (115, 0.55), `mega` (130, 0.8) and `tinyPlanet`
  (150, 1, looking straight down).
- **On the GPU** (`packages/adapters/webgpu`, `createViewRenderer`), one full-screen pass rebuilds
  the ray from `packView` and samples the frame with a sampler that repeats across its left and
  right edges, so the back of the sphere has no seam. `renderView` is its CPU reference.

## Consequences

- The five numbers are the whole state of a view, so a keyframe is a view and a time (ADR 0025),
  and a viewer and an export that agree on a view show the same picture.
- The field of view is the camera's, not the sphere's: at distance 1 the picture shows twice the
  angle. The presets' values follow how editors' lenses of those names look; they are a starting
  point to tune, not a measurement.
- The renderer samples without mipmaps, so a wide view of a large frame drawn small can alias at
  its edges.
