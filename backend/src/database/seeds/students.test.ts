import { compareTerms } from '@course-reg/shared';
import { describe, expect, it } from 'vitest';
import { createSeededRandom } from '../../utils/random.js';
import { COURSES, SEED_TERM } from './catalog.js';
import { DEMO_STUDENTS } from './demoAccounts.js';
import { buildSeedStudents, countEligibleStudents, SEED_RANDOM_SEED } from './seedDatabase.js';
import { generateStudents } from './students.js';

describe('generateStudents', () => {
  it('is deterministic for a given seed', () => {
    const first = generateStudents(createSeededRandom(SEED_RANDOM_SEED));
    const second = generateStudents(createSeededRandom(SEED_RANDOM_SEED));

    expect(second).toEqual(first);
    expect(generateStudents(createSeededRandom(1))).not.toEqual(first);
  });

  it('produces values that satisfy the database constraints', () => {
    const students = buildSeedStudents();

    expect(students).toHaveLength(300);
    expect(new Set(students.map((s) => s.rollNumber)).size).toBe(300);
    expect(new Set(students.map((s) => s.email)).size).toBe(300);
    expect(students.every((s) => s.semester >= 1 && s.semester <= 8)).toBe(true);
    expect(students.every((s) => s.creditsCompleted >= 0)).toBe(true);
    expect(students.every((s) => /^[A-Z0-9]{4,20}$/.test(s.rollNumber))).toBe(true);
    expect(students.every((s) => compareTerms(s.expectedGraduationTerm, SEED_TERM) >= 0)).toBe(
      true,
    );
  });

  it('only records completed courses whose prerequisites were also completed', () => {
    const prerequisites = new Map(COURSES.map((c) => [c.code, c.prerequisites]));
    const violations = buildSeedStudents().filter((student) => {
      const passed = new Set(student.completedCourses.map((c) => c.code));
      return [...passed].some((code) =>
        (prerequisites.get(code) ?? []).some((required) => !passed.has(required)),
      );
    });

    expect(violations).toEqual([]);
  });
});

describe('demo case', () => {
  it('has at least 100 students eligible for Artificial Intelligence', () => {
    expect(countEligibleStudents(buildSeedStudents(), 'CS401')).toBeGreaterThanOrEqual(100);
  });

  it('gives each named demo student the documented situation', () => {
    const byEmail = new Map(DEMO_STUDENTS.map((s) => [s.email, s]));
    const eligibleForAi = (email: string) => {
      const student = byEmail.get(email);
      return student ? countEligibleStudents([student], 'CS401') === 1 : undefined;
    };

    expect(eligibleForAi('aarav.sharma@university.edu')).toBe(true);
    expect(eligibleForAi('priya.nair@university.edu')).toBe(true);
    expect(eligibleForAi('rohan.verma@university.edu')).toBe(true);
    expect(eligibleForAi('meera.iyer@university.edu')).toBe(false);
    expect(byEmail.get('rohan.verma@university.edu')?.expectedGraduationTerm).toBe(SEED_TERM);
  });
});
