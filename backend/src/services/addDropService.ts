/**
 * Add/drop: the five student actions that move a real seat.
 *
 * Submitting a cart recorded an intention. These take and release seats while a
 * hundred other students are doing the same thing, so each one is ONE
 * transaction that:
 *
 *   1. locks the window FOR SHARE, so an admin cannot move the period from
 *      under it, while students never block each other on it;
 *   2. takes `pg_advisory_xact_lock(hashtext(window_id))` — the SAME lock
 *      promotion uses, which is what serialises a seat being taken against a
 *      seat being given away, and what stops two actions taking two course
 *      locks in opposite orders (docs/CONCURRENCY.md);
 *   3. claims the idempotency key, so a retry replays instead of acting twice;
 *   4. locks the offering row FOR UPDATE and counts its free seats THERE, so
 *      the number it decides on cannot be stale;
 *   5. asks the pure rules in `addDropRules.ts` what to do, and does it;
 *   6. calls `waitlistPromotionService.processFreedSeats` on its OWN client for
 *      every seat it freed, so an action and the promotions it caused commit
 *      together.
 *
 * Any throw rolls all of it back, which is what makes "the swap happens, or the
 * student keeps the seat they had" true rather than hopeful.
 */
import type {
  AddDropAction,
  AddDropOutcome,
  AddDropProblem,
  AddDropResult,
  AddDropView,
  AddRequest,
  CourseRef,
  DropRequest,
  EligibilityResult,
  HistoryEventType,
  PromotionSummary,
  StudentWaitlistEntry,
  SwapRequest,
  WaitlistRequest,
} from '@course-reg/shared';
import type { PoolClient } from 'pg';
import { withTransaction, type TransactionPool } from '../database/transaction.js';
import type { AddDropRequestRepository } from '../repositories/addDropRequestRepository.js';
import type { CourseCatalogueRepository } from '../repositories/courseCatalogueRepository.js';
import type { NotificationRepository } from '../repositories/notificationRepository.js';
import type { RegistrationHistoryRepository } from '../repositories/registrationHistoryRepository.js';
import type { RegistrationWindowRepository } from '../repositories/registrationWindowRepository.js';
import type { StudentRepository } from '../repositories/studentRepository.js';
import type { StudentWaitlistRow, WaitlistRepository } from '../repositories/waitlistRepository.js';
import type { WindowRecord } from '../types/catalogue.js';
import { AppError } from '../utils/appError.js';
import { injectFault } from '../utils/faultInjection.js';
import {
  canAddDropNow,
  decideAdd,
  decideDrop,
  decideJoinWaitlist,
  decideLeaveWaitlist,
  decideSwap,
  describeAddDropPeriod,
  type CourseState,
} from './addDropRules.js';
import { toEligibilityCourse } from './catalogueRules.js';
import { evaluateEligibility } from './eligibilityRules.js';
import type { WaitlistPromotionService } from './waitlistPromotionService.js';

/** Fault point a test can arm, to prove an action rolls back whole. */
export const FAULT_MID_ADD_DROP = 'addDrop.afterSeatMoved';

export interface AddDropService {
  /** The caller's own page. Never another student's. */
  getView(studentId: string): Promise<AddDropView>;
  drop(studentId: string, key: string, request: DropRequest): Promise<AddDropResult>;
  add(studentId: string, key: string, request: AddRequest): Promise<AddDropResult>;
  swap(studentId: string, key: string, request: SwapRequest): Promise<AddDropResult>;
  joinWaitlist(studentId: string, key: string, request: WaitlistRequest): Promise<AddDropResult>;
  leaveWaitlist(studentId: string, key: string, request: WaitlistRequest): Promise<AddDropResult>;
}

export interface AddDropServiceDependencies {
  pool: TransactionPool;
  windows: RegistrationWindowRepository;
  catalogue: CourseCatalogueRepository;
  students: StudentRepository;
  waitlists: WaitlistRepository;
  promotions: WaitlistPromotionService;
  /**
   * Repositories bound to the transaction's own client. Everything read inside
   * the transaction MUST use these: asking the pool for a second client while
   * holding one deadlocks as soon as the pool is saturated, which under a
   * hundred simultaneous adds is immediately (docs/CONCURRENCY.md).
   */
  requestsFor: (client: PoolClient) => AddDropRequestRepository;
  waitlistsFor: (client: PoolClient) => WaitlistRepository;
  catalogueFor: (client: PoolClient) => CourseCatalogueRepository;
  studentsFor: (client: PoolClient) => StudentRepository;
  historyFor: (client: PoolClient) => RegistrationHistoryRepository;
  notificationsFor: (client: PoolClient) => NotificationRepository;
  now?: () => Date;
}

