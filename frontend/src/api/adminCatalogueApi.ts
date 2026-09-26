import type {
  AdminCatalogue,
  AdminCourseRecord,
  ApiResponse,
  CourseActivationChangeRequest,
  CreateCourseRequest,
  CsvImportReport,
  UpdateCourseRequest,
} from '@course-reg/shared';
import { apiClient } from './apiClient';

/**
 * The course CATALOGUE — the records and their rules. Distinct from
 * `adminApi.getAdminCourses`, which lists the current window's offerings with
 * their seats and demand.
 */
const coursePath = (code: string): string => `/admin/course-catalogue/${encodeURIComponent(code)}`;

export function getAdminCatalogue(signal?: AbortSignal): Promise<ApiResponse<AdminCatalogue>> {
  return apiClient.get<AdminCatalogue>('/admin/course-catalogue', { signal });
}

export function createCourse(
  request: CreateCourseRequest,
): Promise<ApiResponse<AdminCourseRecord>> {
  return apiClient.post<AdminCourseRecord>('/admin/course-catalogue', { body: request });
}

/** The code is not editable: submissions and stored results all refer to it. */
export function updateCourse(
  code: string,
  request: UpdateCourseRequest,
): Promise<ApiResponse<AdminCourseRecord>> {
  return apiClient.patch<AdminCourseRecord>(coursePath(code), { body: request });
}

/** Retires or reinstates a course. Never deletes: the history refers to it. */
export function setCourseActive(
  code: string,
  isActive: boolean,
  request: CourseActivationChangeRequest = {},
): Promise<ApiResponse<AdminCourseRecord>> {
  return apiClient.post<AdminCourseRecord>(
    `${coursePath(code)}/${isActive ? 'reactivate' : 'deactivate'}`,
    { body: request },
  );
}

export function previewCourseImport(csv: string): Promise<ApiResponse<CsvImportReport>> {
  return apiClient.post<CsvImportReport>('/admin/course-catalogue/import/preview', {
    body: { csv },
  });
}

export function confirmCourseImport(csv: string): Promise<ApiResponse<CsvImportReport>> {
  return apiClient.post<CsvImportReport>('/admin/course-catalogue/import', { body: { csv } });
}
