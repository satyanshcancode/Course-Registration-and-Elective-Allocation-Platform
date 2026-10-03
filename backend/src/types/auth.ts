import type { AdminRole } from '@course-reg/shared';

/**
 * The authenticated caller, attached to `req.auth` by `requireAuth`.
 *
 * Student endpoints must take the student's identity from here — never from
 * an id in the URL, query string or body.
 *
 * Staff are ADMIN or CO_ADMIN. Everything audited already records
 * `userId` as the actor, so a co-admin's actions are attributed to them.
 */
export type AuthContext =
  { role: AdminRole; userId: string } | { role: 'STUDENT'; userId: string; studentId: string };
