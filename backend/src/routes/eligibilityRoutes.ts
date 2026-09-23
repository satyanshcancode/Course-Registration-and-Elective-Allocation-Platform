import { Router, type RequestHandler } from 'express';
import type { EligibilityController } from '../controllers/eligibilityController.js';
import { requireRole } from '../middleware/requireRole.js';

/** The pre-check is a student feature: it answers "can I take this course?". */
export function createEligibilityRouter(
  controller: EligibilityController,
  requireAuth: RequestHandler,
): Router {
  const router = Router();
  router.use(requireAuth, requireRole('STUDENT'));
  router.get('/', controller.getOverview);
  router.get('/:code', controller.getCourse);
  return router;
}
