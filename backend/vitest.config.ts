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
    /**
     * One test file at a time, everywhere.
     *
     * The integration files share one database and truncate it between tests,
     * so two of them running at once make each other fail at random. Setting
     * `fileParallelism` inside the integration project instead LOOKS right and
     * does nothing: it is deprecated at the project level in Vitest 4, which
     * is why those tests were intermittently red. It has to be set here, at
     * the root, and a single fork is not an alternative — sharing one fork
     * across files breaks the per-file pool and session state.
     */
    fileParallelism: false,
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
          // Files share one database and truncate it, so they must not
          // overlap; the root-level `fileParallelism: false` below is what
          // enforces that (see the note there).
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
