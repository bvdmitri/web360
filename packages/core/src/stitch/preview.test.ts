import { execFileSync } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { readCalibration } from '../format/insta360/calibration';
import { readInfo } from '../format/insta360/info';
import { readInsta360Recording } from '../format/insta360/recording';
import { readTrailer } from '../format/insta360/trailer';
import type { CameraRecording, LensOptics } from '../model/recording';
import { axisAlignments } from '../motion/axes';
import { fuseOrientation } from '../motion/fusion';
import { rotationAt } from '../motion/interpolate';
import type { OrientationSample } from '../motion/orientation';
import {
  levelHorizon,
  lockToWorld,
  smoothHeading,
  type StabilizationSample,
} from '../motion/stabilize';
import { outputToCamera } from '../motion/view';
import { ByteReader } from '../shared/binary/byteReader';
import { identity, multiply, type Quaternion } from '../shared/math/quaternion';
import { degrees, seconds } from '../shared/units/units';
import { refineCalibration } from './calibrate';
import { estimateGains } from './gains';
import { renderEquirectangular, type LensSampler, type Rgb } from './render';
import { seamCorrelation } from './seam';
import { devignette, estimateVignetting, type Vignetting } from './vignetting';

// A developer harness, not a CI test, skipped unless WEB360_PREVIEW_INSV points at the `_00_` half
// of a real Insta360 split recording. It decodes lens frames with ffmpeg, CPU-stitches them, and
// writes the result with ffmpeg for eyeballing, to WEB360_PREVIEW_OUT (or the temp directory).
//
//   WEB360_PREVIEW_AT=<s>        video time to stitch (default 0)
//   WEB360_PREVIEW_STAB=<mode>   stabilize: off | lock | horizon | smooth (unset: raw camera frame)
//   WEB360_PREVIEW_IMU=<n>       which of the 24 axis alignments maps the IMU to the lenses
//   WEB360_PREVIEW_IMU_SEARCH=1  rank the 24 alignments by how still a locked view stays
//   WEB360_PREVIEW_CLIP=<n>      render n consecutive frames as an MP4 instead of one PNG
//   WEB360_PREVIEW_ONLY=0|1, WEB360_PREVIEW_TINT=1, WEB360_PREVIEW_FOV=<deg>,
//   WEB360_PREVIEW_SWEEP=1, WEB360_PREVIEW_REFINE=1, WEB360_PREVIEW_GAIN=0, WEB360_PREVIEW_VIGNETTE=0
const footage = process.env['WEB360_PREVIEW_INSV'];
const setting = (name: string): string | undefined => process.env[`WEB360_PREVIEW_${name}`];

const STILL = { width: 1024, height: 512, decode: 2880 };
const CLIP = { width: 768, height: 384, decode: 960 };
const SEARCH = { width: 160, height: 80, decode: 720 };
const VIDEO_FPS = 30_000 / 1001;
const MICROS = 1_000_000;
const BYTE_MAX = 255;
const GAIN_GRID = { width: 256, height: 128 };
const SEAM_BAND = {
  width: 720,
  height: 24,
  halfAngle: (Number(setting('BAND') ?? '3') * Math.PI) / 180,
};
const SWEEP = {
  from: Number(setting('SWEEP_FROM') ?? '181'),
  to: Number(setting('SWEEP_TO') ?? '196'),
};
const SMOOTHING = seconds(Number(setting('SMOOTHING') ?? '1'));
const tints: Rgb[] = [
  [1, 0.55, 0.55],
  [0.55, 0.55, 1],
];
const black: LensSampler = () => [0, 0, 0];

interface Source {
  readonly insv00: string;
  readonly insv10: string;
  readonly recording: CameraRecording;
  readonly canvas: readonly [number, number];
  readonly directory: string;
}

interface Motion {
  readonly attitude: readonly OrientationSample[];
  readonly view: readonly OrientationSample[];
  readonly imuToCamera: Quaternion;
}

interface Corrections {
  readonly vignetting: Vignetting;
  readonly gains: Rgb[] | undefined;
}

interface Frame {
  readonly rotation: Quaternion;
  readonly width: number;
  readonly height: number;
}

const loadSource = (insv00: string, directory: string): Source => {
  const reader = ByteReader.of(readFileSync(insv00));
  const recording = readInsta360Recording(reader);
  const infoRecord = readTrailer(reader).records.find((record) => record.id === 1);
  if (infoRecord === undefined) throw new Error('the recording has no info record');
  const canvas = readCalibration(readInfo(reader, infoRecord.region).calibration).canvas;
  return { insv00, insv10: insv00.replaceAll('_00_', '_10_'), recording, canvas, directory };
};

