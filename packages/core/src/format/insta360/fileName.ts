const PATTERN =
  /^(?<prefix>VID|LRV)_(?<date>\d{8})_(?<time>\d{6})_(?<lens>\d)(?<proxy>\d)_(?<sequence>\d+)\.(?:insv|lrv)$/u;
const MAIN = '0';

/**
 * The parts of an Insta360 recording file name.
 *
 * @remarks `lens` is the first digit of the two-digit stream code (0 the back lens, 1 the
 * screen-side lens); `proxy` is the second digit (a low-resolution LRV preview rather than the
 * recording). The name is a hint for pairing and ordering; a reader still verifies it against the
 * file's contents.
 */
export interface RecordingFileName {
  readonly prefix: string;
  readonly date: string;
  readonly time: string;
  readonly lens: number;
  readonly proxy: boolean;
  readonly sequence: string;
}

/** Parses an Insta360 file name, or returns `undefined` when the name does not match. */
export function parseRecordingFileName(name: string): RecordingFileName | undefined {
  const match = PATTERN.exec(name);
  if (match?.groups === undefined) return undefined;
  const groups = match.groups;
  return {
    prefix: String(groups['prefix']),
    date: String(groups['date']),
    time: String(groups['time']),
    lens: Number(groups['lens']),
    proxy: groups['proxy'] !== MAIN,
    sequence: String(groups['sequence']),
  };
}

/**
 * A key the lens files of one recording share.
 *
 * @remarks The `_00_` and `_10_` halves of a split recording give the same key; a preview (a
 * different prefix) gives a different one, so grouping by key separates a recording's lenses from
 * its proxies.
 */
export function recordingKey(name: RecordingFileName): string {
  return `${name.prefix}_${name.date}_${name.time}_${name.sequence}`;
}
