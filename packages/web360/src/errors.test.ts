import { MissingLensFileError, NotInsta360Error } from '@web360/core';
import { describe, expect, it } from 'vitest';

import { openingError, Web360Error } from './errors';

describe('opening errors', () => {
  it('names a missing second file', () => {
    const error = openingError(new MissingLensFileError('one half'));
    expect(error).toMatchObject({ code: 'missing-second-file', message: 'one half' });
  });

  it('reads anything else the readers throw as an unreadable recording', () => {
    expect(openingError(new NotInsta360Error('xx')).code).toBe('unreadable-recording');
    expect(openingError('odd').message).toBe('odd');
  });

  it('passes a web360 error through', () => {
    const error = new Web360Error('decode', 'broken');
    expect(openingError(error)).toBe(error);
  });
});
