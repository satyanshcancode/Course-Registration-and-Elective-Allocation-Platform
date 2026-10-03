import type {
  InviteCoAdminResult,
  TeamList,
  TeamMember,
  TeamMemberStatus,
} from '@course-reg/shared';
import type { PoolClient } from 'pg';
import type { AuditLogRepository } from '../repositories/auditLogRepository.js';
import type { TeamMemberRecord, TeamRepository } from '../repositories/teamRepository.js';
import type { TransactionPool } from '../database/transaction.js';
import { withTransaction } from '../database/transaction.js';
import { AppError } from '../utils/appError.js';
import { isConstraintViolation, PG_ERROR } from '../database/pgErrors.js';
import type { AccountService } from './accountService.js';

/** Audit actions this service records. */
export const TEAM_ACTIONS = {
  INVITED: 'CO_ADMIN_INVITED',
  DEACTIVATED: 'STAFF_DEACTIVATED',
  REACTIVATED: 'STAFF_REACTIVATED',
} as const;

/**
 * Staff accounts.
 *
 * **Every method here is reachable only behind `requireAdminManager`**, so the
 * service does not re-check the caller's role: the route is the single place
 * that decision is made, and duplicating it would create two answers that could
 * drift apart. What the service DOES enforce is the rules a role check cannot
 * express: a co-admin is the only thing that can be created, the last active
 * administrator cannot be deactivated, and a student is out of reach entirely
 * because every query is scoped to the two staff roles.
 */
export interface TeamService {
  list(viewerUserId: string): Promise<TeamList>;
  invite(
    actorUserId: string,
    request: { name: string; email: string },
  ): Promise<InviteCoAdminResult>;
  /** Mints a fresh activation link for an invited co-admin and sends it. */
  resendInvitation(actorUserId: string, memberId: string): Promise<TeamList>;
  setActive(
    actorUserId: string,
    memberId: string,
    isActive: boolean,
    reason?: string,
  ): Promise<TeamList>;
}

export interface TeamServiceDependencies {
  pool: TransactionPool;
  team: TeamRepository;
  teamFor: (client: PoolClient) => TeamRepository;
  auditLogsFor: (client: PoolClient) => AuditLogRepository;
  accountService: AccountService;
}

function statusOf(record: TeamMemberRecord): TeamMemberStatus {
  if (!record.isActive) {
    return 'DEACTIVATED';
  }
  // Active with no password means the invitation has been sent and not yet
  // redeemed — the same meaning "invited" has for a student.
  return record.hasPassword ? 'ACTIVE' : 'INVITED';
}

function toMember(record: TeamMemberRecord, viewerUserId: string): TeamMember {
  return {
    id: record.id,
    email: record.email,
    name: record.name,
    role: record.role,
    status: statusOf(record),
    createdAt: record.createdAt.toISOString(),
    isSelf: record.id === viewerUserId,
  };
}

/** How a member is referred to in a message: their name, or their address. */
function labelOf(record: TeamMemberRecord): string {
  return record.name ?? record.email;
}

