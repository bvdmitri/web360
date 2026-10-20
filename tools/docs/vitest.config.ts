import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'docs',
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
