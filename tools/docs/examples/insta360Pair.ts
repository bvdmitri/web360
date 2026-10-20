// The Insta360 ONE R writes each lens to its own file:
// VID_<date>_<time>_00_<seq>.insv carries the recording's metadata, and the
// matching _10_ file holds the other lens. Pass them as `main` and
// `second`; a single-file recording (X3 and later) needs only `main`.
import { openRendition, type Rendition } from '@bvdmitri/web360';

export async function openInsta360(
  files: readonly File[],
): Promise<Rendition> {
  const main = files.find((file) => /_00_\d+\.insv$/iu.test(file.name));
  if (main === undefined)
    throw new Error('the _00_ file of the recording is missing');
  const second = files.find((file) => /_10_\d+\.insv$/iu.test(file.name));
  return openRendition(
    {
      main: { blob: main },
      ...(second !== undefined && { second: { blob: second } }),
    },
    { width: 2880, stabilization: 'horizon' },
  );
}
