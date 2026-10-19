# ISO base media file format

The container every reader sits on. Insta360 `.insv` and GoPro `.360` are both ISO base media
files (ISO/IEC 14496-12, the family MP4 and QuickTime belong to): the vendor's telemetry and
calibration ride inside the same box structure described here. `packages/core/src/format/mp4`
reads this structure; a vendor reader reads what its camera writes into it.

## Boxes

A file is a sequence of boxes, and a box is a header followed by content that is either fields or
more boxes. The header is:

| Bytes | Field  | Meaning                                                              |
| ----- | ------ | -------------------------------------------------------------------- |
| 0     | `size` | u32, big-endian: the whole box length in bytes, this header included |
| 4     | `type` | four bytes, a code read as ASCII (`ftyp`, `moov`, `mdat`, ...)       |

All integers in the box structure are big-endian.

Two sizes are special:

- `size` = 1: the real length is a 64-bit big-endian value in the eight bytes after `type`, so
  the header is sixteen bytes. A recording's `mdat` uses this form once it passes 4 GiB.
- `size` = 0: the box runs to the end of its enclosing region (the file, or a container box's
  content). Only the last box of a region may use it.

A box shorter than its own header, or one that ends past the region it is read within, is
malformed and refused.

## Nesting and regions

A container box's content is more boxes (for example `moov` contains `mvhd` and one `trak` per
track; a `trak` contains `tkhd` and `mdia`). Children are walked over the parent's content range.

The reader walks a half-open byte range and keeps every offset absolute within the file. Offsets
stay absolute because a chunk offset read from a sample table later states its position against
the start of the file, not against the box it sits in, so no translation is needed.

## Movie and tracks

The `moov` box holds the movie: one `mvhd` and one `trak` per track.

- `mvhd`, the movie header, carries the movie timescale, the ticks per second an edit list counts
  in. It is a full box whose version sets the width of its creation and modification times
  (32-bit at version 0, 64-bit at version 1); a `u32` timescale follows the two times.
- `trak/tkhd`, the track header, carries the track id, a `u32` in that same spot past the two
  times.
- `trak/mdia/mdhd`, the media header, carries the media timescale in the same spot; a track's
  sample times count in it.
- `trak/mdia/hdlr`, the handler, is a four-byte code for what the track holds: `vide` for video,
  `soun` for sound. A track of any other handler (a camera's own metadata track) is left out.
- `trak/mdia/minf/stbl/stsd`, the sample description, holds the sample entry. A visual entry names
  its codec (a four-byte code such as `hvc1` or `avc1`), its coded width and height, and, in a
  child `hvcC` or `avcC` box, the bytes that prefix each stored NAL unit (that box's length field,
  its low two bits plus one).

## Sample tables

A track's sample table (`stbl`, inside `trak/mdia/minf`) says where each sample sits and how long
it lasts. Each table is a full box: a one-byte version and three flag bytes precede its fields,
then a 32-bit entry count, then the entries. All values are big-endian.

| Box    | Each entry                                               | Holds                                                                                |
| ------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `stts` | sample count, delta                                      | a run of samples that share a duration, in the media timescale                       |
| `ctts` | sample count, offset                                     | a run that shifts composition time from decode time; offset is signed                |
| `stss` | sample number                                            | the one-based samples that begin a group of pictures; absent means every sample does |
| `stsz` | a shared size, else one size per sample                  | the byte size of each sample                                                         |
| `stsc` | first chunk, samples per chunk, sample description index | a run of chunks laid out alike                                                       |
| `stco` | chunk offset (32-bit)                                    | the absolute file offset of each chunk                                               |
| `co64` | chunk offset (64-bit)                                    | the absolute file offset of each chunk, past 4 GiB                                   |

A table that lists more entries than its box can hold is refused.
