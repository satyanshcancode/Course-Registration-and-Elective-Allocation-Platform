import type { CurrentUser, LoginRequest } from '@course-reg/shared';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { PASSWORD_HASH_ROUNDS } from '../config/session.js';
import type { AuditLogRepository } from '../repositories/auditLogRepository.js';
import type { UserRepository } from '../repositories/userRepository.js';
import type { AuthContext } from '../types/auth.js';
import { AppError } from '../utils/appError.js';
import { logger } from '../utils/logger.js';
import type { TokenService } from './tokenService.js';

/** Identical for unknown e-mail and wrong password, so accounts can't be enumerated. */
export const INVALID_CREDENTIALS_MESSAGE = 'Incorrect e-mail or password.';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface LoginContext {
  ip: string | undefined;
  userAgent: string | undefined;
}

export interface LoginResult {
  user: CurrentUser;
  /** Goes into the httpOnly cookie only; never into a response body. */
  token: string;
}

export interface AuthService {
  login(credentials: LoginRequest, context: LoginContext): Promise<LoginResult>;
  /** Verifies a session token and re-checks the user in the database. */
  resolveSession(token: string): Promise<AuthContext | null>;
  getCurrentUser(userId: string): Promise<CurrentUser>;
}

interface AuthServiceDependencies {
  users: UserRepository;
  auditLogs: AuditLogRepository;
  tokens: TokenService;
}

export function createAuthService({
  users,
  auditLogs,
  tokens,
}: AuthServiceDependencies): AuthService {
  // A hash of a random password with the real cost factor. Comparing against it
  // when the e-mail is unknown makes both failure paths take the same time.
  const dummyPasswordHash = bcrypt.hash(randomUUID(), PASSWORD_HASH_ROUNDS);

  async function getCurrentUser(userId: string): Promise<CurrentUser> {
    const user = await users.findCurrentUser(userId);
    if (!user) {
      throw AppError.unauthorized();
    }
    return user;
  }

  async function recordAdminLogin(userId: string, context: LoginContext): Promise<void> {
    try {
      await auditLogs.record({
        actorUserId: userId,
        action: 'LOGIN',
        entityType: 'user',
        entityId: userId,
        newValue: { ip: context.ip ?? null, userAgent: context.userAgent ?? null },
      });
    } catch (error) {
      // Auditing must not lock administrators out; the failure is logged instead.
      logger.error('Failed to record admin login in audit log', { userId, error });
    }
  }

  return {
    async login({ email, password }, context) {
      const account = await users.findCredentialsByEmail(email);
      const hash = account?.passwordHash ?? (await dummyPasswordHash);
      const passwordMatches = await bcrypt.compare(password, hash);

      if (!account || !passwordMatches) {
        throw AppError.unauthorized(INVALID_CREDENTIALS_MESSAGE);
      }

      const user = await getCurrentUser(account.id);
      if (user.role === 'ADMIN') {
        await recordAdminLogin(user.id, context);
      }
      return { user, token: tokens.sign({ userId: user.id, role: user.role }) };
    },

    async resolveSession(token) {
      const claims = tokens.verify(token);
      if (!claims || !UUID_PATTERN.test(claims.userId)) {
        return null;
      }
      // The database is the source of truth: deleted users and changed roles
      // invalidate existing tokens immediately.
      const user = await users.findSessionUser(claims.userId);
      if (user?.role !== claims.role) {
        return null;
      }
      return user.role === 'STUDENT'
        ? { role: 'STUDENT', userId: user.id, studentId: user.id }
        : { role: 'ADMIN', userId: user.id };
    },

    getCurrentUser,
  };
}
