/**
 * Property-based tests: instead of a handful of hand-written worlds, fast-check
 * builds thousands of random ones — random students, preferences, capacities,
 * eligibility and seeds — and checks that the rules hold in every single one.
 *
 * A hand-written test proves the engine is right about the case you thought
 * of. These prove it about the cases you did not, and when one fails
 * fast-check shrinks the counter-example to the smallest world that still
 * breaks it.
 */
import { DEFAULT_PREFERENCE_PRIORITY_CONFIG, FCFS_CONFIG } from '@course-reg/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { FcfsStrategy } from './fcfsStrategy.js';
import { hashOutput } from './index.js';
import { PreferencePriorityStrategy } from './preferencePriorityStrategy.js';
import { MAX_SEED } from '../utils/random.js';
import {
  indexCourses,
  isAllocatable,
  rankOf,
  type AllocationCourse,
  type AllocationInput,
  type AllocationOutput,
  type AllocationStudent,
} from './types.js';

const TERM = '2026-FALL' as const;
const PROGRAMS = ['CSE', 'ECE', 'ME'] as const;
const GRADUATION_TERMS = ['2026-SPRING', '2026-FALL', '2027-SPRING', '2028-FALL'] as const;

/** A world: 1–6 courses, 0–12 students, random capacities and eligibility. */
const anyWorld = fc
  .record({
    courseCount: fc.integer({ min: 1, max: 6 }),
    capacities: fc.array(fc.integer({ min: 0, max: 4 }), { minLength: 6, maxLength: 6 }),
    relevance: fc.array(fc.subarray([...PROGRAMS]), { minLength: 6, maxLength: 6 }),
    randomSeed: fc.integer({ min: 0, max: MAX_SEED }),
    students: fc.array(
      fc.record({
        semester: fc.integer({ min: 1, max: 8 }),
        programId: fc.constantFrom(...PROGRAMS),
        expectedGraduationTerm: fc.constantFrom(...GRADUATION_TERMS),
        // Which courses they rank, and in which order.
        preferenceIndexes: fc.uniqueArray(fc.integer({ min: 0, max: 5 }), { maxLength: 5 }),
        // Which of those they are still eligible for.
        eligibleMask: fc.array(fc.boolean(), { minLength: 5, maxLength: 5 }),
      }),
      { maxLength: 12 },
    ),
  })
  .map(({ courseCount, capacities, relevance, randomSeed, students }): AllocationInput => {
    const courses: AllocationCourse[] = Array.from({ length: courseCount }, (_, index) => ({
      courseId: `c${index}`,
      code: `C${index}`,
      name: `Course ${index}`,
      capacity: capacities[index] ?? 1,
      relevantProgramIds: new Set(relevance[index] ?? []),
    }));

    const allocationStudents: AllocationStudent[] = students.map((raw, index) => {
      const preferences = raw.preferenceIndexes
        .filter((courseIndex) => courseIndex < courseCount)
        .map((courseIndex) => `c${courseIndex}`);
      return {
        studentId: `s${String(index).padStart(3, '0')}`,
        sequence: index + 1,
        semester: raw.semester,
        programId: raw.programId,
        expectedGraduationTerm: raw.expectedGraduationTerm,
        preferences,
        eligibleCourseIds: new Set(
          preferences.filter((_, position) => raw.eligibleMask[position] !== false),
        ),
      };
    });

    return {
      term: TERM,
      config: DEFAULT_PREFERENCE_PRIORITY_CONFIG,
      randomSeed,
      students: allocationStudents,
      courses,
    };
  });

const allocatedOf = (output: AllocationOutput) =>
  new Map(
    output.results
      .filter((row) => row.outcome === 'ALLOCATED')
      .map((row) => [row.studentId, row.courseId]),
  );

/** The invariants every method owes, whatever it does internally. */
function expectSoundAllocation(input: AllocationInput, output: AllocationOutput): void {
  const courses = indexCourses(input.courses);
  const assigned = allocatedOf(output);
  const byStudent = new Map(input.students.map((student) => [student.studentId, student]));

  // At most one course per student: the map above would have silently
  // collapsed duplicates, so count the rows instead.
  const allocatedRows = output.results.filter((row) => row.outcome === 'ALLOCATED');
  expect(allocatedRows).toHaveLength(assigned.size);

  const seatsUsed = new Map<string, number>();
  for (const [studentId, courseId] of assigned) {
    const student = byStudent.get(studentId);
    expect(student).toBeDefined();
    if (!student) {
      continue;
    }
    // Only a course they ranked, and are still eligible for.
    expect(student.preferences).toContain(courseId);
    expect(isAllocatable(student, courseId, courses)).toBe(true);
    seatsUsed.set(courseId, (seatsUsed.get(courseId) ?? 0) + 1);
  }

  // Capacity is never exceeded.
  for (const [courseId, used] of seatsUsed) {
    expect(used).toBeLessThanOrEqual(courses.get(courseId)?.capacity ?? 0);
  }

  // Waitlists hold exactly the courses a promotion would improve on.
  for (const student of input.students) {
    const held = assigned.get(student.studentId);
    const heldRank = held === undefined ? null : rankOf(student, held);
    const expected = student.preferences
      .filter((courseId, index) => {
        if (!isAllocatable(student, courseId, courses)) {
          return false;
        }
        return heldRank === null || index + 1 < heldRank;
      })
      .sort();
    const actual = output.results
      .filter((row) => row.studentId === student.studentId && row.outcome === 'WAITLISTED')
      .map((row) => row.courseId)
      .sort();
    expect(actual).toEqual(expected);
  }
}

