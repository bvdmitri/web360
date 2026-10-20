import { describe, expect, it } from 'vitest';

import { jitterOf, luminanceOf, patchShifts, type Picture } from './residualMotion';

const WIDTH = 128;
const HEIGHT = 64;

// A textured picture, smooth enough to sample between pixels, moved by (dx, dy) pixels.
const texture = (dx: number, dy: number): Picture => {
  const luminance = new Float32Array(WIDTH * HEIGHT);
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const u = ((x - dx) / WIDTH) * 2 * Math.PI;
      const v = y - dy;
      luminance[y * WIDTH + x] =
        0.5 +
        0.2 * Math.sin(5 * u + v / 3) +
        0.15 * Math.cos(9 * u - v / 5) +
        0.1 * Math.sin(v / 2);
    }
  }
  return { width: WIDTH, height: HEIGHT, luminance };
};

const grid = { columns: 4, rows: 2, size: 16, reach: 4 };

describe('residual motion between frames', () => {
  it('reads a picture as its luminance', () => {
    const picture = luminanceOf(
      [
        [1, 1, 1],
        [0, 0.5, 1],
      ],
      { width: 2, height: 1 },
    );
    expect(picture.width).toBe(2);
    expect(picture.luminance[0]).toBeCloseTo(1, 6);
    expect(picture.luminance[1]).toBeCloseTo(0.5, 6);
  });

  it('finds how far each patch moved, to a fraction of a pixel', () => {
    const shifts = patchShifts(texture(0, 0), texture(1.3, -0.6), grid);
    expect(shifts.length).toBeGreaterThan(4);
    for (const { shift } of shifts) {
      expect(shift[0]).toBeCloseTo(1.3, 1);
      expect(shift[1]).toBeCloseTo(-0.6, 1);
    }
  });

  it('follows a patch across the picture edge, which an equirectangular frame wraps', () => {
    const shifts = patchShifts(texture(0, 0), texture(-2, 0), { ...grid, columns: 8 });
    expect(shifts).toHaveLength(16);
    for (const { shift } of shifts) expect(shift[0]).toBeCloseTo(-2, 1);
  });

  it('leaves out patches without texture, whose shift says nothing', () => {
    const flat: Picture = {
      width: WIDTH,
      height: HEIGHT,
      luminance: new Float32Array(WIDTH * HEIGHT).fill(0.5),
    };
    expect(patchShifts(flat, flat, grid)).toEqual([]);
  });

  it('counts a steady pan as no jitter, and a shake back and forth as its size', () => {
    const steady = Array.from({ length: 5 }, () => [
      { cell: 0, shift: [1, 0] as const },
      { cell: 1, shift: [1, 0] as const },
    ]);
    expect(jitterOf(steady)).toBe(0);
    const shaking = Array.from({ length: 5 }, (...[, index]) => [
      { cell: 0, shift: [index % 2 === 0 ? 0.5 : -0.5, 0] as const },
    ]);
    expect(jitterOf(shaking)).toBeCloseTo(1, 9);
    expect(jitterOf([])).toBe(0);
  });

  it('compares a patch only with itself, from one pair of frames to the next', () => {
    const series = [[{ cell: 0, shift: [0, 0] as const }], [{ cell: 1, shift: [3, 0] as const }]];
    expect(jitterOf(series)).toBe(0);
  });
});
