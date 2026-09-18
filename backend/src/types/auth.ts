/**
 * The authenticated caller, attached to `req.auth` by `requireAuth`.
 *
 * Student endpoints must take the student's identity from here — never from
 * an id in the URL, query string or body.
 */
export type AuthContext =
  { role: 'ADMIN'; userId: string } | { role: 'STUDENT'; userId: string; studentId: string };
