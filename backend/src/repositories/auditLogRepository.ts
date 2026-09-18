import type { Pool } from 'pg';

export interface AuditLogInput {
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string;
}

export interface AuditLogRepository {
  record(entry: AuditLogInput): Promise<void>;
}

export function createAuditLogRepository(pool: Pick<Pool, 'query'>): AuditLogRepository {
  return {
    async record(entry) {
      await pool.query(
        `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, old_value, new_value, reason)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          entry.actorUserId,
          entry.action,
          entry.entityType,
          entry.entityId,
          entry.oldValue === undefined ? null : JSON.stringify(entry.oldValue),
          entry.newValue === undefined ? null : JSON.stringify(entry.newValue),
          entry.reason ?? null,
        ],
      );
    },
  };
}
