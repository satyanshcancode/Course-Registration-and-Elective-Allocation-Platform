import type { ApiFieldError } from '@course-reg/shared';
import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { sendFailure } from '../utils/apiResponse.js';
import { AppError } from '../utils/appError.js';
import { logger } from '../utils/logger.js';

/** Shape of errors raised by Express's body parsers (the `http-errors` package). */
interface HttpLikeError {
  status: number;
  expose: boolean;
  message: string;
}

function isHttpLikeError(error: unknown): error is HttpLikeError {
  return (
    error instanceof Error &&
    'status' in error &&
    typeof error.status === 'number' &&
    'expose' in error &&
    typeof error.expose === 'boolean'
  );
}

function toFieldErrors(error: ZodError): ApiFieldError[] {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}

/**
 * Central error handler: turns every error into an ApiFailure body.
 * Only AppError, validation and client-side HTTP errors expose their message;
 * anything else is logged and reported as a generic 500.
 */
export const errorHandler: ErrorRequestHandler = (error: unknown, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof AppError) {
    sendFailure(res, error.statusCode, error.message, error.errors);
    return;
  }

  if (error instanceof ZodError) {
    sendFailure(res, 400, 'Validation failed', toFieldErrors(error));
    return;
  }

  if (isHttpLikeError(error) && error.expose && error.status < 500) {
    sendFailure(res, error.status, error.message);
    return;
  }

  logger.error('Unhandled request error', { method: req.method, path: req.originalUrl, error });
  sendFailure(res, 500, 'Internal server error');
};
