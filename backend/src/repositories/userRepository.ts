import { isOneOf, USER_ROLES, type CurrentUser, type UserRole } from '@course-reg/shared';
import type { Pool } from 'pg';
import { mapCurrentUserRow, RowMappingError } from './mappers.js';
import type { CurrentUserRow } from './rows.js';

/** Login lookup result. The hash never leaves the auth service. */
export interface UserCredentials {
  id: string;
  role: UserRole;
  passwordHash: string;
}

export interface SessionUser {
  id: string;
  role: UserRole;
}

export interface UserRepository {
  /** Case-insensitive (users.email is CITEXT). */
  findCredentialsByEmail(email: string): Promise<UserCredentials | null>;
  findSessionUser(userId: string): Promise<SessionUser | null>;
  findCurrentUser(userId: string): Promise<CurrentUser | null>;
}

function toRole(value: string): UserRole {
  if (!isOneOf(USER_ROLES, value)) {
    throw new RowMappingError('users.role', value);
  }
  return value;
}

export function createUserRepository(pool: Pick<Pool, 'query'>): UserRepository {
  return {
    async findCredentialsByEmail(email) {
      const result = await pool.query<{ id: string; role: string; password_hash: string }>(
        'SELECT id, role, password_hash FROM users WHERE email = $1',
        [email],
      );
      const row = result.rows[0];
      return row ? { id: row.id, role: toRole(row.role), passwordHash: row.password_hash } : null;
    },

    async findSessionUser(userId) {
      const result = await pool.query<{ id: string; role: string }>(
        'SELECT id, role FROM users WHERE id = $1',
        [userId],
      );
      const row = result.rows[0];
      return row ? { id: row.id, role: toRole(row.role) } : null;
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
  };
}
