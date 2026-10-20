import type { Problem } from './rules.ts';

// Personal data in a GoPro fixture: the GPMF records and metadata boxes that identify the camera,
// the recording or a person, which a committed fixture must hold only as zeros (docs/SAMPLES.md).

/** GPMF records naming the camera or the recording, the faces it saw, and where it was. */
const PERSONAL_RECORDS = new Set(['CASN', 'CINF', 'MUID', 'CPID', 'CDAT', 'FACE', 'GPS5', 'GPS9']);
/** The camera's metadata boxes (`moov/udta`) holding hashes of the camera and the recording. */
const PERSONAL_BOXES = new Set(['CAME', 'MUID', 'GUMI']);
// A GPMF type byte: a letter for a value, '?' for a structure.
const GPMF_TYPES = new Set(Array.from('bBcdfFGhHjJlLqQsSUD?', (letter) => letter.codePointAt(0)));
const HEADER = 8;
const QUAD = 4;
// A record's header after its key: the type, the structure size, then the repeat (two bytes).
const STRUCTURE = 5;
const REPEAT = 6;

/** A personal payload that is not all zeros: its key and the bytes it spans. */
export interface PersonalData {
  readonly key: string;
  readonly start: number;
  readonly end: number;
}

const keyAt = (bytes: Uint8Array, at: number): string =>
  String.fromCodePoint(...bytes.subarray(at, at + QUAD));

const isZero = (bytes: Uint8Array): boolean => bytes.every((value) => value === 0);

// The payload of a GPMF record whose key starts at `at`, when the bytes there read as one.
function recordPayload(bytes: Uint8Array, at: number): { start: number; end: number } | undefined {
  // The scan reads a key only where a whole header follows it.
  const header = new DataView(bytes.buffer, bytes.byteOffset + at, HEADER);
  if (!GPMF_TYPES.has(header.getUint8(QUAD))) return undefined;
  const size = header.getUint8(STRUCTURE) * header.getUint16(REPEAT);
  const start = at + HEADER;
  return start + size <= bytes.length ? { start, end: start + size } : undefined;
}

// The payload of a box whose type starts at `at`, when the four bytes before it read as its size.
function boxPayload(bytes: Uint8Array, at: number): { start: number; end: number } | undefined {
  if (at < QUAD) return undefined;
  const size = new DataView(bytes.buffer, bytes.byteOffset + at - QUAD, QUAD).getUint32(0);
  const end = at - QUAD + size;
  return size >= HEADER && end <= bytes.length ? { start: at + QUAD, end } : undefined;
}

/** Every personal record or box in the file whose payload is not all zeros, in file order. */
export function personalData(bytes: Uint8Array): PersonalData[] {
  const found: PersonalData[] = [];
  for (let at = 0; at + HEADER <= bytes.length; at += 1) {
    const key = keyAt(bytes, at);
    const isRecord = PERSONAL_RECORDS.has(key);
    if (!isRecord && !PERSONAL_BOXES.has(key)) continue;
    const payload = (isRecord ? recordPayload(bytes, at) : undefined) ?? boxPayload(bytes, at);
    if (payload === undefined) continue;
    if (!isZero(bytes.subarray(payload.start, payload.end))) found.push({ key, ...payload });
  }
  return found;
}

/** A copy of the file with every personal payload zeroed, its layout and size unchanged. */
export function scrubbed(bytes: Uint8Array): Uint8Array {
  const copy = Uint8Array.from(bytes);
  for (const { start, end } of personalData(bytes)) copy.fill(0, start, end);
  return copy;
}

const GOPRO_FIXTURE = /^test\/fixtures\/.*\.360$/u;

/** The personal data a committed GoPro fixture still holds, as problems; none for other files. */
export function fixtureProblems(path: string, bytes: Uint8Array): Problem[] {
  return GOPRO_FIXTURE.test(path)
    ? personalData(bytes).map(({ key, start }) => ({
        path,
        line: 0,
        rule: 'personal-data',
        detail: `${key} at byte ${start}`,
      }))
    : [];
}
