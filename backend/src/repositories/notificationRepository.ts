import type { NotificationType } from '@course-reg/shared';
import type { Pool, PoolClient } from 'pg';

export interface NotificationBroadcast {
  userIds: readonly string[];
  type: NotificationType;
  title: string;
  body: string;
}

/** One notification with its own wording, for a per-student message. */
export interface PersonalNotification {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
}

export interface NotificationRepository {
  /**
   * One row per user in a single INSERT (unnest over the id array), so opening
   * registration for 300 students is one statement inside the same transaction.
   * Returns how many rows were written.
   */
  broadcast(message: NotificationBroadcast): Promise<number>;
  /**
   * The same, but each row carries its own title and body: an allocation
   * result is different for every student, and still has to be one statement.
   */
  sendMany(messages: readonly PersonalNotification[]): Promise<number>;
  countUnread(userId: string): Promise<number>;
}

export function createNotificationRepository(
  pool: Pick<Pool | PoolClient, 'query'>,
): NotificationRepository {
  return {
    async broadcast({ userIds, type, title, body }) {
      if (userIds.length === 0) {
        return 0;
      }
      const result = await pool.query(
        `INSERT INTO notifications (user_id, type, title, body)
         SELECT user_id, $2, $3, $4
         FROM unnest($1::uuid[]) AS user_id`,
        [userIds, type, title, body],
      );
      return result.rowCount ?? 0;
    },

    async sendMany(messages) {
      if (messages.length === 0) {
        return 0;
      }
      const result = await pool.query(
        `INSERT INTO notifications (user_id, type, title, body)
         SELECT user_id, type, title, body
         FROM unnest($1::uuid[], $2::text[], $3::text[], $4::text[])
           AS t(user_id, type, title, body)`,
        [
          messages.map((message) => message.userId),
          messages.map((message) => message.type),
          messages.map((message) => message.title),
          messages.map((message) => message.body),
        ],
      );
      return result.rowCount ?? 0;
    },

    async countUnread(userId) {
      const result = await pool.query<{ count: number }>(
        `SELECT count(*)::int AS count
         FROM notifications
         WHERE user_id = $1 AND read_at IS NULL`,
        [userId],
      );
      return result.rows[0]?.count ?? 0;
    },
  };
}
