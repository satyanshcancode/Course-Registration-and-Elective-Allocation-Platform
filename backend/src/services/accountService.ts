/**
 * The account lifecycle: invitation, activation, password reset and password
 * change.
 *
 * Three rules shape everything here.
 *
 * **Redeeming a link is one transaction.** Locking the token row, checking it,
 * writing the password and spending the token happen together, so two requests
 * carrying the same link cannot both set a password.
 *
 * **Nothing tells a stranger whether an address exists.** `requestReset`
 * answers the same way for a known and an unknown e-mail, and does the same
 * amount of work either way. Whether a token is unknown, spent or expired is
 * likewise one answer.
 *
 * **Setting a password ends every other session.** `users.setPassword` moves
 * `password_changed_at` to the database's `now()`, which `authService`
 * compares against each token's `iat`. Every outstanding link is spent at the
 * same time, so a reset e-mail cannot be used after the password has moved on.
 */
import type {
  AccountTokenPurpose,
  ActivationCheck,
  ChangePasswordRequest,
  SetPasswordRequest,
} from '@course-reg/shared';
import bcrypt from 'bcryptjs';
import type { PoolClient } from 'pg';
import { ACCOUNT_TOKEN_TTL_HOURS } from '../config/env.js';
import { PASSWORD_HASH_ROUNDS } from '../config/session.js';
import { withTransaction, type TransactionPool } from '../database/transaction.js';
import {
  invitationEmail,
  passwordChangedEmail,
  passwordResetEmail,
} from '../mail/accountEmails.js';
import type { Mailer } from '../mail/mailer.js';
import type { AccountTokenRepository } from '../repositories/accountTokenRepository.js';
import type { AuditLogRepository } from '../repositories/auditLogRepository.js';
import type { UserRepository } from '../repositories/userRepository.js';
import { AppError } from '../utils/appError.js';
import { logger } from '../utils/logger.js';
import {
  accountTokenExpiry,
  generateAccountToken,
  hashAccountToken,
  looksLikeAccountToken,
} from './accountTokens.js';
import type { AuthService, LoginResult } from './authService.js';

/** Audit actions this service records. */
export const ACCOUNT_ACTIONS = {
  INVITED: 'STUDENT_INVITED',
  ACTIVATED: 'ACCOUNT_ACTIVATED',
  PASSWORD_RESET: 'PASSWORD_RESET',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
} as const;

/**
 * The single answer of /forgot-password, whether or not the address exists.
 * Same wording, same status, same timing.
 */
export const RESET_REQUESTED_MESSAGE =
  'If that e-mail address belongs to an account, a password reset link is on its way. Check your inbox, including the spam folder.';

const UNUSABLE_LINK_MESSAGE =
  'This link is no longer usable. It may have already been used, expired, or been replaced by a newer one. Ask for a new link and try again.';

export interface AccountService {
  /**
   * Creates (or replaces) an invitation and e-mails it. Runs on the CALLER's
   * client so that creating a student and inviting them commit together.
   */
  invite(
    client: PoolClient,
    input: { userId: string; email: string; name: string; actorUserId: string; resent: boolean },
  ): Promise<void>;
  /** What the activation page shows before a password is set. */
  checkToken(token: string): Promise<ActivationCheck>;
  /** Redeems an activation link: sets the first password and signs the user in. */
  activate(request: SetPasswordRequest): Promise<LoginResult>;
  /** Redeems a reset link. Identical mechanics; a different audit action. */
  resetPassword(request: SetPasswordRequest): Promise<LoginResult>;
  /** Always resolves, and always the same way. */
  requestReset(email: string): Promise<void>;
  changePassword(userId: string, request: ChangePasswordRequest): Promise<LoginResult>;
}

export interface AccountServiceDependencies {
  pool: TransactionPool;
  users: UserRepository;
  tokens: AccountTokenRepository;
  /** Repositories bound to a transaction's client: every write here audits inside one. */
  usersFor: (client: PoolClient) => UserRepository;
  tokensFor: (client: PoolClient) => AccountTokenRepository;
  auditLogsFor: (client: PoolClient) => AuditLogRepository;
  mailer: Mailer;
  authService: AuthService;
  /** Absolute origin of the app, e.g. "http://localhost:5173". */
  appBaseUrl: string;
  passwordHashRounds?: number;
  ttlHours?: number;
}

