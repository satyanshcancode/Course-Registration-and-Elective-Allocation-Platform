/**
 * The engine on small worlds whose right answer can be worked out by hand.
 *
 * No database and no server: `allocate` is a pure function, so a test is just
 * an object in and an object out.
 */
import {
  DEFAULT_PREFERENCE_PRIORITY_CONFIG,
  FCFS_CONFIG,
  type AllocationConfig,
} from '@course-reg/shared';
import { describe, expect, it } from 'vitest';
import { FcfsStrategy } from './fcfsStrategy.js';
import { hashOutput, strategyFor } from './index.js';
import { PreferencePriorityStrategy } from './preferencePriorityStrategy.js';
import { FINAL_YEAR_SEMESTER, scoreFor } from './scoring.js';
import type { AllocationCourse, AllocationInput, AllocationStudent } from './types.js';

const TERM = '2026-FALL' as const;

function course(
  courseId: string,
  capacity: number,
  relevantProgramIds: string[] = [],
): AllocationCourse {
  return {
    courseId,
    code: courseId.toUpperCase(),
    name: `Course ${courseId}`,
    capacity,
    relevantProgramIds: new Set(relevantProgramIds),
  };
}

function student(
  studentId: string,
  preferences: string[],
  overrides: Partial<AllocationStudent> = {},
): AllocationStudent {
  return {
    studentId,
    sequence: Number(studentId.replace(/\D/g, '')) || 1,
    semester: 5,
    programId: 'CSE',
    expectedGraduationTerm: '2028-SPRING',
    preferences,
    eligibleCourseIds: new Set(preferences),
    ...overrides,
  };
}

function world(
  students: AllocationStudent[],
  courses: AllocationCourse[],
  config: AllocationConfig = DEFAULT_PREFERENCE_PRIORITY_CONFIG,
  randomSeed = 42,
): AllocationInput {
  return { term: TERM, config, randomSeed, students, courses };
}

/** studentId -> the course they were given, for readable assertions. */
function assignments(output: {
  results: readonly { studentId: string; courseId: string; outcome: string }[];
}) {
  return Object.fromEntries(
    output.results
      .filter((row) => row.outcome === 'ALLOCATED')
      .map((row) => [row.studentId, row.courseId]),
  );
}

describe('scoreFor', () => {
  const ai = course('ai', 20, ['CSE']);

  it('gives the preference weight alone when no bonus applies', () => {
    const breakdown = scoreFor(
      student('s1', ['ai'], { programId: 'ECE', semester: 5 }),
      ai,
      1,
      TERM,
      DEFAULT_PREFERENCE_PRIORITY_CONFIG,
    );
    expect(breakdown).toMatchObject({ preferencePoints: 100, priorityPoints: 0, total: 100 });
    expect(breakdown.bonuses).toEqual([]);
  });

  it('adds program relevance for a student of a relevant programme', () => {
    const breakdown = scoreFor(
      student('s1', ['ai'], { programId: 'CSE' }),
      ai,
      2,
      TERM,
      DEFAULT_PREFERENCE_PRIORITY_CONFIG,
    );
    expect(breakdown.bonuses).toEqual([{ type: 'PROGRAM_RELEVANCE', points: 25 }]);
    expect(breakdown.total).toBe(80 + 25);
  });

  it('adds final year from semester 7', () => {
    const facts = { programId: 'ECE' as const, semester: FINAL_YEAR_SEMESTER };
    const breakdown = scoreFor(
      student('s1', ['ai'], facts),
      ai,
      1,
      TERM,
      DEFAULT_PREFERENCE_PRIORITY_CONFIG,
    );
    expect(breakdown.bonuses).toEqual([{ type: 'FINAL_YEAR', points: 20 }]);
    expect(breakdown.total).toBe(120);
  });

  it('adds graduation urgency when the degree ends this term or earlier', () => {
    const graduating = student('s1', ['ai'], {
      programId: 'ECE',
      expectedGraduationTerm: TERM,
    });
    const later = student('s2', ['ai'], {
      programId: 'ECE',
      expectedGraduationTerm: '2027-SPRING',
    });
    expect(scoreFor(graduating, ai, 1, TERM, DEFAULT_PREFERENCE_PRIORITY_CONFIG).total).toBe(140);
    expect(scoreFor(later, ai, 1, TERM, DEFAULT_PREFERENCE_PRIORITY_CONFIG).total).toBe(100);
  });

  it('stacks every bonus, and lists each one', () => {
    const breakdown = scoreFor(
      student('s1', ['ai'], {
        programId: 'CSE',
        semester: 8,
        expectedGraduationTerm: TERM,
      }),
      ai,
      1,
      TERM,
      DEFAULT_PREFERENCE_PRIORITY_CONFIG,
    );
    expect(breakdown.bonuses.map((bonus) => bonus.type)).toEqual([
      'FINAL_YEAR',
      'PROGRAM_RELEVANCE',
      'GRADUATION_URGENCY',
    ]);
    expect(breakdown.total).toBe(100 + 20 + 25 + 40);
    expect(breakdown.priorityPoints).toBe(85);
  });
});

