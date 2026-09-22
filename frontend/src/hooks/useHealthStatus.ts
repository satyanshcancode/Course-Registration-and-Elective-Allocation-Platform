import type { HealthStatus } from '@course-reg/shared';
import { getHealth } from '../api/healthApi';
import { unwrap } from '../api/unwrap';
import { useAsync, type AsyncResource } from './useAsync';

export function useHealthStatus(): AsyncResource<HealthStatus> {
  return useAsync(async (signal) => unwrap(await getHealth(signal)));
}
