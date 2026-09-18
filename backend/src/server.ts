import { createApp } from './app.js';
import { appEnvSchema, loadEnv } from './config/env.js';
import { createServices } from './container.js';
import { createPool } from './database/pool.js';
import { logger } from './utils/logger.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

function start(): void {
  const env = loadEnv(appEnvSchema);
  const pool = createPool(env.DATABASE_URL);

  const app = createApp({
    corsOrigins: env.CORS_ORIGIN,
    jsonBodyLimit: env.JSON_BODY_LIMIT,
    cookieSecure: env.COOKIE_SECURE,
    services: createServices(pool, { jwtSecret: env.JWT_SECRET }),
  });

  const server = app.listen(env.PORT, () => {
    logger.info(`Backend listening on port ${env.PORT}`, {
      nodeEnv: env.NODE_ENV,
      secureCookies: env.COOKIE_SECURE,
    });
  });

  const shutdown = (signal: NodeJS.Signals): void => {
    logger.info(`${signal} received, shutting down`);
    setTimeout(() => {
      logger.error('Graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS).unref();

    server.close(() => {
      pool
        .end()
        .then(() => {
          logger.info('Shutdown complete');
        })
        .catch((error: unknown) => {
          logger.error('Error while closing the database pool', { error });
          process.exitCode = 1;
        });
    });
  };

  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

try {
  start();
} catch (error) {
  // Fail fast: invalid configuration must stop the process immediately.
  logger.error(error instanceof Error ? error.message : 'Failed to start backend');
  process.exit(1);
}
