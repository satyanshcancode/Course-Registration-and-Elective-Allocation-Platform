/** Per-file setup for integration tests: clean tables before every test. */
import { afterAll, beforeEach } from 'vitest';
import { truncateApplicationTables } from '../../src/database/truncate.js';
import { closeTestPool, getTestPool } from './testDatabase.js';

beforeEach(async () => {
  await truncateApplicationTables(getTestPool());
});

afterAll(async () => {
  await closeTestPool();
});
