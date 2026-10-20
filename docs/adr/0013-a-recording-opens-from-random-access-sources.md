# ADR 0013: A recording opens from random-access sources

Status: accepted (2026-10-19)

## Context

A reader that takes a `ByteReader` over a whole file needs the file in memory. A browser stitcher
is handed a camera's files as `Blob`s of up to several gigabytes each (a ONE R lens file of a
two-minute recording is 800 MB), which cannot be held in memory. Decoding needs, per lens, the
codec, its configuration and each frame's place and time, and the stitch needs to know which part
of the calibration canvas each decoded frame shows.

## Decision

- **`ports/RandomAccessSource`** is the port: a size, and `read(offset, length)` resolving those
  bytes. `memorySource` implements it over bytes for tests; `blobSource` (`packages/web360`)
  implements it over a `Blob`.
- **`format/mp4/readMovieFrom`** walks the top-level box headers and reads only the `moov`.
- **`format/insta360/openInsta360`** reads the footer, then the trailer it spans, then each file's
  movie: never the media. It gives the `CameraRecording`, the calibration canvas, an `EncodedVideo`
  per lens video (codec string, decoder configuration from the `avcC` or `hvcC` payload, and the
  frames in decode order, timed in microseconds on the file's media clock), a `LensImage` per lens,
  and beside them the `sources` the bytes are read from.
- **Each frame names its file.** An `EncodedVideo` has no source of its own; each `EncodedFrame`
  may carry `source`, an index into the opener's `sources` (the first when it names none), and the
  WebCodecs decoder (`packages/adapters/webcodecs`, `decodeVideo`) takes those `sources` and reads
  each frame from its own. A GoPro's chapters are joined the same way (`openGoPro`).
- **A lens video is recognised by its aspect.** A video with the aspect of one lens's share of the
  canvas holds one lens, its frame covering that share, scaled (the ONE R writes square 2880 by
  2880 lens videos on a 6080 by 3040 canvas). When the primary file carries such a track per lens,
  lens `i` is track `i`. When it carries one, the recording is split across files: lens 0 is the
  primary (`_00_`, with the trailer), lens 1 the secondary (`_10_`), and without the secondary it
  is refused (`MissingLensFileError`). Any other video covers the whole canvas for every lens.

## Consequences

- Opening a recording reads kilobytes of headers plus its `moov` and trailer (a few megabytes),
  whatever the file's size; frames are read one at a time as they decode.
- Frame times are the media clock from the first frame; the edit list is not applied (ADR 0002).
  The motion clock time of a frame is the capture clock plus that time (ADR 0010).
- The split layout is covered on the ONE R fixture; the track-per-lens and whole-canvas layouts on
  variants of it with the movie edited, not on a recording of a body that writes them. The reader
  applies the ONE R's field of view, coverage and IMU alignment to every Insta360 body until
  footage from another body sets its own (ADR 0007, 0010).
