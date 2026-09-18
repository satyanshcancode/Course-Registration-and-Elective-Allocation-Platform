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
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    env: {
      LOG_LEVEL: 'silent',
    },
  },
});
