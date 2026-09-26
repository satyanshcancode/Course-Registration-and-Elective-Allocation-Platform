/**
 * Composition root: wires repositories into services. Used by server.ts and by
 * integration tests (with the test database pool), so both run the same graph.
 */
import type { Pool } from 'pg';
import { SESSION_TTL_SECONDS } from './config/session.js';
import type { Mailer } from './mail/mailer.js';
import { createAccountTokenRepository } from './repositories/accountTokenRepository.js';
import { createAddDropRequestRepository } from './repositories/addDropRequestRepository.js';
import { createAdminCourseRepository } from './repositories/adminCourseRepository.js';
import { createAdminStudentRepository } from './repositories/adminStudentRepository.js';
import { createAllocationRepository } from './repositories/allocationRepository.js';
import { createAuditLogRepository } from './repositories/auditLogRepository.js';
import { createCourseCatalogueRepository } from './repositories/courseCatalogueRepository.js';
import { createHealthRepository } from './repositories/healthRepository.js';
import { createNotificationRepository } from './repositories/notificationRepository.js';
import { createPreferenceRepository } from './repositories/preferenceRepository.js';
import { createRegistrationHistoryRepository } from './repositories/registrationHistoryRepository.js';
import { createOfferingRepository } from './repositories/offeringRepository.js';
import { createRegistrationWindowRepository } from './repositories/registrationWindowRepository.js';
import { createStudentRepository } from './repositories/studentRepository.js';
import { createUserRepository } from './repositories/userRepository.js';
import { createWaitlistRepository } from './repositories/waitlistRepository.js';
import type { ApiServices } from './routes/index.js';
import { createAccountService } from './services/accountService.js';
import { createActivityService } from './services/activityService.js';
import { createAddDropService } from './services/addDropService.js';
import { createAdminCatalogueService } from './services/adminCatalogueService.js';
import { createAdminCourseService } from './services/adminCourseService.js';
import { createAdminStudentService } from './services/adminStudentService.js';
import { createAllocationService } from './services/allocationService.js';
import { createAuthService } from './services/authService.js';
import { createCartService } from './services/cartService.js';
import { createCatalogueService } from './services/catalogueService.js';
import { createEligibilityService } from './services/eligibilityService.js';
import { createHealthService } from './services/healthService.js';
import { createRegistrationWindowService } from './services/registrationWindowService.js';
import { createSubmitService } from './services/submitService.js';
import { createStudentService } from './services/studentService.js';
import { createTokenService } from './services/tokenService.js';
import { createWaitlistPromotionService } from './services/waitlistPromotionService.js';
import { createWaitlistService } from './services/waitlistService.js';

export interface ServiceConfig {
  jwtSecret: string;
  /** Origin the activation and reset links point at. */
  appBaseUrl: string;
  mailer: Mailer;
  /** Tests lower the bcrypt cost; production uses the default. */
  passwordHashRounds?: number;
}

export function createServices(pool: Pool, config: ServiceConfig): ApiServices {
  const windows = createRegistrationWindowRepository(pool);
  const catalogue = createCourseCatalogueRepository(pool);
  const students = createStudentRepository(pool);
  const preferences = createPreferenceRepository(pool);
  const allocations = createAllocationRepository(pool);
  const waitlists = createWaitlistRepository(pool);
  const promotions = createWaitlistPromotionService({
    waitlistsFor: createWaitlistRepository,
    studentsFor: createStudentRepository,
    catalogueFor: createCourseCatalogueRepository,
    historyFor: createRegistrationHistoryRepository,
    notificationsFor: createNotificationRepository,
    auditLogsFor: createAuditLogRepository,
  });
  const users = createUserRepository(pool);
  const accountTokens = createAccountTokenRepository(pool);
  const adminStudents = createAdminStudentRepository(pool);
  const adminCourses = createAdminCourseRepository(pool);

  const authService = createAuthService({
    users,
    auditLogs: createAuditLogRepository(pool),
    tokens: createTokenService({ secret: config.jwtSecret, ttlSeconds: SESSION_TTL_SECONDS }),
  });
  const accountService = createAccountService({
    pool,
    users,
    tokens: accountTokens,
    usersFor: createUserRepository,
    tokensFor: createAccountTokenRepository,
    auditLogsFor: createAuditLogRepository,
    mailer: config.mailer,
    authService,
    appBaseUrl: config.appBaseUrl,
    ...(config.passwordHashRounds !== undefined && {
      passwordHashRounds: config.passwordHashRounds,
    }),
  });
  const activityService = createActivityService({
    windows,
    waitlists,
    preferences,
    history: createRegistrationHistoryRepository(pool),
    notifications: createNotificationRepository(pool),
  });

  return {
    healthService: createHealthService(createHealthRepository(pool)),
    authService,
    accountService,
    adminStudentService: createAdminStudentService({
      pool,
      students: adminStudents,
      tokens: accountTokens,
      activityService,
      accountService,
      studentsFor: createAdminStudentRepository,
      auditLogsFor: createAuditLogRepository,
      listAllCourses: () => adminCourses.listCourseRefs(),
      listDepartments: () => adminCourses.listDepartments(),
    }),
    adminCatalogueService: createAdminCatalogueService({
      pool,
      courses: adminCourses,
      coursesFor: createAdminCourseRepository,
      auditLogsFor: createAuditLogRepository,
    }),
    studentService: createStudentService(students, createNotificationRepository(pool)),
    activityService,
    catalogueService: createCatalogueService({ windows, catalogue, students }),
    eligibilityService: createEligibilityService({ windows, catalogue, students }),
    cartService: createCartService({
      pool,
      windows,
      catalogue,
      students,
      preferences,
      preferencesFor: createPreferenceRepository,
    }),
    submitService: createSubmitService({
      pool,
      windows,
      catalogue,
      students,
      preferences,
      preferencesFor: createPreferenceRepository,
      catalogueFor: createCourseCatalogueRepository,
      studentsFor: createStudentRepository,
      historyFor: createRegistrationHistoryRepository,
      notificationsFor: createNotificationRepository,
    }),
    adminCourseService: createAdminCourseService({
      pool,
      windows,
      catalogue,
      offeringsFor: createOfferingRepository,
      auditLogsFor: createAuditLogRepository,
      promotions,
    }),
    waitlistService: createWaitlistService({
      pool,
      windows,
      waitlists,
      promotions,
      waitlistsFor: createWaitlistRepository,
      historyFor: createRegistrationHistoryRepository,
      notificationsFor: createNotificationRepository,
      auditLogsFor: createAuditLogRepository,
    }),
    addDropService: createAddDropService({
      pool,
      windows,
      catalogue,
      students,
      waitlists,
      promotions,
      requestsFor: createAddDropRequestRepository,
      waitlistsFor: createWaitlistRepository,
      catalogueFor: createCourseCatalogueRepository,
      studentsFor: createStudentRepository,
      historyFor: createRegistrationHistoryRepository,
      notificationsFor: createNotificationRepository,
    }),
    allocationService: createAllocationService({
      pool,
      windows,
      allocations,
      auditLogs: createAuditLogRepository(pool),
      waitlists,
      allocationsFor: createAllocationRepository,
      windowsFor: createRegistrationWindowRepository,
      historyFor: createRegistrationHistoryRepository,
      notificationsFor: createNotificationRepository,
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
