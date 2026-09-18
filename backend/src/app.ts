import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { errorHandler } from './middleware/errorHandler.js';
import { notFoundHandler } from './middleware/notFoundHandler.js';
import { requestLogger } from './middleware/requestLogger.js';
import { createApiRouter, type ApiServices } from './routes/index.js';

export interface AppOptions {
  corsOrigins: string[];
  jsonBodyLimit: string;
  services: ApiServices;
}

/**
 * Builds the Express application without starting a server, so tests can
 * drive it with supertest and inject fake services.
 */
export function createApp({ corsOrigins, jsonBodyLimit, services }: AppOptions): Express {
  const app = express();

  app.disable('x-powered-by');
  // Requests arrive through the Vite dev proxy or nginx in production.
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(cors({ origin: corsOrigins }));
  app.use(express.json({ limit: jsonBodyLimit }));
  app.use(requestLogger);

  app.use('/api', createApiRouter(services));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
