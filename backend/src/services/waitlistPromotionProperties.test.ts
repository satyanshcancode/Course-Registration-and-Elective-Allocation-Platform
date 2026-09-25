/**
 * Property-based tests for waitlist promotion.
 *
 * Random allocated worlds, then a random sequence of the things that free a
 * seat — an admin withdrawing a student, an admin adding capacity — and after
 * every step the invariants have to still hold. Hundreds of worlds find the
 * orderings that a hand-written example never thinks of.
 *
 * The repositories are in-memory here. The SQL behind them is what
 * `tests/integration/waitlist.test.ts` checks; what is checked here is the
 * promotion logic itself, which is why thousands of runs are affordable.
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
        const rank = this.rankOf(entry.studentId, courseId);
        if (rank === null) {
          throw new Error('a waitlist entry for a course the student never ranked');
        }
        return Promise.resolve({
          entryId: entry.id,
          studentId: entry.studentId,
          student: ref(entry.studentId),
          position: entry.position,
          score: 0,
          preferenceRank: rank,
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

type Action = { type: 'withdraw'; student: number } | { type: 'capacity'; course: number };

const worldArbitrary = fc
  .record({
    courses: fc.array(fc.integer({ min: 0, max: 3 }), { minLength: 2, maxLength: 5 }),
    students: fc.array(
      fc.record({
        preferences: fc.uniqueArray(fc.nat({ max: 4 }), { minLength: 1, maxLength: 5 }),
        eligible: fc.array(fc.boolean(), { minLength: 5, maxLength: 5 }),
      }),
      { minLength: 1, maxLength: 12 },
    ),
    actions: fc.array(
      fc.oneof(
        fc.record({ type: fc.constant('withdraw' as const), student: fc.nat({ max: 11 }) }),
        fc.record({ type: fc.constant('capacity' as const), course: fc.nat({ max: 4 }) }),
      ),
      { maxLength: 8 },
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

  for (const action of spec.actions) {
    if (action.type === 'withdraw') {
      const student = world.students[action.student];
      const enrollment = student ? world.activeFor(student.id) : undefined;
      if (!enrollment) {
        continue;
      }
      enrollment.status = 'DROPPED';
      await service.processFreedSeats(noClient, {
        windowId: WINDOW,
        courseIds: [enrollment.courseId],
        actorUserId: 'admin',
      });
      continue;
    }
    const course = world.courses[action.course];
    if (!course) {
      continue;
    }
    course.capacity += 1;
    await service.processFreedSeats(noClient, {
      windowId: WINDOW,
      courseIds: [course.id],
      actorUserId: 'admin',
    });
  }
  return world;
}

const RUNS = { numRuns: 250 } as const;

describe('waitlist promotion, over random worlds', () => {
  it('actually promotes people, so the properties above are not vacuous', async () => {
    let promotions = 0;
    await fc.assert(
      fc.asyncProperty(worldArbitrary, async (spec) => {
        const world = await play(spec);
        promotions += world.enrollments.filter(
          (enrollment) => enrollment.source === 'WAITLIST_PROMOTION',
        ).length;
      }),
      RUNS,
    );
    expect(promotions).toBeGreaterThan(50);
  });

  it('never exceeds a course capacity', async () => {
    await fc.assert(
      fc.asyncProperty(worldArbitrary, async (spec) => {
        const world = await play(spec);
        for (const course of world.courses) {
          expect(world.taken(course.id)).toBeLessThanOrEqual(course.capacity);
        }
      }),
      RUNS,
    );
  });

  it('leaves every student holding at most one seat, always one they ranked', async () => {
    await fc.assert(
      fc.asyncProperty(worldArbitrary, async (spec) => {
        const world = await play(spec);
        for (const student of world.students) {
          const active = world.enrollments.filter(
            (enrollment) => enrollment.studentId === student.id && enrollment.status === 'ACTIVE',
          );
          expect(active.length).toBeLessThanOrEqual(1);
          for (const enrollment of active) {
            expect(student.preferences).toContain(enrollment.courseId);
          }
        }
      }),
      RUNS,
    );
  });

  it('never leaves a student waiting for something they rank below their seat', async () => {
    await fc.assert(
      fc.asyncProperty(worldArbitrary, async (spec) => {
        const world = await play(spec);
        for (const entry of world.entries.filter((candidate) => candidate.status === 'WAITING')) {
          const held = world.activeFor(entry.studentId);
          if (!held) {
            continue;
          }
          const heldRank = world.rankOf(entry.studentId, held.courseId);
          const waitingRank = world.rankOf(entry.studentId, entry.courseId);
          expect(waitingRank).not.toBeNull();
          expect(waitingRank ?? 0).toBeLessThan(heldRank ?? 0);
        }
      }),
      RUNS,
    );
  });

  it('never leaves a seat free while an eligible student waits for it', async () => {
    await fc.assert(
      fc.asyncProperty(worldArbitrary, async (spec) => {
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
      fc.asyncProperty(worldArbitrary, async (spec) => {
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
      fc.asyncProperty(worldArbitrary, async (spec) => {
        const first = await play(spec);
        const second = await play(spec);
        expect(second.snapshot()).toEqual(first.snapshot());
      }),
      RUNS,
    );
  });
});
