import { Router, type RequestHandler } from 'express';
import type { AdminController } from '../controllers/adminController.js';
import { requireRole } from '../middleware/requireRole.js';

export function createAdminRouter(
  controller: AdminController,
  requireAuth: RequestHandler,
): Router {
  const router = Router();
  router.use(requireAuth, requireRole('ADMIN'));
  router.get('/ping', controller.ping);
  router.get('/courses', controller.listCourses);
  router.patch('/courses/:code/capacity', controller.updateCapacity);
  return router;
}
