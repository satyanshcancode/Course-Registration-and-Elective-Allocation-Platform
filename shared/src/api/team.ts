/**
 * The registrar's own accounts: administrators and co-administrators.
 *
 * Only an ADMIN ever sees or calls any of this. A CO_ADMIN is refused by the
 * server on every endpoint here, which is the whole difference between the two
 * roles; the hidden navigation item is a convenience, never the control.
 */
import type { AdminRole } from '../domain/enums.js';

/** Where a staff account stands, in one value rather than two booleans. */
export const TEAM_MEMBER_STATUSES = ['ACTIVE', 'INVITED', 'DEACTIVATED'] as const;
export type TeamMemberStatus = (typeof TEAM_MEMBER_STATUSES)[number];

export interface TeamMember {
  id: string;
  email: string;
  /** Null for accounts created before staff names were recorded. */
  name: string | null;
  role: AdminRole;
  status: TeamMemberStatus;
  createdAt: string;
  /** True when this row is the signed-in administrator. */
  isSelf: boolean;
}

export interface TeamList {
  members: TeamMember[];
  /**
   * How many ADMIN accounts are still active. The page uses it to explain why
   * the last one cannot be deactivated; the server enforces the rule itself.
   */
  activeAdmins: number;
}

export interface InviteCoAdminRequest {
  name: string;
  email: string;
}

/** POST /api/admin/team responds with the new row and the refreshed list. */
export interface InviteCoAdminResult {
  member: TeamMember;
  team: TeamList;
}

export interface SetTeamMemberActiveRequest {
  /** Recorded on the audit row. */
  reason?: string;
}
