import { Router, type RequestHandler } from 'express';
import type { WaitlistController } from '../controllers/waitlistController.js';
import { requireRole } from '../middleware/requireRole.js';

/** Admin-only: one course's roster and queue, withdrawals, and the sweep. */
export function createAdminWaitlistRouter(
  controller: WaitlistController,
  requireAuth: RequestHandler,
): Router {
  const router = Router();
  router.use(requireAuth, requireRole('ADMIN'));
  router.get('/waitlists', controller.getAdminView);
  router.post('/waitlists/process', controller.processAll);
  router.post('/enrollments/:id/withdraw', controller.withdraw);
  return router;
}
