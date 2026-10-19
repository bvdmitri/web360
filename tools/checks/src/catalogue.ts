interface Catalogue {
  readonly samples: readonly { readonly files: readonly string[]; readonly serial?: string }[];
  readonly terms?: readonly string[];
}

function isCatalogue(value: unknown): value is Catalogue {
  if (typeof value !== 'object' || value === null) return false;
  const { samples, terms } = value as Record<string, unknown>;
  const isSamplesOk =
    Array.isArray(samples) &&
    samples.every(
      (s: unknown) =>
        typeof s === 'object' &&
        s !== null &&
        Array.isArray((s as Catalogue['samples'][number]).files),
    );
  return isSamplesOk && (terms === undefined || Array.isArray(terms));
}

/**
 * Every term the private samples catalogue (`samples/catalogue.json`, never committed) says must
 * not appear in the repository: file names, camera serials and any extra terms.
 *
 * @remarks A missing catalogue yields no terms (a fresh clone has none). An unreadable one throws:
 * a check that silently checks nothing would let a private name through.
 */
export function privateTerms(json: string | undefined): string[] {
  if (json === undefined) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('samples catalogue is not valid JSON');
  }
  if (!isCatalogue(parsed)) throw new Error('samples catalogue has an unexpected shape');
  const fromSamples = parsed.samples.flatMap((s) => [
    ...s.files,
    ...(s.serial === undefined ? [] : [s.serial]),
  ]);
  return [...fromSamples, ...(parsed.terms ?? [])];
}
