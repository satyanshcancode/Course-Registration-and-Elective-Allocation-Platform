/**
 * Property-based tests for everything that moves a seat after allocation.
 *
 * Random allocated worlds, then a random sequence of the things that move seats
 * — an admin withdrawing a student or adding capacity, and a student adding,
 * dropping, swapping, joining a queue or leaving one — and after every step the
 * invariants have to still hold. Hundreds of worlds find the orderings that a
 * hand-written example never thinks of.
 *
 * The student actions go through the same pure rules the service uses
 * (`addDropRules.ts`) and then through the real `processFreedSeats`, so what is
 * covered is the decision logic and the promotion cascade together.
 *
 * The repositories are in-memory here. The SQL behind them is what
 * `tests/integration/waitlist.test.ts` and `addDrop.test.ts` check; what is
 * checked here is the logic itself, which is why thousands of runs are
 * affordable.
 */
import type { EnrollmentSource, PreferenceRank } from '@course-reg/shared';
import fc from 'fast-check';
import type { PoolClient } from 'pg';
import { describe, expect, it } from 'vitest';
import type { CourseCatalogueRepository } from '../repositories/courseCatalogueRepository.js';
import type { AuditLogRepository } from '../repositories/auditLogRepository.js';
import type { NotificationRepository } from '../repositories/notificationRepository.js';
import type { RegistrationHistoryRepository } from '../repositories/registrationHistoryRepository.js';
import type { StudentRepository } from '../repositories/studentRepository.js';
import type {
  HeldSeat,
  LockedCourseSeats,
  WaitlistRepository,
} from '../repositories/waitlistRepository.js';
import type { OfferingRecord } from '../types/catalogue.js';
import {
  decideAdd,
  decideDrop,
  decideJoinWaitlist,
  decideLeaveWaitlist,
  decideSwap,
  type CourseState,
} from './addDropRules.js';
import { createWaitlistPromotionService } from './waitlistPromotionService.js';

const WINDOW = 'window-1';

interface CourseSpec {
  id: string;
  capacity: number;
}

interface StudentSpec {
  id: string;
  /** Course ids in rank order; index 0 is their first preference. */
  preferences: string[];
  /** The courses they are still eligible for at promotion time. */
  eligible: Set<string>;
}

interface Enrollment {
  id: string;
  studentId: string;
  courseId: string;
  status: 'ACTIVE' | 'DROPPED';
  source: EnrollmentSource;
}

interface Entry {
  id: string;
  studentId: string;
  courseId: string;
  position: number;
  status: 'WAITING' | 'PROMOTED' | 'REMOVED';
}

/** An allocated world held in memory, plus the repositories over it. */
class World {
  readonly enrollments: Enrollment[] = [];
  readonly entries: Entry[] = [];
  /**
   * Courses each student asked for during add/drop, by adding them, swapping
   * into them or joining their queue. A seat can legitimately be one of these
   * rather than one they ranked — including off a queue they joined themselves,
   * which is a promotion into a course that was never on their list.
   */
  readonly requested = new Map<string, Set<string>>();
  private nextId = 0;

  constructor(
    readonly courses: CourseSpec[],
    readonly students: StudentSpec[],
  ) {}

  private id(prefix: string) {
    this.nextId += 1;
    return `${prefix}-${this.nextId}`;
  }

  course(courseId: string): CourseSpec {
    const course = this.courses.find((candidate) => candidate.id === courseId);
    if (!course) {
      throw new Error(`no course ${courseId}`);
    }
    return course;
  }

  student(studentId: string): StudentSpec {
    const student = this.students.find((candidate) => candidate.id === studentId);
    if (!student) {
      throw new Error(`no student ${studentId}`);
    }
    return student;
  }

  rankOf(studentId: string, courseId: string): PreferenceRank | null {
    const index = this.student(studentId).preferences.indexOf(courseId);
    return index < 0 ? null : ((index + 1) as PreferenceRank);
  }

  taken(courseId: string): number {
    return this.enrollments.filter(
      (enrollment) => enrollment.courseId === courseId && enrollment.status === 'ACTIVE',
    ).length;
  }

