import { defineProject, mergeConfig } from 'vitest/config';

import core from './vitest.config';

// Stryker's per-test coverage instruments every statement, so the tests that open a whole fixture
// run many times slower than in the plain suite: on a CI runner the GoPro chapter test takes from
// under 30 s to over it, against 5 s by default. Stryker bounds each mutant's run by its own timeout.
const INSTRUMENTED_TEST_TIMEOUT_MS = 120_000;

export default mergeConfig(
  core,
  defineProject({ test: { testTimeout: INSTRUMENTED_TEST_TIMEOUT_MS } }),
);
