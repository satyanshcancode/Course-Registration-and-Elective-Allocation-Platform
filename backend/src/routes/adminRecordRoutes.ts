import { Router, type RequestHandler } from 'express';
import type { AdminCatalogueController } from '../controllers/adminCatalogueController.js';
import type { AdminStudentController } from '../controllers/adminStudentController.js';
import { requireRole } from '../middleware/requireRole.js';

/**
 * Student records and the course catalogue: everything an administrator
 * maintains by hand, mounted under /api/admin.
 *
 * Both routers take requireAuth + requireRole('ADMIN') on the router itself, so
 * a route added later cannot be left unguarded by forgetting a middleware.
 *
 * A student is addressed by roll number and a course by code — never by the
 * internal id, which does not leave the server.
 */
export function createAdminStudentRouter(
  controller: AdminStudentController,
  requireAuth: RequestHandler,
): Router {
  const router = Router();
  router.use(requireAuth, requireRole('ADMIN'));

  // Before /students/:rollNumber, or "import" would be read as a roll number.
  router.post('/students/import/preview', controller.previewImport);
  router.post('/students/import', controller.confirmImport);
  // Programmes, departments and courses for the forms' pickers.
  router.get('/reference-data', controller.referenceData);

  router.get('/students', controller.list);
  router.post('/students', controller.create);
  router.get('/students/:rollNumber', controller.get);
  router.patch('/students/:rollNumber', controller.update);
  router.post('/students/:rollNumber/invitation', controller.resendInvitation);
  router.post('/students/:rollNumber/deactivate', controller.deactivate);
  router.post('/students/:rollNumber/reactivate', controller.reactivate);
  return router;
}

/**
 * The catalogue lives at /course-catalogue rather than /courses because
 * /api/admin/courses is already the OFFERINGS of the current window, with their
 * seats and demand. The two are genuinely different resources.
 */
export function createAdminCatalogueRouter(
  controller: AdminCatalogueController,
  requireAuth: RequestHandler,
): Router {
  const router = Router();
  router.use(requireAuth, requireRole('ADMIN'));

  router.post('/course-catalogue/import/preview', controller.previewImport);
  router.post('/course-catalogue/import', controller.confirmImport);

  router.get('/course-catalogue', controller.list);
  router.post('/course-catalogue', controller.create);
  router.get('/course-catalogue/:code', controller.get);
  router.patch('/course-catalogue/:code', controller.update);
  router.post('/course-catalogue/:code/deactivate', controller.deactivate);
  router.post('/course-catalogue/:code/reactivate', controller.reactivate);
  return router;
}
