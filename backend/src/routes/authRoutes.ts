import { Router, type RequestHandler } from 'express';
import type { AuthController } from '../controllers/authController.js';

export function createAuthRouter(
  controller: AuthController,
  middleware: { requireAuth: RequestHandler; loginRateLimiter: RequestHandler },
): Router {
  const router = Router();
  router.post('/login', middleware.loginRateLimiter, controller.login);
  // No requireAuth: signing out must work even with an expired session.
  router.post('/logout', controller.logout);
  router.get('/me', middleware.requireAuth, controller.me);
  return router;
}
