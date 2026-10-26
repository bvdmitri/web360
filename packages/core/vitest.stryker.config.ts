import { defineProject, mergeConfig } from 'vitest/config';

import core from './vitest.config';

// Stryker's per-test coverage instruments every statement, so the tests that open a whole fixture
// run many times slower than in the plain suite, past vitest's 5 s default on a CI runner.
const INSTRUMENTED_TEST_TIMEOUT_MS = 30_000;

export default mergeConfig(
  core,
  defineProject({ test: { testTimeout: INSTRUMENTED_TEST_TIMEOUT_MS } }),
);
