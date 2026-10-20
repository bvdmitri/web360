# @bvdmitri/web360

[![npm](https://img.shields.io/npm/v/@bvdmitri/web360)](https://www.npmjs.com/package/@bvdmitri/web360)
[![docs](https://img.shields.io/badge/docs-GitHub%20Pages-blue)](https://bvdmitri.github.io/web360/)
[![CI](https://github.com/bvdmitri/web360/actions/workflows/ci.yml/badge.svg)](https://github.com/bvdmitri/web360/actions/workflows/ci.yml)

Stitch and stabilize raw 360 recordings in the browser, on WebGPU and WebCodecs. The
[documentation](https://bvdmitri.github.io/web360/) has the guide, the supported cameras and the
API reference.

web360 opens an Insta360 recording (`.insv`, a single file or a split `_00_`/`_10_` pair) or a GoPro
MAX or MAX2 recording (`.360`, its chapters joined) from the files a user picked, decodes it, and
renders stabilized equirectangular frames on the GPU: an Insta360's two lenses stitched, a GoPro's
cube map, which the camera stitched itself, read out. It hands you `VideoFrame`s; encoding, audio
and storage stay with your application.

```ts
import { openRendition, Web360Error } from '@bvdmitri/web360';

const rendition = await openRendition(
  { main: { blob: mainFile }, second: { blob: secondFile } },
  { width: 3840, from: 12, to: 40, stabilization: 'smooth' },
);
// A GoPro recording: its first chapter, then the others in order.
// openRendition({ main: { blob: firstChapter }, following: [{ blob: secondChapter }] }, options)
try {
  for await (const frame of rendition.frames()) {
    await encoder.add(frame); // your encoder: frame.timestamp is microseconds from `from`
    frame.close();
  }
} finally {
  rendition.dispose();
}
```

<!-- #region guide -->

## Options

- `width`: the output width in pixels; the height is half.
- `from`, `to`: the span to render, in seconds of the recording (the whole recording by default).
- `stabilization`: `smooth` (the default: a level horizon facing the camera's heading smoothed both
  ways in time), `lock` (fixed in the world), `horizon` (level, facing where the camera faces),
  `follow` (the camera's motion smoothed, tilt included) or `off`.
- `smoothing`: the time constant of `smooth` and `follow`, in seconds (1 by default).
- `gainMatching`: match the lenses' exposure and colour across the seam, re-measured as the video
  goes (on by default; a GoPro has matched its own).
- `signal`: an `AbortSignal` that stops the rendition.
- `platform`: where decoding, rendering and presenting happen; the browser's by default
  (`browserPlatform()`). A test supplies its own to run a rendition outside a browser.

`rendition.metadata` gives the recording's `duration` in seconds and its camera `model`;
`rendition.duration` is the span's length.

## Errors

Opening or rendering throws a `Web360Error` whose `code` says why:

| Code                    | Meaning                                                  |
| ----------------------- | -------------------------------------------------------- |
| `missing-second-file`   | a split recording was opened without its other lens file |
| `unreadable-recording`  | the files are not a recording web360 reads               |
| `render-unavailable`    | the browser has no WebGPU                                |
| `webcodecs-unavailable` | the browser has no WebCodecs                             |
| `codec-unsupported`     | the browser cannot decode the recording's video          |
| `decode`                | decoding failed partway                                  |

## Requirements

A browser with WebGPU and WebCodecs (current Chrome and Edge; Safari as its WebGPU matures). Run it
in a dedicated Web Worker so stitching never blocks the page.

## Cameras

The Insta360 ONE R (5.7K 360 lens) is measured: its lens field of view, its IMU alignment and its
rolling shutter come from real footage. Other Insta360 bodies open and stitch with the ONE R's
values until footage from them sets their own.

The GoPro MAX2 is measured: its cube-map layout, the alignment of its gyro to the picture and its
telemetry delay come from real footage, and it is stabilized by its gyro, levelled by the gravity it
records.
The original MAX opens with the MAX2's values until footage from it sets its own. A GoPro's 8K
video needs a browser that decodes HEVC at that size.

<!-- #endregion guide -->

## License

MIT
