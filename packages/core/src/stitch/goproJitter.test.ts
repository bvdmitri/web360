// Developer harness, skipped unless WEB360_GOPRO_JITTER names a GoPro .360 recording: measures how
// much each way of steering the picture leaves it shaking from frame to frame (ADR 0023). For each
// moment it decodes consecutive frames once (needs ffmpeg), renders them under `lock` with each
// candidate attitude, and writes the jitter (residualMotion.ts) in degrees to OUT.json. Settings:
// WEB360_GOPRO_JITTER=<file.360>  WEB360_GOPRO_OUT=<stem of the .json>
// WEB360_GOPRO_MOMENTS=<s,s,...>  WEB360_GOPRO_GYRO_OFFSETS=<ms,ms,...> (the gyro's clock offsets)
import { execFileSync } from 'node:child_process';
import {
  appendFileSync,
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
import { readFrameOrientation } from '../format/gopro/motion';
import { openGoPro, type GoProOpened } from '../format/gopro/open';
import { readMovieFrom } from '../format/mp4/locate';
import { samplesOf } from '../format/mp4/movie';
import type { Sample } from '../format/mp4/timeline';
import { rotationAt } from '../motion/interpolate';
import { levelAttitude, levelOrientation } from '../motion/level';
import type { OrientationSample } from '../motion/orientation';
import { outputToCamera } from '../motion/view';
import type { RandomAccessSource } from '../ports/source';
import { attitudeOf } from '../rendition/attitude';
import { viewOf, type Stabilization } from '../rendition/motion';
import { ByteReader } from '../shared/binary/byteReader';
import { conjugate, identity, multiply, rotate, type Quaternion } from '../shared/math/quaternion';
import { cubeSamples } from '../optics/eac';
import { renderCubeMap, type TextureSampler } from './cubeRender';
import { toDirection } from './equirectangular';
import { jitterOf, luminanceOf, patchShifts, type PatchShift } from './residualMotion';
import type { Rgb } from './sampler';

const setting = (name: string): string | undefined => process.env[`WEB360_GOPRO_${name}`];
const recording = setting('JITTER');
const MICROS = 1_000_000;
const MILLIS = 1000;
const BYTE_MAX = 255;
const FULL_TURN = 360;
const DECODE_SCALE = 0.25;
const RUN = { width: 1024, height: 512, frames: 16 };
const GRID = { columns: 16, rows: 4, size: 24, reach: 6 };

interface Size {
  readonly width: number;
  readonly height: number;
}

/**
 * A way to steer the picture: the turn from the output to the cube at a video time (seconds), and
 * optionally a rolling shutter: the signed time (ms) the sensors take to read from top to bottom.
 */
interface Candidate {
  readonly name: string;
  readonly correction: (seconds: number) => Quaternion;
  readonly readout?: number;
}

const SHUTTER_STEPS = 17;
const QUARTER = Math.PI / 2;

// A direction's place down its lens's sensor, about -1 (top) to 1 (bottom): the MAX's lenses look
// along the cube's +x and -x, upright, and an equidistant fisheye puts the angle off the axis
// along the direction's way around it.
const sensorRow = (direction: readonly [number, number, number]): number => {
  const angle = Math.acos(Math.min(1, Math.abs(direction[0])));
  const around = Math.hypot(direction[1], direction[2]);
  return around === 0 ? 0 : (angle / QUARTER) * (-direction[2] / around);
};

// The cube rendered with each direction steered by the attitude when its sensor row was read.
const renderWithShutter = (
  scene: { readonly cube: ReturnType<typeof goproCubeMap>; readonly samplers: TextureSampler[] },
  steer: { readonly at: number; readonly candidate: Candidate },
): Rgb[] => {
  const readout = (steer.candidate.readout ?? 0) / MILLIS;
  const table = Array.from({ length: SHUTTER_STEPS }, (...[, step]) => {
    const row = (step / (SHUTTER_STEPS - 1)) * 2 - 1;
    return steer.candidate.correction(steer.at + (row * readout) / 2);
  });
  const middle = steer.candidate.correction(steer.at);
  const pixels: Rgb[] = [];
  for (let y = 0; y < RUN.height; y += 1) {
    for (let x = 0; x < RUN.width; x += 1) {
      const out = toDirection((x + 1 / 2) / RUN.width, (y + 1 / 2) / RUN.height);
      const along = sensorRow(rotate(middle, out));
      const row = Math.max(-1, Math.min(1, along));
      const step = Math.round(((row + 1) / 2) * (SHUTTER_STEPS - 1));
      const direction = rotate(table[step] ?? middle, out);
      const colour: [number, number, number] = [0, 0, 0];
      for (const sample of cubeSamples(scene.cube, direction)) {
        const read = scene.samplers[sample.texture]?.(sample.pixel) ?? [0, 0, 0];
        colour[0] += sample.weight * read[0];
        colour[1] += sample.weight * read[1];
        colour[2] += sample.weight * read[2];
      }
      pixels.push(colour);
    }
  }
  return pixels;
};

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

const orientationAt = (samples: readonly OrientationSample[], time: number): Quaternion =>
  rotationAt(samples, time, (sample) => sample.orientation);

// Consecutive frames of one track from a moment, decoded in one pass, each as RGB bytes.
const decodeRun = (
  file: string,
  run: { stream: number; at: number; frames?: number },
  size: Size,
): Uint8Array[] => {
  const count = run.frames ?? RUN.frames;
  const raw = path.join(os.tmpdir(), `web360-jitter-${process.pid}-${run.stream}.rgb`);
  const input = ['-v', 'error', '-y', '-ss', String(run.at), '-i', file];
  const pick = ['-map', `0:v:${run.stream}`, '-frames:v', String(count)];
  const output = ['-vf', `scale=${size.width}:${size.height}`, '-f', 'rawvideo'];
  execFileSync('ffmpeg', [...input, ...pick, ...output, '-pix_fmt', 'rgb24', raw]);
  const bytes = new Uint8Array(readFileSync(raw));
  rmSync(raw);
  const frame = size.width * size.height * 3;
  return Array.from({ length: count }, (...[, index]) =>
    bytes.subarray(index * frame, (index + 1) * frame),
  );
};

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

// The camera's own attitude (CORI) and image turn (IORI), one per frame, on the telemetry clock.
const frameOrientation = async (
  source: RandomAccessSource,
): Promise<{ camera: OrientationSample[]; image: OrientationSample[] }> => {
  const movie = await readMovieFrom(source);
  const track = movie.tracks.find((one) => one.format === 'gpmd');
  if (track === undefined) return { camera: [], image: [] };
  const original = samplesOf(track);
  const bytes = new Uint8Array(original.reduce((sum, sample) => sum + sample.size, 0));
  const samples: Sample[] = [];
  let offset = 0;
  for (const sample of original) {
    bytes.set(await source.read(sample.offset, sample.size), offset);
    samples.push({ ...sample, offset });
    offset += sample.size;
  }
  return readFrameOrientation(ByteReader.of(bytes), samples, track.timescale);
};

// ADR 0021's clock for CORI, kept as the reference the gyro is compared with.
const CORI_CLOCK = 30_000;

// Steering by an attitude on its own clock, the world held where it was at the attitude's start.
const steeredBy = (
  attitude: readonly OrientationSample[],
  axes: { readonly imuToCamera: Quaternion; readonly clock: number },
): ((seconds: number) => Quaternion) => {
  const view = viewOf(attitude, {
    stabilization: (setting('STAB') as Stabilization | undefined) ?? 'lock',
  });
  return (seconds) => {
    const time = axes.clock + seconds * MICROS;
    return outputToCamera(
      axes.imuToCamera,
      orientationAt(attitude, time),
      orientationAt(view, time),
    );
  };
};

const candidatesOf = async (opened: GoProOpened, file: string): Promise<Candidate[]> => {
  const camera = opened.recording;
  const telemetry = await frameOrientation(fileSource(file));
  // CORI read as the body's turn to the world, levelled by the camera's gravity (ADR 0021).
  const coriAttitude = levelAttitude(
    telemetry.camera.map((sample) => ({ ...sample, orientation: conjugate(sample.orientation) })),
    camera.gravity ?? [],
    { trust: 'every-reading' },
  );
  const cori = steeredBy(coriAttitude, { imuToCamera: camera.imuToCamera, clock: CORI_CLOCK });
  const turns = telemetry.image;
  // The image turn is on the orientation frame's axes; imuToCamera carries it onto the cube's.
  const inCube = (seconds: number): Quaternion => {
    const turn = orientationAt(turns, CORI_CLOCK + seconds * MICROS);
    return multiply(multiply(camera.imuToCamera, turn), conjugate(camera.imuToCamera));
  };
  // The reader puts the gyro and accelerometer on the orientation frame's axes, which CORI and
  // GRAV are on, so every candidate shares one body frame and one front.
  const gyro = levelOrientation(camera.angularVelocity, camera.acceleration);
  const gyroAxes = camera.imuToCamera;
  const gyroGrav = attitudeOf(camera);
  const offsets = (setting('GYRO_OFFSETS') ?? '0,15,30,45').split(',').map(Number);
  const readouts = (setting('READOUTS') ?? '').split(',').filter(Boolean).map(Number);
  const only = setting('ONLY');
  const all: Candidate[] = [
    { name: 'none', correction: () => identity() },
    { name: 'cori', correction: cori },
    ...offsets.map((ms) => ({
      name: `cori@${ms}ms`,
      correction: steeredBy(coriAttitude, { imuToCamera: camera.imuToCamera, clock: ms * MILLIS }),
    })),
    { name: 'cori+iori', correction: (s) => multiply(inCube(s), cori(s)) },
    { name: 'cori+iori-inverse', correction: (s) => multiply(conjugate(inCube(s)), cori(s)) },
    ...offsets.map((ms) => ({
      name: `gyro@${ms}ms`,
      correction: steeredBy(gyro, { imuToCamera: gyroAxes, clock: ms * MILLIS }),
    })),
    ...offsets.map((ms) => ({
      name: `gyro+grav@${ms}ms`,
      correction: steeredBy(gyroGrav, { imuToCamera: gyroAxes, clock: ms * MILLIS }),
    })),
    ...offsets.flatMap((ms) =>
      readouts.map((readout) => ({
        name: `gyro+grav@${ms}ms rs${readout}`,
        correction: steeredBy(gyroGrav, { imuToCamera: gyroAxes, clock: ms * MILLIS }),
        readout,
      })),
    ),
  ];
  return only === undefined
    ? all
    : all.filter((one) => one.name.startsWith(only) || one.name === 'none');
};

// The jitter, in degrees, of a run of consecutive frames steered by one candidate.
const jitterAt = (
  frames: readonly TextureSampler[][],
  context: { readonly track: Size; readonly at: number; readonly frameRate: number },
  candidate: Candidate,
): number => {
  const cube = goproCubeMap(context.track);
  const pictures = frames.map((samplers, index) => {
    const at = context.at + index / context.frameRate;
    const pixels =
      candidate.readout === undefined
        ? renderCubeMap({ cube, samplers, correction: candidate.correction(at), ...RUN })
        : renderWithShutter({ cube, samplers }, { at, candidate });
    return luminanceOf(pixels, RUN);
  });
  const series: PatchShift[][] = [];
  for (let index = 1; index < pictures.length; index += 1) {
    series.push(patchShifts(pictures[index - 1]!, pictures[index]!, GRID));
  }
  return (jitterOf(series) * FULL_TURN) / RUN.width;
};

interface Opening {
  readonly file: string;
  readonly opened: GoProOpened;
  readonly track: Size;
  readonly size: Size;
}

const openingOf = async (file: string): Promise<Opening> => {
  const opened = await openGoPro([fileSource(file)]);
  const [first] = opened.videos;
  const track = { width: first?.width ?? 0, height: first?.height ?? 0 };
  const size = {
    width: Math.round(track.width * DECODE_SCALE),
    height: Math.round(track.height * DECODE_SCALE),
  };
  return { file, opened, track, size };
};

// Both tracks' samplers for each of a run of consecutive frames from a moment.
const framesFrom = (opening: Opening, run: { at: number; frames?: number }): TextureSampler[][] => {
  const { file, size, track } = opening;
  const runs = [0, 1].map((stream) => decodeRun(file, { stream, ...run }, size));
  const count = run.frames ?? RUN.frames;
  return Array.from({ length: count }, (...[, index]) =>
    runs.map((frames) => samplerOf(frames[index] ?? new Uint8Array(), size, track)),
  );
};

const measure = async (opening: Opening): Promise<Record<string, Record<string, number>>> => {
  const candidates = await candidatesOf(opening.opened, opening.file);
  const moments = (setting('MOMENTS') ?? '5,12,40,55,120,150').split(',').map(Number);
  const table: Record<string, Record<string, number>> = {};
  for (const at of moments) {
    const frames = framesFrom(opening, { at });
    const context = { track: opening.track, at, frameRate: opening.opened.recording.frameRate };
    for (const candidate of candidates) {
      table[candidate.name] = {
        ...table[candidate.name],
        [String(at)]: jitterAt(frames, context, candidate),
      };
    }
  }
  return table;
};

// One frame's pixels as bytes, at its slot in a stack of candidates.
const writeSlot = (raw: Uint8Array, pixels: readonly Rgb[], slot: number): void => {
  const base = slot * RUN.width * RUN.height * 3;
  for (const [at, pixel] of pixels.entries()) {
    raw[base + at * 3] = Math.round(Math.min(1, Math.max(0, pixel[0])) * BYTE_MAX);
    raw[base + at * 3 + 1] = Math.round(Math.min(1, Math.max(0, pixel[1])) * BYTE_MAX);
    raw[base + at * 3 + 2] = Math.round(Math.min(1, Math.max(0, pixel[2])) * BYTE_MAX);
  }
};

const renderClip = (
  opening: Opening,
  clip: { readonly from: number; readonly count: number; readonly candidates: Candidate[] },
  out: string,
): void => {
  const frameRate = opening.opened.recording.frameRate;
  const frames = framesFrom(opening, { at: clip.from, frames: clip.count });
  const cube = goproCubeMap(opening.track);
  const raw = new Uint8Array(RUN.width * RUN.height * 3 * clip.candidates.length);
  const video = `${out}.rgb`;
  rmSync(video, { force: true });
  for (const [index, samplers] of frames.entries()) {
    for (const [slot, candidate] of clip.candidates.entries()) {
      const correction = candidate.correction(clip.from + index / frameRate);
      writeSlot(raw, renderCubeMap({ cube, samplers, correction, ...RUN }), slot);
    }
    appendFileSync(video, raw);
  }
  const input = ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24'];
  const stacked = `${RUN.width}x${RUN.height * clip.candidates.length}`;
  const shape = ['-s', stacked, '-r', String(frameRate)];
  const encode = ['-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', `${out}.mp4`];
  execFileSync('ffmpeg', [...input, ...shape, '-i', video, ...encode]);
  rmSync(video);
};

describe('gopro jitter (developer harness)', () => {
  it.skipIf(recording === undefined)(
    'measures how much each attitude leaves the picture shaking',
    async () => {
      const table = await measure(await openingOf(recording ?? ''));
      const out = setting('OUT') ?? path.join(os.tmpdir(), 'web360-gopro-jitter');
      writeFileSync(`${out}.json`, JSON.stringify(table, undefined, 2));
      expect(Object.keys(table).length).toBeGreaterThan(0);
    },
    3_600_000,
  );

  it.skipIf(recording === undefined || setting('CLIP') === undefined)(
    'renders a clip of each named candidate, stacked, to compare by eye',
    async () => {
      const opening = await openingOf(recording ?? '');
      const [from = 0, length = 3] = (setting('CLIP') ?? '').split(',').map(Number);
      const names = (setting('CLIP_CANDIDATES') ?? 'cori').split(',');
      const all = await candidatesOf(opening.opened, opening.file);
      const candidates = all.filter((one) => names.includes(one.name));
      const count = Math.round(length * opening.opened.recording.frameRate);
      const out = setting('OUT') ?? path.join(os.tmpdir(), 'web360-gopro-clip');
      renderClip(opening, { from, count, candidates }, out);
      expect(candidates.length).toBe(names.length);
    },
    3_600_000,
  );
});
