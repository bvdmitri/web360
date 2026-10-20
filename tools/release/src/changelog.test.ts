import { describe, expect, it } from 'vitest';

import { changelogSection } from './changelog.ts';

const changelog = `# Changelog

Intro.

## [Unreleased]

## [0.4.3] - 2026-10-20

### Changed

- The \`smoothing\` option takes a plain number of seconds.

## [0.4.2] - 2026-10-20

### Changed

- Steadier GoPro recordings.

[0.4.3]: https://example.test/0.4.3
[0.4.2]: https://example.test/0.4.2
`;

describe("a version's release notes", () => {
  it('are its section of the changelog, without the heading', () => {
    expect(changelogSection(changelog, '0.4.3')).toBe(
      '### Changed\n\n- The `smoothing` option takes a plain number of seconds.',
    );
  });

  it('end before the link references for the last version', () => {
    expect(changelogSection(changelog, '0.4.2')).toBe(
      '### Changed\n\n- Steadier GoPro recordings.',
    );
  });

  it('do not exist for a version the changelog has no section for', () => {
    expect(() => changelogSection(changelog, '9.9.9')).toThrow(/9\.9\.9/u);
  });
});
