import { describe, expect, it } from 'vitest';

import type { LensImage, LensOptics } from '../model/recording';
import { degrees } from '../shared/units/units';
import { estimateColour, imageSampler, type LensPicture } from './colour';

const optics = (pitch: number, centerX: number): LensOptics => ({
  projection: 'equidistant',
  radius: 30,
  fieldOfView: degrees(190),
  coverage: degrees(196),
  center: [centerX, 32],
  orientation: { yaw: degrees(0), pitch: degrees(pitch), roll: degrees(0) },
});
const lenses = [optics(0, 32), optics(180, 96)];
const images: LensImage[] = [
  { texture: 0, origin: [0, 0], extent: [64, 64] },
  { texture: 1, origin: [64, 0], extent: [64, 64] },
];

// A picture of `size` square pixels whose every pixel is `level` of 255 in each channel.
const flat = (size: number, level: number): LensPicture => ({
  width: size,
  height: size,
  rgba: new Uint8Array(size * size * 4).map((...[, index]) => (index % 4 === 3 ? 255 : level)),
});

describe('lens pictures on the CPU', () => {
  it('reads a picture pixel through the image placement, scaled to the picture size', () => {
    const picture: LensPicture = {
      width: 2,
      height: 2,
      rgba: Uint8Array.from([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]),
    };
    const sampler = imageSampler(picture, images[1]!);
    expect(sampler([64 + 10, 10])).toEqual([1, 0, 0]);
    expect(sampler([64 + 40, 10])).toEqual([0, 1, 0]);
    expect(sampler([64 + 10, 40])).toEqual([0, 0, 1]);
    expect(sampler([10, 10])).toEqual([0, 0, 0]);
  });
});

describe('colour corrections from lens pictures', () => {
  it('raises the darker lens and lowers the brighter one to meet across the seam', () => {
    const colour = estimateColour({ lenses, images, pictures: [flat(32, 200), flat(32, 100)] });
    const [brighter, darker] = colour.gains;
    expect(brighter![0]).toBeLessThan(1);
    expect(darker![0]).toBeGreaterThan(1);
    expect(brighter![0] * 200).toBeCloseTo(darker![0] * 100, 0);
  });

  it('finds no falloff in lenses that record none', () => {
    const colour = estimateColour({ lenses, images, pictures: [flat(32, 150), flat(32, 150)] });
    expect(colour.vignetting.strength).toBeCloseTo(0, 6);
    expect(colour.gains[0]![1]).toBeCloseTo(1, 6);
  });

  it('reads a lens without a picture as black, which leaves its gain alone', () => {
    const colour = estimateColour({ lenses, images, pictures: [flat(32, 150)] });
    expect(colour.gains[1]).toEqual([1, 1, 1]);
    const unplaced = estimateColour({ lenses, images: [images[0]!], pictures: [flat(32, 150)] });
    expect(unplaced.gains[1]).toEqual([1, 1, 1]);
  });
});
