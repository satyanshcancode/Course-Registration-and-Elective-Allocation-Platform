import type { RequestHandler } from 'express';
import { AppError } from '../utils/appError.js';

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * CSRF defence in depth (on top of SameSite=Strict cookies): a state-changing
 * request that carries an Origin header must come from an allowed origin.
 * Requests without Origin (curl, server-to-server, same-origin GETs) pass.
 */
export function rejectCrossOriginWrites(allowedOrigins: readonly string[]): RequestHandler {
  const allowed = new Set(allowedOrigins);
  return (req, _res, next) => {
    const origin = req.get('origin');
    if (STATE_CHANGING_METHODS.has(req.method) && origin !== undefined && !allowed.has(origin)) {
      next(AppError.forbidden('Cross-origin request rejected.'));
      return;
    }
    next();
  };
}
