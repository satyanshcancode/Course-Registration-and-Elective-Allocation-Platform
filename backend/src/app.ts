import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { errorHandler } from './middleware/errorHandler.js';
import {
  DEFAULT_LOGIN_RATE_LIMIT,
  DEFAULT_SUBMIT_RATE_LIMIT,
  type RateLimitOptions,
} from './middleware/loginRateLimiter.js';
import { notFoundHandler } from './middleware/notFoundHandler.js';
import { rejectCrossOriginWrites } from './middleware/rejectCrossOriginWrites.js';
import { requestLogger } from './middleware/requestLogger.js';
import { createApiRouter, type ApiServices } from './routes/index.js';

export interface AppOptions {
  corsOrigins: string[];
  jsonBodyLimit: string;
  /** Adds the Secure flag to the session cookie (true in production). */
  cookieSecure: boolean;
  loginRateLimit?: RateLimitOptions;
  submitRateLimit?: RateLimitOptions;
  services: ApiServices;
}

/**
 * Builds the Express application without starting a server, so tests can
 * drive it with supertest and inject services.
 */
export function createApp({
  corsOrigins,
  jsonBodyLimit,
  cookieSecure,
  loginRateLimit = DEFAULT_LOGIN_RATE_LIMIT,
  submitRateLimit = DEFAULT_SUBMIT_RATE_LIMIT,
  services,
}: AppOptions): Express {
  const app = express();

  app.disable('x-powered-by');
  // Requests arrive through the Vite dev proxy or nginx in production.
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(cors({ origin: corsOrigins, credentials: true }));
  app.use(rejectCrossOriginWrites(corsOrigins));
  app.use(express.json({ limit: jsonBodyLimit }));
  app.use(requestLogger);

  app.use('/api', createApiRouter(services, { cookieSecure, loginRateLimit, submitRateLimit }));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
