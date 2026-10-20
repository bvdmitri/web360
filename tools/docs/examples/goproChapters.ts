// A GoPro recording longer than about 4 GB is split into chapters:
// GS01nnnn.360, GS02nnnn.360, and so on. Pass the first as `main` and the
// rest, in order, as `following`.
import {
  openRendition,
  type RecordingFile,
  type Rendition,
} from '@bvdmitri/web360';

const chapterOf = (file: File): number =>
  Number(/^GS(\d{2})\d{4}\.360$/iu.exec(file.name)?.[1]);

export async function openGoPro(
  files: readonly File[],
): Promise<Rendition> {
  const [first, ...rest] = files
    .filter((file) => file.name.toLowerCase().endsWith('.360'))
    .toSorted((a, b) => chapterOf(a) - chapterOf(b))
    .map((file): RecordingFile => ({ blob: file, name: file.name }));
  if (first === undefined)
    throw new Error('no .360 chapter among the files');
  return openRendition({ main: first, following: rest }, { width: 3840 });
}
