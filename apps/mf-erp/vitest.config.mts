import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Bound worker pressure on resource-constrained hosts; keep files independent.
    maxWorkers: 1,
    fileParallelism: false,
    isolate: true,
  },
});
