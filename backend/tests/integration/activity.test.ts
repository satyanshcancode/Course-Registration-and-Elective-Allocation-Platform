/**
 * The student's own record, end to end: where they stand at each stage of a
 * window, the timeline that got them there, and their notifications.
 *
 * The world is deliberately the same shape as `waitlist.test.ts`, because it
 * is the one that produces every interesting stage from real actions rather
 * than from inserted rows:
 *
 *   AI401 (1 seat)   CS402 (1 seat)   DS403 (5 seats)
 *   Ava  sem 8  ranks AI401, CS402   -> AI401 (her 1st choice)
 *   Bo   sem 5  ranks AI401, CS402   -> CS402 (his 2nd), waiting for AI401
 *   Cai  sem 8  never submitted      -> nothing at all
 *
 * Withdrawing Ava promotes Bo into AI401 and frees CS402; Cai then adds DS403
 * during add/drop and swaps it for CS402. That single line covers allocated,
 * waitlisted, promoted, added and swapped without a single hand-written row.
 */
import {
  HISTORY_EVENT_TYPES,
  type HistoryEvent,
  type HistoryPage,
  type NotificationPage,
  type NotificationReadResult,
  type StudentStatus,
} from '@course-reg/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { action, buildAddDropWorld, type AddDropWorld } from './addDropWorld.js';
import {
  addPreference,
  createCourse,
  createDepartment,
  createDraftSubmission,
  createOffering,
  createProgram,
  createStudent,
  createWindow,
  markSubmitted,
  setWindowStatus,
} from './fixtures.js';
import { buildApp, dataOf, sessionFor } from './http.js';
import { getTestPool } from './testDatabase.js';

const app = () => buildApp();

function get(path: string, cookie: string): request.Test {
  return request(app()).get(path).set('Cookie', cookie);
}

const statusOf = async (cookie: string): Promise<StudentStatus> =>
  dataOf(await get('/api/students/me/status', cookie).expect(200)) as StudentStatus;

const historyOf = async (cookie: string, query = ''): Promise<HistoryPage> =>
  dataOf(await get(`/api/students/me/history${query}`, cookie).expect(200)) as HistoryPage;

const inboxOf = async (cookie: string, query = ''): Promise<NotificationPage> =>
  dataOf(
    await get(`/api/students/me/notifications${query}`, cookie).expect(200),
  ) as NotificationPage;

const kinds = (page: HistoryPage): string[] => page.events.map((event) => event.detail.type);

/** The one event of this type, so a test can assert on its facts. */
function only<T extends HistoryEvent['detail']['type']>(
  page: HistoryPage,
  type: T,
): Extract<HistoryEvent['detail'], { type: T }> {
  const found = page.events.filter((event) => event.detail.type === type);
  expect(found).toHaveLength(1);
  const detail = found[0]?.detail;
  if (detail?.type !== type) {
    throw new Error(`expected exactly one ${type} event`);
  }
  return detail as Extract<HistoryEvent['detail'], { type: T }>;
}

interface Cast extends AddDropWorld {
  ava: string;
  bo: string;
  cai: string;
}

async function buildWorld(): Promise<Cast> {
  const world = await buildAddDropWorld({
    courses: [
      { code: 'AI401', capacity: 1 },
      { code: 'CS402', capacity: 1 },
      { code: 'DS403', capacity: 5 },
    ],
    students: [
      { name: 'Ava', semester: 8, ranked: ['AI401', 'CS402'] },
      { name: 'Bo', semester: 5, ranked: ['AI401', 'CS402'] },
      { name: 'Cai', semester: 8, ranked: [] },
    ],
  });
  const [ava = '', bo = '', cai = ''] = world.cookies;
  return { ...world, ava, bo, cai };
}

/** The enrollment id of a student's ACTIVE seat, for the withdraw endpoint. */
async function activeEnrollment(studentIndex: number, world: Cast): Promise<string> {
  const result = await getTestPool().query<{ id: string }>(
    `SELECT id FROM enrollments WHERE student_id = $1 AND status = 'ACTIVE'`,
    [world.studentIds[studentIndex]],
  );
  const id = result.rows[0]?.id;
  if (!id) {
    throw new Error('expected an active enrollment');
  }
  return id;
}

/** Withdraws Ava's seat, which promotes Bo and frees CS402 in one transaction. */
async function withdrawAva(world: Cast): Promise<void> {
  await request(app())
    .post(`/api/admin/enrollments/${await activeEnrollment(0, world)}/withdraw`)
    .set('Cookie', world.adminCookie)
    .send({ reason: 'Left the programme' })
    .expect(200);
}

