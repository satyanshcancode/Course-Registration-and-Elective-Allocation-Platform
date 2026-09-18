export type DependencyStatus = 'ok' | 'down';

export type OverallHealthStatus = 'ok' | 'degraded';

export interface DatabaseHealth {
  status: DependencyStatus;
  /** Round-trip time of the check query; null when the database is unreachable. */
  latencyMs: number | null;
}

/** Payload of `GET /api/health`. */
export interface HealthStatus {
  status: OverallHealthStatus;
  database: DatabaseHealth;
  uptimeSeconds: number;
  /** ISO-8601 time at which the report was produced. */
  timestamp: string;
}