/** An AppError carrying AddDropProblem[] in `details`, read with readAddDropProblems. */
export function addDropProblemError(problems: readonly AddDropProblem[], status = 409): AppError {
  return new AppError(status, problemMessage(problems), undefined, [...problems]);
}

/** The one-line summary; the page reads `details` for the per-course wording. */
function problemMessage(problems: readonly AddDropProblem[]): string {
  const first = problems[0];
  if (!first) {
    return 'That change was refused.';
  }
  switch (first.type) {
    case 'PERIOD_CLOSED':
    case 'NOT_ALLOCATED':
      return first.reason;
    case 'SEAT_TAKEN':
      return 'That seat was just taken.';
    case 'UNKNOWN_COURSE':
      return `There is no course with code ${first.code}.`;
    case 'NOT_OFFERED':
      return `${first.code} is not offered in this registration window.`;
    case 'NOT_ELIGIBLE':
      return `You are not eligible for ${first.code}.`;
    case 'ALREADY_ENROLLED':
      return `You already hold a seat in ${first.code}.`;
    case 'ALREADY_HOLDS_SEAT':
      return `You hold a seat in ${first.heldCode}. Swap it for ${first.code} instead.`;
    case 'NO_SEAT_HELD':
      return 'You do not hold a seat to change.';
    case 'NOT_THE_HELD_SEAT':
      return `You hold a seat in ${first.heldCode}, not ${first.code}. Reload the page.`;
    case 'SAME_COURSE':
      return `${first.code} is the course you already hold.`;
    case 'ALREADY_WAITING':
      return `You are already on the waitlist for ${first.code}.`;
    case 'NOT_WAITING':
      return `You are not on the waitlist for ${first.code}.`;
    case 'REQUEST_CHANGED':
      return 'That request key was used for a different change. Reload the page and try again.';
  }
}

/** One offered course, its seats read under FOR UPDATE, ready for the rules. */
interface LockedCourse {
  state: CourseState;
  /** Null when the window does not offer the code at all. */
  courseId: string | null;
  name: string;
}

