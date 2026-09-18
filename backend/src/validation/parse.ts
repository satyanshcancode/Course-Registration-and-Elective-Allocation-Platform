import type { z } from 'zod';
import { AppError } from '../utils/appError.js';

/**
 * Validates untrusted input (body, query, params) against a zod schema and
 * returns the typed, normalised value, or throws a 400 listing each field error.
 */
export function parseInput<Schema extends z.ZodType>(
  schema: Schema,
  input: unknown,
): z.infer<Schema> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw AppError.badRequest(
      'Please correct the highlighted fields.',
      result.error.issues.map((issue) => ({
        field: issue.path.join('.') || '(root)',
        message: issue.message,
      })),
    );
  }
  return result.data;
}
