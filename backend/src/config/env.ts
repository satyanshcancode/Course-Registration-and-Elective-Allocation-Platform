import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { LOG_LEVELS } from '../utils/logger.js';

/** Repo-root .env, used when the backend runs directly on the host. */
const ROOT_ENV_FILE = fileURLToPath(new URL('../../../.env', import.meta.url));

export const databaseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/, error: 'must be a postgres:// URL' }),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
});

export const appEnvSchema = databaseEnvSchema.extend({
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CORS_ORIGIN: z
    .string()
    .min(1)
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    ),
  JSON_BODY_LIMIT: z.string().min(1).default('100kb'),
});

export type DatabaseEnv = z.infer<typeof databaseEnvSchema>;
export type AppEnv = z.infer<typeof appEnvSchema>;

export class EnvValidationError extends Error {
  constructor(issues: readonly z.core.$ZodIssue[]) {
    const details = issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`);
    super(`Invalid environment configuration:\n${details.join('\n')}`);
    this.name = 'EnvValidationError';
  }
}

/** Loads the repo-root .env if present. Existing variables are never overridden. */
export function loadDotEnvFile(): void {
  if (existsSync(ROOT_ENV_FILE)) {
    process.loadEnvFile(ROOT_ENV_FILE);
  }
}

/**
 * Validates environment variables against a schema and throws a readable
 * error listing every problem, so the process fails fast at startup.
 */
export function parseEnv<Schema extends z.ZodType>(
  schema: Schema,
  source: NodeJS.ProcessEnv,
): z.infer<Schema> {
  const result = schema.safeParse(source);
  if (!result.success) {
    throw new EnvValidationError(result.error.issues);
  }
  return result.data;
}

export function loadEnv<Schema extends z.ZodType>(schema: Schema): z.infer<Schema> {
  loadDotEnvFile();
  return parseEnv(schema, process.env);
}
