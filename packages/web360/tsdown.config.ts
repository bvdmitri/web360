import { defineConfig } from 'tsdown';

// One ESM file and one declaration file: the core and the adapters are workspace packages, bundled
// in rather than published on their own.
export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  platform: 'browser',
  target: 'es2023',
  dts: { eager: true },
  deps: { alwaysBundle: [/^@web360\//] },
  outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
  // The declarations name WebGPU types, which the package's own dependency provides.
  banner: { dts: '/// <reference types="@webgpu/types" />' },
});