// ---------------------------------------------------------------------------
// Status, stage by stage
// ---------------------------------------------------------------------------

describe('GET /api/students/me/status', () => {
  it('says there is nothing to report when no window exists', async () => {
    const pool = getTestPool();
    const department = await createDepartment(pool, { code: 'CSE', name: 'Computer Science' });
    const program = await createProgram(pool, department, {
      code: 'CSE',
      name: 'Computer Science',
    });
    const student = await createStudent(pool, program, { name: 'Dee', semester: 4 });

    const status = await statusOf(sessionFor(student, 'STUDENT'));

    expect(status).toMatchObject({ window: null, submission: null, held: null, waiting: [] });
    expect(status.addDrop.open).toBe(false);
  });

  describe('while registration is open', () => {
    async function openWorld() {
      const pool = getTestPool();
      const department = await createDepartment(pool, { code: 'CSE', name: 'Computer Science' });
      const program = await createProgram(pool, department, {
        code: 'CSE',
        name: 'Computer Science',
      });
      const windowId = await createWindow(pool, { name: 'Fall 2026' });
      const ai = await createCourse(pool, department, { code: 'AI401', name: 'AI' });
      const cs = await createCourse(pool, department, { code: 'CS402', name: 'Cloud' });
      await createOffering(pool, windowId, ai, 5);
      await createOffering(pool, windowId, cs, 5);
      await setWindowStatus(pool, windowId, 'OPEN');
      const quiet = await createStudent(pool, program, { name: 'Quiet', semester: 6 });
      const keen = await createStudent(pool, program, { name: 'Keen', semester: 6 });
      return { windowId, ai, cs, quiet, keen };
    }

    it('reports no submission for a student who has saved nothing', async () => {
      const { quiet } = await openWorld();

      const status = await statusOf(sessionFor(quiet, 'STUDENT'));

      expect(status.window?.status).toBe('OPEN');
      expect(status.submission).toBeNull();
      expect(status.held).toBeNull();
    });

    it('reports a draft as a draft, with no receipt to quote yet', async () => {
      const { windowId, ai, cs, keen } = await openWorld();
      const pool = getTestPool();
      const submission = await createDraftSubmission(pool, keen, windowId);
      await addPreference(pool, submission, windowId, ai, 1);
      await addPreference(pool, submission, windowId, cs, 2);

      const status = await statusOf(sessionFor(keen, 'STUDENT'));

      expect(status.submission).toEqual({
        status: 'DRAFT',
        reference: null,
        submittedAt: null,
        courseCodes: ['AI401', 'CS402'],
      });
    });

    it('reports a submission with its reference, time and courses in rank order', async () => {
      const { windowId, ai, cs, keen } = await openWorld();
      const pool = getTestPool();
      const submission = await createDraftSubmission(pool, keen, windowId);
      // Saved out of order on purpose: the reply must be in RANK order.
      await addPreference(pool, submission, windowId, cs, 2);
      await addPreference(pool, submission, windowId, ai, 1);
      await markSubmitted(pool, submission, randomUUID());

      const status = await statusOf(sessionFor(keen, 'STUDENT'));

      expect(status.submission?.status).toBe('SUBMITTED');
      expect(status.submission?.reference).toMatch(/^REF-[0-9A-F]{8}$/);
      expect(status.submission?.submittedAt).not.toBeNull();
      expect(status.submission?.courseCodes).toEqual(['AI401', 'CS402']);
    });
  });

  it('names the seat allocation gave, and how it was obtained', async () => {
    const world = await buildWorld();

    const status = await statusOf(world.ava);

    expect(status.held).toMatchObject({
      course: { code: 'AI401' },
      source: 'ALLOCATION',
      origin: 'ALLOCATION',
      preferenceRank: 1,
    });
    expect(status.waiting).toEqual([]);
    expect(status.addDrop.open).toBe(true);
  });

  it('reports a live waitlist position beside the seat actually held', async () => {
    const world = await buildWorld();

    const status = await statusOf(world.bo);

    expect(status.held).toMatchObject({ course: { code: 'CS402' }, preferenceRank: 2 });
    expect(status.waiting).toHaveLength(1);
    expect(status.waiting[0]).toMatchObject({
      course: { code: 'AI401' },
      preferenceRank: 1,
      status: 'WAITING',
      position: 1,
    });
  });

  it('reports a promotion as a promotion once a seat frees up', async () => {
    const world = await buildWorld();

    await withdrawAva(world);
    const status = await statusOf(world.bo);

    expect(status.held).toMatchObject({
      course: { code: 'AI401' },
      source: 'WAITLIST_PROMOTION',
      origin: 'PROMOTION',
      preferenceRank: 1,
    });
    // Promoted into their first choice, so there is nothing left to wait for.
    expect(status.waiting).toEqual([]);
  });

  it('tells an add from a swap, which the enrollment row cannot', async () => {
    const world = await buildWorld();
    await withdrawAva(world); // frees CS402, which Cai will swap into

    await action(world.cai, '/add', { code: 'DS403' }).expect(200);
    expect(await statusOf(world.cai)).toMatchObject({
      held: { course: { code: 'DS403' }, source: 'ADD', origin: 'ADD', preferenceRank: null },
    });

    await action(world.cai, '/swap', { fromCode: 'DS403', toCode: 'CS402' }).expect(200);
    expect(await statusOf(world.cai)).toMatchObject({
      held: { course: { code: 'CS402' }, source: 'ADD', origin: 'SWAP' },
    });
  });

  it('reports nothing held for a student who never submitted', async () => {
    const world = await buildWorld();

    const status = await statusOf(world.cai);

    expect(status).toMatchObject({ submission: null, held: null, waiting: [] });
    expect(status.window?.status).toBe('ALLOCATED');
  });
});

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

