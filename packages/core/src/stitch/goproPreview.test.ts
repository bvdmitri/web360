// Developer harness, skipped unless WEB360_GOPRO_PREVIEW names a GoPro .360 recording: renders one
// moment of its cube map to an equirectangular PNG (needs ffmpeg). Settings:
//   WEB360_GOPRO_PREVIEW=<file.360>  WEB360_GOPRO_OUT=<png>  WEB360_GOPRO_AT=<seconds>
//   WEB360_GOPRO_SCALE=<0..1, the decode size against the stored size, 0.5 by default>
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { goproCubeMap } from '../format/gopro/cube';
import { identity } from '../shared/math/quaternion';
import { renderCubeMap, type TextureSampler } from './cubeRender';
import type { Rgb } from './sampler';

const setting = (name: string): string | undefined => process.env[`WEB360_GOPRO_${name}`];
const recording = setting('PREVIEW');
const TRACK = { width: 5888, height: 1920 };
const OUTPUT = { width: 2048, height: 1024 };
const BYTE_MAX = 255;

const decodeTrack = (
  stream: string,
  at: number,
  size: { width: number; height: number },
): Uint8Array => {
  const raw = path.join(os.tmpdir(), `web360-gopro-${process.pid}-${stream}.rgb`);
  const filter = `scale=${size.width}:${size.height}`;
  const input = [
    '-v',
    'error',
    '-y',
    '-ss',
    String(at),
    '-i',
    recording ?? '',
    '-map',
    `0:v:${stream}`,
  ];
  execFileSync('ffmpeg', [
    ...input,
    '-frames:v',
    '1',
    '-vf',
    filter,
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgb24',
    raw,
  ]);
  const bytes = new Uint8Array(readFileSync(raw));
  rmSync(raw);
  return bytes;
};

// Nearest-pixel reads of a decoded track, given in stored-track pixels.
const samplerOf = (rgb: Uint8Array, size: { width: number; height: number }): TextureSampler => {
  const scale = size.width / TRACK.width;
  return (pixel): Rgb => {
    const x = Math.min(size.width - 1, Math.max(0, Math.floor(pixel[0] * scale)));
    const y = Math.min(size.height - 1, Math.max(0, Math.floor(pixel[1] * scale)));
    const at = (y * size.width + x) * 3;
    return [
      (rgb[at] ?? 0) / BYTE_MAX,
      (rgb[at + 1] ?? 0) / BYTE_MAX,
      (rgb[at + 2] ?? 0) / BYTE_MAX,
    ];
  };
};

const writePng = (pixels: readonly Rgb[], out: string): void => {
  const bytes = new Uint8Array(pixels.length * 3);
  for (const [index, pixel] of pixels.entries()) {
    for (let channel = 0; channel < 3; channel += 1) {
      bytes[index * 3 + channel] = Math.round(
        Math.min(1, Math.max(0, pixel[channel] ?? 0)) * BYTE_MAX,
      );
    }
  }
  const input = ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24'];
  execFileSync('ffmpeg', [...input, '-s', `${OUTPUT.width}x${OUTPUT.height}`, '-i', '-', out], {
    input: bytes,
  });
};

describe('gopro cube preview (developer harness)', () => {
  it.skipIf(recording === undefined)(
    'renders a GoPro recording to an equirectangular PNG',
    () => {
      const at = Number(setting('AT') ?? '0');
      const scale = Number(setting('SCALE') ?? '0.5');
      const size = {
        width: Math.round(TRACK.width * scale),
        height: Math.round(TRACK.height * scale),
      };
      const samplers = ['0', '1'].map((stream) => samplerOf(decodeTrack(stream, at, size), size));
      const pixels = renderCubeMap({
        cube: goproCubeMap(TRACK),
        samplers,
        correction: identity(),
        ...OUTPUT,
      });
      const out = setting('OUT') ?? path.join(os.tmpdir(), 'web360-gopro.png');
      writePng(pixels, out);
      expect(pixels).toHaveLength(OUTPUT.width * OUTPUT.height);
    },
    600_000,
  );
});
