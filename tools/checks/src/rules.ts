/** One finding of a repository check; `line` is 0 when the path itself is at fault. */
export interface Problem {
  readonly path: string;
  readonly line: number;
  readonly rule: 'dash' | 'private-sample' | 'personal-data';
  readonly detail: string;
}

const DASH = /[\u{2013}\u{2014}]/u;

function termIn(haystack: string, terms: readonly string[]): string | undefined {
  const lower = haystack.toLowerCase();
  return terms.find((term) => term !== '' && lower.includes(term.toLowerCase()));
}

function lineProblems(path: string, line: string, terms: readonly string[]): Problem[] {
  const problems: Problem[] = [];
  const at = { path, line: 0 };
  if (DASH.test(line)) problems.push({ ...at, rule: 'dash', detail: 'em or en dash' });
  const term = termIn(line, terms);
  if (term !== undefined) problems.push({ ...at, rule: 'private-sample', detail: term });
  return problems;
}

/**
 * The problems in one file: em and en dashes, and any private sample term in its path or text.
 *
 * @remarks Terms match case-insensitively, since file systems and camera apps disagree on case.
 */
export function findProblems(path: string, text: string, terms: readonly string[]): Problem[] {
  const inPath = termIn(path, terms);
  const problems: Problem[] =
    inPath === undefined ? [] : [{ path, line: 0, rule: 'private-sample', detail: inPath }];
  for (const [index, line] of text.split('\n').entries()) {
    for (const problem of lineProblems(path, line, terms)) {
      problems.push({ ...problem, line: index + 1 });
    }
  }
  return problems;
}
