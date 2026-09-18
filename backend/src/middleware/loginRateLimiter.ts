import type { ApiFailure } from '@course-reg/shared';
import type { RequestHandler, Response } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { sendFailure } from '../utils/apiResponse.js';

export interface RateLimitOptions {
  windowMs: number;
  limit: number;
}

export const DEFAULT_LOGIN_RATE_LIMIT: RateLimitOptions = {
  windowMs: 15 * 60 * 1000,
  limit: 10,
};

/** The e-mail part of the key, normalised like the login lookup. */
function emailKey(body: unknown): string {
  if (typeof body === 'object' && body !== null && 'email' in body) {
    const email: unknown = body.email;
    if (typeof email === 'string') {
      return email.trim().toLowerCase().slice(0, 254);
    }
  }
  return '';
}

/**
 * Limits failed sign-in attempts per IP + e-mail. Keying on both stops one
 * client from hammering an account without letting one shared IP (a campus
 * network) lock out everyone. Successful sign-ins are not counted.
 */
export function createLoginRateLimiter(options: RateLimitOptions): RequestHandler {
  const minutes = Math.ceil(options.windowMs / 60_000);
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? 'unknown')}|${emailKey(req.body)}`,
    handler: (_req, res: Response<ApiFailure>) => {
      sendFailure(
        res,
        429,
        `Too many sign-in attempts. Please wait ${minutes} minutes and try again.`,
      );
    },
  });
}
