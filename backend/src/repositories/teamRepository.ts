import { isOneOf, ADMIN_ROLES, type AdminRole } from '@course-reg/shared';
import type { Pool, PoolClient } from 'pg';
import { RowMappingError } from './mappers.js';

/**
 * Staff accounts only. Every query here is scoped by
 * `role IN ('ADMIN', 'CO_ADMIN')`, so a student can never be read, listed,
 * deactivated or promoted through this repository even if an id were guessed.
 */
export interface TeamMemberRecord {
  id: string;
  email: string;
  name: string | null;
  role: AdminRole;
  isActive: boolean;
  hasPassword: boolean;
  createdAt: Date;
}

export interface TeamRepository {
  list(): Promise<TeamMemberRecord[]>;
  find(userId: string): Promise<TeamMemberRecord | null>;
  /** Locks the row, so two administrators acting on one account serialise. */
  lock(userId: string): Promise<TeamMemberRecord | null>;
  /** Creates an INVITED co-admin: no password hash yet. Returns its id. */
  createCoAdmin(input: { email: string; name: string }): Promise<string>;
  setActive(userId: string, isActive: boolean): Promise<void>;
  /**
   * How many ADMIN accounts are still active, counted inside the caller's
   * transaction so the last-administrator rule cannot be raced by two
   * deactivations running at once.
   */
  countActiveAdmins(): Promise<number>;
}

const SELECT_COLUMNS = `id, email, display_name AS name, role, is_active,
                        password_hash IS NOT NULL AS has_password, created_at`;

interface TeamMemberRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
  is_active: boolean;
  has_password: boolean;
  created_at: Date;
}

function mapRow(row: TeamMemberRow): TeamMemberRecord {
  if (!isOneOf(ADMIN_ROLES, row.role)) {
    throw new RowMappingError('users.role (expected a staff role)', row.role);
  }
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    isActive: row.is_active,
    hasPassword: row.has_password,
    createdAt: row.created_at,
  };
}

export function createTeamRepository(pool: Pick<Pool | PoolClient, 'query'>): TeamRepository {
  const findBy = async (userId: string, forUpdate: boolean): Promise<TeamMemberRecord | null> => {
    const result = await pool.query<TeamMemberRow>(
      `SELECT ${SELECT_COLUMNS}
       FROM users
       WHERE id = $1 AND role IN ('ADMIN', 'CO_ADMIN')
       ${forUpdate ? 'FOR UPDATE' : ''}`,
      [userId],
    );
    const row = result.rows[0];
    return row ? mapRow(row) : null;
  };

  return {
    async list() {
      const result = await pool.query<TeamMemberRow>(
        `SELECT ${SELECT_COLUMNS}
         FROM users
         WHERE role IN ('ADMIN', 'CO_ADMIN')
         -- Administrators first, then by name so the list is stable between
         -- loads; created_at breaks the tie for the unnamed older accounts.
         ORDER BY role = 'ADMIN' DESC, display_name NULLS LAST, created_at`,
      );
      return result.rows.map(mapRow);
    },

    find: (userId) => findBy(userId, false),
    lock: (userId) => findBy(userId, true),

    async createCoAdmin({ email, name }) {
      // The role is a literal, never a parameter: there is no code path through
      // which a request body can decide what role an account gets.
      const result = await pool.query<{ id: string }>(
        `INSERT INTO users (email, display_name, role) VALUES ($1, $2, 'CO_ADMIN') RETURNING id`,
        [email, name],
      );
      const id = result.rows[0]?.id;
      if (id === undefined) {
        throw new Error('Failed to create the co-administrator user row');
      }
      return id;
    },

    async setActive(userId, isActive) {
      await pool.query(
        `UPDATE users SET is_active = $2 WHERE id = $1 AND role IN ('ADMIN', 'CO_ADMIN')`,
        [userId, isActive],
      );
    },

    async countActiveAdmins() {
      const result = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM users WHERE role = 'ADMIN' AND is_active`,
      );
      return Number(result.rows[0]?.count ?? '0');
    },
  };
}
