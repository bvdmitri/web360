import type { ByteReader } from '../../shared/binary/byteReader';
import { microseconds, seconds, type Microseconds, type Seconds } from '../../shared/units/units';
import type { Region } from '../mp4/box';

const ENTRY_SIZE = 16;
const EXPOSURE_OFFSET = 8;

/** One exposure entry: a capture timestamp and the frame's exposure time. */
export interface ExposureEntry {
  readonly timestamp: Microseconds;
  readonly exposure: Seconds;
}

/**
 * Reads the exposure record (id 4) into per-frame entries.
 *
 * @remarks Each 16-byte entry is a `u64` capture timestamp and an `f64` exposure time in seconds.
 * The timestamp shares the recording's capture clock, microseconds in the raw-gyro layout. Entries
 * begin a few frames before the first encoded frame.
 */
export function readExposure(reader: ByteReader, region: Region): ExposureEntry[] {
  const count = Math.floor((region.end - region.start) / ENTRY_SIZE);
  const entries: ExposureEntry[] = [];
  for (let index = 0; index < count; index += 1) {
    const at = region.start + index * ENTRY_SIZE;
    entries.push({
      timestamp: microseconds(reader.u64le(at)),
      exposure: seconds(reader.f64le(at + EXPOSURE_OFFSET)),
    });
  }
  return entries;
}