describe('FcfsStrategy', () => {
  it('gives each student their best choice that still has a seat, in arrival order', () => {
    // One seat in "a". s1 arrives first and takes it; s2 falls through to "b".
    const input = world(
      [
        student('s1', ['a', 'b'], { sequence: 1 }),
        student('s2', ['a', 'b'], { sequence: 2 }),
        student('s3', ['a', 'b'], { sequence: 3 }),
      ],
      [course('a', 1), course('b', 1)],
      FCFS_CONFIG,
    );
    const output = new FcfsStrategy().allocate(input);

    expect(assignments(output)).toEqual({ s1: 'a', s2: 'b' });
    expect(output.metrics.allocated).toBe(2);
    expect(output.metrics.unallocated).toBe(1);
  });

  it('ignores the score entirely, which is how justified envy appears', () => {
    // s2 would score far higher for "a" (final year, relevant, graduating),
    // but s1 submitted first.
    const input = world(
      [
        student('s1', ['a'], { sequence: 1, programId: 'ECE' }),
        student('s2', ['a'], {
          sequence: 2,
          programId: 'CSE',
          semester: 8,
          expectedGraduationTerm: TERM,
        }),
      ],
      [course('a', 1, ['CSE'])],
      FCFS_CONFIG,
    );
    const output = new FcfsStrategy().allocate(input);

    expect(assignments(output)).toEqual({ s1: 'a' });
    expect(output.metrics.justifiedEnvy).toBe(1);
    // FCFS does not score, so no row carries one.
    expect(output.results.every((row) => row.score === null)).toBe(true);
  });
});

describe('PreferencePriorityStrategy', () => {
  it('gives the seat to the higher score, whoever submitted first', () => {
    const input = world(
      [
        student('s1', ['a'], { sequence: 1, programId: 'ECE' }),
        student('s2', ['a'], { sequence: 2, programId: 'CSE' }),
      ],
      [course('a', 1, ['CSE'])],
    );
    const output = new PreferencePriorityStrategy().allocate(input);

    expect(assignments(output)).toEqual({ s2: 'a' });
    expect(output.metrics.justifiedEnvy).toBe(0);
  });

  it('lets a later proposal displace an earlier hold (the "deferred" part)', () => {
    // s3 first proposes to "a", is rejected, and displaces s2 from "b".
    const input = world(
      [
        student('s1', ['a'], { programId: 'CSE', semester: 8 }),
        student('s2', ['b'], { programId: 'ECE' }),
        student('s3', ['a', 'b'], { programId: 'CSE' }),
      ],
      [course('a', 1, ['CSE']), course('b', 1, ['CSE'])],
    );
    const output = new PreferencePriorityStrategy().allocate(input);

    expect(assignments(output)).toEqual({ s1: 'a', s3: 'b' });
    const displaced = output.results.find((row) => row.studentId === 's2');
    expect(displaced?.outcome).toBe('WAITLISTED');
    expect(displaced?.waitlistPosition).toBe(1);
  });

  it('never leaves justified envy, where a simple global sort would', () => {
    // A global "sort everyone by best score" would give s1 their second
    // choice and leave s2 — who scores lower for "a" — holding "a".
    const input = world(
      [
        student('s1', ['a', 'b'], { programId: 'CSE', semester: 8 }),
        student('s2', ['a'], { programId: 'ECE' }),
      ],
      [course('a', 1, ['CSE']), course('b', 1)],
    );
    const output = new PreferencePriorityStrategy().allocate(input);

    expect(assignments(output)).toEqual({ s1: 'a' });
    expect(output.metrics.justifiedEnvy).toBe(0);
  });

  it('breaks an exact tie with the seeded number, the same way every time', () => {
    const identical = [
      student('s1', ['a'], { programId: 'CSE' }),
      student('s2', ['a'], { programId: 'CSE' }),
    ];
    const first = new PreferencePriorityStrategy().allocate(
      world(identical, [course('a', 1)], DEFAULT_PREFERENCE_PRIORITY_CONFIG, 7),
    );
    const again = new PreferencePriorityStrategy().allocate(
      world(identical, [course('a', 1)], DEFAULT_PREFERENCE_PRIORITY_CONFIG, 7),
    );
    const other = new PreferencePriorityStrategy().allocate(
      world(identical, [course('a', 1)], DEFAULT_PREFERENCE_PRIORITY_CONFIG, 1234),
    );

    expect(Object.keys(assignments(first))).toHaveLength(1);
    expect(assignments(again)).toEqual(assignments(first));
    expect(hashOutput(again)).toBe(hashOutput(first));
    // A different seed is allowed to pick the other student; either way the
    // outcome is one of the two, and it is stable for that seed.
    expect(Object.keys(assignments(other))).toHaveLength(1);
  });

  it('never allocates a course the student is no longer eligible for', () => {
    const input = world(
      [student('s1', ['a', 'b'], { eligibleCourseIds: new Set(['b']) })],
      [course('a', 5), course('b', 5)],
    );
    const output = new PreferencePriorityStrategy().allocate(input);

    expect(assignments(output)).toEqual({ s1: 'b' });
    const blocked = output.results.find((row) => row.courseId === 'a');
    expect(blocked?.outcome).toBe('NOT_ALLOCATED');
    expect(blocked?.explanation.type).toBe('NOT_ALLOCATED_INELIGIBLE');
  });
});

