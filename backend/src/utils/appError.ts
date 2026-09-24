import type { ApiFieldError } from '@course-reg/shared';

/**
 * An expected, client-facing error. Its message is safe to return in the
 * response body; anything that is not an AppError is reported as a generic 500.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly errors: ApiFieldError[] | undefined;
  /** Endpoint-specific detail for the client, e.g. the cart's CartProblem[]. */
  readonly details: unknown;

  constructor(statusCode: number, message: string, errors?: ApiFieldError[], details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.errors = errors;
    this.details = details;
  }

  static badRequest(message: string, errors?: ApiFieldError[]): AppError {
    return new AppError(400, message, errors);
  }

  static unauthorized(message = 'Please sign in to continue.'): AppError {
    return new AppError(401, message);
  }

  static forbidden(message = 'You do not have permission to do that.'): AppError {
    return new AppError(403, message);
  }

  static notFound(message = 'Resource not found'): AppError {
    return new AppError(404, message);
  }
}
