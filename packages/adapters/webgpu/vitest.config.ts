import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'webgpu',
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
