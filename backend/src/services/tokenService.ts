import { isOneOf, USER_ROLES, type UserRole } from '@course-reg/shared';
import jwt from 'jsonwebtoken';

/** The only claims a session token carries (plus iat/exp). */
export interface SessionClaims {
  userId: string;
  role: UserRole;
}

export interface TokenService {
  sign(claims: SessionClaims): string;
  /** Returns the claims, or null for any invalid, tampered or expired token. */
  verify(token: string): SessionClaims | null;
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
        const role: unknown = payload.role;
        return isOneOf(USER_ROLES, role) ? { userId: payload.sub, role } : null;
      } catch {
        return null;
      }
    },
  };
}