  activeFor(studentId: string): Enrollment | undefined {
    return this.enrollments.find(
      (enrollment) => enrollment.studentId === studentId && enrollment.status === 'ACTIVE',
    );
  }

  /**
   * The allocation this world starts from: greedily seat students in their
   * ranked order, and waitlist them on everything they ranked above what they
   * ended up with, in score order (here, the order they appear).
   */
  allocate() {
    for (const student of this.students) {
      const seat = student.preferences.find(
        (courseId) =>
          student.eligible.has(courseId) && this.taken(courseId) < this.course(courseId).capacity,
      );
      if (seat) {
        this.enrollments.push({
          id: this.id('enrollment'),
          studentId: student.id,
          courseId: seat,
          status: 'ACTIVE',
          source: 'ALLOCATION',
        });
      }
      const above = seat ? student.preferences.indexOf(seat) : student.preferences.length;
      for (const courseId of student.preferences.slice(0, above)) {
        this.entries.push({
          id: this.id('entry'),
          studentId: student.id,
          courseId,
          position: this.entries.filter((entry) => entry.courseId === courseId).length + 1,
          status: 'WAITING',
        });
      }
    }
  }

  /** One course as the pure rules see it, with the seats as they are now. */
  stateOf(studentId: string, courseId: string): CourseState {
    const course = this.course(courseId);
    return {
      code: courseId,
      exists: true,
      seats: { capacity: course.capacity, allocated: this.taken(courseId) },
      eligibility: this.student(studentId).eligible.has(courseId)
        ? { eligible: true }
        : { eligible: false, reasons: [{ type: 'ALREADY_COMPLETED' }] },
      waiting: this.entries.some(
        (entry) =>
          entry.studentId === studentId &&
          entry.courseId === courseId &&
          entry.status === 'WAITING',
      ),
    };
  }

  /** Records an explicit add/drop request, so the invariants can allow it. */
  request(studentId: string, courseId: string) {
    const asked = this.requested.get(studentId) ?? new Set<string>();
    asked.add(courseId);
    this.requested.set(studentId, asked);
  }

  /** Every course this student could defensibly end up holding. */
  wanted(studentId: string): Set<string> {
    return new Set([
      ...this.student(studentId).preferences,
      ...(this.requested.get(studentId) ?? []),
    ]);
  }

  heldOf(studentId: string): { code: string } | null {
    const enrollment = this.activeFor(studentId);
    return enrollment ? { code: enrollment.courseId } : null;
  }

  enroll(studentId: string, courseId: string, source: EnrollmentSource) {
    if (this.taken(courseId) >= this.course(courseId).capacity) {
      throw new Error(`overbooked ${courseId}`);
    }
    if (this.activeFor(studentId)) {
      throw new Error(`${studentId} would hold two seats`);
    }
    this.enrollments.push({
      id: this.id('enrollment'),
      studentId,
      courseId,
      status: 'ACTIVE',
      source,
    });
    // Taking a seat ends the queues they joined during add/drop, exactly as
    // addDropService does: promotion could never honour them afterwards.
    for (const entry of this.entries) {
      if (
        entry.studentId === studentId &&
        entry.status === 'WAITING' &&
        this.rankOf(studentId, entry.courseId) === null
      ) {
        entry.status = 'REMOVED';
      }
    }
  }

  /** A snapshot that two identical runs can be compared on. */
  snapshot(): string {
    return JSON.stringify({
      enrollments: [...this.enrollments]
        .map((e) => `${e.studentId}|${e.courseId}|${e.status}|${e.source}`)
        .sort(),
      entries: [...this.entries]
        .map((e) => `${e.studentId}|${e.courseId}|${e.position}|${e.status}`)
        .sort(),
    });
  }

