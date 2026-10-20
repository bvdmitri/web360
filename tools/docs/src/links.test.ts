import { describe, expect, it } from 'vitest';

import { siteLink } from './links.ts';

const page = 'docs/adr/0015-the-rendition-api.md';

describe('a link on a documentation page', () => {
  it('stays as it is when it points to another page of the site', () => {
    expect(siteLink('../FORMAT-gopro.md', page)).toBe('../FORMAT-gopro.md');
    expect(siteLink('./0016-the-attitude-is-levelled-offline.md#decision', page)).toBe(
      './0016-the-attitude-is-levelled-offline.md#decision',
    );
  });

  it('points to the file on GitHub when it leaves the documentation', () => {
    expect(siteLink('../../packages/web360/src/rendition.ts', page)).toBe(
      'https://github.com/bvdmitri/web360/blob/main/packages/web360/src/rendition.ts',
    );
    expect(siteLink('../PLAN.md#what-is-next', 'docs/index.md')).toBe(
      'https://github.com/bvdmitri/web360/blob/main/PLAN.md#what-is-next',
    );
  });

  it('leaves anchors, absolute paths and addresses alone', () => {
    for (const href of ['#options', '/api/', 'https://www.npmjs.com/', 'mailto:x@example.test']) {
      expect(siteLink(href, page)).toBe(href);
    }
  });
});