const decodeFrames = (
  file: string,
  at: number,
  decode: { count: number; size: number },
): Uint8Array[] => {
  const out = path.join(os.tmpdir(), `web360-decode-${process.pid}.rgb`);
  const scale = `scale=${decode.size}:${decode.size}`;
  const input = ['-v', 'error', '-y', '-ss', String(at), '-i', file, '-map', '0:v:0'];
  const output = [
    '-frames:v',
    String(decode.count),
    '-vf',
    scale,
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgb24',
    out,
  ];
  execFileSync('ffmpeg', [...input, ...output]);
  const all = readFileSync(out);
  rmSync(out);
  const frameBytes = decode.size * decode.size * 3;
  const frames: Uint8Array[] = [];
  for (let start = 0; start + frameBytes <= all.length; start += frameBytes) {
    frames.push(all.subarray(start, start + frameBytes));
  }
  return frames;
};

const samplersFor = (
  source: Source,
  frames: readonly Uint8Array[],
  size: number,
): LensSampler[] => {
  const squareWidth = source.canvas[0] / source.recording.lenses.length;
  const scaleX = size / squareWidth;
  const scaleY = size / source.canvas[1];
  return frames.map((rgb, index) => (pixel: readonly [number, number]): Rgb => {
    const vx = Math.round((pixel[0] - index * squareWidth) * scaleX);
    const vy = Math.round(pixel[1] * scaleY);
    if (vx < 0 || vy < 0 || vx >= size || vy >= size) return [0, 0, 0];
    const offset = (vy * size + vx) * 3;
    return [
      (rgb[offset] ?? 0) / BYTE_MAX,
      (rgb[offset + 1] ?? 0) / BYTE_MAX,
      (rgb[offset + 2] ?? 0) / BYTE_MAX,
    ];
  });
};

const samplersAt = (source: Source, at: number, size: number): LensSampler[] => {
  const lens0 = decodeFrames(source.insv00, at, { count: 1, size });
  const lens1 = decodeFrames(source.insv10, at, { count: 1, size });
  return onlyChosen(samplersFor(source, [...lens0, ...lens1], size));
};

const onlyChosen = (samplers: readonly LensSampler[]): LensSampler[] => {
  const only = setting('ONLY');
  return samplers.map((sampler, index) =>
    only === undefined || only === String(index) ? sampler : black,
  );
};

const tinted = (samplers: readonly LensSampler[]): readonly LensSampler[] =>
  setting('TINT') === undefined
    ? samplers
    : samplers.map((sampler, index) => {
        const colour = tints[index] ?? [1, 1, 1];
        return (pixel: readonly [number, number]): Rgb => {
          const [r, g, b] = sampler(pixel);
          return [r * colour[0], g * colour[1], b * colour[2]];
        };
      });

const withFieldOfView = (lenses: readonly LensOptics[], fov: number): LensOptics[] =>
  lenses.map((one) => ({ ...one, fieldOfView: degrees(fov) }));

const lensesFor = (
  source: Source,
  samplers: readonly LensSampler[],
  outBase: string,
): readonly LensOptics[] => {
  const override = setting('FOV');
  const lenses =
    override === undefined
      ? source.recording.lenses
      : withFieldOfView(source.recording.lenses, Number(override));
  if (setting('REFINE') === undefined) return lenses;
  const refined = refineCalibration(lenses, samplers, SEAM_BAND);
  writeFileSync(`${outBase}.refined.json`, JSON.stringify(refined, undefined, 2));
  return refined.lenses;
};

const correctionsFor = (
  lenses: readonly LensOptics[],
  samplers: readonly LensSampler[],
): Corrections => {
  const vignetting =
    setting('VIGNETTE') === '0'
      ? { strength: 0, start: 1 }
      : estimateVignetting(lenses, samplers, GAIN_GRID);
  const flat = devignette(lenses, samplers, vignetting);
  return {
    vignetting,
    gains: setting('GAIN') === '0' ? undefined : estimateGains(lenses, flat, GAIN_GRID),
  };
};

const renderWith = (
  lenses: readonly LensOptics[],
  samplers: readonly LensSampler[],
  context: { readonly corrections: Corrections; readonly frame: Frame },
): Rgb[] => {
  const { corrections, frame } = context;
  return renderEquirectangular({
    lenses,
    samplers: tinted(devignette(lenses, samplers, corrections.vignetting)),
    correction: frame.rotation,
    width: frame.width,
    height: frame.height,
    ...(corrections.gains !== undefined && { gains: corrections.gains }),
  });
};

