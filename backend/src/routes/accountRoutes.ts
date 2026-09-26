import { Router, type RequestHandler } from 'express';
import type { AccountController } from '../controllers/accountController.js';

/**
 * The PUBLIC half of the account lifecycle, mounted under /api/auth.
 *
 * No requireAuth: somebody activating an account or resetting a forgotten
 * password has no session yet, by definition. The link's token is the
 * credential, and the rate limiter is what keeps these open endpoints cheap.
 *
 * The limiter is attached PER ROUTE, not with `router.use`. This router shares
 * the /api/auth mount with the sign-in router, and `router.use` runs for every
 * request that enters a router — including the ones it does not handle. Sign-in
 * would then spend this budget as well as its own, and one busy campus address
 * could lock everybody out of signing in by asking for password resets.
 */
export function createPublicAccountRouter(
  controller: AccountController,
  middleware: { accountRateLimiter: RequestHandler },
): Router {
  const router = Router();
  const limit = middleware.accountRateLimiter;
  router.get('/activation/:token', limit, controller.checkToken);
  router.post('/activate', limit, controller.activate);
  router.post('/forgot-password', limit, controller.forgotPassword);
  router.post('/reset-password', limit, controller.resetPassword);
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
