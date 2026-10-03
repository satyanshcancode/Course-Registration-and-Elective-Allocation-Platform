import { Router, type RequestHandler } from 'express';
import type { TeamController } from '../controllers/teamController.js';
import { requireAdminManager } from '../middleware/requireRole.js';

/**
 * Staff accounts, under /api/admin/team.
 *
 * This is the ONE router a co-administrator cannot reach. `requireAdminManager`
 * is mounted on the router rather than per route, so a route added here later
 * is guarded by construction; and because the restriction lives on its own
 * router, no other admin endpoint can accidentally acquire it or lose it.
 *
 * Members are addressed by their user id, which is a UUID the Team page
 * already holds; there is no other stable handle for a staff account, which
 * has no roll number.
 */
export function createTeamRouter(controller: TeamController, requireAuth: RequestHandler): Router {
  const router = Router();
  router.use(requireAuth, requireAdminManager);

  router.get('/team', controller.list);
  router.post('/team', controller.invite);
  router.post('/team/:id/invitation', controller.resendInvitation);
  router.post('/team/:id/deactivate', controller.deactivate);
  router.post('/team/:id/reactivate', controller.reactivate);
  return router;
}
