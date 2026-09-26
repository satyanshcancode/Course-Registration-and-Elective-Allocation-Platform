import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { errorHandler } from './middleware/errorHandler.js';
import {
  DEFAULT_ACCOUNT_RATE_LIMIT,
  DEFAULT_ADD_DROP_RATE_LIMIT,
  DEFAULT_LOGIN_RATE_LIMIT,
  DEFAULT_SUBMIT_RATE_LIMIT,
  type RateLimitOptions,
} from './middleware/loginRateLimiter.js';
import { notFoundHandler } from './middleware/notFoundHandler.js';
import { rejectCrossOriginWrites } from './middleware/rejectCrossOriginWrites.js';
import { requestLogger } from './middleware/requestLogger.js';
import { createApiRouter, type ApiServices } from './routes/index.js';

/** Paths that accept an uploaded CSV, and so a much larger body. */
const CSV_UPLOAD_PATHS = ['/api/admin/students/import', '/api/admin/course-catalogue/import'];

export interface AppOptions {
  corsOrigins: string[];
  jsonBodyLimit: string;
  /** Bodies of the CSV import endpoints only; far larger than jsonBodyLimit. */
  csvBodyLimit?: string;
  /** Adds the Secure flag to the session cookie (true in production). */
  cookieSecure: boolean;
  loginRateLimit?: RateLimitOptions;
  accountRateLimit?: RateLimitOptions;
  submitRateLimit?: RateLimitOptions;
  addDropRateLimit?: RateLimitOptions;
  services: ApiServices;
}

/**
 * Builds the Express application without starting a server, so tests can
 * drive it with supertest and inject services.
 */
export function createApp({
  corsOrigins,
  jsonBodyLimit,
  csvBodyLimit = '2mb',
  cookieSecure,
  loginRateLimit = DEFAULT_LOGIN_RATE_LIMIT,
  accountRateLimit = DEFAULT_ACCOUNT_RATE_LIMIT,
  submitRateLimit = DEFAULT_SUBMIT_RATE_LIMIT,
  addDropRateLimit = DEFAULT_ADD_DROP_RATE_LIMIT,
  services,
}: AppOptions): Express {
  const app = express();

  app.disable('x-powered-by');
  // Requests arrive through the Vite dev proxy or nginx in production.
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(cors({ origin: corsOrigins, credentials: true }));
  app.use(rejectCrossOriginWrites(corsOrigins));
  // The CSV parser is mounted FIRST and only on the import paths: the general
  // parser would otherwise reject a legitimate upload with 413 before this one
  // ever saw it. Every other route keeps the small limit.
  app.use(CSV_UPLOAD_PATHS, express.json({ limit: csvBodyLimit }));
  app.use(express.json({ limit: jsonBodyLimit }));
  app.use(requestLogger);

  app.use(
    '/api',
    createApiRouter(services, {
      cookieSecure,
      loginRateLimit,
      accountRateLimit,
      submitRateLimit,
      addDropRateLimit,
    }),
  );

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
