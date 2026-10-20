// A version's release notes, read from CHANGELOG.md (Keep a Changelog) for its GitHub Release.

const HEADING = /^## \[(?<version>[^\]]+)\]/u;
const LINK_REFERENCE = /^\[[^\]]+\]: /u;

/**
 * The section of a changelog for one version, without its `## [x.y.z] - date` heading and trimmed.
 * It runs to the next version's heading or to the link references at the end. Throws for a version
 * the changelog has no section for, so a release is never cut without notes.
 */
export function changelogSection(changelog: string, version: string): string {
  const lines = changelog.split('\n');
  const start = lines.findIndex((line) => HEADING.exec(line)?.groups?.['version'] === version);
  if (start === -1) throw new Error(`CHANGELOG.md has no section for ${version}`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => HEADING.test(line) || LINK_REFERENCE.test(line));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
}
