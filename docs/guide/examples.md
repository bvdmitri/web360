# Examples

Each example is a complete function you can copy. They are compiled against the package's own
types on every change to web360, so they stay correct as it evolves.

## Render a span to MP4

Encode the stabilized frames into an MP4 in memory with [Mediabunny](https://mediabunny.dev). A
4K 360 clip runs to hundreds of megabytes a minute: for long spans, write to a file instead of
memory (Mediabunny's `StreamTarget`).

<<< ../../tools/docs/examples/renderToMp4.ts

## A preview frame

One stabilized frame as an `ImageBitmap`, to draw on a canvas or turn into a thumbnail.

<<< ../../tools/docs/examples/firstFrame.ts

## An Insta360 split pair

<<< ../../tools/docs/examples/insta360Pair.ts

## A GoPro recording in chapters

<<< ../../tools/docs/examples/goproChapters.ts

## Progress and cancelling

<<< ../../tools/docs/examples/progressAndCancel.ts

## Errors a user can act on

<<< ../../tools/docs/examples/errors.ts

## In a Web Worker

The worker side; the page creates it with
`new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })` and posts
`{ file }` to it.

<<< ../../tools/docs/examples/worker.ts
