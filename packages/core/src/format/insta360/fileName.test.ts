import { describe, expect, it } from 'vitest';

import { parseRecordingFileName, recordingKey } from './fileName';

describe('insta360 file name', () => {
  it('parses the back and screen lens files of a recording', () => {
    expect(parseRecordingFileName('VID_20200101_120000_00_003.insv')).toEqual({
      prefix: 'VID',
      date: '20200101',
      time: '120000',
      lens: 0,
      proxy: false,
      sequence: '003',
    });
    expect(parseRecordingFileName('VID_20200101_120000_10_003.insv')?.lens).toBe(1);
  });

  it('marks a low-resolution preview as a proxy', () => {
    expect(parseRecordingFileName('LRV_20200101_120000_11_003.insv')).toMatchObject({
      prefix: 'LRV',
      lens: 1,
      proxy: true,
    });
  });

  it('returns undefined for a name that is not an Insta360 recording', () => {
    expect(parseRecordingFileName('holiday.mp4')).toBeUndefined();
    expect(parseRecordingFileName('VID_bad.insv')).toBeUndefined();
  });

  it('gives the two lenses of a recording one key, apart from its preview', () => {
    const back = parseRecordingFileName('VID_20200101_120000_00_003.insv');
    const screen = parseRecordingFileName('VID_20200101_120000_10_003.insv');
    const preview = parseRecordingFileName('LRV_20200101_120000_11_003.insv');
    if (back === undefined || screen === undefined || preview === undefined) {
      throw new Error('a name failed to parse');
    }
    expect(recordingKey(back)).toBe(recordingKey(screen));
    expect(recordingKey(back)).not.toBe(recordingKey(preview));
  });
});
