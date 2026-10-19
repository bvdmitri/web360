import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'checks',
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
