import { Router, type RequestHandler } from 'express';
import type { TeamController } from '../controllers/teamController.js';
import { requireAdminManager } from '../middleware/requireRole.js';

/**
 * Staff accounts, under /api/admin/team.
 *
 * This is the ONE router a co-administrator cannot reach. `requireAdminManager`
 * is mounted on the router rather than per route, so a route added here later
 * is guarded by construction.
 *
 * **It must be mounted on '/admin/team', not on '/admin'.** A `router.use`
 * middleware runs for every request that reaches the router, whether or not a
 * route inside it matches — so mounted on '/admin' this one answered 403 for
 * admin paths handled by routers registered after it. Scoping the mount to the
 * prefix the routes actually live under is what keeps the refusal to the five
 * endpoints it is about.
 *
 * Members are addressed by their user id, which is a UUID the Team page
 * already holds; there is no other stable handle for a staff account, which
 * has no roll number.
 */
export function createTeamRouter(controller: TeamController, requireAuth: RequestHandler): Router {
  const router = Router();
  router.use(requireAuth, requireAdminManager);

  router.get('/', controller.list);
  router.post('/', controller.invite);
  router.post('/:id/invitation', controller.resendInvitation);
  router.post('/:id/deactivate', controller.deactivate);
  router.post('/:id/reactivate', controller.reactivate);
  return router;
}
