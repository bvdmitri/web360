import { describe, expect, it } from 'vitest';

import { findProblems } from './rules.ts';

describe('findProblems', () => {
  it('passes ordinary prose and code', () => {
    expect(findProblems('a.md', 'A self-hosted, well-formed line.\n', [])).toEqual([]);
  });

  it('flags em and en dashes, with their line', () => {
    expect(findProblems('a.md', 'fine\nnot \u{2014} fine\nrange 1\u{2013}2\n', [])).toEqual([
      { path: 'a.md', line: 2, rule: 'dash', detail: 'em or en dash' },
      { path: 'a.md', line: 3, rule: 'dash', detail: 'em or en dash' },
    ]);
  });

  it('flags a private sample term in the text, ignoring case', () => {
    expect(findProblems('a.ts', 'open("vid_2026_secret.insv")\n', ['VID_2026_SECRET'])).toEqual([
      { path: 'a.ts', line: 1, rule: 'private-sample', detail: 'VID_2026_SECRET' },
    ]);
  });

  it('flags a private sample term in the path itself', () => {
    expect(findProblems('test/serial-ABC123.json', '{}\n', ['abc123'])).toEqual([
      { path: 'test/serial-ABC123.json', line: 0, rule: 'private-sample', detail: 'abc123' },
    ]);
  });

  it('ignores empty terms', () => {
    expect(findProblems('a.md', 'anything\n', [''])).toEqual([]);
  });
});
