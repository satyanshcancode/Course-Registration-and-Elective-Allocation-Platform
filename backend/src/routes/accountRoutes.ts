import { Router, type RequestHandler } from 'express';
import type { AccountController } from '../controllers/accountController.js';

/**
 * The PUBLIC half of the account lifecycle, mounted under /api/auth.
 *
 * No requireAuth: somebody activating an account or resetting a forgotten
 * password has no session yet, by definition. The link's token is the
 * credential, and the rate limiter is what keeps these open endpoints cheap.
 */
export function createPublicAccountRouter(
  controller: AccountController,
  middleware: { accountRateLimiter: RequestHandler },
): Router {
  const router = Router();
  router.use(middleware.accountRateLimiter);
  router.get('/activation/:token', controller.checkToken);
  router.post('/activate', controller.activate);
  router.post('/forgot-password', controller.forgotPassword);
  router.post('/reset-password', controller.resetPassword);
  return router;
}

/**
 * The signed-in half, mounted under /api/account. Open to BOTH roles — an
 * administrator changes their own password here too — so it takes requireAuth
 * without a requireRole.
 */
export function createAccountRouter(
  controller: AccountController,
  requireAuth: RequestHandler,
): Router {
  const router = Router();
  router.use(requireAuth);
  router.put('/password', controller.changePassword);
  return router;
}