  waitlists(): WaitlistRepository {
    const ref = (studentId: string) => ({
      name: studentId,
      email: `${studentId}@test`,
      program: 'CSE',
      semester: 5,
    });
    const held = (enrollment: Enrollment): HeldSeat => ({
      enrollmentId: enrollment.id,
      courseId: enrollment.courseId,
      code: enrollment.courseId,
      name: enrollment.courseId,
      enrolledAt: new Date(0),
      source: enrollment.source,
      preferenceRank: this.rankOf(enrollment.studentId, enrollment.courseId),
    });
    const seats = (course: CourseSpec): LockedCourseSeats => ({
      courseId: course.id,
      code: course.id,
      name: course.id,
      capacity: course.capacity,
      allocated: this.taken(course.id),
    });
    const notUsed = () => Promise.reject(new Error('not used by processFreedSeats'));

    return {
      lockWindowForPromotion: () => Promise.resolve(),
      findWindowStatus: () => Promise.resolve('ALLOCATED'),
      lockOffering: (_window, courseId) => Promise.resolve(seats(this.course(courseId))),
      findOfferingByCode: (_window, code) => Promise.resolve(seats(this.course(code))),
      nextWaiting: (_window, courseId) => {
        const entry = this.entries
          .filter((candidate) => candidate.courseId === courseId && candidate.status === 'WAITING')
          .sort((a, b) => a.position - b.position)[0];
        if (!entry) {
          return Promise.resolve(null);
        }
        return Promise.resolve({
          entryId: entry.id,
          studentId: entry.studentId,
          student: ref(entry.studentId),
          position: entry.position,
          score: 0,
          // Null for a queue joined during add/drop: the student never ranked
          // it, so promotion may only offer it while they hold nothing.
          preferenceRank: this.rankOf(entry.studentId, courseId),
        });
      },
      markPromoted: (entryId) => {
        const entry = this.entries.find((candidate) => candidate.id === entryId);
        if (entry?.status === 'WAITING') {
          entry.status = 'PROMOTED';
        }
        return Promise.resolve();
      },
      markRemoved: (entryId) => {
        const entry = this.entries.find((candidate) => candidate.id === entryId);
        if (entry?.status === 'WAITING') {
          entry.status = 'REMOVED';
        }
        return Promise.resolve();
      },
      removeEntriesRankedBelow: (_window, studentId, rank) => {
        const removed = this.entries.filter((entry) => {
          const entryRank = this.rankOf(studentId, entry.courseId);
          return (
            entry.studentId === studentId &&
            entry.status === 'WAITING' &&
            entryRank !== null &&
            entryRank > rank
          );
        });
        for (const entry of removed) {
          entry.status = 'REMOVED';
        }
        return Promise.resolve(
          removed.map((entry) => ({
            courseId: entry.courseId,
            code: entry.courseId,
            name: entry.courseId,
          })),
        );
      },
      removeUnrankedEntries: (_window, studentId) => {
        const removed = this.entries.filter(
          (entry) =>
            entry.studentId === studentId &&
            entry.status === 'WAITING' &&
            this.rankOf(studentId, entry.courseId) === null,
        );
        for (const entry of removed) {
          entry.status = 'REMOVED';
        }
        return Promise.resolve(
          removed.map((entry) => ({
            courseId: entry.courseId,
            code: entry.courseId,
            name: entry.courseId,
          })),
        );
      },
      findWaitingEntry: (_window, studentId, courseId) => {
        const entry = this.entries.find(
          (candidate) =>
            candidate.studentId === studentId &&
            candidate.courseId === courseId &&
            candidate.status === 'WAITING',
        );
        return Promise.resolve(entry ? { entryId: entry.id, position: entry.position } : null);
      },
      joinWaitlist: (_window, studentId, courseId) => {
        // The end of the queue is max(position) over EVERY entry the course has
        // had, exactly as the SQL does it, so a late joiner never lands above
        // somebody the run placed.
        const position =
          Math.max(
            0,
            ...this.entries
              .filter((entry) => entry.courseId === courseId)
              .map((entry) => entry.position),
          ) + 1;
        const entry: Entry = {
          id: this.id('entry'),
          studentId,
          courseId,
          position,
          status: 'WAITING',
        };
        this.entries.push(entry);
        return Promise.resolve({ entryId: entry.id, position });
      },
      lockWindowForShare: () =>
        Promise.resolve({ status: 'ALLOCATED', addDropOpensAt: null, addDropClosesAt: null }),
      listReleasedSeats: notUsed,
      findHeldSeat: (_window, studentId) => {
        const enrollment = this.activeFor(studentId);
        return Promise.resolve(enrollment ? held(enrollment) : null);
      },
      findEnrollment: notUsed,
      enroll: (_window, studentId, courseId, source) => {
        if (this.taken(courseId) >= this.course(courseId).capacity) {
          throw new Error(`overbooked ${courseId}`);
        }
        this.enrollments.push({
          id: this.id('enrollment'),
          studentId,
          courseId,
          status: 'ACTIVE',
          source,
        });
        return Promise.resolve();
      },
      dropEnrollment: (enrollmentId) => {
        const enrollment = this.enrollments.find((candidate) => candidate.id === enrollmentId);
        if (enrollment) {
          enrollment.status = 'DROPPED';
        }
        return Promise.resolve();
      },
      coursesWithFreeSeats: () =>
        Promise.resolve(
          this.courses
            .filter(
              (course) =>
                this.taken(course.id) < course.capacity &&
                this.entries.some(
                  (entry) => entry.courseId === course.id && entry.status === 'WAITING',
                ),
            )
            .map((course) => course.id),
        ),
      listOfferedCourses: notUsed,
      listStudentEntries: notUsed,
      listRoster: notUsed,
      listWaitlist: notUsed,
    };
  }

