import type { AccountTokenPurpose } from '@course-reg/shared';
import { ACCOUNT_TOKEN_PURPOSES, isOneOf } from '@course-reg/shared';
import type { Pool, PoolClient } from 'pg';
import { RowMappingError } from './mappers.js';
import type { AccountTokenRow, OutstandingTokenRow } from './rows.js';

/** An activation or reset link as the service sees it. Never the token itself. */
export interface AccountTokenRecord {
  id: string;
  userId: string;
  purpose: AccountTokenPurpose;
  expiresAt: Date;
  consumedAt: Date | null;
}

/** The account a token belongs to, read in the same query as the token. */
export interface AccountTokenOwner {
  userId: string;
  email: string;
  isActive: boolean;
  /** Null for an account that has never had a password (still invited). */
  hasPassword: boolean;
}

export interface LockedAccountToken {
  token: AccountTokenRecord;
  owner: AccountTokenOwner;
}

export interface AccountTokenRepository {
  create(input: {
    userId: string;
    purpose: AccountTokenPurpose;
    tokenHash: string;
    expiresAt: Date;
    createdBy: string | null;
  }): Promise<string>;
  /**
   * Finds a live-or-spent token by hash and LOCKS it, together with its owner,
   * so two requests redeeming the same link cannot both succeed. Returns null
   * when no row has that hash at all.
   */
  lockByHash(tokenHash: string): Promise<LockedAccountToken | null>;
  /** Marks one token spent. Returns false when it was already consumed. */
  consume(tokenId: string): Promise<boolean>;
  /**
   * Spends every outstanding token of a user — every purpose, not just one.
   * Called when a password is set or changed, and when an invitation is
   * resent, so exactly one link is ever live.
   */
  consumeAllFor(userId: string, purpose?: AccountTokenPurpose): Promise<number>;
  /** The live token of this purpose, for "an invitation is pending until …". */
  findOutstanding(
    userId: string,
    purpose: AccountTokenPurpose,
  ): Promise<{ expiresAt: Date } | null>;
  /** Live tokens for many users at once, for the students list. */
  findOutstandingFor(userIds: readonly string[]): Promise<Map<string, Date>>;
}

function toPurpose(value: string): AccountTokenPurpose {
  if (!isOneOf(ACCOUNT_TOKEN_PURPOSES, value)) {
    throw new RowMappingError('account_tokens.purpose', value);
  }
  return value;
}

export function createAccountTokenRepository(
  client: Pick<Pool | PoolClient, 'query'>,
): AccountTokenRepository {
  return {
    async create({ userId, purpose, tokenHash, expiresAt, createdBy }) {
      const result = await client.query<{ id: string }>(
        `INSERT INTO account_tokens (user_id, purpose, token_hash, expires_at, created_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [userId, purpose, tokenHash, expiresAt, createdBy],
      );
      const id = result.rows[0]?.id;
      if (id === undefined) {
        throw new Error('Failed to create an account token');
      }
      return id;
    },

    async lockByHash(tokenHash) {
      // The token row is locked, not the user's: two people redeeming DIFFERENT
      // links for the same account is fine, the same link twice is not.
      const result = await client.query<AccountTokenRow>(
        `SELECT t.id, t.user_id, t.purpose, t.expires_at, t.consumed_at,
                u.email, u.is_active, u.password_hash IS NOT NULL AS has_password
         FROM account_tokens t
         JOIN users u ON u.id = t.user_id
         WHERE t.token_hash = $1
         FOR UPDATE OF t`,
        [tokenHash],
      );
      const row = result.rows[0];
      if (!row) {
        return null;
      }
      return {
        token: {
          id: row.id,
          userId: row.user_id,
          purpose: toPurpose(row.purpose),
          expiresAt: row.expires_at,
          consumedAt: row.consumed_at,
        },
        owner: {
          userId: row.user_id,
          email: row.email,
          isActive: row.is_active,
          hasPassword: row.has_password,
        },
      };
    },

    async consume(tokenId) {
      // The WHERE clause is the guard: a second consume changes no row.
      const result = await client.query(
        'UPDATE account_tokens SET consumed_at = now() WHERE id = $1 AND consumed_at IS NULL',
        [tokenId],
      );
      return result.rowCount === 1;
    },

    async consumeAllFor(userId, purpose) {
      const result = await client.query(
        `UPDATE account_tokens SET consumed_at = now()
         WHERE user_id = $1 AND consumed_at IS NULL
           AND ($2::text IS NULL OR purpose = $2)`,
        [userId, purpose ?? null],
      );
      return result.rowCount ?? 0;
    },

    async findOutstanding(userId, purpose) {
      const result = await client.query<{ expires_at: Date }>(
        `SELECT expires_at FROM account_tokens
         WHERE user_id = $1 AND purpose = $2 AND consumed_at IS NULL AND expires_at > now()
         ORDER BY created_at DESC
         LIMIT 1`,
        [userId, purpose],
      );
      const row = result.rows[0];
      return row ? { expiresAt: row.expires_at } : null;
    },

    async findOutstandingFor(userIds) {
      if (userIds.length === 0) {
        return new Map();
      }
      // One query for the whole page: the list must not be N+1 in its rows.
      const result = await client.query<OutstandingTokenRow>(
        `SELECT user_id, max(expires_at) AS expires_at
         FROM account_tokens
         WHERE user_id = ANY ($1::uuid[]) AND consumed_at IS NULL AND expires_at > now()
         GROUP BY user_id`,
        [[...userIds]],
      );
      return new Map(result.rows.map((row) => [row.user_id, row.expires_at]));
    },
  };
}
