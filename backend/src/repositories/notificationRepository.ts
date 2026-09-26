import { NOTIFICATION_TYPES, type NotificationItem } from '@course-reg/shared';
import type { NotificationType } from '@course-reg/shared';
import type { Pool, PoolClient } from 'pg';
import { oneOf } from './mappers.js';
import type { NotificationRow } from './rows.js';

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

export interface NotificationPageQuery {
  /** Only unread ones. */
  unreadOnly: boolean;
  /** `<createdAt>|<id>` of the last row seen; omit for the newest page. */
  cursor?: string | undefined;
  limit: number;
}

/** What one "mark as read" call changed, and whether the row was even theirs. */
export interface MarkReadResult {
  found: boolean;
  marked: number;
}

export interface NotificationRepository {
  /**
   * The user's own messages, newest first. Keyset on `(created_at, id)`, which
   * is exactly the ORDER BY and the `notifications_user_idx` prefix, so a page
   * cannot repeat or skip a row when a new message arrives mid-read.
   */
  listForUser(userId: string, query: NotificationPageQuery): Promise<NotificationItem[]>;
  /** Marks one as read. Scoped to the owner BY THE QUERY, not afterwards. */
  markRead(userId: string, notificationId: string): Promise<MarkReadResult>;
  /** Marks every unread one as read; returns how many changed. */
  markAllRead(userId: string): Promise<number>;
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
    async listForUser(userId, { unreadOnly, cursor, limit }) {
      const [cursorAt, cursorId] = splitCursor(cursor);
      const result = await pool.query<NotificationRow>(
        `SELECT id, user_id, type, title, body, read_at, created_at
         FROM notifications
         WHERE user_id = $1
           AND ($2::boolean IS FALSE OR read_at IS NULL)
           AND ($3::timestamptz IS NULL OR (created_at, id) < ($3, $4::uuid))
         ORDER BY created_at DESC, id DESC
         LIMIT $5`,
        [userId, unreadOnly, cursorAt, cursorId, limit],
      );
      return result.rows.map(toNotificationItem);
    },

    async markRead(userId, notificationId) {
      // One statement: "is it theirs" and "did this change anything" are
      // different answers (404 vs. an idempotent no-op) and must agree.
      const result = await pool.query<{ found: number; marked: number }>(
        `WITH target AS (
           SELECT id FROM notifications WHERE id = $1 AND user_id = $2
         ), done AS (
           UPDATE notifications SET read_at = now()
           WHERE id IN (SELECT id FROM target) AND read_at IS NULL
           RETURNING id
         )
         SELECT (SELECT count(*) FROM target)::int AS found,
                (SELECT count(*) FROM done)::int AS marked`,
        [notificationId, userId],
      );
      const row = result.rows[0];
      return { found: (row?.found ?? 0) > 0, marked: row?.marked ?? 0 };
    },

    async markAllRead(userId) {
      const result = await pool.query(
        `UPDATE notifications SET read_at = now()
         WHERE user_id = $1 AND read_at IS NULL`,
        [userId],
      );
      return result.rowCount ?? 0;
    },

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

/** `<ISO created_at>|<uuid>`; anything malformed reads as "start at the top". */
function splitCursor(cursor: string | undefined): [string | null, string | null] {
  const separator = cursor?.lastIndexOf('|') ?? -1;
  if (cursor === undefined || separator <= 0) {
    return [null, null];
  }
  return [cursor.slice(0, separator), cursor.slice(separator + 1)];
}

/** The cursor pointing just past this row. */
export function notificationCursor(item: NotificationItem): string {
  return `${item.createdAt}|${item.id}`;
}

function toNotificationItem(row: NotificationRow): NotificationItem {
  return {
    id: row.id,
    type: oneOf(NOTIFICATION_TYPES, row.type, 'notifications.type'),
    title: row.title,
    body: row.body,
    readAt: row.read_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  };
}
