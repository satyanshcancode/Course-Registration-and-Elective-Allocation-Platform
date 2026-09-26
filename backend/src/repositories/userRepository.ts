import { isOneOf, USER_ROLES, type CurrentUser, type UserRole } from '@course-reg/shared';
import type { Pool, PoolClient } from 'pg';
import { mapCurrentUserRow, RowMappingError } from './mappers.js';
import type { CurrentUserRow } from './rows.js';

/** Login lookup result. The hash never leaves the auth service. */
export interface UserCredentials {
  id: string;
  role: UserRole;
  /** Null for an invited account that has never set a password. */
  passwordHash: string | null;
  /** A deactivated account cannot sign in, but keeps all of its history. */
  isActive: boolean;
}

export interface SessionUser {
  id: string;
  role: UserRole;
  isActive: boolean;
  /** Session tokens issued before this instant are refused. */
  passwordChangedAt: Date;
}

/** What a password reset needs to know about an address, and nothing more. */
export interface AccountByEmail {
  id: string;
  email: string;
  isActive: boolean;
  hasPassword: boolean;
}

export interface UserRepository {
  /** Case-insensitive (users.email is CITEXT). */
  findCredentialsByEmail(email: string): Promise<UserCredentials | null>;
  findSessionUser(userId: string): Promise<SessionUser | null>;
  findCurrentUser(userId: string): Promise<CurrentUser | null>;
  findAccountByEmail(email: string): Promise<AccountByEmail | null>;
  /** The address of an account, for the "your password changed" note. */
  findEmail(userId: string): Promise<string | null>;
  /**
   * Sets the password and moves the session cut-off to now(), which is what
   * ends every other session. The database's clock is used, never a JS Date,
   * so the cut-off and the `now()` a token is signed against agree.
   */
  setPassword(userId: string, passwordHash: string): Promise<void>;
  /** The hash alone, to check the current password before changing it. */
  findPasswordHash(userId: string): Promise<string | null>;
  setActive(userId: string, isActive: boolean): Promise<void>;
}

function toRole(value: string): UserRole {
  if (!isOneOf(USER_ROLES, value)) {
    throw new RowMappingError('users.role', value);
  }
  return value;
}

export function createUserRepository(
  pool: Pick<Pool | PoolClient, 'query'>,
): UserRepository {
  return {
    async findCredentialsByEmail(email) {
      const result = await pool.query<{
        id: string;
        role: string;
        password_hash: string | null;
        is_active: boolean;
      }>('SELECT id, role, password_hash, is_active FROM users WHERE email = $1', [email]);
      const row = result.rows[0];
      return row
        ? {
            id: row.id,
            role: toRole(row.role),
            passwordHash: row.password_hash,
            isActive: row.is_active,
          }
        : null;
    },

    async findSessionUser(userId) {
      const result = await pool.query<{
        id: string;
        role: string;
        is_active: boolean;
        password_changed_at: Date;
      }>('SELECT id, role, is_active, password_changed_at FROM users WHERE id = $1', [userId]);
      const row = result.rows[0];
      return row
        ? {
            id: row.id,
            role: toRole(row.role),
            isActive: row.is_active,
            passwordChangedAt: row.password_changed_at,
          }
        : null;
    },

    async findCurrentUser(userId) {
      const result = await pool.query<CurrentUserRow>(
        `SELECT u.id, u.email, u.role,
                s.name, s.roll_number, s.semester, s.credits_completed,
                p.code AS program_code, p.name AS program_name
         FROM users u
         LEFT JOIN students s ON s.user_id = u.id
         LEFT JOIN programs p ON p.id = s.program_id
         WHERE u.id = $1`,
        [userId],
      );
      const row = result.rows[0];
      return row ? mapCurrentUserRow(row) : null;
    },

    async findAccountByEmail(email) {
      const result = await pool.query<{
        id: string;
        email: string;
        is_active: boolean;
        has_password: boolean;
      }>(
        `SELECT id, email, is_active, password_hash IS NOT NULL AS has_password
         FROM users WHERE email = $1`,
        [email],
      );
      const row = result.rows[0];
      return row
        ? {
            id: row.id,
            email: row.email,
            isActive: row.is_active,
            hasPassword: row.has_password,
          }
        : null;
    },

    async findEmail(userId) {
      const result = await pool.query<{ email: string }>('SELECT email FROM users WHERE id = $1', [
        userId,
      ]);
      return result.rows[0]?.email ?? null;
    },

    async setPassword(userId, passwordHash) {
      await pool.query(
        'UPDATE users SET password_hash = $2, password_changed_at = now() WHERE id = $1',
        [userId, passwordHash],
      );
    },

    async findPasswordHash(userId) {
      const result = await pool.query<{ password_hash: string | null }>(
        'SELECT password_hash FROM users WHERE id = $1',
        [userId],
      );
      return result.rows[0]?.password_hash ?? null;
    },

    async setActive(userId, isActive) {
      await pool.query('UPDATE users SET is_active = $2 WHERE id = $1', [userId, isActive]);
    },
  };
}
