import { describe, expect, it } from 'vitest';

import { ByteReader } from '../../shared/binary/byteReader';
import type { Sample } from '../mp4/timeline';
import { readDeviceName, readFrameOrientation, readMotion } from './motion';
import { UnsupportedStreamError } from './stream';

const INT16 = 0x73;
const UINT32 = 0x4c;
const CHAR = 0x63;
const CONTAINER = 0x00;
const TIMESCALE = 1000;
const BLOCK_TICKS = 1000;

const ascii = (text: string): number[] => Array.from(text, (c) => c.codePointAt(0) ?? 0);
const u16be = (n: number): number[] => [(n >>> 8) & 0xff, n & 0xff];
const signed16be = (n: number): number[] => u16be(n & 0xff_ff);
const zeros = (n: number): number[] => Array.from({ length: n }, () => 0);
const pad = (length: number): number[] => zeros((4 - (length % 4)) % 4);

const klv = (key: string, spec: [number, number, number], data: number[]): number[] => {
  const [type, structSize, count] = spec;
  return [...ascii(key), type, structSize, ...u16be(count), ...data, ...pad(data.length)];
};

const scal = (divisors: number[]): number[] =>
  klv(
    'SCAL',
    [INT16, 2, divisors.length],
    divisors.flatMap((value) => signed16be(value)),
  );
const leaf = (key: string, components: number, rows: number[][]): number[] =>
  klv(
    key,
    [INT16, components * 2, rows.length],
    rows.flatMap((row) => row.flatMap((n) => signed16be(n))),
  );
const strm = (children: number[]): number[] =>
  klv('STRM', [CONTAINER, 1, children.length], children);
const devc = (children: number[]): number[] =>
  klv('DEVC', [CONTAINER, 1, children.length], children);
const dvid = (): number[] => klv('DVID', [UINT32, 4, 1], zeros(4));
const sensor = (key: string, divisor: number, rows: number[][]): number[] =>
  strm([...scal([divisor]), ...leaf(key, rows[0]?.length ?? 0, rows)]);

const assemble = (blocks: number[][]): { reader: ByteReader; samples: Sample[] } => {
  const bytes: number[] = [];
  const samples: Sample[] = [];
  for (const [index, block] of blocks.entries()) {
    samples.push({
      offset: bytes.length,
      size: block.length,
      decodeTime: index * BLOCK_TICKS,
      compositionTime: index * BLOCK_TICKS,
      duration: BLOCK_TICKS,
      isSync: true,
    });
    bytes.push(...block);
  }
  return { reader: ByteReader.of(Uint8Array.from(bytes)), samples };
};

const gyro = (rows: number[][]): number[] => sensor('GYRO', 10, rows);
const accl = (rows: number[][]): number[] => sensor('ACCL', 100, rows);

describe('gopro motion', () => {
  it('spaces each block evenly over its duration and concatenates the blocks', () => {
    const block = devc([
      ...dvid(),
      ...gyro([
        [10, 20, 30],
        [40, 50, 60],
      ]),
      ...accl([[100, 200, 300]]),
    ]);
    const { reader, samples } = assemble([block, block]);

    const motion = readMotion(reader, samples, TIMESCALE);
    expect(motion.angularVelocity).toEqual([
      { timestamp: 0, value: [1, 2, 3] },
      { timestamp: 500_000, value: [4, 5, 6] },
      { timestamp: 1_000_000, value: [1, 2, 3] },
      { timestamp: 1_500_000, value: [4, 5, 6] },
    ]);
    expect(motion.acceleration).toEqual([
      { timestamp: 0, value: [1, 2, 3] },
      { timestamp: 1_000_000, value: [1, 2, 3] },
    ]);
  });

  it('contributes nothing to a stream a block does not carry', () => {
    const { reader, samples } = assemble([devc([...accl([[100, 200, 300]])])]);
    const motion = readMotion(reader, samples, TIMESCALE);
    expect(motion.angularVelocity).toEqual([]);
    expect(motion.acceleration).toHaveLength(1);
  });

  it('ignores a stream with no children', () => {
    const { reader, samples } = assemble([devc([...strm([]), ...gyro([[10, 20, 30]])])]);
    const motion = readMotion(reader, samples, TIMESCALE);
    expect(motion.angularVelocity).toEqual([{ timestamp: 0, value: [1, 2, 3] }]);
  });

  it('refuses a motion stream that is not a 3-vector', () => {
    const { reader, samples } = assemble([devc([...sensor('GYRO', 1, [[1, 2]])])]);
    expect(() => readMotion(reader, samples, TIMESCALE)).toThrow(UnsupportedStreamError);
  });
});

