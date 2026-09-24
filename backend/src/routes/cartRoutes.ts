import { Router, type RequestHandler } from 'express';
import type { CartController } from '../controllers/cartController.js';
import { requireRole } from '../middleware/requireRole.js';

/** The cart is a student feature; the student is always the caller. */
export function createCartRouter(controller: CartController, requireAuth: RequestHandler): Router {
  const router = Router();
  router.use(requireAuth, requireRole('STUDENT'));
  router.get('/', controller.getCart);
  router.put('/', controller.saveCart);
  return router;
}

export function createRegistrationRouter(
  controller: CartController,
  requireAuth: RequestHandler,
  submitRateLimiter: RequestHandler,
): Router {
  const router = Router();
  router.use(requireAuth, requireRole('STUDENT'));
  router.post('/submit', submitRateLimiter, controller.submit);
  router.get('/status', controller.getStatus);
  return router;
}
