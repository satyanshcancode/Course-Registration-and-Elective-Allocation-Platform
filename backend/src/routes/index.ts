import { Router } from 'express';
import { createHealthController } from '../controllers/healthController.js';
import type { HealthService } from '../services/healthService.js';
import { createHealthRouter } from './healthRoutes.js';

/** Services the HTTP layer depends on; built once in server.ts (or a test). */
export interface ApiServices {
  healthService: HealthService;
}

/** Mounts every feature router under /api. */
export function createApiRouter(services: ApiServices): Router {
  const router = Router();
  router.use('/health', createHealthRouter(createHealthController(services.healthService)));
  return router;
}
