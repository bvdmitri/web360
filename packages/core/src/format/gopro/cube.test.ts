import { describe, expect, it } from 'vitest';

import { cubeSamples } from '../../optics/eac';
import { goproCubeMap, UnsupportedLayoutError } from './cube';

describe('the GoPro cube map from its tracks', () => {
  it('lays the MAX2 8K tracks out as measured: 1920 faces, 64-pixel seam bands', () => {
    const cube = goproCubeMap({ width: 5888, height: 1920 });
    expect(cube.faces.map((face) => [face.texture, ...face.origin, face.size, face.band])).toEqual([
      [0, 0, 0, 1920, 64],
      [0, 1984, 0, 1920, 0],
      [0, 3904, 0, 1920, 64],
      [1, 0, 0, 1920, 64],
      [1, 1984, 0, 1920, 0],
      [1, 3904, 0, 1920, 64],
    ]);
  });

  it('gives the MAX 5.6K tracks their 32-pixel bands', () => {
    const cube = goproCubeMap({ width: 4096, height: 1344 });
    expect(cube.faces.map((face) => face.band)).toEqual([32, 0, 32, 32, 0, 32]);
    expect(cube.faces[2]?.origin).toEqual([2 * 1344 + 32, 0]);
  });

  it('looks straight ahead at the first track front face, and up at the second track up face', () => {
    const cube = goproCubeMap({ width: 5888, height: 1920 });
    expect(cubeSamples(cube, [1, 0, 0])[0]?.pixel).toEqual([1984 + 960, 960]);
    expect(cubeSamples(cube, [0, 0, 1]).map((sample) => sample.texture)).toEqual([1, 1]);
  });

  it('refuses tracks narrower than three faces', () => {
    expect(() => goproCubeMap({ width: 3000, height: 1920 })).toThrow(UnsupportedLayoutError);
    expect(() => goproCubeMap({ width: 5889, height: 1920 })).toThrow(UnsupportedLayoutError);
  });
});
