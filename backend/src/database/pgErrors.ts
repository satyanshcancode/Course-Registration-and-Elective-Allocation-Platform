import { DatabaseError } from 'pg';

/** PostgreSQL SQLSTATE codes the application reacts to. */
export const PG_ERROR = {
  UNIQUE_VIOLATION: '23505',
  FOREIGN_KEY_VIOLATION: '23503',
  CHECK_VIOLATION: '23514',
  NOT_NULL_VIOLATION: '23502',
  /** Raised by our triggers, e.g. editing a submitted submission. */
  OBJECT_NOT_IN_PREREQUISITE_STATE: '55000',
} as const;

export type PgErrorCode = (typeof PG_ERROR)[keyof typeof PG_ERROR];

export function isDatabaseError(error: unknown): error is DatabaseError {
  return error instanceof DatabaseError;
}

/** True when `error` is a violation of the named constraint (or index). */
export function isConstraintViolation(
  error: unknown,
  code: PgErrorCode,
  constraint?: string,
): error is DatabaseError {
  return (
    isDatabaseError(error) &&
    error.code === code &&
    (constraint === undefined || error.constraint === constraint)
  );
}
