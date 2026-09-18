/**
 * CLI: `npm run seed`. Resets every application table and loads the
 * deterministic demo data set (safe to run repeatedly).
 */
import { logger } from '../../utils/logger.js';
import { runSeedCommand } from './runSeedCommand.js';
import { seedDatabase } from './seedDatabase.js';

runSeedCommand('Seed', (pool) => seedDatabase(pool, { logger }));