export function createAddDropService({
  pool,
  windows,
  catalogue,
  students,
  waitlists,
  promotions,
  requestsFor,
  waitlistsFor,
  catalogueFor,
  studentsFor,
  historyFor,
  notificationsFor,
  now = () => new Date(),
}: AddDropServiceDependencies): AddDropService {
  /** Eligibility for every offered course, re-derived from the student's rows. */
  async function eligibilityByCode(
    studentId: string,
    windowId: string,
    courses: CourseCatalogueRepository,
    profiles: StudentRepository,
  ) {
    // Sequential, not Promise.all: inside a transaction both repositories are
    // bound to the SAME client, and one pg client cannot run two queries at
    // once (it is deprecated today and an error from pg@9).
    const offerings = await courses.listOfferings(windowId);
    const facts = await profiles.findEligibilityFacts(studentId);
    if (!facts) {
      throw AppError.notFound('Student profile not found.');
    }
    return {
      offerings,
      eligibility: new Map<string, EligibilityResult>(
        offerings.map((offering) => [
          offering.code,
          evaluateEligibility(facts, toEligibilityCourse(offering)),
        ]),
      ),
    };
  }

  // -------------------------------------------------------------------------
  // The page
  // -------------------------------------------------------------------------

  async function buildView(studentId: string): Promise<AddDropView> {
    const serverTime = now().toISOString();
    const window = await windows.findCurrent();
    if (!window) {
      return {
        window: null,
        period: describeAddDropPeriod(null, now()),
        held: null,
        available: [],
        full: [],
        waiting: [],
        serverTime,
      };
    }

    const [{ offerings, eligibility }, held, entries] = await Promise.all([
      eligibilityByCode(studentId, window.id, catalogue, students),
      waitlists.findHeldSeat(window.id, studentId),
      waitlists.listStudentEntries(window.id, studentId),
    ]);

    const waiting = entries.filter((entry) => entry.status === 'WAITING');
    const waitingByCode = new Map(waiting.map((entry) => [entry.code, entry]));
    const ranks = new Map(entries.map((entry) => [entry.code, entry.preferenceRank]));

    // Only courses the student could actually take are options: an ineligible
    // one is not a choice, and the catalogue already explains why.
    const options = offerings
      .filter((offering) => eligibility.get(offering.code)?.eligible === true)
      .filter((offering) => offering.code !== held?.code)
      .map((offering) => ({
        code: offering.code,
        name: offering.name,
        credits: offering.credits,
        department: offering.department,
        capacity: offering.capacity,
        allocated: offering.allocated,
        available: Math.max(0, offering.capacity - offering.allocated),
        preferenceRank: ranks.get(offering.code) ?? null,
        waiting: waitingByCode.get(offering.code)?.waiting ?? 0,
      }));

    return {
      window: window.summary,
      period: describeAddDropPeriod(toRuleWindow(window), now()),
      held: held
        ? {
            course: { code: held.code, name: held.name },
            credits: offerings.find((offering) => offering.code === held.code)?.credits ?? 0,
            source: held.source,
            preferenceRank: held.preferenceRank,
            enrolledAt: held.enrolledAt.toISOString(),
          }
        : null,
      available: options.filter((course) => course.available > 0),
      full: options.filter((course) => course.available === 0),
      waiting: waiting.map(toWaitingEntry),
      serverTime,
    };
  }

  // -------------------------------------------------------------------------
  // The transaction every action shares
  // -------------------------------------------------------------------------

  /** The locked state an action's body works from, plus its own repositories. */
  interface ActionContext {
    windowId: string;
    /** The seat held right now; null for a student with an empty timetable. */
    held: Awaited<ReturnType<WaitlistRepository['findHeldSeat']>>;
    waitlists: WaitlistRepository;
    history: RegistrationHistoryRepository;
    notifications: NotificationRepository;
    lockCourse(code: string): Promise<LockedCourse>;
    /** Offers every seat this action freed to the people waiting for it. */
    promote(courseIds: readonly string[]): Promise<PromotionSummary>;
  }

  /**
   * Runs one action inside the transaction described at the top of this file.
   * The body only decides and writes; the locks, the period check and the
   * idempotency replay live here, once, for all five.
   */
  async function act(
    studentId: string,
    key: string,
    action: AddDropAction,
    request: object,
    body: (context: ActionContext) => Promise<AddDropOutcome>,
  ): Promise<AddDropResult> {
    const current = await windows.findCurrent();
    if (!current) {
      throw addDropProblemError([
        { type: 'NOT_ALLOCATED', reason: 'There is no registration window yet.' },
      ]);
    }

    const acted = await withTransaction(pool, async (client) => {
      const repository = waitlistsFor(client);

      // 1. The window, FOR SHARE. The period is re-read here, inside the
      //    transaction, not trusted from the request or the page.
      const gate = canAddDropNow(await repository.lockWindowForShare(current.id), now());
      if (!gate.allowed) {
        throw addDropProblemError([gate.problem]);
      }

      // 2. The per-window advisory lock, taken BEFORE any offering row, so a
      //    seat being taken and a seat being given away cannot interleave.
      await repository.lockWindowForPromotion(current.id);

      // 3. The idempotency key. A retry of this attempt replays the first
      //    answer; the same key for a different request is refused.
      const claim = await requestsFor(client).claim(studentId, current.id, key, action, request);
      if (claim.kind === 'replay') {
        return { outcome: claim.result, replayed: true };
      }
      if (claim.kind === 'conflict') {
        throw addDropProblemError([{ type: 'REQUEST_CHANGED' }]);
      }

      const { eligibility } = await eligibilityByCode(
        studentId,
        current.id,
        catalogueFor(client),
        studentsFor(client),
      );

      const context: ActionContext = {
        windowId: current.id,
        held: await repository.findHeldSeat(current.id, studentId),
        waitlists: repository,
        history: historyFor(client),
        notifications: notificationsFor(client),

        async lockCourse(code) {
          const offering = await repository.findOfferingByCode(current.id, code);
          if (!offering) {
            // Either no such course, or a real course this window does not
            // offer; the student's message differs, so tell them apart.
            const existing = await catalogueFor(client).findExistingCodes([code]);
            return {
              courseId: null,
              name: code,
              state: {
                code,
                exists: existing.has(code),
                seats: null,
                eligibility: { eligible: true },
                waiting: false,
              },
            };
          }
          // FOR UPDATE: the free-seat count decided on below cannot move.
          const seats = await repository.lockOffering(current.id, offering.courseId);
          const entry = await repository.findWaitingEntry(current.id, studentId, offering.courseId);
          return {
            courseId: offering.courseId,
            name: offering.name,
            state: {
              code,
              exists: true,
              seats: seats ? { capacity: seats.capacity, allocated: seats.allocated } : null,
              eligibility: eligibility.get(code) ?? { eligible: true },
              waiting: entry !== null,
            },
          };
        },

        promote: (courseIds) =>
          promotions.processFreedSeats(client, {
            windowId: current.id,
            courseIds: [...courseIds],
            // The student did this themselves; no admin acted.
            actorUserId: null,
          }),
      };

      const outcome = await body(context);
      // Test-only: proves the seat move, the trail and any promotion it caused
      // roll back together.
      injectFault(FAULT_MID_ADD_DROP);
      await requestsFor(client).recordResult(key, outcome);
      return { outcome, replayed: false };
    });

    // The refreshed page comes with every reply, so nothing needs a second
    // request to see what changed.
    return { result: acted.outcome, view: await buildView(studentId), replayed: acted.replayed };
  }

  /** The student's timeline row and the message they are sent, together. */
  async function writeTrail(
    context: ActionContext,
    studentId: string,
    entry: {
      eventType: HistoryEventType;
      courseId: string;
      details: unknown;
      title: string;
      body: string;
    },
  ): Promise<void> {
    await context.history.record({
      studentId,
      windowId: context.windowId,
      eventType: entry.eventType,
      courseId: entry.courseId,
      details: entry.details,
    });
    await context.notifications.sendMany([
      { userId: studentId, type: 'ENROLLMENT_CHANGE', title: entry.title, body: entry.body },
    ]);
  }

  /** Every queue the student is still waiting on, left with STUDENT_LEFT. */
  async function leaveEveryQueue(context: ActionContext, studentId: string): Promise<CourseRef[]> {
    const entries = await context.waitlists.listStudentEntries(context.windowId, studentId);
    const left: CourseRef[] = [];
    for (const entry of entries.filter((candidate) => candidate.status === 'WAITING')) {
      const waiting = await context.waitlists.findWaitingEntry(
        context.windowId,
        studentId,
        entry.courseId,
      );
      if (!waiting) {
        continue;
      }
      await context.waitlists.markRemoved(waiting.entryId, 'STUDENT_LEFT');
      await context.history.record({
        studentId,
        windowId: context.windowId,
        eventType: 'WAITLIST_LEFT',
        courseId: entry.courseId,
        details: { reason: 'STUDENT_LEFT' },
      });
      left.push({ code: entry.code, name: entry.name });
    }
    return left;
  }

  /**
   * Taking a seat ends every queue place the student joined during add/drop.
   *
   * Promotion can only offer such a place to somebody holding nothing — there
   * is no rank behind it, so "would this be an upgrade?" has no answer — which
   * means leaving them WAITING would be leaving a promise that can never be
   * kept. Places they RANKED are untouched: a ranked course still beats a seat
   * taken here, and promotion knows it.
   */
  async function endUnhonourableQueues(
    context: ActionContext,
    studentId: string,
  ): Promise<CourseRef[]> {
    const removed = await context.waitlists.removeUnrankedEntries(
      context.windowId,
      studentId,
      'SEAT_ELSEWHERE',
    );
    for (const entry of removed) {
      await context.history.record({
        studentId,
        windowId: context.windowId,
        eventType: 'WAITLIST_REMOVED',
        courseId: entry.courseId,
        details: { reason: 'SEAT_ELSEWHERE' },
      });
    }
    return removed.map((entry) => ({ code: entry.code, name: entry.name }));
  }

  /** Writes the queue entry and the trail, and reports the place in line. */
  async function joinQueue(
    context: ActionContext,
    studentId: string,
    course: CourseRef & { courseId: string },
    courseWasFull: boolean,
  ): Promise<AddDropOutcome> {
    await context.waitlists.joinWaitlist(context.windowId, studentId, course.courseId);
    // The live place, computed from the entries still WAITING — positions are
    // never renumbered, so the stored one is not what to show.
    const entries = await context.waitlists.listStudentEntries(context.windowId, studentId);
    const entry = entries.find((candidate) => candidate.code === course.code);
    const position = entry?.position ?? 1;
    const waiting = entry?.waiting ?? 1;

    await writeTrail(context, studentId, {
      eventType: 'WAITLIST_JOINED',
      courseId: course.courseId,
      details: { position, courseWasFull },
      title: `You joined the waitlist for ${course.code} ${course.name}`,
      body: `You are ${position} of ${waiting} waiting. A seat is offered to you automatically if one frees up.`,
    });
    return {
      outcome: 'WAITLISTED',
      course: { code: course.code, name: course.name },
      position,
      waiting,
      courseWasFull,
    };
  }

  return {
    getView: buildView,

    drop(studentId, key, request) {
      return act(studentId, key, 'DROP', request, async (context) => {
        const decision = decideDrop(request.code, context.held);
        if (decision.kind === 'refused') {
          throw addDropProblemError(decision.problems);
        }
        // decideDrop already refused a missing seat; this narrows the type.
        const held = context.held;
        if (!held) {
          throw addDropProblemError([{ type: 'NO_SEAT_HELD' }]);
        }

        await context.waitlists.dropEnrollment(held.enrollmentId, 'STUDENT_DROP');
        const leftWaitlists = request.leaveWaitlists
          ? await leaveEveryQueue(context, studentId)
          : [];
        await writeTrail(context, studentId, {
          eventType: 'DROPPED',
          courseId: held.courseId,
          details: {
            reason: 'STUDENT_DROP',
            leftWaitlists: leftWaitlists.map((course) => course.code),
          },
          title: `You dropped ${held.code} ${held.name}`,
          body: 'Your seat has been offered to the next eligible student on the waitlist.',
        });

        // Same transaction: the seat is never visible as "free" while somebody
        // eligible is waiting for it.
        return {
          outcome: 'DROPPED',
          course: { code: held.code, name: held.name },
          dropReason: 'STUDENT_DROP',
          promotions: await context.promote([held.courseId]),
          leftWaitlists,
        };
      });
    },

    add(studentId, key, request) {
      return act(studentId, key, 'ADD', request, async (context) => {
        const course = await context.lockCourse(request.code);
        const decision = decideAdd(course.state, context.held, request.waitlistIfFull === true);
        if (decision.kind === 'refused') {
          throw addDropProblemError(decision.problems);
        }
        const courseId = course.courseId;
        if (courseId === null) {
          throw addDropProblemError([{ type: 'NOT_OFFERED', code: request.code }]);
        }
        const ref = { code: request.code, name: course.name, courseId };

        if (decision.kind === 'join-waitlist') {
          return joinQueue(context, studentId, ref, true);
        }
        await context.waitlists.enroll(context.windowId, studentId, courseId, 'ADD');
        const ended = await endUnhonourableQueues(context, studentId);
        await writeTrail(context, studentId, {
          eventType: 'ADDED',
          courseId,
          details: { source: 'ADD', endedQueues: ended.map((course) => course.code) },
          title: `You added ${ref.code} ${ref.name}`,
          body: 'The seat is yours. You can drop or swap it until add/drop closes.',
        });
        return { outcome: 'ADDED', course: { code: ref.code, name: ref.name } };
      });
    },

    swap(studentId, key, request) {
      return act(studentId, key, 'SWAP', request, async (context) => {
        // Both offerings are locked before anything is written. Under the
        // window's advisory lock no other action holds an offering row, so the
        // order these two are taken in cannot deadlock against anybody.
        const from = await context.lockCourse(request.fromCode);
        const to = await context.lockCourse(request.toCode);
        const decision = decideSwap(from.state, to.state, context.held);
        if (decision.kind === 'refused') {
          throw addDropProblemError(decision.problems);
        }
        const held = context.held;
        const toCourseId = to.courseId;
        if (!held || toCourseId === null) {
          throw addDropProblemError([{ type: 'NOT_OFFERED', code: request.toCode }]);
        }

        // Release, then take. One ACTIVE seat per student per window is a
        // unique index, so the other order is rejected; and a throw anywhere
        // here rolls BOTH statements back, which is exactly what "the student
        // keeps their old seat" means.
        await context.waitlists.dropEnrollment(held.enrollmentId, 'SWAPPED');
        await context.waitlists.enroll(context.windowId, studentId, toCourseId, 'ADD');
        const ended = await endUnhonourableQueues(context, studentId);
        await writeTrail(context, studentId, {
          eventType: 'SWAPPED',
          courseId: toCourseId,
          details: { from: held.code, to: request.toCode, endedQueues: ended.map((c) => c.code) },
          title: `You swapped ${held.code} for ${request.toCode} ${to.name}`,
          body: `Your ${held.code} seat has been offered to the next eligible student waiting for it.`,
        });

        return {
          outcome: 'SWAPPED',
          from: { code: held.code, name: held.name },
          to: { code: request.toCode, name: to.name },
          promotions: await context.promote([held.courseId]),
        };
      });
    },

    joinWaitlist(studentId, key, request) {
      return act(studentId, key, 'WAITLIST_JOIN', request, async (context) => {
        const course = await context.lockCourse(request.code);
        const decision = decideJoinWaitlist(course.state, context.held);
        if (decision.kind === 'refused') {
          throw addDropProblemError(decision.problems);
        }
        const courseId = course.courseId;
        if (courseId === null) {
          throw addDropProblemError([{ type: 'NOT_OFFERED', code: request.code }]);
        }
        const ref = { code: request.code, name: course.name, courseId };

        if (decision.kind === 'take-seat') {
          await context.waitlists.enroll(context.windowId, studentId, courseId, 'ADD');
          const ended = await endUnhonourableQueues(context, studentId);
          await writeTrail(context, studentId, {
            eventType: 'ADDED',
            courseId,
            details: {
              source: 'ADD',
              seatFreedBeforeJoining: true,
              endedQueues: ended.map((course) => course.code),
            },
            title: `You added ${ref.code} ${ref.name}`,
            body: 'A seat had freed up by the time you asked, so you have the seat rather than a place in the queue.',
          });
          return { outcome: 'ADDED', course: { code: ref.code, name: ref.name } };
        }
        return joinQueue(context, studentId, ref, false);
      });
    },

    leaveWaitlist(studentId, key, request) {
      return act(studentId, key, 'WAITLIST_LEAVE', request, async (context) => {
        const course = await context.lockCourse(request.code);
        const decision = decideLeaveWaitlist(request.code, course.state.waiting);
        if (decision.kind === 'refused') {
          throw addDropProblemError(decision.problems);
        }
        const courseId = course.courseId;
        if (courseId === null) {
          throw addDropProblemError([{ type: 'NOT_WAITING', code: request.code }]);
        }
        const entry = await context.waitlists.findWaitingEntry(
          context.windowId,
          studentId,
          courseId,
        );
        if (!entry) {
          throw addDropProblemError([{ type: 'NOT_WAITING', code: request.code }]);
        }

        await context.waitlists.markRemoved(entry.entryId, 'STUDENT_LEFT');
        await writeTrail(context, studentId, {
          eventType: 'WAITLIST_LEFT',
          courseId,
          details: { reason: 'STUDENT_LEFT', position: entry.position },
          title: `You left the waitlist for ${request.code} ${course.name}`,
          body: 'You will not be offered a seat in this course again unless you join the queue once more.',
        });
        return { outcome: 'WAITLIST_LEFT', course: { code: request.code, name: course.name } };
      });
    },
  };
}

const toWaitingEntry = (row: StudentWaitlistRow): StudentWaitlistEntry => ({
  course: { code: row.code, name: row.name },
  preferenceRank: row.preferenceRank,
  status: row.status,
  position: row.position,
  waiting: row.waiting,
  capacity: row.capacity,
  allocated: row.allocated,
  score: row.score,
  reason: row.reason,
  endedAt: row.endedAt?.toISOString() ?? null,
});

/** The window fields the period rules need, from the loaded record. */
function toRuleWindow(window: WindowRecord) {
  const { status, addDropOpensAt, addDropClosesAt } = window.summary;
  return {
    status,
    addDropOpensAt: addDropOpensAt === null ? null : new Date(addDropOpensAt),
    addDropClosesAt: addDropClosesAt === null ? null : new Date(addDropClosesAt),
  };
}
