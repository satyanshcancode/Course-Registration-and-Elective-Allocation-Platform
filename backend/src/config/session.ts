import type { CookieOptions } from 'express';

/** Name of the httpOnly cookie carrying the signed session JWT. */
export const SESSION_COOKIE_NAME = 'cr_session';

/** Sessions (JWT expiry and cookie lifetime) last 8 hours. */
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

/** Cost factor for bcrypt; the seed data uses the same value. */
export const PASSWORD_HASH_ROUNDS = 10;

/**
 * httpOnly: invisible to JavaScript, so XSS cannot steal it.
 * SameSite=Strict: never sent on cross-site requests (first CSRF defence).
 * path=/api: only sent to the API, not with static assets.
 */
export function sessionCookieOptions(secure: boolean): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure,
    path: '/api',
  };
}

/** Reads one cookie from a raw Cookie header without trusting its format. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) {
    return undefined;
  }
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator > 0 && part.slice(0, separator).trim() === name) {
      const value = part.slice(separator + 1).trim();
      try {
        return decodeURIComponent(value);
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}
