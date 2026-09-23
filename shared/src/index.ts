// API contracts (DTOs exchanged over HTTP).
export type { ApiFailure, ApiFieldError, ApiResponse, ApiSuccess } from './api/apiResponse.js';
export { isApiResponse } from './api/apiResponse.js';
export type {
  AdminPing,
  CurrentAdmin,
  CurrentStudent,
  CurrentUser,
  LoginRequest,
  StudentProfile,
  StudentProfileSummary,
  UnreadNotificationCount,
} from './api/auth.js';
export type {
  AdminCourseList,
  AdminCourseOffering,
  CatalogueCourse,
  CatalogueFilterOptions,
  CataloguePage,
  CatalogueQuery,
  CourseDetail,
  CourseSeats,
  CourseSortKey,
  CurrentWindowResponse,
  MyCourseStatus,
  MyCourseStatusCode,
  PrerequisiteStatus,
  RegistrationWindowSummary,
  SeatSnapshot,
  SortOrder,
  StudentCourseContext,
  UpdateCapacityRequest,
} from './api/courses.js';
export {
  CAPACITY_LIMITS,
  CAPACITY_REASON_LENGTH,
  CATALOGUE_PAGE_SIZE,
  COURSE_SORT_KEYS,
  DEFAULT_SORT_ORDER,
  SORT_ORDERS,
} from './api/courses.js';
export type {
  CourseEligibility,
  CourseEligibilityDetail,
  EligibilityOverview,
  EligibilitySummary,
  StudentEligibilityFacts,
} from './api/eligibility.js';
export type {
  AdminWindowDetail,
  UpdateWindowRequest,
  WindowActionRequest,
  WindowCounts,
  WindowCourseOption,
} from './api/registrationWindow.js';
export {
  POLICY_POINT_LIMITS,
  RANDOM_SEED_LIMITS,
  WINDOW_NAME_LENGTH,
  WINDOW_REASON_LENGTH,
  WINDOW_TRANSITIONS,
} from './api/registrationWindow.js';
export type {
  DatabaseHealth,
  DependencyStatus,
  HealthStatus,
  OverallHealthStatus,
} from './api/health.js';

// Domain models, value types and rules shared by both sides.
export * from './domain/enums.js';
export * from './domain/academicTerm.js';
export * from './domain/allocationConfig.js';
export type * from './domain/models.js';
export type * from './domain/refs.js';
export * from './domain/eligibility.js';