describe('every strategy, on any world', () => {
  it('produces a sound allocation (FCFS)', () => {
    fc.assert(
      fc.property(anyWorld, (input) => {
        const run = { ...input, config: FCFS_CONFIG };
        expectSoundAllocation(run, new FcfsStrategy().allocate(run));
      }),
      { numRuns: 300 },
    );
  });

  it('produces a sound allocation (Preference + Priority)', () => {
    fc.assert(
      fc.property(anyWorld, (input) => {
        expectSoundAllocation(input, new PreferencePriorityStrategy().allocate(input));
      }),
      { numRuns: 300 },
    );
  });

  it('gives the identical output for the same input and seed', () => {
    fc.assert(
      fc.property(anyWorld, (input) => {
        const strategy = new PreferencePriorityStrategy();
        expect(hashOutput(strategy.allocate(input))).toBe(hashOutput(strategy.allocate(input)));
        const fcfsInput = { ...input, config: FCFS_CONFIG };
        const fcfs = new FcfsStrategy();
        expect(hashOutput(fcfs.allocate(fcfsInput))).toBe(hashOutput(fcfs.allocate(fcfsInput)));
      }),
      { numRuns: 200 },
    );
  });
});

describe('Preference + Priority', () => {
  it('never leaves justified envy', () => {
    fc.assert(
      fc.property(anyWorld, (input) => {
        const output = new PreferencePriorityStrategy().allocate(input);
        expect(output.metrics.justifiedEnvy).toBe(0);
      }),
      { numRuns: 400 },
    );
  });
});

describe('FCFS', () => {
  it('never lets a later submission take a seat an earlier one wanted and could have had', () => {
    fc.assert(
      fc.property(anyWorld, (input) => {
        const run = { ...input, config: FCFS_CONFIG };
        const courses = indexCourses(run.courses);
        const assigned = allocatedOf(new FcfsStrategy().allocate(run));

        for (const early of run.students) {
          const earlyRank = (() => {
            const held = assigned.get(early.studentId);
            return held === undefined ? null : rankOf(early, held);
          })();

          for (const late of run.students) {
            if (late.sequence <= early.sequence) {
              continue;
            }
            const taken = assigned.get(late.studentId);
            if (taken === undefined || !isAllocatable(early, taken, courses)) {
              continue;
            }
            const wanted = rankOf(early, taken);
            if (wanted === null) {
              continue;
            }
            // The earlier student was served first, so they must hold
            // something at least as good as what the later one took.
            expect(earlyRank).not.toBeNull();
            expect(earlyRank ?? Infinity).toBeLessThanOrEqual(wanted);
          }
        }
      }),
      { numRuns: 300 },
    );
  });
});

describe('performance', () => {
  it('allocates 5,000 students over 50 courses in well under a second', () => {
    const courses: AllocationCourse[] = Array.from({ length: 50 }, (_, index) => ({
      courseId: `c${index}`,
      code: `C${index}`,
      name: `Course ${index}`,
      capacity: 40,
      relevantProgramIds: new Set(index % 3 === 0 ? ['CSE'] : []),
    }));
    const students: AllocationStudent[] = Array.from({ length: 5_000 }, (_, index) => {
      // Deterministic, deliberately clustered on the low-numbered courses so
      // the popular ones are heavily oversubscribed.
      const preferences = Array.from(
        { length: 5 },
        (_unused, slot) => `c${(index * 7 + slot * 11) % 20}`,
      ).filter((courseId, slot, all) => all.indexOf(courseId) === slot);
      return {
        studentId: `s${String(index).padStart(5, '0')}`,
        sequence: index + 1,
        semester: (index % 8) + 1,
        programId: PROGRAMS[index % PROGRAMS.length] ?? 'CSE',
        expectedGraduationTerm: GRADUATION_TERMS[index % GRADUATION_TERMS.length] ?? TERM,
        preferences,
        eligibleCourseIds: new Set(preferences),
      };
    });
    const input: AllocationInput = {
      term: TERM,
      config: DEFAULT_PREFERENCE_PRIORITY_CONFIG,
      randomSeed: 2026,
      students,
      courses,
    };

    const startedAt = performance.now();
    const output = new PreferencePriorityStrategy().allocate(input);
    const elapsedMs = performance.now() - startedAt;

    expect(output.metrics.justifiedEnvy).toBe(0);
    expect(output.metrics.allocated).toBeGreaterThan(0);
    expect(elapsedMs).toBeLessThan(1_000);
  });
});
