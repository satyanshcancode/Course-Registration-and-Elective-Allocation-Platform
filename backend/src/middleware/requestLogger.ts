import type { RequestHandler } from 'express';
import { logger } from '../utils/logger.js';

/** Logs one line per completed request with status and duration. */
export const requestLogger: RequestHandler = (req, res, next) => {
  const startedAt = performance.now();
  res.on('finish', () => {
    const durationMs = Math.round(performance.now() - startedAt);
    const line = `${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms`;
    if (res.statusCode >= 500) {
      logger.warn(line);
    } else {
      logger.info(line);
    }
  });
  next();
};
