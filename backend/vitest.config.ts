import { defineConfig } from 'vitest/config';

// Low-memory machines fail to start more fork workers; override with
// VITEST_MAX_WORKERS=<n> (or --maxWorkers) when there is memory to spare.
const maxWorkers = Number(process.env.VITEST_MAX_WORKERS ?? 2);

export default defineConfig({
  resolve: {
    // Resolve @course-reg/shared to its TypeScript source, like tsx does in dev.
    conditions: ['source'],
  },
  ssr: {
    resolve: {
      conditions: ['source'],
    },
  },
  test: {
    environment: 'node',
    maxWorkers,
    env: {
      LOG_LEVEL: 'silent',
      // The Docker image sets NODE_ENV=development, and Vitest leaves an
      // explicit value alone. Declaring it here is what lets the test-only
      // fault injection arm itself (see src/utils/faultInjection.ts).
      NODE_ENV: 'test',
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts'],
        },
      },
      {
        // Needs PostgreSQL (npm run docker:up). Uses "<db>_test", never the dev database.
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          globalSetup: ['tests/integration/globalSetup.ts'],
          setupFiles: ['tests/integration/setup.ts'],
          // Files share one database and truncate it, so they must not overlap.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
