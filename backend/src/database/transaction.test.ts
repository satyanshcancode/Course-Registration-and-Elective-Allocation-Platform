import type { PoolClient } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { withTransaction, type TransactionPool } from './transaction.js';

/** Records the SQL sent to a fake client; optionally fails a given statement. */
function createFakePool(failOn?: string) {
  const statements: string[] = [];
  const release = vi.fn();
  const client = {
    query: vi.fn((sql: string) => {
      statements.push(sql);
      return sql === failOn ? Promise.reject(new Error(`${sql} failed`)) : Promise.resolve({});
    }),
    release,
  };
  const pool: TransactionPool = {
    // The fake implements only what withTransaction touches.
    connect: () => Promise.resolve(client as unknown as PoolClient),
  } as TransactionPool;
  return { pool, client, statements, release };
}

describe('withTransaction', () => {
  it('commits and returns the result when the work succeeds', async () => {
    const { pool, statements, release } = createFakePool();

    const result = await withTransaction(pool, async (client) => {
      await client.query('INSERT 1');
      return 'done';
    });

    expect(result).toBe('done');
    expect(statements).toEqual(['BEGIN', 'INSERT 1', 'COMMIT']);
    expect(release).toHaveBeenCalledWith(undefined);
  });

  it('rolls back and re-throws when the work fails', async () => {
    const { pool, statements, release } = createFakePool();

    await expect(
      withTransaction(pool, async (client) => {
        await client.query('INSERT 1');
        throw new Error('business rule violated');
      }),
    ).rejects.toThrow('business rule violated');

    expect(statements).toEqual(['BEGIN', 'INSERT 1', 'ROLLBACK']);
    expect(release).toHaveBeenCalledWith(undefined);
  });

  it('rolls back when COMMIT fails', async () => {
    const { pool, statements } = createFakePool('COMMIT');

    await expect(withTransaction(pool, () => Promise.resolve(1))).rejects.toThrow('COMMIT failed');
    expect(statements).toEqual(['BEGIN', 'COMMIT', 'ROLLBACK']);
  });

  it('destroys the connection when ROLLBACK fails', async () => {
    const { pool, release } = createFakePool('ROLLBACK');

    await expect(
      withTransaction(pool, () => Promise.reject(new Error('work failed'))),
    ).rejects.toThrow('work failed');
    expect(release).toHaveBeenCalledWith(expect.any(Error));
  });
});
