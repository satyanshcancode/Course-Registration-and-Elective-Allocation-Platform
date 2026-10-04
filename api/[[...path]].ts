/**
 * The whole Express API as one Vercel serverless function.
 *
 * An Express app is already a `(req, res)` handler, so this file is the same
 * `createApp` factory the Docker server and every integration test use, plus
 * the wiring that `server.ts` does. The backend is NOT forked: a rule that
 * changed here would otherwise have to be kept true in two places.
 *
 * **The filename is an optional catch-all on purpose.** `api/index.ts` would
 * match only `/api`, and routing `/api/*` to it with a rewrite makes the path
 * the function sees depend on how Vercel rewrites it. `[[...path]]` matches
 * `/api` and everything under it by filesystem routing alone, so `req.url` is
 * the real request path and `createApp`'s `/api` mount behaves exactly as it
 * does locally.
 *
 * Everything at module scope runs once per cold start and is reused by every
 * invocation that instance serves, which is the only reason a connection pool
 * is worth keeping here. It is deliberately tiny — see
 * `backend/src/database/pool.ts` for why one instance must not hold ten
 * connections.
 */
import { createApp } from '../backend/dist/app.js';
import { appEnvSchema, loadEnv } from '../backend/dist/config/env.js';
import { createServices } from '../backend/dist/container.js';
import { createPool } from '../backend/dist/database/pool.js';
import { createMailer } from '../backend/dist/mail/createMailer.js';

const env = loadEnv(appEnvSchema);

const pool = createPool(env.DATABASE_URL, {
  max: env.DATABASE_POOL_MAX,
  ssl: env.DATABASE_SSL,
});

const mailer = createMailer({
  smtpHost: env.SMTP_HOST,
  smtpPort: env.SMTP_PORT,
  smtpSecure: env.SMTP_SECURE,
  smtpUser: env.SMTP_USER,
  smtpPassword: env.SMTP_PASSWORD,
  mailFrom: env.MAIL_FROM,
  mailFromName: env.MAIL_FROM_NAME,
});

const app = createApp({
  corsOrigins: env.CORS_ORIGIN,
  jsonBodyLimit: env.JSON_BODY_LIMIT,
  csvBodyLimit: env.CSV_BODY_LIMIT,
  cookieSecure: env.COOKIE_SECURE,
  trustProxyHops: env.TRUST_PROXY_HOPS,
  services: createServices(pool, {
    jwtSecret: env.JWT_SECRET,
    appBaseUrl: env.APP_BASE_URL,
    mailer,
  }),
});

// No app.listen and no pool.end: Vercel owns the server, and the pool has to
// outlive the request so the next invocation on this instance reuses it.
export default app;
