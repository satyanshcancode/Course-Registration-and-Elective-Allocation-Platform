import { Router, type RequestHandler } from 'express';
import type { CourseController } from '../controllers/courseController.js';

/**
 * The catalogue, for any signed-in user. Students additionally get their own
 * eligibility and status on each course; admins get the plain catalogue.
 */
export function createCourseRouter(
  controller: CourseController,
  requireAuth: RequestHandler,
): Router {
  const router = Router();
  router.use(requireAuth);
  router.get('/', controller.listCatalogue);
  // Before "/:code", or "seats" would be read as a course code.
  router.get('/seats', controller.getSeats);
  router.get('/:code', controller.getCourse);
  return router;
}
