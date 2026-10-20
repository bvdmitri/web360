// Developer harness, skipped unless WEB360_GOPRO_PREVIEW names a GoPro .360 recording: renders one
// moment of its cube map to an equirectangular PNG (needs ffmpeg), or runs one of the measurements
// of ADR 0021 and 0023. Settings:
//   WEB360_GOPRO_PREVIEW=<file.360>  WEB360_GOPRO_OUT=<png, or the stem of a search's .json>
//   WEB360_GOPRO_AT=<seconds>  WEB360_GOPRO_SCALE=<0..1, the decode size against the stored size>
//   WEB360_GOPRO_STAB=<off|lock|horizon|smooth|follow>  stabilizes the still with the attitude
//   WEB360_GOPRO_SEARCH=1  ranks readings of the attitude a rendition uses, each with the 24 axis-aligned
//     turns to the cube, by how still they hold the world between frames at the fastest moments
//   WEB360_GOPRO_OFFSETS=<ms,ms,...>  ranks time offsets of the attitude against the picture alike
//   WEB360_GOPRO_HORIZON=<s,s,...>  ranks the 24 turns by how level the horizon comes out under
//     horizon levelling at those moments
import { execFileSync } from 'node:child_process';
import {
  closeSync,
  openSync,
  readFileSync,
  readSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { goproCubeMap } from '../format/gopro/cube';
import { openGoPro, type GoProOpened } from '../format/gopro/open';
import type { RandomAccessSource } from '../ports/source';
import { attitudeOf } from '../rendition/attitude';
import { viewOf, type Stabilization } from '../rendition/motion';
import { axisAlignments } from '../motion/axes';
import { rotationAt } from '../motion/interpolate';
import type { OrientationSample } from '../motion/orientation';
import { outputToCamera } from '../motion/view';
import { conjugate, identity, multiply, type Quaternion } from '../shared/math/quaternion';
import { renderCubeMap, type TextureSampler } from './cubeRender';
import type { Rgb } from './sampler';

const setting = (name: string): string | undefined => process.env[`WEB360_GOPRO_${name}`];
const recording = setting('PREVIEW');
const OUTPUT = { width: 2048, height: 1024 };
const BYTE_MAX = 255;
const MICROS = 1_000_000;
const MILLIS = 1000;
const SEARCH = { width: 512, height: 256, scale: 0.25, moments: 8, spacing: 5, gap: 1 / 3 };

interface Size {
  readonly width: number;
  readonly height: number;
}

interface Harness {
  readonly file: string;
  readonly opened: GoProOpened;
  readonly track: Size;
  readonly out: string;
}

// The recording's bytes read on demand from its file, as a browser reads a picked file.
const fileSource = (file: string): RandomAccessSource => ({
  size: statSync(file).size,
  read: (offset, length): Promise<Uint8Array> => {
    const handle = openSync(file, 'r');
    const bytes = new Uint8Array(length);
    readSync(handle, bytes, 0, length, offset);
    closeSync(handle);
    return Promise.resolve(bytes);
  },
});

const numbers = (list: string): number[] => list.split(',').map(Number);

const orientationAt = (samples: readonly OrientationSample[], time: number): Quaternion =>
  rotationAt(samples, time, (sample) => sample.orientation);

const decodeTrack = (
  harness: Harness,
  frame: { readonly stream: number; readonly at: number },
  size: Size,
): Uint8Array => {
  const { stream, at } = frame;
  const raw = path.join(os.tmpdir(), `web360-gopro-${process.pid}-${stream}.rgb`);
  const input = ['-v', 'error', '-y', '-ss', String(at), '-i', harness.file];
  const pick = ['-map', `0:v:${stream}`, '-frames:v', '1'];
  const output = ['-vf', `scale=${size.width}:${size.height}`, '-f', 'rawvideo'];
  execFileSync('ffmpeg', [...input, ...pick, ...output, '-pix_fmt', 'rgb24', raw]);
  const bytes = new Uint8Array(readFileSync(raw));
  rmSync(raw);
  return bytes;
};

// Nearest-pixel reads of a decoded track, given in stored-track pixels.
const samplerOf = (rgb: Uint8Array, size: Size, track: Size): TextureSampler => {
  const scale = size.width / track.width;
  return (pixel): Rgb => {
    const x = Math.min(size.width - 1, Math.max(0, Math.floor(pixel[0] * scale)));
    const y = Math.min(size.height - 1, Math.max(0, Math.floor(pixel[1] * scale)));
    const at = (y * size.width + x) * 3;
    return [
      (rgb[at] ?? 0) / BYTE_MAX,
      (rgb[at + 1] ?? 0) / BYTE_MAX,
      (rgb[at + 2] ?? 0) / BYTE_MAX,
    ];
  };
};

// Both tracks' samplers for the frame at a moment, decoded at a fraction of their stored size.
const framesAt = (harness: Harness, at: number, scale: number): TextureSampler[] => {
  const size = {
    width: Math.round(harness.track.width * scale),
    height: Math.round(harness.track.height * scale),
  };
  return [0, 1].map((stream) =>
    samplerOf(decodeTrack(harness, { stream, at }, size), size, harness.track),
  );
};

const searchRender = (
  harness: Harness,
  samplers: TextureSampler[],
  correction: Quaternion,
): Rgb[] =>
  renderCubeMap({
    cube: goproCubeMap(harness.track),
    samplers,
    correction,
    width: SEARCH.width,
    height: SEARCH.height,
  });

const turnRate = (attitude: readonly OrientationSample[], time: number, step: number): number => {
  const turn = multiply(
    conjugate(orientationAt(attitude, time)),
    orientationAt(attitude, time + step),
  );
  return 2 * Math.acos(Math.min(1, Math.abs(turn.w)));
};

// The fastest-turning moments, at least `spacing` seconds apart.
const fastMoments = (harness: Harness): number[] => {
  const attitude = attitudeOf(harness.opened.recording);
  const step = MICROS / harness.opened.recording.frameRate;
  const end = (attitude.at(-1)?.timestamp ?? 0) / MICROS - 1;
  const rated: { at: number; rate: number }[] = [];
  for (let at = 1; at < end; at += 1 / 2) {
    rated.push({ at, rate: turnRate(attitude, at * MICROS, step) });
  }
  return spacedOut(rated.toSorted((a, b) => b.rate - a.rate).map(({ at }) => at));
};

// The first moments of a list that keep `spacing` seconds from every one taken before them.
const spacedOut = (moments: readonly number[]): number[] => {
  const chosen: number[] = [];
  for (const at of moments) {
    if (chosen.every((other) => Math.abs(other - at) >= SEARCH.spacing)) chosen.push(at);
    if (chosen.length === SEARCH.moments) break;
  }
  return chosen;
};

const luminance = (pixel: Rgb): number => (pixel[0] + pixel[1] + pixel[2]) / 3;
const mean = (values: readonly number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

// How alike two renders are: the correlation of their luminance, 1 for a world held still.
const stillness = (a: readonly Rgb[], b: readonly Rgb[]): number => {
  const xs = a.map((pixel) => luminance(pixel));
  const ys = b.map((pixel) => luminance(pixel));
  const [mx, my] = [mean(xs), mean(ys)];
  let xy = 0;
  let xx = 0;
  let yy = 0;
  for (const [index, x] of xs.entries()) {
    const y = ys[index] ?? 0;
    xy += (x - mx) * (y - my);
    xx += (x - mx) ** 2;
    yy += (y - my) ** 2;
  }
  return xy / Math.sqrt(xx * yy);
};

// How still a reading of the attitude holds the world from a fast moment to a third of a second on.
const lockStillness = (
  harness: Harness,
  pair: readonly TextureSampler[][],
  steer: { at: number; attitude: (time: number) => Quaternion; alignment: Quaternion },
): number => {
  const view = steer.attitude(steer.at);
  const [a, b] = [steer.at, steer.at + SEARCH.gap].map((time, which) =>
    searchRender(
      harness,
      pair[which] ?? [],
      outputToCamera(steer.alignment, steer.attitude(time), view),
    ),
  );
  return stillness(a ?? [], b ?? []);
};

const READINGS: Record<string, (q: Quaternion) => Quaternion> = {
  stored: (q) => q,
  conjugated: (q) => conjugate(q),
};

const searchReadings = (harness: Harness): void => {
  const attitude = attitudeOf(harness.opened.recording);
  const totals = new Map<string, number>();
  for (const at of fastMoments(harness)) {
    const pair = [at, at + SEARCH.gap].map((time) => framesAt(harness, time, SEARCH.scale));
    for (const [name, read] of Object.entries(READINGS)) {
      const reading = (time: number): Quaternion => read(orientationAt(attitude, time * MICROS));
      for (const [index, alignment] of axisAlignments().entries()) {
        const key = `${name} #${index}`;
        const score = lockStillness(harness, pair, { at, attitude: reading, alignment });
        totals.set(key, (totals.get(key) ?? 0) + score);
      }
    }
  }
  const ranking = [...totals]
    .toSorted((a, b) => b[1] - a[1])
    .map(([key, score]) => ({ key, score }));
  writeFileSync(`${harness.out}.json`, JSON.stringify(ranking.slice(0, 12), undefined, 2));
};

const searchOffsets = (harness: Harness, offsets: readonly number[]): void => {
  const { recording: camera } = harness.opened;
  const attitude = attitudeOf(camera);
  const totals = offsets.map(() => 0);
  const moments = setting('MOMENTS')?.split(',').map(Number) ?? fastMoments(harness);
  const perMoment: { at: number; best: number }[] = [];
  for (const at of moments) {
    const pair = [at, at + SEARCH.gap].map((time) => framesAt(harness, time, SEARCH.scale));
    const scores = offsets.map((offset) => {
      const reading = (time: number): Quaternion =>
        orientationAt(attitude, time * MICROS + offset * MILLIS);
      return lockStillness(harness, pair, { at, attitude: reading, alignment: camera.imuToCamera });
    });
    for (const [index, score] of scores.entries()) totals[index] = (totals[index] ?? 0) + score;
    const best = scores.indexOf(Math.max(...scores));
    perMoment.push({ at, best: offsets[best] ?? 0 });
  }
  const ranking = offsets.map((offset, index) => ({ offset, score: totals[index] ?? 0 }));
  const report = { ranking: ranking.toSorted((a, b) => b.score - a.score), perMoment };
  writeFileSync(`${harness.out}.json`, JSON.stringify(report, undefined, 2));
};

// Per column, the row of the sharpest bright-to-dark step in the middle half: the horizon. The
// score is how far those rows stray from the equator (median absolute), lower is better.
const horizonScore = (pixels: readonly Rgb[]): number => {
  const { width, height } = SEARCH;
  const rows: number[] = [];
  for (let x = 0; x < width; x += 1) {
    let best = { row: height / 2, step: 0 };
    for (let y = height / 4; y < (3 * height) / 4; y += 1) {
      const above = pixels[(y - 2) * width + x] ?? [0, 0, 0];
      const below = pixels[(y + 2) * width + x] ?? [0, 0, 0];
      const step = above[2] + above[1] - below[2] - below[1];
      if (step > best.step) best = { row: y, step };
    }
    rows.push(Math.abs(best.row - height / 2));
  }
  return rows.toSorted((a, b) => a - b)[Math.floor(rows.length / 2)] ?? height;
};

const searchHorizon = (harness: Harness, moments: readonly number[]): void => {
  const { recording: camera } = harness.opened;
  const attitude = attitudeOf(camera);
  const view = viewOf(attitude, { stabilization: 'horizon' });
  const totals = axisAlignments().map(() => 0);
  for (const at of moments) {
    const samplers = framesAt(harness, at, SEARCH.scale);
    const time = camera.captureClock + at * MICROS;
    const [body, held] = [orientationAt(attitude, time), orientationAt(view, time)];
    for (const [index, alignment] of axisAlignments().entries()) {
      const pixels = searchRender(harness, samplers, outputToCamera(alignment, body, held));
      totals[index] = (totals[index] ?? 0) + horizonScore(pixels);
    }
  }
  const ranking = totals.map((score, index) => ({ index, score }));
  const best = ranking.toSorted((a, b) => a.score - b.score).slice(0, 8);
  writeFileSync(`${harness.out}.json`, JSON.stringify(best, undefined, 2));
};

// The turn from the output to the cube at a moment, for a stabilization mode.
const stabilizedAt = (harness: Harness, stabilization: Stabilization, at: number): Quaternion => {
  const { recording: camera } = harness.opened;
  const attitude = attitudeOf(camera);
  const view = viewOf(attitude, { stabilization });
  const time = camera.captureClock + at * MICROS;
  return outputToCamera(
    camera.imuToCamera,
    orientationAt(attitude, time),
    orientationAt(view, time),
  );
};

const writePng = (pixels: readonly Rgb[], out: string): void => {
  const bytes = new Uint8Array(pixels.length * 3);
  for (const [index, pixel] of pixels.entries()) {
    for (let channel = 0; channel < 3; channel += 1) {
      bytes[index * 3 + channel] = Math.round(
        Math.min(1, Math.max(0, pixel[channel] ?? 0)) * BYTE_MAX,
      );
    }
  }
  const input = ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24'];
  execFileSync('ffmpeg', [...input, '-s', `${OUTPUT.width}x${OUTPUT.height}`, '-i', '-', out], {
    input: bytes,
  });
};

const correctionOf = (
  harness: Harness,
  stabilization: Stabilization | undefined,
  at: number,
): Quaternion =>
  stabilization === undefined ? identity() : stabilizedAt(harness, stabilization, at);

const renderStill = (harness: Harness): void => {
  const at = Number(setting('AT') ?? '0');
  const scale = Number(setting('SCALE') ?? '0.5');
  const stabilization = setting('STAB') as Stabilization | undefined;
  const pixels = renderCubeMap({
    cube: goproCubeMap(harness.track),
    samplers: framesAt(harness, at, scale),
    correction: correctionOf(harness, stabilization, at),
    ...OUTPUT,
  });
  writePng(pixels, harness.out);
  expect(pixels).toHaveLength(OUTPUT.width * OUTPUT.height);
};

const MODES: { readonly name: string; readonly run: (harness: Harness, value: string) => void }[] =
  [
    {
      name: 'SEARCH',
      run: (harness): void => {
        searchReadings(harness);
      },
    },
    {
      name: 'OFFSETS',
      run: (harness, value): void => {
        searchOffsets(harness, numbers(value));
      },
    },
    {
      name: 'HORIZON',
      run: (harness, value): void => {
        searchHorizon(harness, numbers(value));
      },
    },
  ];

const harnessOf = async (file: string): Promise<Harness> => {
  const opened = await openGoPro([fileSource(file)]);
  const [first] = opened.videos;
  const track = { width: first?.width ?? 0, height: first?.height ?? 0 };
  const out = setting('OUT') ?? path.join(os.tmpdir(), 'web360-gopro');
  return { file, opened, track, out };
};

describe('gopro cube preview (developer harness)', () => {
  it.skipIf(recording === undefined)(
    'renders a GoPro recording to an equirectangular PNG',
    async () => {
      const harness = await harnessOf(recording ?? '');
      const mode = MODES.find(({ name }) => setting(name) !== undefined);
      if (mode === undefined) renderStill(harness);
      else mode.run(harness, setting(mode.name) ?? '');
    },
    600_000,
  );
});
