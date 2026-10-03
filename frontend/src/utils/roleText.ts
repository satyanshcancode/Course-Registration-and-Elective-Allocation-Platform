import type { TeamMemberStatus, UserRole } from '@course-reg/shared';

/**
 * How a role and a staff account's status are written, in one place.
 *
 * Both `default` branches take a `never`, so adding a role or a status fails
 * to compile here until somebody decides what it is called.
 */
export function roleLabel(role: UserRole): string {
  switch (role) {
    case 'STUDENT':
      return 'Student';
    case 'ADMIN':
      return 'Administrator';
    case 'CO_ADMIN':
      return 'Co-administrator';
    default: {
      const unhandled: never = role;
      throw new Error(`Unhandled role: ${String(unhandled)}`);
    }
  }
}

/** What the role may do, for the one page where the difference is the point. */
export function roleSummary(role: UserRole): string {
  switch (role) {
    case 'STUDENT':
      return 'Ranks courses and sees their own result.';
    case 'ADMIN':
      return 'Everything, including these staff accounts.';
    case 'CO_ADMIN':
      return 'Everything except managing staff accounts.';
    default: {
      const unhandled: never = role;
      throw new Error(`Unhandled role: ${String(unhandled)}`);
    }
  }
}

export function teamStatusLabel(status: TeamMemberStatus): string {
  switch (status) {
    case 'ACTIVE':
      return 'Active';
    case 'INVITED':
      return 'Invited';
    case 'DEACTIVATED':
      return 'Deactivated';
    default: {
      const unhandled: never = status;
      throw new Error(`Unhandled team status: ${String(unhandled)}`);
    }
  }
}

/** Why an account is in that state, said plainly rather than left to a colour. */
export function teamStatusDetail(status: TeamMemberStatus): string {
  switch (status) {
    case 'ACTIVE':
      return 'Has set a password and can sign in.';
    case 'INVITED':
      return 'Invitation sent. They set their own password from the link.';
    case 'DEACTIVATED':
      return 'Cannot sign in. Their history is kept.';
    default: {
      const unhandled: never = status;
      throw new Error(`Unhandled team status: ${String(unhandled)}`);
    }
  }
}
