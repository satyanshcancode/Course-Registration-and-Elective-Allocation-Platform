import { Router } from 'express';
import type { HealthController } from '../controllers/healthController.js';

export function createHealthRouter(controller: HealthController): Router {
  const router = Router();
  router.get('/', controller.getHealth);
  return router;
}
