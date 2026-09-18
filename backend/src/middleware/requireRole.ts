import type { UserRole } from '@course-reg/shared';
import type { RequestHandler } from 'express';
import { AppError } from '../utils/appError.js';

/** 403 unless the authenticated caller has `role`. Place after requireAuth. */
export function requireRole(role: UserRole): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) {
      next(AppError.unauthorized());
      return;
    }
    if (req.auth.role !== role) {
      next(AppError.forbidden());
      return;
    }
    next();
  };
}