describe('GET /api/students/me/history', () => {
  it('publishes the facts of each event, newest first', async () => {
    const world = await buildWorld();
    await withdrawAva(world);

    const page = await historyOf(world.bo);

    // Allocated CS402 + waitlisted AI401, then the upgrade into AI401.
    expect(kinds(page)).toEqual(['PROMOTED', 'DROPPED', 'ALLOCATED']);
    expect(only(page, 'ALLOCATED')).toMatchObject({
      rank: 2,
      waitlisted: [{ rank: 1, position: 1 }],
    });
    expect(only(page, 'PROMOTED')).toMatchObject({
      rank: 1,
      fromPosition: 1,
      releasedCourse: 'CS402',
    });
    // The seat let go to take the better one, named as an upgrade.
    expect(only(page, 'DROPPED')).toMatchObject({ reason: 'UPGRADED', upgradedTo: 'AI401' });
  });

  it('records a real submission, with its reference and its courses', async () => {
    const pool = getTestPool();
    const department = await createDepartment(pool, { code: 'CSE', name: 'Computer Science' });
    const program = await createProgram(pool, department, {
      code: 'CSE',
      name: 'Computer Science',
    });
    const windowId = await createWindow(pool, { name: 'Fall 2026' });
    const ai = await createCourse(pool, department, { code: 'AI401', name: 'AI' });
    const cs = await createCourse(pool, department, { code: 'CS402', name: 'Cloud' });
    await createOffering(pool, windowId, ai, 5);
    await createOffering(pool, windowId, cs, 5);
    await setWindowStatus(pool, windowId, 'OPEN');
    const student = await createStudent(pool, program, { name: 'Keen', semester: 6 });
    const cookie = sessionFor(student, 'STUDENT');

    // Through the real endpoints, so the row is the one a student produces.
    await request(app())
      .put('/api/preferences')
      .set('Cookie', cookie)
      .send({ courseCodes: ['AI401', 'CS402'] })
      .expect(200);
    await request(app())
      .post('/api/registration/submit')
      .set('Cookie', cookie)
      .set('Idempotency-Key', randomUUID())
      .send({ courseCodes: ['AI401', 'CS402'] })
      .expect(200);

    const page = await historyOf(cookie);
    expect(kinds(page)).toEqual(['SUBMITTED']);
    expect(only(page, 'SUBMITTED')).toMatchObject({
      courseCodes: ['AI401', 'CS402'],
      reference: (await statusOf(cookie)).submission?.reference,
    });
    // A submission is about five courses at once, so it names none of them.
    expect(page.events[0]?.course).toBeNull();
    // And it was confirmed in the inbox.
    expect((await inboxOf(cookie)).items.map((item) => item.type)).toEqual(['SYSTEM']);
  });

  it('names the course each event is about', async () => {
    const world = await buildWorld();
    await withdrawAva(world);

    const page = await historyOf(world.bo);
    const byType = new Map(page.events.map((event) => [event.detail.type, event.course]));

    expect(byType.get('PROMOTED')).toEqual({ code: 'AI401', name: 'Course AI401' });
    expect(byType.get('DROPPED')).toEqual({ code: 'CS402', name: 'Course CS402' });
    // The run gave Bo a seat in CS402, so that is the course it is about.
    expect(byType.get('ALLOCATED')).toEqual({ code: 'CS402', name: 'Course CS402' });
  });

  it('records an administrator’s withdrawal with the reason they gave', async () => {
    const world = await buildWorld();
    await withdrawAva(world);

    expect(only(await historyOf(world.ava), 'DROPPED')).toMatchObject({
      reason: 'ADMIN_WITHDRAWAL',
      note: 'Left the programme',
    });
  });

  it('records what add/drop did, including the queues it ended', async () => {
    const world = await buildWorld();
    await withdrawAva(world);
    // AI401 is full (Bo was just promoted into it), so this is a real queue;
    // CS402 is the seat Bo let go to take it.
    await action(world.cai, '/waitlist/join', { code: 'AI401' }).expect(200);
    await action(world.cai, '/add', { code: 'CS402' }).expect(200);

    const page = await historyOf(world.cai);

    expect(kinds(page)).toEqual(['ADDED', 'WAITLIST_REMOVED', 'WAITLIST_JOINED']);
    expect(only(page, 'WAITLIST_JOINED')).toMatchObject({ position: 1, courseWasFull: false });
    // Taking a seat ends a queue they only joined in add/drop: there is no
    // rank behind it, so "would AI401 be an upgrade?" has no answer.
    expect(only(page, 'ADDED')).toMatchObject({ source: 'ADD', endedQueues: ['AI401'] });
    expect(only(page, 'WAITLIST_REMOVED')).toMatchObject({ reason: 'SEAT_ELSEWHERE' });
  });

  it('walks older events one page at a time through the cursor', async () => {
    const world = await buildWorld();
    await withdrawAva(world);

    const first = await historyOf(world.bo, '?limit=2');
    expect(kinds(first)).toEqual(['PROMOTED', 'DROPPED']);
    expect(first.nextCursor).not.toBeNull();

    const second = await historyOf(world.bo, `?limit=2&cursor=${first.nextCursor ?? ''}`);
    expect(kinds(second)).toEqual(['ALLOCATED']);
    // The list is exhausted, so there is nothing to ask for next.
    expect(second.nextCursor).toBeNull();
  });

  it('filters by event type and by course, without narrowing the filters', async () => {
    const world = await buildWorld();
    await withdrawAva(world);

    const dropped = await historyOf(world.bo, '?type=DROPPED');
    expect(kinds(dropped)).toEqual(['DROPPED']);

    const aboutAi = await historyOf(world.bo, '?course=AI401');
    expect(kinds(aboutAi)).toEqual(['PROMOTED']);

    // The choices on offer describe the whole timeline, not the filtered view:
    // picking one filter must not remove the others.
    expect(dropped.types).toEqual(['ALLOCATED', 'DROPPED', 'PROMOTED']);
    expect(dropped.courses.map((course) => course.code)).toEqual(['AI401', 'CS402']);
  });

  it('refuses a filter or cursor that is not a real one', async () => {
    const world = await buildWorld();

    await get('/api/students/me/history?type=NONSENSE', world.bo).expect(400);
    await get('/api/students/me/history?cursor=not-a-number', world.bo).expect(400);
    await get('/api/students/me/history?limit=0', world.bo).expect(400);
  });

  it('is empty, with no filters to offer, for a student who has done nothing', async () => {
    const world = await buildWorld();

    expect(await historyOf(world.cai)).toEqual(
      expect.objectContaining({ events: [], nextCursor: null, courses: [], types: [] }),
    );
  });
});

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

