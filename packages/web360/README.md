# @bvdmitri/web360

Stitch and stabilize raw 360 recordings in the browser, on WebGPU and WebCodecs.

web360 opens an Insta360 recording (`.insv`, a single file or a split `_00_`/`_10_` pair) from the
files a user picked, decodes both lenses, and stitches them into stabilized equirectangular frames
on the GPU. It hands you `VideoFrame`s; encoding, audio and storage stay with your application.

```ts
import { openRendition, Web360Error } from '@bvdmitri/web360';

const rendition = await openRendition(
  { main: { blob: mainFile }, second: { blob: secondFile } },
  { width: 3840, from: 12, to: 40, stabilization: 'smooth' },
);
try {
  for await (const frame of rendition.frames()) {
    await encoder.add(frame); // your encoder: frame.timestamp is microseconds from `from`
    frame.close();
  }
} finally {
  rendition.dispose();
}
```

## Options

- `width`: the output width in pixels; the height is half.
- `from`, `to`: the span to render, in seconds of the recording (the whole recording by default).
- `stabilization`: `smooth` (the default: a level horizon facing the camera's heading smoothed both
  ways in time), `lock` (fixed in the world), `horizon` (level, facing where the camera faces),
  `follow` (the camera's motion smoothed, tilt included) or `off`.
- `smoothing`: the time constant of `smooth` and `follow`, in seconds (1 by default).
- `gainMatching`: match the lenses' exposure and vignetting across the seam (on by default).
- `signal`: an `AbortSignal` that stops the rendition.

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

## License

MIT
