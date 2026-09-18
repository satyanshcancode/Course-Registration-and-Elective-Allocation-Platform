import type { HealthStatus } from '@course-reg/shared';
import { getHealth } from '../api/healthApi';
import { useApiResource, type ApiResource } from './useApiResource';

export function useHealthStatus(): ApiResource<HealthStatus> {
  return useApiResource(getHealth);
}
