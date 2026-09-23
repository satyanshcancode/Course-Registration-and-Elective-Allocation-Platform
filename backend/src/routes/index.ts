import { Router } from 'express';
import { createAdminController } from '../controllers/adminController.js';
import { createAuthController } from '../controllers/authController.js';
import { createCourseController } from '../controllers/courseController.js';
import { createEligibilityController } from '../controllers/eligibilityController.js';
import { createHealthController } from '../controllers/healthController.js';
import { createStudentController } from '../controllers/studentController.js';
import { createLoginRateLimiter, type RateLimitOptions } from '../middleware/loginRateLimiter.js';
import { createRequireAuth } from '../middleware/requireAuth.js';
import type { AdminCourseService } from '../services/adminCourseService.js';
import type { AuthService } from '../services/authService.js';
import type { CatalogueService } from '../services/catalogueService.js';
import type { EligibilityService } from '../services/eligibilityService.js';
import type { HealthService } from '../services/healthService.js';
import type { RegistrationWindowService } from '../services/registrationWindowService.js';
import type { StudentService } from '../services/studentService.js';
import { createAdminRouter } from './adminRoutes.js';
import { createAuthRouter } from './authRoutes.js';
import { createCourseRouter } from './courseRoutes.js';
import { createEligibilityRouter } from './eligibilityRoutes.js';
import { createHealthRouter } from './healthRoutes.js';
import { createRegistrationWindowRouter } from './registrationWindowRoutes.js';
import { createStudentRouter } from './studentRoutes.js';

/** Services the HTTP layer depends on; built once in container.ts (or a test). */
export interface ApiServices {
  healthService: HealthService;
  authService: AuthService;
  studentService: StudentService;
  catalogueService: CatalogueService;
  eligibilityService: EligibilityService;
  adminCourseService: AdminCourseService;
  registrationWindowService: RegistrationWindowService;
}

export interface ApiRouterOptions {
  cookieSecure: boolean;
  loginRateLimit: RateLimitOptions;
}

/** Mounts every feature router under /api. */
export function createApiRouter(services: ApiServices, options: ApiRouterOptions): Router {
  const requireAuth = createRequireAuth(services.authService);
  const router = Router();

  router.use('/health', createHealthRouter(createHealthController(services.healthService)));
  router.use(
    '/auth',
    createAuthRouter(
      createAuthController(services.authService, { cookieSecure: options.cookieSecure }),
      { requireAuth, loginRateLimiter: createLoginRateLimiter(options.loginRateLimit) },
    ),
  );
  router.use(
    '/students',
    createStudentRouter(createStudentController(services.studentService), requireAuth),
  );
  const courseController = createCourseController(services.catalogueService);
  router.use(
    '/registration-windows',
    createRegistrationWindowRouter(courseController, requireAuth),
  );
  router.use('/courses', createCourseRouter(courseController, requireAuth));
  router.use(
    '/eligibility',
    createEligibilityRouter(createEligibilityController(services.eligibilityService), requireAuth),
  );
  router.use(
    '/admin',
    createAdminRouter(
      createAdminController({
        adminCourseService: services.adminCourseService,
        registrationWindowService: services.registrationWindowService,
      }),
      requireAuth,
    ),
  );
  return router;
}
