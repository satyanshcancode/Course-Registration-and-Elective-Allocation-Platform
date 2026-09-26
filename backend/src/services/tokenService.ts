import { isOneOf, USER_ROLES, type UserRole } from '@course-reg/shared';
import jwt from 'jsonwebtoken';

/** The only claims a session token carries (plus iat/exp). */
export interface SessionClaims {
  userId: string;
  role: UserRole;
}

/** The claims as read back, including the issued-at the signer set. */
export interface VerifiedSessionClaims extends SessionClaims {
  /** Whole seconds since the epoch, as JWT defines `iat`. */
  issuedAt: number;
}

export interface SignOptions {
  /**
   * The `iat` to stamp, in whole seconds. Passed when a token must not fall
   * below the account's password-change cut-off (see accountTokens.ts);
   * omitted, the current time is used.
   */
  issuedAt?: number;
}

export interface TokenService {
  sign(claims: SessionClaims, options?: SignOptions): string;
  /** Returns the claims, or null for any invalid, tampered or expired token. */
  verify(token: string): VerifiedSessionClaims | null;
}

const ALGORITHM = 'HS256';

export function createTokenService(options: { secret: string; ttlSeconds: number }): TokenService {
  const { secret, ttlSeconds } = options;

  return {
    sign({ userId, role }, options = {}) {
      // An `iat` in the payload is respected by jsonwebtoken, and `exp` is then
      // computed relative to it, so the session still lasts its full TTL.
      return jwt.sign(
        { role, ...(options.issuedAt !== undefined && { iat: options.issuedAt }) },
        secret,
        { algorithm: ALGORITHM, subject: userId, expiresIn: ttlSeconds },
      );
    },

    verify(token) {
      try {
        // Pinning the algorithm blocks "alg: none" and algorithm-confusion tokens.
        const payload = jwt.verify(token, secret, { algorithms: [ALGORITHM] });
        if (typeof payload === 'string' || typeof payload.sub !== 'string') {
          return null;
        }
        // `iat` is what makes a password change able to end a session, so a
        // token without one is not usable: it cannot be placed in time.
        if (typeof payload.iat !== 'number') {
          return null;
        }
        const role: unknown = payload.role;
        return isOneOf(USER_ROLES, role)
          ? { userId: payload.sub, role, issuedAt: payload.iat }
          : null;
      } catch {
        return null;
      }
    },
  };
}
