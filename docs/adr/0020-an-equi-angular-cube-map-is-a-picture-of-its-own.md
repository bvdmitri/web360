# ADR 0020: An equi-angular cube map is a picture of its own

Status: accepted (2026-10-20)

## Context

ADR 0003 left the model's optics fisheye-shaped until a second vendor arrived. The GoPro MAX and
MAX2 stitch their two lenses in the camera and store the sphere as an equi-angular cube map split
across two video tracks (FORMAT-gopro.md). There is no lens to model and no seam for web360 to
make; a frame only has to be read back out of the cube, apart from the narrow band where the
camera's own seam is stored twice.

## Decision

- **`model/cube.ts`** describes a cube map as six `CubeFace`s: the texture and pixel rectangle the
  face is stored in, its logical size, the duplicated seam band at its middle (0 for none), and the
  cube frame it looks along (`centre`, `across` for its columns, `down` for its rows).
- **`optics/eac.ts`** reads it: `cubeSamples` takes a direction to the face it leans toward most,
  through the equi-angular mapping (`u = atan(across / centre) / (pi / 4)`), to texture pixels;
  inside a seam band it returns both stored copies cross-faded linearly across the band, so the
  camera's seam step is smoothed. `cubeDirection` is its inverse.
- **`format/gopro/cube.ts`** builds a GoPro's cube from its track size alone: faces as tall as the
  track, bands of `(width - 3 * height) / 2` in the outer faces of each track, and the face order
  and frames measured on MAX2 frames by matching face edges.
- **`stitch/cubeRender.ts`** renders a cube map to an equirectangular frame on the CPU, the
  reference a GPU pass is checked against, as the lens stitch has its own.
- A recording opened by a vendor reader will say which picture it is, lenses or a cube map; the
  lens stitch is unchanged.

## Consequences

- A cube-map camera skips the colour work of the lens stitch: the camera already matched its
  lenses, and only the band's two copies are blended.
- The original MAX takes the same order and frames as the MAX2, stated publicly but not yet
  measured on its frames.
- `stitch/goproPreview.test.ts` renders a GoPro recording's moment to a PNG for inspection
  (`WEB360_GOPRO_PREVIEW`).
