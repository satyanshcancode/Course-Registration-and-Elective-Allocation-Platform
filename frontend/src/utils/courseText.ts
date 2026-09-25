/** Plain-language wording for catalogue data: reasons, statuses, demand and the window. */
import type { MyCourseStatus, RegistrationWindowSummary } from '@course-reg/shared';
import { formatDateTime, formatRelative } from './formatDate';
import { formatDemandRatio } from './formatSeats';

/** Short status wording for tags and table cells: "Choice 2 · draft", "Waitlisted · #7". */
export function describeMyStatus(status: MyCourseStatus): string {
  switch (status.code) {
    case 'NOT_SELECTED':
      return 'Not selected';
    case 'IN_DRAFT_CART':
      return `Choice ${status.rank} · draft`;
    case 'SUBMITTED':
      return `Choice ${status.rank} · submitted`;
    case 'ENROLLED':
      return 'Enrolled';
    case 'WAITLISTED':
      return `Waitlisted · #${status.position}`;
    case 'NOT_ALLOCATED':
      return `Choice ${status.rank} · not allocated`;
  }
}

/** "114 requests · 5.7×", "1 request · 0.1×", "No requests yet". */
export function describeDemand(demand: number, capacity: number): string {
  if (demand === 0) {
    return 'No requests yet';
  }
  const requests = `${demand} ${demand === 1 ? 'request' : 'requests'}`;
  return capacity > 0 ? `${requests} · ${formatDemandRatio(demand, capacity)}` : requests;
}

/** More requests than seats. */
export function isOversubscribed(demand: number, capacity: number): boolean {
  return demand > capacity;
}

/**
 * Where the window stands, relative to `now` (the server's clock, so a wrong
 * device clock can't mislead): "Opens in 2 days · Mon 21 Sep, 10:00".
 */
export function describeWindow(window: RegistrationWindowSummary, now: Date): string {
  const starts = new Date(window.startsAt);
  const ends = new Date(window.endsAt);
  switch (window.status) {
    case 'DRAFT':
      return starts > now
        ? `Opens ${formatRelative(starts, now)} · ${formatDateTime(starts)}`
        : 'Opening soon';
    case 'OPEN':
      return ends > now
        ? `Open · closes ${formatRelative(ends, now)} · ${formatDateTime(ends)}`
        : 'Open · closing now';
    case 'CLOSED':
      return `Closed ${formatDateTime(ends)} · allocation pending`;
    case 'ALLOCATED':
      return 'Allocation complete · results published';
  }
}

/** "just now", "8s ago", "3 min ago": for the live seats indicator. */
export function formatUpdatedAgo(updatedAt: Date, now: Date): string {
  const seconds = Math.max(0, Math.round((now.getTime() - updatedAt.getTime()) / 1000));
  if (seconds < 3) {
    return 'just now';
  }
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  return `${Math.floor(seconds / 60)} min ago`;
}
