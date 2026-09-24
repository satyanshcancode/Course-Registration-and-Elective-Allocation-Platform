import type { ApiFailure, ApiFieldError, ApiSuccess } from '@course-reg/shared';
import type { Response } from 'express';

export function sendSuccess<T>(
  res: Response<ApiSuccess<T>>,
  data: T,
  options: { statusCode?: number; message?: string } = {},
): void {
  const body: ApiSuccess<T> = { success: true, data };
  if (options.message !== undefined) {
    body.message = options.message;
  }
  res.status(options.statusCode ?? 200).json(body);
}

export function sendFailure(
  res: Response<ApiFailure>,
  statusCode: number,
  message: string,
  errors?: ApiFieldError[],
  details?: unknown,
): void {
  const body: ApiFailure = { success: false, data: null, message };
  if (errors !== undefined && errors.length > 0) {
    body.errors = errors;
  }
  if (details !== undefined) {
    body.details = details;
  }
  res.status(statusCode).json(body);
}
