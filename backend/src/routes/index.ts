import { Router } from 'express';
import { createAccountController } from '../controllers/accountController.js';
import { createActivityController } from '../controllers/activityController.js';
import { createAdminCatalogueController } from '../controllers/adminCatalogueController.js';
import { createAdminStudentController } from '../controllers/adminStudentController.js';
import { createAddDropController } from '../controllers/addDropController.js';
import { createAdminController } from '../controllers/adminController.js';
import { createAuthController } from '../controllers/authController.js';
import { createCartController } from '../controllers/cartController.js';
import { createCourseController } from '../controllers/courseController.js';
import { createEligibilityController } from '../controllers/eligibilityController.js';
import { createAllocationController } from '../controllers/allocationController.js';
import { createHealthController } from '../controllers/healthController.js';
import { createStudentController } from '../controllers/studentController.js';
import { createWaitlistController } from '../controllers/waitlistController.js';
import {
  createAccountRateLimiter,
  createAddDropRateLimiter,
  createLoginRateLimiter,
  createSubmitRateLimiter,
  type RateLimitOptions,
} from '../middleware/loginRateLimiter.js';
import { createRequireAuth } from '../middleware/requireAuth.js';
import type { AccountService } from '../services/accountService.js';
import type { ActivityService } from '../services/activityService.js';
import type { AdminCatalogueService } from '../services/adminCatalogueService.js';
import type { AdminStudentService } from '../services/adminStudentService.js';
import type { AddDropService } from '../services/addDropService.js';
import type { AdminCourseService } from '../services/adminCourseService.js';
import type { AllocationService } from '../services/allocationService.js';
import type { AuthService } from '../services/authService.js';
import type { CartService } from '../services/cartService.js';
import type { CatalogueService } from '../services/catalogueService.js';
import type { EligibilityService } from '../services/eligibilityService.js';
import type { HealthService } from '../services/healthService.js';
import type { RegistrationWindowService } from '../services/registrationWindowService.js';
import type { SubmitService } from '../services/submitService.js';
import type { StudentService } from '../services/studentService.js';
import type { WaitlistService } from '../services/waitlistService.js';
import { createAccountRouter, createPublicAccountRouter } from './accountRoutes.js';
import { createAddDropRouter } from './addDropRoutes.js';
import { createAdminRouter } from './adminRoutes.js';
import { createAdminCatalogueRouter, createAdminStudentRouter } from './adminRecordRoutes.js';
import { createAdminAllocationRouter, createAllocationRouter } from './allocationRoutes.js';
import { createAuthRouter } from './authRoutes.js';
import { createCartRouter, createRegistrationRouter } from './cartRoutes.js';
import { createCourseRouter } from './courseRoutes.js';
import { createEligibilityRouter } from './eligibilityRoutes.js';
import { createHealthRouter } from './healthRoutes.js';
import { createRegistrationWindowRouter } from './registrationWindowRoutes.js';
import { createStudentRouter } from './studentRoutes.js';
import { createAdminWaitlistRouter } from './waitlistRoutes.js';

/** Services the HTTP layer depends on; built once in container.ts (or a test). */
export interface ApiServices {
  healthService: HealthService;
  authService: AuthService;
  accountService: AccountService;
  adminStudentService: AdminStudentService;
  adminCatalogueService: AdminCatalogueService;
  studentService: StudentService;
  activityService: ActivityService;
  catalogueService: CatalogueService;
  cartService: CartService;
  submitService: SubmitService;
  eligibilityService: EligibilityService;
  adminCourseService: AdminCourseService;
  registrationWindowService: RegistrationWindowService;
  allocationService: AllocationService;
  waitlistService: WaitlistService;
  addDropService: AddDropService;
}

export interface ApiRouterOptions {
  cookieSecure: boolean;
  loginRateLimit: RateLimitOptions;
  accountRateLimit: RateLimitOptions;
  submitRateLimit: RateLimitOptions;
  addDropRateLimit: RateLimitOptions;
}

/** Mounts every feature router under /api. */
export function createApiRouter(services: ApiServices, options: ApiRouterOptions): Router {
  const requireAuth = createRequireAuth(services.authService);
  const router = Router();

  router.use('/health', createHealthRouter(createHealthController(services.healthService)));

  const accountController = createAccountController(services.accountService, {
    cookieSecure: options.cookieSecure,
  });
  // Mounted on /auth BEFORE the sign-in router, so the account endpoints get
  // their own, tighter rate limit rather than the sign-in one.
  router.use(
    '/auth',
    createPublicAccountRouter(accountController, {
      accountRateLimiter: createAccountRateLimiter(options.accountRateLimit),
    }),
  );
  router.use(
    '/auth',
    createAuthRouter(
      createAuthController(services.authService, { cookieSecure: options.cookieSecure }),
      { requireAuth, loginRateLimiter: createLoginRateLimiter(options.loginRateLimit) },
    ),
  );
  router.use('/account', createAccountRouter(accountController, requireAuth));
  const waitlistController = createWaitlistController(services.waitlistService);
  router.use(
    '/students',
    createStudentRouter(
      createStudentController(services.studentService),
      waitlistController,
      createActivityController(services.activityService),
      requireAuth,
    ),
  );
  const courseController = createCourseController(services.catalogueService);
  router.use(
    '/registration-windows',
    createRegistrationWindowRouter(courseController, requireAuth),
  );
  router.use('/courses', createCourseRouter(courseController, requireAuth));
  const cartController = createCartController({
    cartService: services.cartService,
    submitService: services.submitService,
  });
  router.use('/preferences', createCartRouter(cartController, requireAuth));
  router.use(
    '/registration',
    createRegistrationRouter(
      cartController,
      requireAuth,
      createSubmitRateLimiter(options.submitRateLimit),
    ),
  );
  router.use(
    '/add-drop',
    createAddDropRouter(
      createAddDropController(services.addDropService),
      requireAuth,
      createAddDropRateLimiter(options.addDropRateLimit),
    ),
  );
  router.use(
    '/eligibility',
    createEligibilityRouter(createEligibilityController(services.eligibilityService), requireAuth),
  );
  const allocationController = createAllocationController(services.allocationService);
  router.use('/allocation', createAllocationRouter(allocationController, requireAuth));
  router.use('/admin', createAdminAllocationRouter(allocationController, requireAuth));
  router.use(
    '/admin',
    createAdminStudentRouter(
      createAdminStudentController(services.adminStudentService),
      requireAuth,
    ),
  );
  router.use(
    '/admin',
    createAdminCatalogueRouter(
      createAdminCatalogueController(services.adminCatalogueService),
      requireAuth,
    ),
  );
  router.use('/admin', createAdminWaitlistRouter(waitlistController, requireAuth));
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
