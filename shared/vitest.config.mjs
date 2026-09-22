import { defineConfig } from 'vitest/config';

// Low-memory machines fail to start more fork workers; override with
// VITEST_MAX_WORKERS=<n> (or --maxWorkers) when there is memory to spare.
export default defineConfig({
  test: {
    maxWorkers: Number(process.env.VITEST_MAX_WORKERS ?? 2),
  },
});
