import type { UserRole } from '@course-reg/shared';
import type { LoginLocationState, LoginNotice } from '../types/auth';

const HOME_PATHS: Record<UserRole, string> = {
  STUDENT: '/student',
  ADMIN: '/admin',
};

export function homePathFor(role: UserRole): string {
  return HOME_PATHS[role];
}

/** Only same-app paths: blocks open redirects like "//evil.example". */
function isInternalPath(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/\\');
}

/**
 * Where to go after signing in: back to the page the user asked for if it
 * belongs to their role's area, otherwise their own home.
 */
export function postLoginPath(role: UserRole, from: string | undefined): string {
  const home = homePathFor(role);
  if (from && isInternalPath(from) && (from === home || from.startsWith(`${home}/`))) {
    return from;
  }
  return home;
}

function isLoginNotice(value: unknown): value is LoginNotice {
  return value === 'session-expired' || value === 'signed-out';
}

/** Router state is untyped (`unknown`); keep only well-formed fields. */
export function readLoginLocationState(state: unknown): LoginLocationState {
  if (typeof state !== 'object' || state === null) {
    return {};
  }
  const result: LoginLocationState = {};
  if ('from' in state && typeof state.from === 'string') {
    result.from = state.from;
  }
  if ('notice' in state && isLoginNotice(state.notice)) {
    result.notice = state.notice;
  }
  return result;
}
