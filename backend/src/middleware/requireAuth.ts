import type { Request, RequestHandler } from 'express';
import { readCookie, SESSION_COOKIE_NAME } from '../config/session.js';
import type { AuthService } from '../services/authService.js';
import type { AuthContext } from '../types/auth.js';
import { AppError } from '../utils/appError.js';

const SESSION_INVALID_MESSAGE = 'Your session has expired. Please sign in again.';

/**
 * Verifies the session cookie, re-loads the user and attaches `req.auth`.
 * Missing, invalid, tampered or expired sessions -> 401.
 */
export function createRequireAuth(authService: AuthService): RequestHandler {
  return async (req, _res, next) => {
    const token = readCookie(req.headers.cookie, SESSION_COOKIE_NAME);
    if (!token) {
      next(AppError.unauthorized());
      return;
    }
    const auth = await authService.resolveSession(token);
    if (!auth) {
      next(AppError.unauthorized(SESSION_INVALID_MESSAGE));
      return;
    }
    req.auth = auth;
    next();
  };
}

/** The authenticated caller; use only behind requireAuth. */
export function getAuth(req: Request): AuthContext {
  if (!req.auth) {
    throw AppError.unauthorized();
  }
  return req.auth;
}

/**
 * The calling student's id, taken from the verified session. Student endpoints
 * use this instead of any id supplied in the URL, query or body.
 */
export function requireStudentId(req: Request): string {
  const auth = getAuth(req);
  if (auth.role !== 'STUDENT') {
    throw AppError.forbidden('This is only available to students.');
  }
  return auth.studentId;
}