export function createAccountService({
  pool,
  users,
  tokens,
  usersFor,
  tokensFor,
  auditLogsFor,
  mailer,
  authService,
  appBaseUrl,
  passwordHashRounds = PASSWORD_HASH_ROUNDS,
  ttlHours = ACCOUNT_TOKEN_TTL_HOURS,
}: AccountServiceDependencies): AccountService {
  const linkFor = (purpose: AccountTokenPurpose, token: string): string => {
    const path = purpose === 'ACTIVATION' ? '/activate' : '/reset-password';
    return `${appBaseUrl}${path}?token=${encodeURIComponent(token)}`;
  };

  /**
   * Mints a link for a purpose, spending any outstanding one FIRST so exactly
   * one link is ever live for an account.
   */
  async function issueLink(
    client: PoolClient,
    userId: string,
    purpose: AccountTokenPurpose,
    actorUserId: string | null,
  ): Promise<{ token: string; expiresAt: Date }> {
    const repository = tokensFor(client);
    await repository.consumeAllFor(userId, purpose);

    const token = generateAccountToken();
    // The clock is the application's here rather than the database's, because
    // the expiry is compared with now() in SQL and both sit on one host; the
    // 48-hour window makes any skew irrelevant.
    const expiresAt = accountTokenExpiry(new Date(), ttlHours);
    await repository.create({
      userId,
      purpose,
      tokenHash: hashAccountToken(token),
      expiresAt,
      createdBy: actorUserId,
    });
    return { token, expiresAt };
  }

  /**
   * The shared body of activation and reset: lock the link, judge it, write the
   * password, spend every outstanding link, audit. One transaction.
   */
  async function redeem(
    request: SetPasswordRequest,
    expected: AccountTokenPurpose,
  ): Promise<{ userId: string; email: string }> {
    if (!looksLikeAccountToken(request.token)) {
      throw AppError.badRequest(UNUSABLE_LINK_MESSAGE);
    }
    const tokenHash = hashAccountToken(request.token);
    const passwordHash = await bcrypt.hash(request.password, passwordHashRounds);

    return withTransaction(pool, async (client) => {
      const found = await tokensFor(client).lockByHash(tokenHash);
      // Unknown, wrong purpose, already spent and expired are ONE answer: a
      // guessed token learns nothing beyond "that isn't a live link".
      if (
        found?.token.purpose !== expected ||
        found.token.consumedAt !== null ||
        found.token.expiresAt.getTime() <= Date.now()
      ) {
        throw AppError.badRequest(UNUSABLE_LINK_MESSAGE);
      }
      if (!found.owner.isActive) {
        throw AppError.forbidden(
          'This account has been deactivated, so its password cannot be set. Please contact the registrar.',
        );
      }

      // Belt and braces: the row is locked, and consume() only touches a row
      // that is still unspent, so a racing redemption of the same link fails here.
      if (!(await tokensFor(client).consume(found.token.id))) {
        throw AppError.badRequest(UNUSABLE_LINK_MESSAGE);
      }
      await usersFor(client).setPassword(found.token.userId, passwordHash);
      // Any OTHER outstanding link (a reset requested while an invitation was
      // pending, say) dies with this one.
      await tokensFor(client).consumeAllFor(found.token.userId);

      await auditLogsFor(client).record({
        actorUserId: found.token.userId,
        action:
          expected === 'ACTIVATION' ? ACCOUNT_ACTIONS.ACTIVATED : ACCOUNT_ACTIONS.PASSWORD_RESET,
        entityType: 'user',
        entityId: found.token.userId,
        newValue: { email: found.owner.email, via: expected },
      });

      return { userId: found.token.userId, email: found.owner.email };
    });
  }

  /** A failure to notify must never undo a password that is already set. */
  async function notifyQuietly(send: () => Promise<void>, context: object): Promise<void> {
    try {
      await send();
    } catch (error) {
      logger.error('Failed to send an account e-mail', { ...context, error });
    }
  }

  return {
    async invite(client, { userId, email, name, actorUserId, resent }) {
      const { token, expiresAt } = await issueLink(client, userId, 'ACTIVATION', actorUserId);

      // Audited BEFORE the send, because what this row records is that a link
      // was ISSUED — which has already happened, and is the security-relevant
      // fact: it also means the previous link was just revoked. Auditing after
      // the send would leave a failed delivery with no trace of either.
      await auditLogsFor(client).record({
        actorUserId,
        action: ACCOUNT_ACTIONS.INVITED,
        entityType: 'user',
        entityId: userId,
        newValue: { email, resent, expiresAt: expiresAt.toISOString() },
      });

      // Sending inside the caller's transaction is deliberate: if the e-mail
      // cannot be sent, the throw rolls the whole creation back — the audit row
      // included — rather than leaving an account nobody can reach. The caller
      // decides whether to tolerate that (see adminStudentService's import).
      await mailer.send(
        invitationEmail({
          to: email,
          name,
          link: linkFor('ACTIVATION', token),
          expiresInHours: ttlHours,
          resent,
        }),
      );
    },

    async checkToken(token) {
      if (!looksLikeAccountToken(token)) {
        return { valid: false, reason: 'unusable' };
      }
      // A read-only check: no lock, so opening the page cannot contend with
      // somebody redeeming a link.
      const found = await tokens.findByHash(hashAccountToken(token));
      if (
        found?.token.consumedAt !== null ||
        found.token.expiresAt.getTime() <= Date.now() ||
        !found.owner.isActive
      ) {
        return { valid: false, reason: 'unusable' };
      }
      // The e-mail only: enough for the recipient to recognise the account,
      // and nothing about who they are or what they can do.
      return { valid: true, email: found.owner.email, purpose: found.token.purpose };
    },

    async activate(request) {
      const { userId } = await redeem(request, 'ACTIVATION');
      return authService.issueSession(userId);
    },

    async resetPassword(request) {
      const { userId, email } = await redeem(request, 'PASSWORD_RESET');
      await notifyQuietly(() => mailer.send(passwordChangedEmail(email)), { userId });
      return authService.issueSession(userId);
    },

    async requestReset(email) {
      const account = await users.findAccountByEmail(email);

      // Deliberately silent for an unknown address, a deactivated account and
      // one that has never been activated. The caller gets the same message
      // and the same status in every case — the whole point of the endpoint.
      if (!account || !account.isActive || !account.hasPassword) {
        logger.info('Password reset requested for an address that cannot receive one', {
          known: account !== null,
        });
        return;
      }

      try {
        await withTransaction(pool, async (client) => {
          const { token } = await issueLink(client, account.id, 'PASSWORD_RESET', null);
          await mailer.send(
            passwordResetEmail({
              to: account.email,
              link: linkFor('PASSWORD_RESET', token),
              expiresInHours: ttlHours,
            }),
          );
        });
      } catch (error) {
        // Still the same answer to the caller: a mail outage must not become a
        // way of discovering which addresses exist.
        logger.error('Failed to send a password reset e-mail', { userId: account.id, error });
      }
    },

    async changePassword(userId, request) {
      const currentHash = await users.findPasswordHash(userId);
      if (currentHash === null) {
        // Signed in without a password is not reachable: a session requires one.
        throw AppError.badRequest(
          'This account has no password to change. Use the invitation link instead.',
        );
      }
      if (!(await bcrypt.compare(request.currentPassword, currentHash))) {
        const message = 'That is not your current password.';
        throw new AppError(400, message, [{ field: 'currentPassword', message }]);
      }
      if (await bcrypt.compare(request.newPassword, currentHash)) {
        const message = 'Choose a password you have not used here before.';
        throw new AppError(400, message, [{ field: 'newPassword', message }]);
      }

      const passwordHash = await bcrypt.hash(request.newPassword, passwordHashRounds);
      const email = await withTransaction(pool, async (client) => {
        await usersFor(client).setPassword(userId, passwordHash);
        // An outstanding reset link must not survive a deliberate change.
        await tokensFor(client).consumeAllFor(userId);
        await auditLogsFor(client).record({
          actorUserId: userId,
          action: ACCOUNT_ACTIONS.PASSWORD_CHANGED,
          entityType: 'user',
          entityId: userId,
        });
        return usersFor(client).findEmail(userId);
      });

      if (email !== null) {
        await notifyQuietly(() => mailer.send(passwordChangedEmail(email)), { userId });
      }
      // Every other device is now signed out; this one gets a fresh cookie.
      return authService.issueSession(userId);
    },
  };
}

/** Exported for the tests that assert the exact wording of a dead link. */
export const UNUSABLE_LINK = UNUSABLE_LINK_MESSAGE;