  /**
   * Eligibility is expressed through the real rule: every course needs its own
   * prerequisite, and a student has passed exactly the prerequisites of the
   * courses they are eligible for.
   */
  students_(): StudentRepository {
    return {
      findProfile: () => Promise.reject(new Error('not used')),
      findCourseStatuses: () => Promise.reject(new Error('not used')),
      findCompletedCourses: () => Promise.reject(new Error('not used')),
      findEligibilityFacts: (studentId) => {
        const student = this.student(studentId);
        return Promise.resolve({
          programId: 'program-1',
          program: { code: 'CSE', name: 'Computer Science' },
          semester: 5,
          creditsCompleted: 100,
          completedCourseIds: new Set([...student.eligible].map((id) => `${id}-prerequisite`)),
        });
      },
    };
  }

  catalogue(): CourseCatalogueRepository {
    return {
      listSeats: () => Promise.reject(new Error('not used')),
      findExistingCodes: () => Promise.reject(new Error('not used')),
      listOfferings: (_window, courseCode) => {
        const course = this.course(courseCode ?? '');
        return Promise.resolve([
          {
            courseId: course.id,
            code: course.id,
            name: course.id,
            credits: 4,
            description: '',
            minSemester: 1,
            minCredits: 0,
            department: { code: 'CSE', name: 'Computer Science' },
            capacity: course.capacity,
            allocated: this.taken(course.id),
            demand: 0,
            prerequisites: [{ id: `${course.id}-prerequisite`, code: 'PRE', name: 'Prerequisite' }],
            eligiblePrograms: [],
          } satisfies OfferingRecord,
        ]);
      },
    };
  }
}

const noHistory: RegistrationHistoryRepository = {
  record: () => Promise.resolve(),
  recordMany: () => Promise.resolve(),
};
const noNotifications: NotificationRepository = {
  broadcast: () => Promise.resolve(0),
  sendMany: () => Promise.resolve(0),
  countUnread: () => Promise.resolve(0),
};
const noAudit: AuditLogRepository = { record: () => Promise.resolve() };

function serviceFor(world: World) {
  return createWaitlistPromotionService({
    waitlistsFor: () => world.waitlists(),
    studentsFor: () => world.students_(),
    catalogueFor: () => world.catalogue(),
    historyFor: () => noHistory,
    notificationsFor: () => noNotifications,
    auditLogsFor: () => noAudit,
  });
}

/** processFreedSeats only ever uses the client to build repositories. */
const noClient = {} as PoolClient;

type Action =
  | { type: 'withdraw'; student: number }
  | { type: 'capacity'; course: number }
  | { type: 'add'; student: number; course: number }
  | { type: 'drop'; student: number }
  | { type: 'swap'; student: number; course: number }
  | { type: 'join'; student: number; course: number }
  | { type: 'leave'; student: number; course: number };

