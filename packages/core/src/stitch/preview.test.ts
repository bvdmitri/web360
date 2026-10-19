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
import type { LensOptics } from '../model/recording';
import { degrees } from '../shared/units/units';
import { estimateGains } from './gains';
import { seamCorrelation } from './seam';
import { devignette, estimateVignetting, type Vignetting } from './vignetting';
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
const SWEEP_FROM = Number(process.env['WEB360_PREVIEW_SWEEP_FROM'] ?? '186');
const SEAM_BAND = {
  width: 720,
  height: 24,
  halfAngle: (Number(process.env['WEB360_PREVIEW_BAND'] ?? '3') * Math.PI) / 180,
};
const SWEEP_TO = Number(process.env['WEB360_PREVIEW_SWEEP_TO'] ?? '210');
const SWEEP_STEP = 1;
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
  const at = process.env['WEB360_PREVIEW_AT'] ?? '0';
  const decodeArguments = [
    '-v',
    'error',
    '-y',
    '-ss',
    at,
    '-i',
    file,
    '-map',
    '0:v:0',
    '-frames:v',
    '1',
  ];
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

const onlyChosen = (samplers: readonly LensSampler[]): LensSampler[] => {
  const only = process.env['WEB360_PREVIEW_ONLY'];
  return samplers.map((sampler, index) =>
    only === undefined || only === String(index) ? sampler : black,
  );
};

const withFieldOfView = (lenses: readonly LensOptics[], fov: number): LensOptics[] =>
  lenses.map((one) => ({ ...one, fieldOfView: degrees(fov) }));

const withFieldOfViewOverride = (lenses: readonly LensOptics[]): readonly LensOptics[] => {
  const override = process.env['WEB360_PREVIEW_FOV'];
  return override === undefined ? lenses : withFieldOfView(lenses, Number(override));
};

const vignettingFor = (
  lenses: readonly LensOptics[],
  samplers: readonly LensSampler[],
): Vignetting =>
  process.env['WEB360_PREVIEW_VIGNETTE'] === '0'
    ? { strength: 0, start: 1 }
    : estimateVignetting(lenses, samplers, GAIN_GRID);

const gainsFor = (
  lenses: readonly LensOptics[],
  samplers: readonly LensSampler[],
): Rgb[] | undefined =>
  process.env['WEB360_PREVIEW_GAIN'] === '0'
    ? undefined
    : estimateGains(lenses, samplers, GAIN_GRID);

const tintedIfAsked = (samplers: readonly LensSampler[]): readonly LensSampler[] =>
  process.env['WEB360_PREVIEW_TINT'] === undefined
    ? samplers
    : samplers.map((sampler, index) => tint(sampler, tints[index] ?? [1, 1, 1]));

const writeSweep = (
  lenses: readonly LensOptics[],
  samplers: readonly LensSampler[],
  file: string,
): void => {
  const table = [];
  for (let fov = SWEEP_FROM; fov <= SWEEP_TO; fov += SWEEP_STEP) {
    const candidate = withFieldOfView(lenses, fov);
    const measured = estimateVignetting(candidate, samplers, GAIN_GRID);
    const flattened = devignette(candidate, samplers, measured);
    table.push({
      fov,
      k: measured.strength,
      start: measured.start,
      correlation: seamCorrelation(candidate, flattened, SEAM_BAND),
    });
  }
  writeFileSync(file, JSON.stringify(table, undefined, 2));
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

      const chosen = onlyChosen(samplers);
      if (process.env['WEB360_PREVIEW_SWEEP'] !== undefined) {
        writeSweep(recording.lenses, chosen, `${outPng}.sweep.json`);
      }
      const lenses = withFieldOfViewOverride(recording.lenses);
      const vignetting = vignettingFor(lenses, chosen);
      const flat = devignette(lenses, chosen, vignetting);
      const tinted = tintedIfAsked(flat);
      const gains = gainsFor(lenses, flat);
      const correlation = seamCorrelation(lenses, flat, SEAM_BAND);
      writeFileSync(
        `${outPng}.correction.json`,
        JSON.stringify({ vignetting, gains, correlation }),
      );

      const scene: Scene = {
        lenses,
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