const correctionsByMode = (
  mode: string,
  attitude: readonly OrientationSample[],
): StabilizationSample[] => {
  const modes: Record<string, () => StabilizationSample[]> = {
    lock: () => lockToWorld(attitude),
    horizon: () => levelHorizon(attitude),
    smooth: () => smoothHeading(attitude, SMOOTHING),
  };
  const chosen = modes[mode];
  return chosen === undefined
    ? attitude.map((sample) => ({ timestamp: sample.timestamp, correction: identity() }))
    : chosen();
};

const motionFor = (recording: CameraRecording): Motion | undefined => {
  const mode = setting('STAB');
  if (mode === undefined) return undefined;
  const attitude = fuseOrientation(recording.angularVelocity, recording.acceleration);
  const corrections = correctionsByMode(mode, attitude);
  const view = corrections.map((one, index) => ({
    timestamp: one.timestamp,
    orientation: multiply(one.correction, attitude[index]?.orientation ?? identity()),
  }));
  const index = setting('IMU');
  const imuToCamera =
    index === undefined ? recording.imuToCamera : (axisAlignments()[Number(index)] ?? identity());
  return { attitude, view, imuToCamera };
};

const TIME_OFFSET = Number(setting('TIME_OFFSET') ?? '0') * 1000;
const timeOf = (source: Source, at: number): number =>
  source.recording.captureClock + at * MICROS + TIME_OFFSET;

const rotationFor = (source: Source, motion: Motion | undefined, at: number): Quaternion => {
  if (motion === undefined) return identity();
  const time = timeOf(source, at);
  const attitude = rotationAt(motion.attitude, time, (sample) => sample.orientation);
  const view = rotationAt(motion.view, time, (sample) => sample.orientation);
  return outputToCamera(motion.imuToCamera, attitude, view);
};

const toBytes = (pixels: readonly Rgb[]): Uint8Array => {
  const bytes = new Uint8Array(pixels.length * 3);
  for (const [index, pixel] of pixels.entries()) {
    for (let channel = 0; channel < 3; channel += 1) {
      bytes[index * 3 + channel] = Math.max(
        0,
        Math.min(BYTE_MAX, Math.round((pixel[channel] ?? 0) * BYTE_MAX)),
      );
    }
  }
  return bytes;
};

