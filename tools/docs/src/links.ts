// Links from a documentation page into the code: the docs link to source files by relative path,
// which reads well on GitHub but leads nowhere on the site, so the site points them at GitHub.
import path from 'node:path';

const REPOSITORY = 'https://github.com/bvdmitri/web360/blob/main';
const SITE = 'docs';
// A link with a scheme (https:, mailto:), to an anchor, or from the site's root.
const NOT_RELATIVE = /^(?:[a-z][a-z0-9+.-]*:|#|\/)/iu;

/**
 * The link a page of the site shows for `href`, a link written in the page at `page` (its path
 * from the repository root). A relative link that stays within `docs/` is a link to another page
 * and stays as written; one that leaves it goes to the file on GitHub, anchor kept.
 */
export function siteLink(href: string, page: string): string {
  if (NOT_RELATIVE.test(href)) return href;
  const [target = '', anchor] = href.split('#', 2);
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(page), target));
  return resolved === SITE || resolved.startsWith(`${SITE}/`)
    ? href
    : `${REPOSITORY}/${resolved}${anchor === undefined ? '' : `#${anchor}`}`;
}
