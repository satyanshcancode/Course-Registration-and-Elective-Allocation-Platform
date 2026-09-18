import type { RequestHandler } from 'express';
import type { HealthService } from '../services/healthService.js';
import { sendSuccess } from '../utils/apiResponse.js';

export interface HealthController {
  getHealth: RequestHandler;
}

export function createHealthController(healthService: HealthService): HealthController {
  return {
    async getHealth(_req, res) {
      const health = await healthService.getStatus();
      // The report itself always succeeds; 503 tells orchestrators and load
      // balancers that a dependency is down.
      sendSuccess(res, health, { statusCode: health.status === 'ok' ? 200 : 503 });
    },
  };
}