const orin = (order: string): number[] => klv('ORIN', [CHAR, order.length, 1], ascii(order));
const label = (key: string, text: string): number[] =>
  klv(key, [CHAR, text.length, 1], ascii(text));

describe('gopro motion axes', () => {
  it('puts each sensor channel on the camera axis its ORIN names', () => {
    const block = devc([
      ...dvid(),
      ...strm([...orin('Zxy'), ...scal([10]), ...leaf('GYRO', 3, [[10, 20, 30]])]),
    ]);
    const { reader, samples } = assemble([block]);
    expect(readMotion(reader, samples, TIMESCALE).angularVelocity[0]?.value).toEqual([-2, -3, 1]);
  });
});

describe('gopro frame orientation', () => {
  const quarter = Math.round(32_767 * Math.SQRT1_2);
  const block = devc([
    ...dvid(),
    ...label('DVNM', 'GoPro Max'),
    ...strm([
      ...scal([32_767]),
      ...leaf('CORI', 4, [
        [32_767, 0, 0, 0],
        [quarter, 0, 0, quarter],
      ]),
    ]),
    ...strm([
      ...scal([32_767]),
      ...leaf('IORI', 4, [
        [32_767, 0, 0, 0],
        [32_767, 0, 0, 0],
      ]),
    ]),
    ...strm([
      ...scal([32_767]),
      ...leaf('GRAV', 3, [
        [0, 0, 32_767],
        [0, 32_767, 0],
      ]),
    ]),
  ]);

  it('reads the camera and image orientations as w, x, y, z quaternions, spaced over the block', () => {
    const { reader, samples } = assemble([block, block]);
    const { camera, image } = readFrameOrientation(reader, samples, TIMESCALE);
    expect(camera.map((sample) => sample.timestamp)).toEqual([0, 500_000, 1_000_000, 1_500_000]);
    expect(camera[1]?.orientation.w).toBeCloseTo(Math.SQRT1_2, 4);
    expect(camera[1]?.orientation.z).toBeCloseTo(Math.SQRT1_2, 4);
    expect(image[1]?.orientation).toEqual({ w: 1, x: 0, y: 0, z: 0 });
  });

  it('reads the gravity direction per frame', () => {
    const { reader, samples } = assemble([block]);
    const { gravity } = readFrameOrientation(reader, samples, TIMESCALE);
    expect(gravity.map((sample) => sample.value)).toEqual([
      [0, 0, 1],
      [0, 1, 0],
    ]);
  });

  it('reads nothing from blocks that carry no orientation', () => {
    const { reader, samples } = assemble([devc([...dvid(), ...gyro([[1, 2, 3]])])]);
    expect(readFrameOrientation(reader, samples, TIMESCALE)).toEqual({
      camera: [],
      image: [],
      gravity: [],
    });
  });

  it('names the camera from the first block that does', () => {
    const { reader, samples } = assemble([devc([...dvid(), ...gyro([[1, 2, 3]])]), block]);
    expect(readDeviceName(reader, samples)).toBe('GoPro Max');
    const silent = assemble([devc([...dvid()])]);
    expect(readDeviceName(silent.reader, silent.samples)).toBe('');
  });
});