export function createTeamService({
  pool,
  team,
  teamFor,
  auditLogsFor,
  accountService,
}: TeamServiceDependencies): TeamService {
  async function reload(viewerUserId: string): Promise<TeamList> {
    const [records, activeAdmins] = await Promise.all([team.list(), team.countActiveAdmins()]);
    return { members: records.map((record) => toMember(record, viewerUserId)), activeAdmins };
  }

  /** 404 rather than 403 for a student's id: it is not a staff account at all. */
  async function requireMember(memberId: string): Promise<TeamMemberRecord> {
    const record = await team.find(memberId);
    if (!record) {
      throw AppError.notFound('No administrator or co-administrator with that id.');
    }
    return record;
  }

  return {
    list: (viewerUserId) => reload(viewerUserId),

    async invite(actorUserId, { name, email }) {
      let memberId: string;
      try {
        memberId = await withTransaction(pool, async (client) => {
          const repository = teamFor(client);
          const id = await repository.createCoAdmin({ email, name });
          await auditLogsFor(client).record({
            actorUserId,
            action: TEAM_ACTIONS.INVITED,
            entityType: 'user',
            entityId: id,
            newValue: { email, name, role: 'CO_ADMIN' },
          });
          // Inside the transaction, like a student's invitation: if the e-mail
          // cannot be sent, the account is rolled back rather than left as a
          // co-admin nobody can reach and no administrator expects to exist.
          await accountService.invite(client, {
            userId: id,
            email,
            name,
            actorUserId,
            resent: false,
            action: TEAM_ACTIONS.INVITED,
          });
          return id;
        });
      } catch (error) {
        if (isConstraintViolation(error, PG_ERROR.UNIQUE_VIOLATION, 'users_email_key')) {
          const message = 'That e-mail address already belongs to another account.';
          throw new AppError(409, message, [{ field: 'email', message }]);
        }
        throw error;
      }

      const record = await requireMember(memberId);
      return { member: toMember(record, actorUserId), team: await reload(actorUserId) };
    },

    async resendInvitation(actorUserId, memberId) {
      const record = await requireMember(memberId);
      if (record.hasPassword) {
        throw AppError.badRequest(
          `${labelOf(record)} has already set a password. Send a password reset instead of a new invitation.`,
        );
      }
      if (!record.isActive) {
        throw AppError.badRequest(
          `${labelOf(record)}'s account is deactivated. Reactivate it before sending an invitation.`,
        );
      }

      // Minting the new link consumes the outstanding one, so the earlier
      // e-mail stops working the moment this one is sent.
      await withTransaction(pool, (client) =>
        accountService.invite(client, {
          userId: record.id,
          email: record.email,
          name: labelOf(record),
          actorUserId,
          resent: true,
          action: TEAM_ACTIONS.INVITED,
        }),
      );
      return reload(actorUserId);
    },

    async setActive(actorUserId, memberId, isActive, reason) {
      await withTransaction(pool, async (client) => {
        const repository = teamFor(client);
        // Locked first, so two administrators deactivating the last two
        // administrators at the same moment serialise instead of both reading
        // "two are active" and both succeeding.
        const record = await repository.lock(memberId);
        if (!record) {
          throw AppError.notFound('No administrator or co-administrator with that id.');
        }
        if (record.isActive === isActive) {
          throw AppError.badRequest(
            isActive
              ? `${labelOf(record)}'s account is already active.`
              : `${labelOf(record)}'s account is already deactivated.`,
          );
        }
        // The rule is about ADMIN accounts specifically: co-admins cannot
        // manage staff, so a registrar left with only co-admins could never
        // invite anyone or restore an administrator, and the installation
        // would be locked out of its own account management for good.
        if (!isActive && record.role === 'ADMIN') {
          const remaining = (await repository.countActiveAdmins()) - 1;
          if (remaining < 1) {
            throw AppError.badRequest(
              record.id === actorUserId
                ? 'You are the last active administrator. Make somebody else an administrator before deactivating your own account.'
                : 'That is the last active administrator. There must always be one.',
            );
          }
        }
        await repository.setActive(record.id, isActive);
        // Nothing clears the session explicitly: `resolveSession` re-reads
        // `is_active` from the database on every request, so a deactivated
        // member's next call is refused and their history is untouched.
        await auditLogsFor(client).record({
          actorUserId,
          action: isActive ? TEAM_ACTIONS.REACTIVATED : TEAM_ACTIONS.DEACTIVATED,
          entityType: 'user',
          entityId: record.id,
          oldValue: { isActive: record.isActive, role: record.role },
          newValue: { isActive, role: record.role },
          ...(reason !== undefined && { reason }),
        });
      });
      return reload(actorUserId);
    },
  };
}
