import type { CourseDetail } from '@course-reg/shared';
import { getCourse } from '../api/courseApi';
import { unwrap } from '../api/unwrap';
import { useAsync, type AsyncResource } from './useAsync';

/** One course with the signed-in student's eligibility and status; reloads when `code` changes. */
export function useCourseDetail(code: string): AsyncResource<CourseDetail> {
  return useAsync(async (signal) => unwrap(await getCourse(code, signal)), { key: code });
}
