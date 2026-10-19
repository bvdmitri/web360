# ADR 0002: The mp4 reader produces a movie of tracks timed on the media clock

Status: accepted (2026-10-19)

## Context

The container reader (`format/mp4`) gives a vendor reader the frames of each track: where a
sample's bytes are, how large it is, and when it decodes and composes. A movie states this across
many boxes, the sample tables, and an edit list, and a reader has to decide what shape it hands on
and how far it resolves timing before a consumer asks.

## Decision

- `readMovie` turns a `moov` box into a `Movie`: the movie timescale and one `Track` per `trak`. A
  track carries its id, handler, media timescale, its visual sample entry when it is a video
  track, and its sample tables.
- **Samples are expanded on demand, not when the movie is read.** A track holds its tables;
  `samplesOf(track)` places and times its samples when a reader asks. Reading the tables is cheap
  even for a track of millions of samples (a long audio track's size is a single uniform value and
  its chunk list is short), so a reader materialises only the tracks it needs and a malformed
  count costs nothing until something expands it (bounded there, see ADR 0003's model work and the
  timeline cap).
- A sample is placed and timed on the track's own media clock. Its file offset comes from the
  chunk tables and the sizes before it in its chunk; its decode time is the running sum of the
  `stts` durations; its composition time adds the `ctts` offset; its sync flag comes from `stss`,
  or every sample is a sync sample where that table is absent.
- **The edit list is not applied here.** A track's samples carry media-clock times. Shifting them
  onto the movie's presentation timeline (an empty edit's delay, the first edit's media time) is a
  later refinement, added when a consumer needs presentation time rather than media time.
- **A fragmented file is refused.** A `moov` that carries `mvex` throws, as no camera writes one
  and the `moov`-only sample tables would not describe a fragmented file's samples.

## Consequences

- A vendor reader works on the movie `format/mp4` returns and never reads container bytes itself.
- A sample's bytes are read straight from the file at its absolute offset, with no per-chunk
  arithmetic at read time.
- Presentation time is unresolved until the edit-list refinement lands; a consumer that needs it
  before then waits for that work.