const encode = (raw: string, size: { width: number; height: number }, out: string): void => {
  const input = [
    '-v',
    'error',
    '-y',
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgb24',
    '-s',
    `${size.width}x${size.height}`,
  ];
  const video = out.endsWith('.mp4')
    ? ['-r', String(VIDEO_FPS), '-i', raw, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18']
    : ['-i', raw];
  execFileSync('ffmpeg', [...input, ...video, out]);
  rmSync(raw);
};

const luminanceCorrelation = (a: readonly Rgb[], b: readonly Rgb[]): number => {
  const pairs: [number, number][] = [];
  for (const [index, colour] of a.entries()) {
    const other = b[index];
    const la = colour[0] + colour[1] + colour[2];
    const lb = other === undefined ? 0 : other[0] + other[1] + other[2];
    if (la > 0 && lb > 0) pairs.push([la, lb]);
  }
  const n = pairs.length;
  const mean = (pick: 0 | 1): number => pairs.reduce((sum, pair) => sum + pair[pick], 0) / n;
  const [ma, mb] = [mean(0), mean(1)];
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (const [x, y] of pairs) {
    cov += (x - ma) * (y - mb);
    va += (x - ma) ** 2;
    vb += (y - mb) ** 2;
  }
  return va > 0 && vb > 0 ? cov / Math.sqrt(va * vb) : 0;
};

const turnBetween = (a: Quaternion, b: Quaternion): number => {
  const dot = Math.abs(a.w * b.w + a.x * b.x + a.y * b.y + a.z * b.z);
  return (2 * Math.acos(Math.min(1, dot)) * 180) / Math.PI;
};

const scanMotion = (source: Source, outBase: string): void => {
  const attitude = fuseOrientation(source.recording.angularVelocity, source.recording.acceleration);
  const span = Number(setting('IMU_SPAN') ?? '2');
  const orientationAt = (time: number): Quaternion =>
    rotationAt(attitude, timeOf(source, time), (sample) => sample.orientation);
  const scan = [];
  for (let at = 0; at < 140; at += 1)
    scan.push({ at, turn: turnBetween(orientationAt(at), orientationAt(at + span)) });
  writeFileSync(`${outBase}.motion.json`, JSON.stringify(scan));
};

const searchImu = (source: Source, at: number, outBase: string): void => {
  const span = Number(setting('IMU_SPAN') ?? '2');
  const first = samplersAt(source, at, SEARCH.decode);
  const second = samplersAt(source, at + span, SEARCH.decode);
  const lenses = source.recording.lenses;
  const corrections = correctionsFor(lenses, first);
  const attitude = fuseOrientation(source.recording.angularVelocity, source.recording.acceleration);
  const orientationAt = (time: number): Quaternion =>
    rotationAt(attitude, timeOf(source, time), (sample) => sample.orientation);
  const reference = orientationAt(at);
  const frameFor = (alignment: Quaternion, time: number): Frame => ({
    rotation: outputToCamera(alignment, orientationAt(time), reference),
    width: SEARCH.width,
    height: SEARCH.height,
  });
  const ranking = axisAlignments().map((alignment, index) => {
    const a = renderWith(lenses, first, { corrections, frame: frameFor(alignment, at) });
    const b = renderWith(lenses, second, { corrections, frame: frameFor(alignment, at + span) });
    return { index, alignment, stillness: luminanceCorrelation(a, b) };
  });
  ranking.sort((left, right) => right.stillness - left.stillness);
  writeFileSync(`${outBase}.imu.json`, JSON.stringify(ranking, undefined, 2));
};

const renderClip = (
  source: Source,
  motion: Motion | undefined,
  context: { at: number; count: number; out: string },
): void => {
  const decode = { count: context.count, size: CLIP.decode };
  const lens0 = decodeFrames(source.insv00, context.at, decode);
  const lens1 = decodeFrames(source.insv10, context.at, decode);
  const lenses = source.recording.lenses;
  const raw = `${context.out}.rgb`;
  let corrections: Corrections | undefined;
  for (const [index, frame0] of lens0.entries()) {
    const frame1 = lens1[index];
    if (frame1 === undefined) break;
    const samplers = onlyChosen(samplersFor(source, [frame0, frame1], CLIP.decode));
    corrections ??= correctionsFor(lenses, samplers);
    const rotation = rotationFor(source, motion, context.at + index / VIDEO_FPS);
    const pixels = renderWith(lenses, samplers, { corrections, frame: { rotation, ...CLIP } });
    appendFileSync(raw, toBytes(pixels));
  }
  encode(raw, CLIP, context.out);
};

const renderStill = (
  source: Source,
  motion: Motion | undefined,
  context: { at: number; out: string },
): void => {
  const samplers = samplersAt(source, context.at, STILL.decode);
  const lenses = lensesFor(source, samplers, context.out);
  if (setting('SWEEP') !== undefined) writeSweep(lenses, samplers, `${context.out}.sweep.json`);
  const corrections = correctionsFor(lenses, samplers);
  const correlation = seamCorrelation(
    lenses,
    devignette(lenses, samplers, corrections.vignetting),
    SEAM_BAND,
  );
  writeFileSync(`${context.out}.correction.json`, JSON.stringify({ ...corrections, correlation }));
  const frame = { rotation: rotationFor(source, motion, context.at), ...STILL };
  const raw = `${context.out}.rgb`;
  writeFileSync(raw, toBytes(renderWith(lenses, samplers, { corrections, frame })));
  encode(raw, STILL, context.out);
};

const writeSweep = (
  lenses: readonly LensOptics[],
  samplers: readonly LensSampler[],
  file: string,
): void => {
  const table = [];
  for (let fov = SWEEP.from; fov <= SWEEP.to; fov += 1) {
    const candidate = withFieldOfView(lenses, fov);
    const measured = estimateVignetting(candidate, samplers, GAIN_GRID);
    const correlation = seamCorrelation(
      candidate,
      devignette(candidate, samplers, measured),
      SEAM_BAND,
    );
    table.push({ fov, k: measured.strength, start: measured.start, correlation });
  }
  writeFileSync(file, JSON.stringify(table, undefined, 2));
};

describe('stitch preview (developer harness)', () => {
  it.skipIf(footage === undefined)(
    'stitches a real recording to a PNG or an MP4',
    () => {
      const out = setting('OUT') ?? path.join(os.tmpdir(), 'web360-stitch.png');
      mkdirSync(path.dirname(out), { recursive: true });
      const source = loadSource(footage!, path.dirname(out));
      const at = Number(setting('AT') ?? '0');
      if (setting('MOTION_SCAN') !== undefined) scanMotion(source, out);
      if (setting('IMU_SEARCH') !== undefined) searchImu(source, at, out);
      const motion = motionFor(source.recording);
      const clip = setting('CLIP');
      const target = clip === undefined ? out : out.replace(/\.png$/u, '.mp4');
      if (clip === undefined) renderStill(source, motion, { at, out: target });
      else renderClip(source, motion, { at, count: Number(clip), out: target });
      expect(existsSync(target)).toBe(true);
      expect(statSync(target).size).toBeGreaterThan(1000);
    },
    1_800_000,
  );
});
