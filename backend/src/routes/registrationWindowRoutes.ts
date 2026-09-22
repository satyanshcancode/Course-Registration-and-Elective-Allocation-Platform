import { Router, type RequestHandler } from 'express';
import type { CourseController } from '../controllers/courseController.js';

export function createRegistrationWindowRouter(
  controller: CourseController,
  requireAuth: RequestHandler,
): Router {
  const router = Router();
  router.use(requireAuth);
  router.get('/current', controller.getCurrentWindow);
  return router;
}
