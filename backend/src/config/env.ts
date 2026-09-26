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

/** The placeholder shipped in .env.example; production refuses to start with it. */
export const EXAMPLE_JWT_SECRET = 'replace-with-a-long-random-secret-of-at-least-32-characters';

export const JWT_SECRET_MIN_LENGTH = 32;

/** How long an activation or password-reset link stays usable. */
export const ACCOUNT_TOKEN_TTL_HOURS = 48;

/**
 * An optional setting, where an EMPTY value means "not set".
 *
 * Docker Compose cannot leave a variable out: `SMTP_USER: ${SMTP_USER:-}`
 * passes an empty string when .env has no SMTP_USER. Without this, `min(1)`
 * rejected it and the production stack refused to start against a mail server
 * that simply needs no credentials — which is exactly what .env.example
 * describes as "set both or neither".
 */
const optionalSetting = () =>
  z.preprocess((value) => (value === '' ? undefined : value), z.string().min(1).optional());

export const appEnvSchema = databaseEnvSchema
  .extend({
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
    JWT_SECRET: z
      .string()
      .min(JWT_SECRET_MIN_LENGTH, `must be at least ${JWT_SECRET_MIN_LENGTH} characters`),
    /** Defaults to true in production; set "false" only for plain-HTTP deployments. */
    COOKIE_SECURE: z
      .enum(['true', 'false'])
      .optional()
      .transform((value) => (value === undefined ? undefined : value === 'true')),
    /** Bodies of CSV imports, which are far larger than any other request. */
    CSV_BODY_LIMIT: z.string().min(1).default('2mb'),
    /**
     * Where the app is reached from a browser. Activation and reset links are
     * built from it, so it must be the address students actually open — not the
     * container's own hostname.
     */
    APP_BASE_URL: z.url({ protocol: /^https?$/ }).default('http://localhost:5173'),
    /** Unset means "no mail server": development logs the e-mails instead. */
    SMTP_HOST: optionalSetting(),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
    /** TLS from the first byte (port 465); 587 upgrades with STARTTLS instead. */
    SMTP_SECURE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    SMTP_USER: optionalSetting(),
    SMTP_PASSWORD: optionalSetting(),
    MAIL_FROM: z.string().min(1).default('Course Registration <no-reply@university.edu>'),
  })
  .superRefine((env, context) => {
    if (env.NODE_ENV === 'production' && env.JWT_SECRET === EXAMPLE_JWT_SECRET) {
      context.addIssue({
        code: 'custom',
        path: ['JWT_SECRET'],
        message: 'is still the example value from .env.example; generate a real secret',
      });
    }
    // Without a mail server nobody can activate an account or reset a password,
    // and the fallback mailer writes the link to the log — so production must
    // not start without one rather than fail quietly later.
    if (env.NODE_ENV === 'production' && env.SMTP_HOST === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['SMTP_HOST'],
        message:
          'is required in production: invitation and password-reset e-mails cannot be sent without it',
      });
    }
    // Half a credential is a misconfiguration, not a passwordless server.
    if ((env.SMTP_USER === undefined) !== (env.SMTP_PASSWORD === undefined)) {
      context.addIssue({
        code: 'custom',
        path: [env.SMTP_USER === undefined ? 'SMTP_USER' : 'SMTP_PASSWORD'],
        message: 'SMTP_USER and SMTP_PASSWORD must be set together, or both left unset',
      });
    }
  })
  .transform(({ COOKIE_SECURE, APP_BASE_URL, ...env }) => ({
    ...env,
    COOKIE_SECURE: COOKIE_SECURE ?? env.NODE_ENV === 'production',
    // Normalised without a trailing slash, so links are built by concatenation.
    APP_BASE_URL: APP_BASE_URL.replace(/\/+$/, ''),
  }));

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
