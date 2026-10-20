# Getting started

web360 turns a camera's raw 360 recording into stabilized equirectangular frames, in the browser.
You give it the files a user picked; it reads their telemetry and calibration, decodes the video
with WebCodecs, renders each frame on WebGPU, and hands you `VideoFrame`s. What you do with them
(encode an MP4, draw a preview, upload) is up to your application.

## Install

::: code-group

```sh [npm]
npm install @bvdmitri/web360
```

```sh [pnpm]
pnpm add @bvdmitri/web360
```

```sh [yarn]
yarn add @bvdmitri/web360
```

:::

## What the browser needs

- **WebGPU** to render, and **WebCodecs** to decode: a current Chrome or Edge, and Safari as its
  WebGPU support matures. web360 checks both when it opens a recording and says which is missing.
- **A decoder for the camera's video.** Insta360 records H.264 or HEVC; a GoPro MAX2's 8K video is
  HEVC at a size not every browser decodes.
- **A dedicated Web Worker** is the place to run it: rendering is heavy, and a worker keeps the page
  responsive. [Examples](./examples.md#in-a-web-worker) shows how.

## Your first rendition

Open a recording, take its frames, and release it when done:

```ts
import { openRendition } from '@bvdmitri/web360';

const rendition = await openRendition(
  { main: { blob: file } }, // the File the user picked
  { width: 3840, from: 10, to: 20 }, // 3840 x 1920, seconds 10 to 20
);
try {
  for await (const frame of rendition.frames()) {
    // frame.timestamp is in microseconds from `from`
    await encoder.add(frame);
    frame.close();
  }
} finally {
  rendition.dispose();
}
```

- `openRendition` reads only the files' headers, telemetry and calibration. It does not load the
  video, so a multi-gigabyte recording opens quickly.
- `rendition.metadata` gives the recording's whole `duration` in seconds and its camera `model`;
  `rendition.duration` is the length of the span you asked for.
- `frames()` decodes and renders as you consume it, one frame at a time. Close each frame when you
  are done with it; `dispose()` releases the GPU.

## Recordings in more than one file

- An **Insta360 ONE R** writes each lens to its own file: pass the `_00_` file as `main` and the
  `_10_` file as `second`.
- A long **GoPro** recording is split into chapters: pass the first (`GS01nnnn.360`) as `main` and
  the rest, in order, as `following`.

[Examples](./examples.md) has both, with how to find the files among the ones a user picked.

## Next

- [Examples](./examples.md): rendering to MP4, a preview frame, progress and cancelling, errors.
- [Options and errors](./options.md): every option of a rendition and every error code.
- [Cameras](./cameras.md): what web360 reads, and what is measured.
- [API reference](../api/): every export, with its types.
