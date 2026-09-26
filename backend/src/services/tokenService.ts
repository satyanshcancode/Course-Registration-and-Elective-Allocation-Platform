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

export interface TokenService {
  sign(claims: SessionClaims): string;
  /** Returns the claims, or null for any invalid, tampered or expired token. */
  verify(token: string): VerifiedSessionClaims | null;
}

const ALGORITHM = 'HS256';

export function createTokenService(options: { secret: string; ttlSeconds: number }): TokenService {
  const { secret, ttlSeconds } = options;

  return {
    sign({ userId, role }) {
      return jwt.sign({ role }, secret, {
        algorithm: ALGORITHM,
        subject: userId,
        expiresIn: ttlSeconds,
      });
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
