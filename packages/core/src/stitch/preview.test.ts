import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { readCalibration } from '../format/insta360/calibration';
import { readInfo } from '../format/insta360/info';
import { readInsta360Recording } from '../format/insta360/recording';
import { readTrailer } from '../format/insta360/trailer';
import { ByteReader } from '../shared/binary/byteReader';
import { identity } from '../shared/math/quaternion';
import { estimateGains } from './gains';
import { devignette, estimateVignetting } from './vignetting';
import { renderEquirectangular, type LensSampler, type Rgb, type Scene } from './render';

// A developer harness, not a CI test: point WEB360_PREVIEW_INSV at the `_00_` half of a real
// Insta360 split recording and it decodes one frame from each lens with ffmpeg, CPU-renders a
// low-resolution equirectangular stitch, and writes a PNG (via ffmpeg) for eyeballing. Skipped
// unless the variable is set. Output goes to WEB360_PREVIEW_OUT or the temp directory, with the
// parsed lens optics alongside as JSON. Diagnostics: WEB360_PREVIEW_ONLY=0|1 renders one lens alone,
// and WEB360_PREVIEW_TINT=1 tints the lenses red and blue so the seam and its alignment show.
const footage = process.env['WEB360_PREVIEW_INSV'];
const OUT_WIDTH = 1024;
const OUT_HEIGHT = 512;
const BYTE_MAX = 255;
const GAIN_GRID = { width: 256, height: 128 };
const tints: Rgb[] = [
  [1, 0.55, 0.55],
  [0.55, 0.55, 1],
];

const black: LensSampler = () => [0, 0, 0];

const tint =
  (sampler: LensSampler, colour: Rgb): LensSampler =>
  (pixel) => {
    const [r, g, b] = sampler(pixel);
    return [r * colour[0], g * colour[1], b * colour[2]];
  };

interface LensImage {
  readonly rgb: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly originX: number;
  readonly scaleX: number;
  readonly scaleY: number;
}

const decodeFrame = (file: string, directory: string, name: string): Uint8Array => {
  const out = path.join(directory, `${name}.rgb`);
  const decodeArguments = ['-v', 'error', '-y', '-i', file, '-map', '0:v:0', '-frames:v', '1'];
  execFileSync('ffmpeg', [...decodeArguments, '-f', 'rawvideo', '-pix_fmt', 'rgb24', out]);
  return readFileSync(out);
};

const samplerFor =
  (image: LensImage): LensSampler =>
  (pixel) => {
    const vx = Math.round((pixel[0] - image.originX) * image.scaleX);
    const vy = Math.round(pixel[1] * image.scaleY);
    if (vx < 0 || vy < 0 || vx >= image.width || vy >= image.height) return [0, 0, 0];
    const offset = (vy * image.width + vx) * 3;
    return [
      (image.rgb[offset] ?? 0) / BYTE_MAX,
      (image.rgb[offset + 1] ?? 0) / BYTE_MAX,
      (image.rgb[offset + 2] ?? 0) / BYTE_MAX,
    ];
  };

const toBytes = (pixels: readonly Rgb[]): Uint8Array => {
  const bytes = new Uint8Array(pixels.length * 3);
  for (const [index, pixel] of pixels.entries()) {
    bytes[index * 3] = clampByte(pixel[0]);
    bytes[index * 3 + 1] = clampByte(pixel[1]);
    bytes[index * 3 + 2] = clampByte(pixel[2]);
  }
  return bytes;
};

const clampByte = (value: number): number =>
  Math.max(0, Math.min(BYTE_MAX, Math.round(value * BYTE_MAX)));

const encodePng = (bytes: Uint8Array, outPng: string): void => {
  const raw = `${outPng}.rgb`;
  writeFileSync(raw, bytes);
  const size = `${OUT_WIDTH}x${OUT_HEIGHT}`;
  execFileSync('ffmpeg', [
    '-v',
    'error',
    '-y',
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgb24',
    '-s',
    size,
    '-i',
    raw,
    outPng,
  ]);
};

describe('stitch preview (developer harness)', () => {
  it.skipIf(footage === undefined)(
    'renders an equirectangular PNG from a real recording',
    () => {
      const insv00 = footage!;
      const insv10 = insv00.replaceAll('_00_', '_10_');
      const outPng =
        process.env['WEB360_PREVIEW_OUT'] ?? path.join(os.tmpdir(), 'web360-stitch.png');
      mkdirSync(path.dirname(outPng), { recursive: true });

      const reader = ByteReader.of(readFileSync(insv00));
      const recording = readInsta360Recording(reader);
      const infoRecord = readTrailer(reader).records.find((record) => record.id === 1);
      if (infoRecord === undefined) throw new Error('the recording has no info record');
      const canvas = readCalibration(readInfo(reader, infoRecord.region).calibration).canvas;
      writeFileSync(
        `${outPng}.json`,
        JSON.stringify(
          { model: recording.model, frame: recording.frame, canvas, lenses: recording.lenses },
          undefined,
          2,
        ),
      );

      const squareWidth = canvas[0] / recording.lenses.length;
      const scaleX = recording.frame.width / squareWidth;
      const scaleY = recording.frame.height / canvas[1];
      const shared = {
        width: recording.frame.width,
        height: recording.frame.height,
        scaleX,
        scaleY,
      };
      const samplers: LensSampler[] = [
        samplerFor({
          ...shared,
          rgb: decodeFrame(insv00, path.dirname(outPng), 'lens0'),
          originX: 0,
        }),
        samplerFor({
          ...shared,
          rgb: decodeFrame(insv10, path.dirname(outPng), 'lens1'),
          originX: squareWidth,
        }),
      ];

      const only = process.env['WEB360_PREVIEW_ONLY'];
      const chosen = samplers.map((sampler, index) =>
        only === undefined || only === String(index) ? sampler : black,
      );
      const strength =
        process.env['WEB360_PREVIEW_VIGNETTE'] === '0'
          ? 0
          : estimateVignetting(recording.lenses, chosen, GAIN_GRID);
      const flat = devignette(recording.lenses, chosen, strength);
      const tinted =
        process.env['WEB360_PREVIEW_TINT'] === undefined
          ? flat
          : flat.map((sampler, index) => tint(sampler, tints[index] ?? [1, 1, 1]));

      const gains =
        process.env['WEB360_PREVIEW_GAIN'] === '0'
          ? undefined
          : estimateGains(recording.lenses, flat, GAIN_GRID);
      writeFileSync(`${outPng}.correction.json`, JSON.stringify({ strength, gains }));

      const scene: Scene = {
        lenses: recording.lenses,
        samplers: tinted,
        correction: identity(),
        width: OUT_WIDTH,
        height: OUT_HEIGHT,
        ...(gains !== undefined && { gains }),
      };
      encodePng(toBytes(renderEquirectangular(scene)), outPng);

      expect(existsSync(outPng)).toBe(true);
      expect(statSync(outPng).size).toBeGreaterThan(1000);
    },
    180_000,
  );
});
