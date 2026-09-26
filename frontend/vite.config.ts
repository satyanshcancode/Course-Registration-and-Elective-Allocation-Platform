import react from '@vitejs/plugin-react';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { defaultClientConditions, type ProxyOptions } from 'vite';
import { defineConfig } from 'vitest/config';

const ROOT_ENV_FILE = fileURLToPath(new URL('../.env', import.meta.url));
const DEFAULT_API_PROXY_TARGET = 'http://localhost:4000';

/**
 * Reads one dev-server setting: process.env (set by Docker Compose) wins,
 * then the repo-root .env used outside Docker.
 *
 * Vite's own loadEnv is deliberately not pointed at the root .env: it would
 * pick up the backend's NODE_ENV=development and produce a development build.
 */
function readSetting(key: string): string | undefined {
  const fromProcess = process.env[key];
  if (fromProcess !== undefined && fromProcess !== '') {
    return fromProcess;
  }
  if (!existsSync(ROOT_ENV_FILE)) {
    return undefined;
  }
  return parseEnv(readFileSync(ROOT_ENV_FILE, 'utf8'))[key];
}

// Low-memory machines fail to start more fork workers; override with
// VITEST_MAX_WORKERS=<n> (or --maxWorkers) when there is memory to spare.
const vitestMaxWorkers = Number(readSetting('VITEST_MAX_WORKERS') ?? 2);

const apiProxy: Record<string, ProxyOptions> = {
  '/api': {
    target: readSetting('API_PROXY_TARGET') ?? DEFAULT_API_PROXY_TARGET,
    changeOrigin: true,
    // Adds X-Forwarded-For so the backend (trust proxy = 1) sees the client IP,
    // which the login rate limiter keys on.
    xfwd: true,
  },
};

/**
 * Forces a real production build for `vite build`.
 *
 * Vite decides `import.meta.env.DEV` from `process.env.NODE_ENV`, NOT from the
 * build mode. A developer with `NODE_ENV=development` exported in their shell
 * therefore got a bundle where `import.meta.env.DEV` was `true`: the sign-in
 * page's demo credentials rendered and the `/dev/components` gallery route was
 * registered, in a build meant to be deployed. The `.env` half of this hazard is
 * already handled by `readSetting` above; this is the ambient half.
 *
 * `vite build --mode development` still opts out, because the mode is explicit
 * there rather than inherited from the environment.
 */
function forceProductionBuild(command: string, mode: string): void {
  if (command === 'build' && mode === 'production') {
    process.env.NODE_ENV = 'production';
  }
}

export default defineConfig(({ command, mode }) => {
  forceProductionBuild(command, mode);

  return {
    plugins: [react()],
    resolve: {
      // Bundle @course-reg/shared from its TypeScript source.
      conditions: ['source', ...defaultClientConditions],
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      proxy: apiProxy,
      // Bind mounts on Windows/macOS do not deliver file events into containers.
      watch: readSetting('WATCH_POLLING') === 'true' ? { usePolling: true, interval: 300 } : {},
    },
    preview: {
      host: '0.0.0.0',
      port: 4173,
      strictPort: true,
      proxy: apiProxy,
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      maxWorkers: vitestMaxWorkers,
    },
  };
});
