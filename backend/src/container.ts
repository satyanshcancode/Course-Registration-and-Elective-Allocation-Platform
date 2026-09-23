/**
 * Composition root: wires repositories into services. Used by server.ts and by
 * integration tests (with the test database pool), so both run the same graph.
 */
import type { Pool } from 'pg';
import { SESSION_TTL_SECONDS } from './config/session.js';
import { createAuditLogRepository } from './repositories/auditLogRepository.js';
import { createCourseCatalogueRepository } from './repositories/courseCatalogueRepository.js';
import { createHealthRepository } from './repositories/healthRepository.js';
import { createNotificationRepository } from './repositories/notificationRepository.js';
import { createOfferingRepository } from './repositories/offeringRepository.js';
import { createRegistrationWindowRepository } from './repositories/registrationWindowRepository.js';
import { createStudentRepository } from './repositories/studentRepository.js';
import { createUserRepository } from './repositories/userRepository.js';
import type { ApiServices } from './routes/index.js';
import { createAdminCourseService } from './services/adminCourseService.js';
import { createAuthService } from './services/authService.js';
import { createCatalogueService } from './services/catalogueService.js';
import { createEligibilityService } from './services/eligibilityService.js';
import { createHealthService } from './services/healthService.js';
import { createRegistrationWindowService } from './services/registrationWindowService.js';
import { createStudentService } from './services/studentService.js';
import { createTokenService } from './services/tokenService.js';

export interface ServiceConfig {
  jwtSecret: string;
}

export function createServices(pool: Pool, config: ServiceConfig): ApiServices {
  const windows = createRegistrationWindowRepository(pool);
  const catalogue = createCourseCatalogueRepository(pool);
  const students = createStudentRepository(pool);
  return {
    healthService: createHealthService(createHealthRepository(pool)),
    authService: createAuthService({
      users: createUserRepository(pool),
      auditLogs: createAuditLogRepository(pool),
      tokens: createTokenService({ secret: config.jwtSecret, ttlSeconds: SESSION_TTL_SECONDS }),
    }),
    studentService: createStudentService(students, createNotificationRepository(pool)),
    catalogueService: createCatalogueService({ windows, catalogue, students }),
    eligibilityService: createEligibilityService({ windows, catalogue, students }),
    adminCourseService: createAdminCourseService({
      pool,
      windows,
      catalogue,
      offeringsFor: createOfferingRepository,
      auditLogsFor: createAuditLogRepository,
    }),
    registrationWindowService: createRegistrationWindowService({
      pool,
      windows,
      catalogue,
      windowsFor: createRegistrationWindowRepository,
      auditLogsFor: createAuditLogRepository,
      notificationsFor: createNotificationRepository,
    }),
  };
}