describe('the student’s notifications', () => {
  it('lists the caller’s own messages, newest first, with the unread count', async () => {
    const world = await buildWorld();
    await withdrawAva(world);

    const inbox = await inboxOf(world.bo);

    expect(inbox.items.map((item) => item.type)).toEqual([
      'WAITLIST_PROMOTION',
      'ALLOCATION_RESULT',
    ]);
    expect(inbox.items.every((item) => item.readAt === null)).toBe(true);
    expect(inbox.unread).toBe(2);
  });

  it('marks one as read and reports the count that is left', async () => {
    const world = await buildWorld();
    const inbox = await inboxOf(world.ava);
    const first = inbox.items[0];

    const result = dataOf(
      await request(app())
        .patch(`/api/students/me/notifications/${first?.id ?? ''}/read`)
        .set('Cookie', world.ava)
        .set('Origin', 'http://localhost:5173')
        .expect(200),
    ) as NotificationReadResult;

    expect(result).toEqual({ marked: 1, unread: inbox.unread - 1 });
    expect((await inboxOf(world.ava, '?filter=unread')).items).toHaveLength(inbox.unread - 1);
    expect((await inboxOf(world.ava, '?filter=all')).items).toHaveLength(inbox.items.length);
  });

  it('treats marking an already-read message as read as a no-op', async () => {
    const world = await buildWorld();
    const first = (await inboxOf(world.ava)).items[0];
    const path = `/api/students/me/notifications/${first?.id ?? ''}/read`;

    await request(app()).patch(path).set('Cookie', world.ava).expect(200);
    const again = dataOf(
      await request(app()).patch(path).set('Cookie', world.ava).expect(200),
    ) as NotificationReadResult;

    expect(again.marked).toBe(0);
  });

  it('marks everything read at once', async () => {
    const world = await buildWorld();
    await withdrawAva(world);

    const result = dataOf(
      await request(app())
        .post('/api/students/me/notifications/read-all')
        .set('Cookie', world.bo)
        .expect(200),
    ) as NotificationReadResult;

    expect(result).toEqual({ marked: 2, unread: 0 });
    expect((await inboxOf(world.bo, '?filter=unread')).items).toEqual([]);
    expect((await inboxOf(world.bo)).items.every((item) => item.readAt !== null)).toBe(true);
  });

  it('walks older messages through the cursor', async () => {
    const world = await buildWorld();
    await withdrawAva(world);
    const all = await inboxOf(world.bo);

    const page = dataOf(
      await get(
        `/api/students/me/notifications?cursor=${encodeURIComponent(
          `${all.items[0]?.createdAt ?? ''}|${all.items[0]?.id ?? ''}`,
        )}`,
        world.bo,
      ).expect(200),
    ) as NotificationPage;

    expect(page.items.map((item) => item.id)).toEqual(all.items.slice(1).map((item) => item.id));
  });

  it('refuses a cursor that is not a real one', async () => {
    const world = await buildWorld();

    await get('/api/students/me/notifications?cursor=yesterday', world.bo).expect(400);
    await get('/api/students/me/notifications?filter=important', world.bo).expect(400);
  });
});

