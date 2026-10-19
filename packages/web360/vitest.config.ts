import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'web360',
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
