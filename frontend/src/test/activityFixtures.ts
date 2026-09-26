import type {
  HistoryEvent,
  HistoryEventDetail,
  HistoryPage,
  NotificationItem,
  NotificationPage,
  StudentStatus,
} from '@course-reg/shared';
import { fallWindow, SERVER_TIME } from './catalogueFixtures';

let nextId = 0;

/** One timeline event. `at` defaults to a fixed afternoon, so days are stable. */
export function historyEvent(
  detail: HistoryEventDetail,
  overrides: Partial<Omit<HistoryEvent, 'detail'>> = {},
): HistoryEvent {
  nextId += 1;
  return {
    id: String(nextId),
    at: '2026-09-21T10:30:00.000Z',
    course: { code: 'CS401', name: 'Artificial Intelligence' },
    detail,
    ...overrides,
  };
}

export function historyPage(overrides: Partial<HistoryPage> = {}): HistoryPage {
  return {
    events: [],
    nextCursor: null,
    courses: [{ code: 'CS401', name: 'Artificial Intelligence' }],
    types: ['ALLOCATED', 'SUBMITTED'],
    serverTime: SERVER_TIME,
    ...overrides,
  };
}

export const studentStatus: StudentStatus = {
  window: { ...fallWindow, status: 'ALLOCATED' },
  submission: {
    status: 'SUBMITTED',
    reference: 'REF-3F9A2C71',
    submittedAt: '2026-09-20T09:00:00.000Z',
    courseCodes: ['CS401', 'CS402'],
  },
  held: {
    course: { code: 'CS401', name: 'Artificial Intelligence' },
    source: 'ALLOCATION',
    origin: 'ALLOCATION',
    preferenceRank: 1,
    enrolledAt: '2026-09-21T10:30:00.000Z',
  },
  waiting: [],
  addDrop: { opensAt: null, closesAt: null, open: false, closedReason: 'Add/drop is not open.' },
  serverTime: SERVER_TIME,
};

export function notification(overrides: Partial<NotificationItem> = {}): NotificationItem {
  nextId += 1;
  return {
    id: `00000000-0000-4000-8000-${String(nextId).padStart(12, '0')}`,
    type: 'ALLOCATION_RESULT',
    title: 'You have a seat in CS401 Artificial Intelligence',
    body: 'Your first choice was granted.',
    readAt: null,
    createdAt: '2026-09-21T10:30:00.000Z',
    ...overrides,
  };
}

export function notificationPage(overrides: Partial<NotificationPage> = {}): NotificationPage {
  return { items: [], nextCursor: null, unread: 0, serverTime: SERVER_TIME, ...overrides };
}