/**
 * Two kinds of world, because they pull in opposite directions.
 *
 * `crowded` fills every course and builds long queues, which is what promotion
 * needs to have anything to do. `roomy` finishes allocation with seats to
 * spare and includes students who never submitted a cart, which is what an add
 * or a swap needs to be possible at all. Every invariant runs over both; the
 * two coverage tests each use the one their paths live in.
 */
function worldArbitraryWith(options: {
  maxCapacity: number;
  minPreferences: number;
  maxActions: number;
}) {
  return fc
    .record({
      courses: fc.array(fc.integer({ min: 0, max: options.maxCapacity }), {
        minLength: 2,
        maxLength: 5,
      }),
      students: fc.array(
        fc.record({
          // An empty list is a student who never submitted a cart. Allocation
          // gives them nothing, which is exactly the late-registration case
          // add/drop exists for.
          preferences: fc.uniqueArray(fc.nat({ max: 4 }), {
            minLength: options.minPreferences,
            maxLength: 5,
          }),
          eligible: fc.array(fc.boolean(), { minLength: 5, maxLength: 5 }),
        }),
        { minLength: 1, maxLength: 12 },
      ),
      actions: fc.array(
        fc.oneof(
          fc.record({ type: fc.constant('withdraw' as const), student: fc.nat({ max: 11 }) }),
          fc.record({ type: fc.constant('capacity' as const), course: fc.nat({ max: 4 }) }),
          fc.record({ type: fc.constant('drop' as const), student: fc.nat({ max: 11 }) }),
          fc.record({
            type: fc.constant('add' as const),
            student: fc.nat({ max: 11 }),
            course: fc.nat({ max: 4 }),
          }),
          fc.record({
            type: fc.constant('swap' as const),
            student: fc.nat({ max: 11 }),
            course: fc.nat({ max: 4 }),
          }),
          fc.record({
            type: fc.constant('join' as const),
            student: fc.nat({ max: 11 }),
            course: fc.nat({ max: 4 }),
          }),
          fc.record({
            type: fc.constant('leave' as const),
            student: fc.nat({ max: 11 }),
            course: fc.nat({ max: 4 }),
          }),
        ),
        { maxLength: options.maxActions },
      ),
    })
    .map(({ courses, students, actions }) => ({
      courses: courses.map((capacity, index) => ({ id: `course-${index}`, capacity })),
      students: students.map((student, index) => ({
        id: `student-${index}`,
        // A preference for a course this world does not offer is not a case the
        // database can produce, so drop those.
        preferences: student.preferences
          .filter((course) => course < courses.length)
          .map((course) => `course-${course}`),
        eligible: new Set(
          student.eligible
            .map((yes, course) => (yes && course < courses.length ? `course-${course}` : null))
            .filter((id): id is string => id !== null),
        ),
      })),
      actions: actions as Action[],
    }));
}

/** Tight capacities, everybody ranks something: long queues, many promotions. */
const crowdedWorld = worldArbitraryWith({ maxCapacity: 3, minPreferences: 1, maxActions: 12 });

/** Spare seats and some non-submitters: adds, swaps and late queue joins. */
const roomyWorld = worldArbitraryWith({ maxCapacity: 6, minPreferences: 0, maxActions: 24 });

/** Every invariant holds in both kinds of world. */
const anyWorld = fc.oneof(crowdedWorld, roomyWorld);

