import type {
  ApiResponse,
  CataloguePage,
  CatalogueQuery,
  CourseDetail,
  CurrentWindowResponse,
  SeatSnapshot,
} from '@course-reg/shared';
import { apiClient, getConditional, type ConditionalResult } from './apiClient';

export function getCurrentWindow(
  signal?: AbortSignal,
): Promise<ApiResponse<CurrentWindowResponse>> {
  return apiClient.get<CurrentWindowResponse>('/registration-windows/current', { signal });
}

/** Query string for GET /api/courses; unset values are left out. */
export function catalogueSearchParams(query: CatalogueQuery): URLSearchParams {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([name, value]) => {
    if (value !== undefined && value !== '' && value !== false) {
      params.set(name, String(value));
    }
  });
  return params;
}

export function getCatalogue(
  query: CatalogueQuery,
  signal?: AbortSignal,
): Promise<ApiResponse<CataloguePage>> {
  const search = catalogueSearchParams(query).toString();
  return apiClient.get<CataloguePage>(search ? `/courses?${search}` : '/courses', { signal });
}

export function getCourse(code: string, signal?: AbortSignal): Promise<ApiResponse<CourseDetail>> {
  return apiClient.get<CourseDetail>(`/courses/${encodeURIComponent(code)}`, { signal });
}

/** Live seat numbers; 'not-modified' when nothing changed since `etag`. */
export function getSeats(
  etag: string | null,
  signal?: AbortSignal,
): Promise<ConditionalResult<SeatSnapshot>> {
  return getConditional<SeatSnapshot>('/courses/seats', etag, { signal });
}
