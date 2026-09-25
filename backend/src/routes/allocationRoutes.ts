import { Router, type RequestHandler } from 'express';
import type { AllocationController } from '../controllers/allocationController.js';
import { requireRole } from '../middleware/requireRole.js';

/** Admin-only: previewing, running and verifying allocation. */
export function createAdminAllocationRouter(
  controller: AllocationController,
  requireAuth: RequestHandler,
): Router {
  const router = Router();
  router.use(requireAuth, requireRole('ADMIN'));
  router.post('/allocation/preview', controller.preview);
  router.post('/allocation/run', controller.run);
  router.get('/allocation-runs', controller.listRuns);
  router.get('/allocation-runs/:id', controller.getRun);
  router.post('/allocation-runs/:id/verify', controller.verifyRun);
  return router;
}

/** The student's own results, and only their own. */
export function createAllocationRouter(
  controller: AllocationController,
  requireAuth: RequestHandler,
): Router {
  const router = Router();
  router.use(requireAuth, requireRole('STUDENT'));
  router.get('/results', controller.myResults);
  return router;
}
