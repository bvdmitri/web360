import { defineConfig } from 'vitest/config';

const LINE_COVERAGE = 95;
const BRANCH_COVERAGE = 90;

export default defineConfig({
  test: {
    projects: [
      'packages/*/vitest.config.ts',
      'packages/adapters/*/vitest.config.ts',
      'tools/*/vitest.config.ts',
    ],
    coverage: {
      provider: 'istanbul',
      include: ['packages/**/src/**/*.ts', 'tools/**/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/index.ts', '**/main.ts', '**/*.d.ts'],
      reporter: ['text-summary', 'lcov'],
      thresholds: {
        lines: LINE_COVERAGE,
        statements: LINE_COVERAGE,
        functions: LINE_COVERAGE,
        branches: BRANCH_COVERAGE,
      },
    },
  },
});