/** Builds the world, allocates it, then runs the actions through the service. */
async function play(spec: {
  courses: CourseSpec[];
  students: StudentSpec[];
  actions: Action[];
}): Promise<World> {
  const world = new World(
    spec.courses.map((course) => ({ ...course })),
    spec.students.map((student) => ({ ...student, eligible: new Set(student.eligible) })),
  );
  world.allocate();
  const service = serviceFor(world);
  const freed = (courseId: string) =>
    service.processFreedSeats(noClient, {
      windowId: WINDOW,
      courseIds: [courseId],
      actorUserId: 'admin',
    });

  for (const action of spec.actions) {
    const student = 'student' in action ? world.students[action.student] : undefined;
    const course = 'course' in action ? world.courses[action.course] : undefined;

    switch (action.type) {
      case 'withdraw': {
        const enrollment = student ? world.activeFor(student.id) : undefined;
        if (!enrollment) {
          continue;
        }
        enrollment.status = 'DROPPED';
        await freed(enrollment.courseId);
        continue;
      }
      case 'capacity': {
        if (!course) {
          continue;
        }
        course.capacity += 1;
        await freed(course.id);
        continue;
      }
      // The student actions go through the SAME pure rules the service uses,
      // so an ordering the rules would refuse is never reached here either.
      case 'drop': {
        const enrollment = student ? world.activeFor(student.id) : undefined;
        if (!student || !enrollment) {
          continue;
        }
        if (decideDrop(enrollment.courseId, { code: enrollment.courseId }).kind === 'refused') {
          continue;
        }
        enrollment.status = 'DROPPED';
        await freed(enrollment.courseId);
        continue;
      }
      case 'add': {
        if (!student || !course) {
          continue;
        }
        const decision = decideAdd(
          world.stateOf(student.id, course.id),
          world.heldOf(student.id),
          true,
        );
        if (decision.kind === 'refused') {
          continue;
        }
        world.request(student.id, course.id);
        if (decision.kind === 'take-seat') {
          world.enroll(student.id, course.id, 'ADD');
        } else {
          await world.waitlists().joinWaitlist(WINDOW, student.id, course.id);
        }
        continue;
      }
      case 'swap': {
        const enrollment = student ? world.activeFor(student.id) : undefined;
        if (!student || !course || !enrollment) {
          continue;
        }
        const decision = decideSwap(
          world.stateOf(student.id, enrollment.courseId),
          world.stateOf(student.id, course.id),
          { code: enrollment.courseId },
        );
        if (decision.kind === 'refused') {
          continue;
        }
        // Release then take, in the order the unique index allows.
        world.request(student.id, course.id);
        enrollment.status = 'DROPPED';
        world.enroll(student.id, course.id, 'ADD');
        await freed(enrollment.courseId);
        continue;
      }
      case 'join': {
        if (!student || !course) {
          continue;
        }
        const decision = decideJoinWaitlist(
          world.stateOf(student.id, course.id),
          world.heldOf(student.id),
        );
        if (decision.kind === 'refused') {
          continue;
        }
        world.request(student.id, course.id);
        if (decision.kind === 'take-seat') {
          world.enroll(student.id, course.id, 'ADD');
        } else {
          await world.waitlists().joinWaitlist(WINDOW, student.id, course.id);
        }
        continue;
      }
      case 'leave': {
        if (!student || !course) {
          continue;
        }
        const entry = world.entries.find(
          (candidate) =>
            candidate.studentId === student.id &&
            candidate.courseId === course.id &&
            candidate.status === 'WAITING',
        );
        if (decideLeaveWaitlist(course.id, entry !== undefined).kind === 'refused' || !entry) {
          continue;
        }
        entry.status = 'REMOVED';
        continue;
      }
    }
  }
  return world;
}

const RUNS = { numRuns: 250 } as const;

