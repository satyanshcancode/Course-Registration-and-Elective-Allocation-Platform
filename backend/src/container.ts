/**
 * Composition root: wires repositories into services. Used by server.ts and by
 * integration tests (with the test database pool), so both run the same graph.
 */
import type { Pool } from 'pg';
import { SESSION_TTL_SECONDS } from './config/session.js';
import { createAuditLogRepository } from './repositories/auditLogRepository.js';
import { createHealthRepository } from './repositories/healthRepository.js';
import { createStudentRepository } from './repositories/studentRepository.js';
import { createUserRepository } from './repositories/userRepository.js';
import type { ApiServices } from './routes/index.js';
import { createAuthService } from './services/authService.js';
import { createHealthService } from './services/healthService.js';
import { createStudentService } from './services/studentService.js';
import { createTokenService } from './services/tokenService.js';

export interface ServiceConfig {
  jwtSecret: string;
}

export function createServices(pool: Pool, config: ServiceConfig): ApiServices {
  return {
    healthService: createHealthService(createHealthRepository(pool)),
    authService: createAuthService({
      users: createUserRepository(pool),
      auditLogs: createAuditLogRepository(pool),
      tokens: createTokenService({ secret: config.jwtSecret, ttlSeconds: SESSION_TTL_SECONDS }),
    }),
    studentService: createStudentService(createStudentRepository(pool)),
  };
}
