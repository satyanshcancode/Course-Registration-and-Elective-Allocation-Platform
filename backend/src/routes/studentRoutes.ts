import { Router, type RequestHandler } from 'express';
import type { ActivityController } from '../controllers/activityController.js';
import type { StudentController } from '../controllers/studentController.js';
import type { WaitlistController } from '../controllers/waitlistController.js';
import { requireRole } from '../middleware/requireRole.js';

/**
 * Routes for the signed-in student. Paths use "/me" and never take a student
 * id: the student is always the caller identified by req.auth.
 */
export function createStudentRouter(
  controller: StudentController,
  waitlists: WaitlistController,
  activity: ActivityController,
  requireAuth: RequestHandler,
): Router {
  const router = Router();
  router.use(requireAuth, requireRole('STUDENT'));
  router.get('/me', controller.getMyProfile);
  router.get('/me/status', activity.getStatus);
  router.get('/me/history', activity.getHistory);
  router.get('/me/notifications/unread-count', controller.getUnreadNotificationCount);
  router.get('/me/notifications', activity.getNotifications);
  router.patch('/me/notifications/:id/read', activity.markNotificationRead);
  router.post('/me/notifications/read-all', activity.markAllNotificationsRead);
  router.get('/me/waitlist', waitlists.myWaitlist);
  return router;
}
