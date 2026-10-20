# Looking around and reframing

A stitched 360 video is an equirectangular picture of the whole sphere. web360 draws flat views of
it, for looking around in a player and for exporting a flat video that follows a path of views.

## A view

A `View` is five numbers, the ones 360 editors keyframe:

| Part       | Meaning                                                                    |
| ---------- | -------------------------------------------------------------------------- |
| `pan`      | Degrees to the right of straight ahead                                     |
| `tilt`     | Degrees above the horizon, from -90 to 90                                  |
| `roll`     | Degrees the top of the picture leans to the right, from -180 to 180        |
| `fov`      | The field of view across the picture's longer side, from 30 to 160 degrees |
| `distance` | 0 for a flat lens, up to 1 for a stereographic one                         |

`VIEW_PRESETS` holds five lenses: `linear`, `dewarp`, `ultra`, `mega` and `tinyPlanet`. Spread one
over a view to apply it: `{ ...view, ...VIEW_PRESETS.ultra }`. `clampView` holds a view to its
limits and wraps its pan. `DEFAULT_VIEW` looks straight ahead through the linear lens.

## A path of keyframes

`viewAt(keyframes, time)` is the view a path of `{ time, view }` keyframes shows at a time in
seconds:

- it passes through each keyframe;
- it moves smoothly between them without overshooting;
- it eases out of the first keyframe and into the last;
- it holds them beyond the ends;
- the pan turns the short way round.

## Look around in a player

`createViewer(canvas)` draws views of a `<video>` (or a decoded `VideoFrame`) on a canvas with
WebGPU. It keeps no clock and handles no input: call `draw` on every video frame and every drag.
Import it from `@bvdmitri/web360/view`, which leaves the stitcher out of the page.

<<< ../../tools/docs/examples/lookAround.ts

## Export a flat video

`createReframer({ width, height })` turns decoded 360 frames into flat views of them, with the same
timestamps, ready for an encoder. Decoding, the audio and encoding are the caller's. Here
Mediabunny's `Conversion` does all three, and the reframer draws each frame's view along the path:

<<< ../../tools/docs/examples/reframeToMp4.ts

Both need WebGPU, and throw a `Web360Error` coded `render-unavailable` without it.
