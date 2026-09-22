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
} from './api/auth.js';
export type {
  AdminCourseList,
  AdminCourseOffering,
  CatalogueCourse,
  CatalogueFilterOptions,
  CataloguePage,
  CatalogueQuery,
  CourseDetail,
  CourseEligibility,
  CourseIneligibilityReason,
  CourseRef,
  CourseSeats,
  CourseSortKey,
  CurrentWindowResponse,
  DepartmentRef,
  MyCourseStatus,
  MyCourseStatusCode,
  PrerequisiteStatus,
  ProgramRef,
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
export type * from './domain/eligibility.js';
