import { Router, type RequestHandler } from 'express';
import type { StudentController } from '../controllers/studentController.js';
import { requireRole } from '../middleware/requireRole.js';

/**
 * Routes for the signed-in student. Paths use "/me" and never take a student
 * id: the student is always the caller identified by req.auth.
 */
export function createStudentRouter(
  controller: StudentController,
  requireAuth: RequestHandler,
): Router {
  const router = Router();
  router.use(requireAuth, requireRole('STUDENT'));
  router.get('/me', controller.getMyProfile);
  router.get('/me/notifications/unread-count', controller.getUnreadNotificationCount);
  return router;
}
