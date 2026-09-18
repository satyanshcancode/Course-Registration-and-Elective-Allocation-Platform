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