describe('waitlists', () => {
  it('waitlists a student who got nothing on every course they ranked', () => {
    const input = world(
      [
        student('s1', ['a'], { programId: 'CSE' }),
        student('s2', ['b'], { programId: 'CSE' }),
        student('s3', ['a', 'b'], { programId: 'ECE' }),
      ],
      [course('a', 1, ['CSE']), course('b', 1, ['CSE'])],
    );
    const output = new PreferencePriorityStrategy().allocate(input);

    const waitlisted = output.results
      .filter((row) => row.studentId === 's3' && row.outcome === 'WAITLISTED')
      .map((row) => row.courseId);
    expect(waitlisted.sort()).toEqual(['a', 'b']);
  });

  it('waitlists an allocated student only on the courses they ranked higher', () => {
    // s2 gets their third choice, so they queue for the first two only.
    const input = world(
      [
        student('s1', ['a'], { programId: 'CSE', semester: 8 }),
        student('s3', ['b'], { programId: 'CSE', semester: 8 }),
        student('s2', ['a', 'b', 'c'], { programId: 'ECE' }),
      ],
      [course('a', 1, ['CSE']), course('b', 1, ['CSE']), course('c', 5)],
    );
    const output = new PreferencePriorityStrategy().allocate(input);
    const rows = output.results.filter((row) => row.studentId === 's2');

    expect(rows.map((row) => [row.courseId, row.outcome])).toEqual([
      ['a', 'WAITLISTED'],
      ['b', 'WAITLISTED'],
      ['c', 'ALLOCATED'],
    ]);
  });

  it('numbers waiting students from 1 in the method’s own order', () => {
    const input = world(
      [
        student('s1', ['a'], { programId: 'CSE', semester: 8, expectedGraduationTerm: TERM }),
        student('s2', ['a'], { programId: 'CSE', semester: 8 }),
        student('s3', ['a'], { programId: 'CSE' }),
        student('s4', ['a'], { programId: 'ECE' }),
      ],
      [course('a', 1, ['CSE'])],
    );
    const output = new PreferencePriorityStrategy().allocate(input);

    const queue = output.results
      .filter((row) => row.outcome === 'WAITLISTED')
      .sort((a, b) => (a.waitlistPosition ?? 0) - (b.waitlistPosition ?? 0));
    expect(queue.map((row) => [row.studentId, row.waitlistPosition])).toEqual([
      ['s2', 1],
      ['s3', 2],
      ['s4', 3],
    ]);
  });
});

describe('explanations', () => {
  it('tell an allocated student where they came and what the cut-off was', () => {
    const input = world(
      [student('s1', ['a'], { programId: 'CSE' }), student('s2', ['a'], { programId: 'ECE' })],
      [course('a', 1, ['CSE'])],
    );
    const output = new PreferencePriorityStrategy().allocate(input);
    const winner = output.results.find((row) => row.outcome === 'ALLOCATED');

    expect(winner?.explanation).toMatchObject({
      type: 'ALLOCATED',
      course: { code: 'A', name: 'Course a' },
      preferenceRank: 1,
      finalRank: 1,
      capacity: 1,
      applicants: 2,
      cutoffScore: 125,
    });
  });

  it('say which better course was granted instead', () => {
    const input = world([student('s1', ['a', 'b'])], [course('a', 1), course('b', 1)]);
    const output = new PreferencePriorityStrategy().allocate(input);
    const skipped = output.results.find((row) => row.courseId === 'b');

    expect(skipped?.explanation).toMatchObject({
      type: 'NOT_ALLOCATED_HIGHER_CHOICE_GRANTED',
      grantedCourse: { code: 'A' },
      grantedRank: 1,
    });
  });

  it('never name another student', () => {
    const input = world([student('s1', ['a']), student('s2', ['a'])], [course('a', 1)]);
    const output = new PreferencePriorityStrategy().allocate(input);
    const serialised = JSON.stringify(output.results.map((row) => row.explanation));

    expect(serialised).not.toContain('s1');
    expect(serialised).not.toContain('s2');
  });
});

describe('strategyFor', () => {
  it('returns the class for each method', () => {
    expect(strategyFor('FCFS')).toBeInstanceOf(FcfsStrategy);
    expect(strategyFor('PREFERENCE_PRIORITY')).toBeInstanceOf(PreferencePriorityStrategy);
  });

  it('gives every instance of a strategy the same allocate, from the prototype', () => {
    const one = strategyFor('FCFS');
    const two = strategyFor('FCFS');
    expect(one).not.toBe(two);
    expect(Object.getPrototypeOf(one)).toBe(Object.getPrototypeOf(two));
    expect(Object.hasOwn(one, 'allocate')).toBe(false);
  });
});
