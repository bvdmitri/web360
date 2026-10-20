// Repository checks: `--staged` (pre-commit), `--message <file>` (commit-msg), `--all` (CI).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

import { privateTerms } from './catalogue.ts';
import { fixtureProblems } from './fixtures.ts';
import { findProblems, type Problem } from './rules.ts';

const git = (...gitArguments: string[]): string =>
  execFileSync('git', gitArguments, { encoding: 'utf8' });

const isBinary = (text: string): boolean => text.includes('\0');

function trackedFiles(isStaged: boolean): { path: string; text: string }[] {
  const paths = isStaged
    ? git('diff', '--cached', '--name-only', '--diff-filter=ACMR')
    : git('ls-files');
  return paths
    .split('\n')
    .filter((path) => path !== '')
    .map((path) => ({
      path,
      text: isStaged ? git('show', `:${path}`) : readFileSync(path, 'utf8'),
    }))
    .filter(({ text }) => !isBinary(text));
}

// GoPro fixtures are read from the working tree, where Git LFS has put their bytes.
function fixtureFindings(isStaged: boolean): Problem[] {
  const paths = isStaged
    ? git('diff', '--cached', '--name-only', '--diff-filter=ACMR')
    : git('ls-files');
  return paths
    .split('\n')
    .filter((path) => path.endsWith('.360') && existsSync(path))
    .flatMap((path) => fixtureProblems(path, new Uint8Array(readFileSync(path))));
}

function problems(mode: string | undefined, argument: string | undefined): Problem[] {
  const catalogue = 'samples/catalogue.json';
  const terms = privateTerms(existsSync(catalogue) ? readFileSync(catalogue, 'utf8') : undefined);
  if (mode === '--message' && argument !== undefined) {
    return findProblems('commit message', readFileSync(argument, 'utf8'), terms);
  }
  if (mode === '--staged' || mode === '--all') {
    const texts = trackedFiles(mode === '--staged').flatMap((f) =>
      findProblems(f.path, f.text, terms),
    );
    return [...texts, ...fixtureFindings(mode === '--staged')];
  }
  throw new Error('usage: main.ts --staged | --all | --message <file>');
}

const [mode, argument] = process.argv.slice(2);
const found = problems(mode, argument);
for (const p of found) process.stderr.write(`${p.path}:${p.line}: ${p.rule}: ${p.detail}\n`);
process.exitCode = found.length > 0 ? 1 : 0;
