import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { memorySource } from '../../ports/source';
import { rotate } from '../../shared/math/quaternion';
import { NotGoProError, openGoPro } from './open';

const fixture = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../../test/fixtures/gopro/max-eac.360',
);
const bytes = new Uint8Array(readFileSync(fixture));

describe('opening a GoPro recording', () => {
  it('reads both cube-map tracks as videos of the one file', async () => {
    const file = memorySource(bytes);
    const opened = await openGoPro([file]);
    expect(opened.videos).toHaveLength(2);
    expect(opened.videos[0]).toMatchObject({ width: 5888, height: 1920 });
    expect(opened.videos[0]?.codec).toMatch(/^hvc1\./u);
    expect(opened.videos[0]?.frames).toHaveLength(6682);
    expect(opened.sources).toEqual([file]);
    expect(opened.images).toEqual([]);
    expect(opened.cube?.faces).toHaveLength(6);
    expect(opened.duration).toBeCloseTo(6682 / (30_000 / 1001), 1);
  });

  it('describes the camera, its motion and its own attitude', async () => {
    const { recording } = await openGoPro([memorySource(bytes)]);
    expect(recording.model).toMatch(/max/iu);
    expect(recording.frameRate).toBeCloseTo(30_000 / 1001, 2);
    expect(recording.lenses).toEqual([]);
    expect(recording.angularVelocity.length).toBeGreaterThan(1000);
    expect(recording.reportedAttitude?.attitude.length).toBeGreaterThan(1000);
    expect(recording.reportedAttitude?.up).toHaveLength(
      recording.reportedAttitude?.attitude.length ?? -1,
    );
    // A frame is shown 30 ms ahead of the telemetry describing it (measured on the MAX2).
    expect(recording.captureClock).toBe(30_000);
    // The orientation frame's forward axis (z) is the cube's front (+x).
    const forward = rotate(recording.imuToCamera, [0, 0, 1]);
    expect(forward.map((value) => Math.round(value))).toEqual([1, 0, 0]);
  });

  it('joins chapters into one recording, each frame naming its chapter', async () => {
    const [first, second] = [memorySource(bytes), memorySource(bytes)];
    const single = await openGoPro([first]);
    const joined = await openGoPro([first, second]);
    const frames = joined.videos[0]?.frames ?? [];
    expect(frames).toHaveLength(2 * 6682);
    expect(frames[0]?.source).toBe(0);
    expect(frames[6682]?.source).toBe(1);
    expect(frames[6682]?.timestamp).toBeCloseTo(single.duration * 1_000_000, -3);
    expect(joined.duration).toBeCloseTo(2 * single.duration, 3);
    expect(joined.sources).toEqual([first, second]);
    const motion = joined.recording.angularVelocity;
    expect(motion.at(-1)!.timestamp).toBeGreaterThan(single.duration * 1_000_000);
  });

  it('refuses a file that is not a GoPro recording', async () => {
    const insta = path.resolve(path.dirname(fixture), '../insta360/oner-split-00.insv');
    const other = memorySource(new Uint8Array(readFileSync(insta)));
    await expect(openGoPro([other])).rejects.toThrow(NotGoProError);
    await expect(openGoPro([])).rejects.toThrow(NotGoProError);
  });
});
