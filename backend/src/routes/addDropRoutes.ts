import { Router, type RequestHandler } from 'express';
import type { AddDropController } from '../controllers/addDropController.js';
import { requireRole } from '../middleware/requireRole.js';

/**
 * Add/drop is a student feature; the student is always the caller. Every write
 * is rate-limited per session, because each one moves a real seat — unlike the
 * cart, where a retry only rewrote a draft.
 */
export function createAddDropRouter(
  controller: AddDropController,
  requireAuth: RequestHandler,
  rateLimiter: RequestHandler,
): Router {
  const router = Router();
  router.use(requireAuth, requireRole('STUDENT'));
  router.get('/', controller.getView);
  router.post('/drop', rateLimiter, controller.drop);
  router.post('/add', rateLimiter, controller.add);
  router.post('/swap', rateLimiter, controller.swap);
  router.post('/waitlist/join', rateLimiter, controller.joinWaitlist);
  router.post('/waitlist/leave', rateLimiter, controller.leaveWaitlist);
  return router;
}
