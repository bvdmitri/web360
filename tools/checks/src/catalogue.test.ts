import { describe, expect, it } from 'vitest';

import { privateTerms } from './catalogue.ts';

describe('privateTerms', () => {
  it('collects every file name, serial and extra term of the catalogue', () => {
    const json = JSON.stringify({
      samples: [
        { files: ['VID_1_00_001.insv', 'VID_1_10_001.insv'], serial: 'SERIAL1' },
        { files: ['CAM_0001.360'] },
      ],
      terms: ['Alex'],
    });
    expect(privateTerms(json)).toEqual([
      'VID_1_00_001.insv',
      'VID_1_10_001.insv',
      'SERIAL1',
      'CAM_0001.360',
      'Alex',
    ]);
  });

  it('reads no terms from a missing catalogue', () => {
    expect(privateTerms(undefined)).toEqual([]);
  });

  it('refuses a catalogue it cannot read, rather than checking nothing', () => {
    expect(() => privateTerms('{"samples": 3}')).toThrow(/catalogue/u);
    expect(() => privateTerms('not json')).toThrow(/catalogue/u);
  });
});
