import { isAdminRole, type UserRole } from '@course-reg/shared';
import type { RequestHandler } from 'express';
import { AppError } from '../utils/appError.js';

/** 403 unless the authenticated caller holds one of `roles`. Place after requireAuth. */
export function requireRole(...roles: readonly [UserRole, ...UserRole[]]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) {
      next(AppError.unauthorized());
      return;
    }
    if (!roles.includes(req.auth.role)) {
      next(AppError.forbidden());
      return;
    }
    next();
  };
}

/**
 * Staff: ADMIN or CO_ADMIN. This guards every administrative router, because a
 * co-admin runs registration day to day and differs in exactly one respect.
 */
export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (!req.auth) {
    next(AppError.unauthorized());
    return;
  }
  if (!isAdminRole(req.auth.role)) {
    next(AppError.forbidden());
    return;
  }
  next();
};

/**
 * ADMIN only, and the single place that difference is enforced: creating,
 * inviting, deactivating or reactivating a member of staff.
 *
 * It is deliberately a SEPARATE middleware rather than a flag on requireAdmin.
 * A route added to the Team router later is guarded by the router's own
 * `use`, and a route added to any other admin router cannot reach these
 * endpoints at all — so the privileged set cannot grow by forgetting a
 * parameter.
 */
export const requireAdminManager: RequestHandler = (req, _res, next) => {
  if (!req.auth) {
    next(AppError.unauthorized());
    return;
  }
  if (req.auth.role !== 'ADMIN') {
    next(
      AppError.forbidden(
        'Only an administrator can manage staff accounts. Ask an administrator to make this change.',
      ),
    );
    return;
  }
  next();
};
