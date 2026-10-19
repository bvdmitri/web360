import { describe, expect, it } from 'vitest';

import type { OrientationSample } from '../motion/orientation';
import { outputToCamera } from '../motion/view';
import type { CameraRecording, LensOptics } from '../model/recording';
import type { OpenedRecording } from '../model/video';
import { fromRotationVector } from '../shared/math/quaternion';
import { degrees, microseconds, seconds } from '../shared/units/units';
import { frameAt } from './frame';

const optics = (pitch: number): LensOptics => ({
  projection: 'equidistant',
  radius: 1400,
  fieldOfView: degrees(183),
  coverage: degrees(188),
  center: [1520, 1520],
  orientation: { yaw: degrees(0), pitch: degrees(pitch), roll: degrees(0) },
});

const recording = {
  model: 'ONE R',
  lenses: [optics(0), optics(180)],
  imuToCamera: fromRotationVector([-Math.PI / 2, 0, 0]),
  rollingShutter: seconds(0.02),
  captureClock: microseconds(1_000_000),
} as unknown as CameraRecording;

const opened: OpenedRecording = {
  recording,
  canvas: [6080, 3040],
  videos: [],
  images: [
    { texture: 0, origin: [0, 0], extent: [3040, 3040] },
    { texture: 1, origin: [3040, 0], extent: [3040, 3040] },
  ],
  duration: seconds(10),
};

const turning: OrientationSample[] = Array.from({ length: 4000 }, (...[, index]) => ({
  timestamp: microseconds(index * 1000),
  orientation: fromRotationVector([0, 0, index * 0.002]),
}));
const still: OrientationSample[] = turning.map((sample) => ({
  timestamp: sample.timestamp,
  orientation: fromRotationVector([0, 0, 1]),
}));

describe('one frame of a rendition', () => {
  const frame = frameAt(
    { opened, attitude: turning, view: still, width: 64, shutterSteps: 8 },
    microseconds(500_000),
  );

  it('places each lens and sizes the output at two to one', () => {
    expect(frame.lenses.map((lens) => lens.image)).toEqual(opened.images);
    expect(frame.lenses.map((lens) => lens.optics)).toEqual(recording.lenses);
    expect([frame.width, frame.height]).toEqual([64, 32]);
  });

  it('rotates by the view at the frame moment on the motion clock', () => {
    const atClock = 1_500_000;
    const expected = outputToCamera(
      recording.imuToCamera,
      fromRotationVector([0, 0, atClock * 0.000002]),
      fromRotationVector([0, 0, 1]),
    );
    expect(frame.correction.w).toBeCloseTo(expected.w, 6);
    expect(frame.correction.z).toBeCloseTo(expected.z, 6);
  });

  it('tabulates the rolling-shutter turn down the canvas rows', () => {
    expect(frame.shutter).toMatchObject({ rows: 3040, steps: 8 });
    const last = frame.shutter?.sample(0, [1520, 3040]);
    expect(Math.abs(last?.w ?? 1)).toBeLessThan(1);
  });

  it('passes the colour corrections through', () => {
    const corrected = frameAt(
      {
        opened,
        attitude: turning,
        view: still,
        width: 64,
        shutterSteps: 8,
        gains: [
          [1, 1, 1],
          [2, 2, 2],
        ],
        vignetting: { strength: 0.5, start: 0.9 },
      },
      microseconds(0),
    );
    expect(corrected.gains?.[1]).toEqual([2, 2, 2]);
    expect(corrected.vignetting).toEqual({ strength: 0.5, start: 0.9 });
  });

  it('has an even height for an odd width', () => {
    const odd = frameAt(
      { opened, attitude: turning, view: still, width: 99, shutterSteps: 2 },
      microseconds(0),
    );
    expect(odd.height).toBe(50);
  });

  it('lets a lens without an image placement read the whole canvas', () => {
    const unplaced = frameAt(
      {
        opened: { ...opened, images: [] },
        attitude: turning,
        view: still,
        width: 8,
        shutterSteps: 2,
      },
      microseconds(0),
    );
    expect(unplaced.lenses[1]?.image).toEqual({ texture: 0, origin: [0, 0], extent: [6080, 3040] });
  });
});