describe('waitlist promotion, over random worlds', () => {
  it('actually promotes people, so the properties above are not vacuous', async () => {
    let promotions = 0;
    await fc.assert(
      fc.asyncProperty(crowdedWorld, async (spec) => {
        const world = await play(spec);
        promotions += world.enrollments.filter(
          (enrollment) => enrollment.source === 'WAITLIST_PROMOTION',
        ).length;
      }),
      RUNS,
    );
    expect(promotions).toBeGreaterThan(50);
  });

  it('actually adds, swaps and queues, so the add/drop cases are not vacuous either', async () => {
    let added = 0;
    let queued = 0;
    await fc.assert(
      fc.asyncProperty(roomyWorld, async (spec) => {
        const world = await play(spec);
        added += world.enrollments.filter((enrollment) => enrollment.source === 'ADD').length;
        queued += [...world.requested.values()].reduce((total, asked) => total + asked.size, 0);
      }),
      RUNS,
    );
    // Both paths are narrow by nature — an add needs a free seat AND a student
    // holding nothing — so these floors sit well under what the generator
    // actually produces (around 20 and 30). They are here to fail loudly if a
    // change ever makes the add/drop actions unreachable.
    expect(added).toBeGreaterThan(8);
    expect(queued).toBeGreaterThan(12);
  });

  it('never exceeds a course capacity', async () => {
    await fc.assert(
      fc.asyncProperty(anyWorld, async (spec) => {
        const world = await play(spec);
        for (const course of world.courses) {
          expect(world.taken(course.id)).toBeLessThanOrEqual(course.capacity);
        }
      }),
      RUNS,
    );
  });

  it('leaves every student holding at most one seat, and one they ranked unless they added it', async () => {
    await fc.assert(
      fc.asyncProperty(anyWorld, async (spec) => {
        const world = await play(spec);
        for (const student of world.students) {
          const active = world.enrollments.filter(
            (enrollment) => enrollment.studentId === student.id && enrollment.status === 'ACTIVE',
          );
          expect(active.length).toBeLessThanOrEqual(1);
          for (const enrollment of active) {
            // Allocation and promotion only ever give a course the student
            // asked for: one they ranked, or — since add/drop — one whose queue
            // they joined or which they added themselves.
            expect([...world.wanted(student.id)]).toContain(enrollment.courseId);
          }
        }
      }),
      RUNS,
    );
  });

  it('never leaves a student waiting for something they rank below their seat', async () => {
    await fc.assert(
      fc.asyncProperty(anyWorld, async (spec) => {
        const world = await play(spec);
        for (const entry of world.entries.filter((candidate) => candidate.status === 'WAITING')) {
          const held = world.activeFor(entry.studentId);
          if (!held) {
            continue;
          }
          const heldRank = world.rankOf(entry.studentId, held.courseId);
          const waitingRank = world.rankOf(entry.studentId, entry.courseId);
          // A queue they joined in add/drop can never be honoured once they
          // hold a seat, so it must not still be waiting.
          expect(waitingRank).not.toBeNull();
          // Holding a course they never ranked, anything they DID rank is
          // still an improvement on it, so there is nothing to compare.
          if (heldRank !== null) {
            expect(waitingRank ?? 0).toBeLessThan(heldRank);
          }
        }
      }),
      RUNS,
    );
  });

  it('never leaves a seat free while an eligible student waits for it', async () => {
    await fc.assert(
      fc.asyncProperty(anyWorld, async (spec) => {
        const world = await play(spec);
        for (const course of world.courses) {
          if (world.taken(course.id) >= course.capacity) {
            continue;
          }
          const stillWaiting = world.entries.filter(
            (entry) =>
              entry.courseId === course.id &&
              entry.status === 'WAITING' &&
              world.student(entry.studentId).eligible.has(course.id),
          );
          expect(stillWaiting).toEqual([]);
        }
      }),
      RUNS,
    );
  });

  it('promotes in stored position order', async () => {
    await fc.assert(
      fc.asyncProperty(anyWorld, async (spec) => {
        const world = await play(spec);
        for (const course of world.courses) {
          const entries = world.entries.filter((entry) => entry.courseId === course.id);
          const promoted = entries.filter((entry) => entry.status === 'PROMOTED');
          const waiting = entries.filter((entry) => entry.status === 'WAITING');
          for (const winner of promoted) {
            for (const loser of waiting) {
              // Nobody was jumped over: a student still waiting was always
              // behind everyone the course took.
              expect(winner.position).toBeLessThan(loser.position);
            }
          }
        }
      }),
      RUNS,
    );
  });

  it('is deterministic: the same world and the same actions end the same way', async () => {
    await fc.assert(
      fc.asyncProperty(anyWorld, async (spec) => {
        const first = await play(spec);
        const second = await play(spec);
        expect(second.snapshot()).toEqual(first.snapshot());
      }),
      RUNS,
    );
  });
});
