import type { DatabaseHealth, HealthStatus } from '@course-reg/shared';
import type { HealthRepository } from '../repositories/healthRepository.js';
import { logger } from '../utils/logger.js';

export interface HealthService {
  getStatus(): Promise<HealthStatus>;
}

interface HealthServiceOptions {
  now?: () => Date;
  uptimeSeconds?: () => number;
}

export function createHealthService(
  repository: HealthRepository,
  { now = () => new Date(), uptimeSeconds = () => process.uptime() }: HealthServiceOptions = {},
): HealthService {
  async function checkDatabase(): Promise<DatabaseHealth> {
    const startedAt = performance.now();
    try {
      await repository.pingDatabase();
      return { status: 'ok', latencyMs: Math.round(performance.now() - startedAt) };
    } catch (error) {
      logger.warn('Database health check failed', { error });
      return { status: 'down', latencyMs: null };
    }
  }

  return {
    async getStatus() {
      const database = await checkDatabase();
      return {
        status: database.status === 'ok' ? 'ok' : 'degraded',
        database,
        uptimeSeconds: Math.floor(uptimeSeconds()),
        timestamp: now().toISOString(),
      };
    },
  };
}
