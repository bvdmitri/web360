const HEX = 16;
const BYTE_HEX = 2;
const AVC_PROFILE = 1;
const AVC_LEVEL = 3;
const HEVC_PROFILE = 1;
const HEVC_COMPATIBILITY = 2;
const HEVC_COMPATIBILITY_BYTES = 4;
const HEVC_CONSTRAINTS = 6;
const HEVC_CONSTRAINT_BYTES = 6;
const HEVC_LEVEL = 12;
const PROFILE_SPACE_SHIFT = 6;
const TIER_SHIFT = 5;
const PROFILE_IDC_MASK = 0b1_1111;
const BITS_PER_BYTE = 8;
const PROFILE_SPACES = ['', 'A', 'B', 'C'] as const;

/**
 * The codec string of an H.264 track (`avc1.PPCCLL`), from its `avcC` configuration: the profile,
 * the constraint flags and the level as two hex digits each.
 */
export function avcCodec(format: string, config: Uint8Array): string {
  const hex = config
    .subarray(AVC_PROFILE, AVC_LEVEL + 1)
    .reduce((text, byte) => text + byte.toString(HEX).padStart(BYTE_HEX, '0'), '');
  return `${format}.${hex}`;
}

/**
 * The codec string of an HEVC track, from its `hvcC` configuration, as WebCodecs and MSE name it:
 * profile space and profile, the compatibility flags bit-reversed in hex, the tier and level, then
 * the constraint bytes in hex with trailing zero bytes dropped.
 */
export function hevcCodec(format: string, config: Uint8Array): string {
  const profile = config[HEVC_PROFILE] ?? 0;
  const space = PROFILE_SPACES[profile >> PROFILE_SPACE_SHIFT] ?? '';
  const tier = (profile >> TIER_SHIFT) & 1 ? 'H' : 'L';
  const parts = [
    `${space}${profile & PROFILE_IDC_MASK}`,
    reversedFlags(
      config.subarray(HEVC_COMPATIBILITY, HEVC_COMPATIBILITY + HEVC_COMPATIBILITY_BYTES),
    ),
    `${tier}${config[HEVC_LEVEL] ?? 0}`,
    ...constraints(config.subarray(HEVC_CONSTRAINTS, HEVC_CONSTRAINTS + HEVC_CONSTRAINT_BYTES)),
  ];
  return [format, ...parts].join('.');
}

function reversedFlags(bytes: Uint8Array): string {
  let flags = 0;
  for (const [index, byte] of bytes.entries()) {
    for (let bit = 0; bit < BITS_PER_BYTE; bit += 1) {
      if ((byte >> (BITS_PER_BYTE - 1 - bit)) & 1) flags += 2 ** (index * BITS_PER_BYTE + bit);
    }
  }
  return flags.toString(HEX);
}

function constraints(bytes: Uint8Array): string[] {
  const kept = [...bytes];
  while (kept.length > 0 && kept.at(-1) === 0) kept.pop();
  return kept.map((byte) => byte.toString(HEX).toUpperCase());
}
