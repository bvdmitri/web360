import { defineProject } from 'vitest/config';

// The rendition tests open the real fixture (levelling its whole motion record) and stitch on a GPU
// device, which on CI is Mesa's software Vulkan driver, seconds where a real GPU takes milliseconds.
const GPU_TEST_TIMEOUT_MS = 30_000;

export default defineProject({
  test: {
    name: 'web360',
    include: ['src/**/*.test.ts'],
    environment: 'node',
    testTimeout: GPU_TEST_TIMEOUT_MS,
  },
});