// ---------------------------------------------------------------------------
// One student's record is one student's record
// ---------------------------------------------------------------------------

describe('a student can only reach their own record', () => {
  it('returns only the caller’s own events', async () => {
    const world = await buildWorld();
    await withdrawAva(world);

    const bo = await historyOf(world.bo);
    const ava = await historyOf(world.ava);

    // Every row in the database belongs to one of them; neither sees both.
    expect(kinds(bo)).toEqual(['PROMOTED', 'DROPPED', 'ALLOCATED']);
    expect(kinds(ava)).toEqual(['DROPPED', 'ALLOCATED']);
    expect(bo.events.map((event) => event.id)).not.toContain(ava.events[0]?.id);
  });

  it('refuses to mark another student’s notification as read', async () => {
    const world = await buildWorld();
    const avasFirst = (await inboxOf(world.ava)).items[0];

    await request(app())
      .patch(`/api/students/me/notifications/${avasFirst?.id ?? ''}/read`)
      .set('Cookie', world.bo)
      .expect(404);

    // And it is still unread for the student it belongs to.
    expect((await inboxOf(world.ava)).items[0]?.readAt).toBeNull();
  });

  it('marks read only the caller’s messages, never everybody’s', async () => {
    const world = await buildWorld();

    await request(app())
      .post('/api/students/me/notifications/read-all')
      .set('Cookie', world.bo)
      .expect(200);

    expect((await inboxOf(world.ava)).unread).toBeGreaterThan(0);
  });

  it('needs a session, and a student one', async () => {
    const world = await buildWorld();

    await request(app()).get('/api/students/me/history').expect(401);
    await request(app()).get('/api/students/me/status').expect(401);
    await get('/api/students/me/history', world.adminCookie).expect(403);
    await get('/api/students/me/notifications', world.adminCookie).expect(403);
    await request(app())
      .post('/api/students/me/notifications/read-all')
      .set('Cookie', world.adminCookie)
      .expect(403);
  });

  it('refuses a cross-origin write', async () => {
    const world = await buildWorld();

    await request(app())
      .post('/api/students/me/notifications/read-all')
      .set('Cookie', world.bo)
      .set('Origin', 'https://evil.example')
      .expect(403);
  });
});

// ---------------------------------------------------------------------------
// The union and the database agree
// ---------------------------------------------------------------------------

describe('the published event types', () => {
  it('are exactly the ones the database allows', async () => {
    const result = await getTestPool().query<{ definition: string }>(
      `SELECT pg_get_constraintdef(oid) AS definition
       FROM pg_constraint
       WHERE conname = 'registration_history_event_type_check'`,
    );
    const definition = result.rows[0]?.definition ?? '';

    for (const type of HISTORY_EVENT_TYPES) {
      expect(definition).toContain(`'${type}'`);
    }
  });
});
