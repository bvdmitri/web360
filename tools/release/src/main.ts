// Prints a version's release notes from CHANGELOG.md: `main.ts <version> [changelog]`.
import { readFileSync } from 'node:fs';

import { changelogSection } from './changelog.ts';

const [version, path = 'CHANGELOG.md'] = process.argv.slice(2);
if (version === undefined) throw new Error('usage: main.ts <version> [changelog]');
process.stdout.write(`${changelogSection(readFileSync(path, 'utf8'), version)}\n`);
