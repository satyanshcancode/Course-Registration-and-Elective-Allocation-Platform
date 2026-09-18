import type { ApiFieldError } from '@course-reg/shared';

/**
 * An expected, client-facing error. Its message is safe to return in the
 * response body; anything that is not an AppError is reported as a generic 500.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly errors: ApiFieldError[] | undefined;

  constructor(statusCode: number, message: string, errors?: ApiFieldError[]) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.errors = errors;
  }

  static badRequest(message: string, errors?: ApiFieldError[]): AppError {
    return new AppError(400, message, errors);
  }

  static notFound(message = 'Resource not found'): AppError {
    return new AppError(404, message);
  }
}
