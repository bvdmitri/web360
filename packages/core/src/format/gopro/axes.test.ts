import { describe, expect, it } from 'vitest';

import { orient, UnsupportedOrientationError } from './axes';

describe('gpmf axis order', () => {
  it('places each channel on the axis its letter names', () => {
    expect(orient([1, 2, 3], 'ZXY')).toEqual([2, 3, 1]);
    expect(orient([1, 2, 3], 'XYZ')).toEqual([1, 2, 3]);
  });

  it('negates a channel whose letter is lower case', () => {
    expect(orient([1, 2, 3], 'Zxy')).toEqual([-2, -3, 1]);
  });

  it('leaves a stream with no stated order as it is', () => {
    expect(orient([1, 2, 3], '')).toEqual([1, 2, 3]);
  });

  it('refuses an order that does not name each axis once', () => {
    expect(() => orient([1, 2, 3], 'XXY')).toThrow(UnsupportedOrientationError);
    expect(() => orient([1, 2, 3], 'XY')).toThrow(UnsupportedOrientationError);
  });
});
