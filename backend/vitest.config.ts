import { defineConfig } from 'vitest/config';

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
    env: {
      LOG_LEVEL: 'silent',
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
