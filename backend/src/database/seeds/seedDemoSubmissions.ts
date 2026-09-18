/**
 * CLI: `npm run seed:demo-submissions`. Opens the Fall 2026 window and records
 * ~150 preference submissions (100+ ranking Artificial Intelligence first).
 * Run `npm run seed` first; re-running replaces the previous demo submissions.
 */
import { logger } from '../../utils/logger.js';
import { seedDemoSubmissions } from './demoSubmissions.js';
import { runSeedCommand } from './runSeedCommand.js';

runSeedCommand('Demo submissions', (pool) => seedDemoSubmissions(pool, { logger }));
