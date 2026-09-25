/**
 * Turning database rows into the engine's input, and back again.
 *
 * The snapshot stored with a run IS the engine's input, written as plain JSON
 * (sets become arrays). That is what makes "verify" meaningful: the same
 * numbers go back through the same code, rather than being rebuilt from
 * today's database, which has moved on.
 */
import {
  isAcademicTerm,
  isAllocationConfig,
  type AcademicTerm,
  type AllocationConfig,
} from '@course-reg/shared';
import type { AllocationCourse, AllocationInput, AllocationStudent } from '../allocation/types.js';
import type { AllocationSnapshot } from '../repositories/allocationRepository.js';
import { evaluateEligibility } from './eligibilityRules.js';

/** The JSON shape of a stored input snapshot. */
export interface StoredAllocationInput {
  term: string;
  config: AllocationConfig;
  randomSeed: number;
  students: {
    studentId: string;
    sequence: number;
    semester: number;
    programId: string;
    expectedGraduationTerm: string;
    preferences: string[];
    eligibleCourseIds: string[];
  }[];
  courses: {
    courseId: string;
    code: string;
    name: string;
    capacity: number;
    relevantProgramIds: string[];
  }[];
}

/**
 * Eligibility is recomputed here, from rows read at allocation time — never
 * taken from whatever was true when the cart was submitted. A student who has
 * since changed programme, or a course that gained a prerequisite, is caught.
 */
export function toEngineInput(snapshot: AllocationSnapshot): AllocationInput {
  // Only the ids matter to the rule; the codes and names it would put in a
  // reason are never shown here, because the engine only needs the boolean.
  const ref = (id: string) => ({ id, code: id, name: id });

  const courses: AllocationCourse[] = snapshot.courses.map((course) => ({
    courseId: course.courseId,
    code: course.code,
    name: course.name,
    // Seats already held (there should be none before the first run) are not
    // available to this run.
    capacity: Math.max(0, course.capacity - course.allocated),
    relevantProgramIds: new Set(course.relevantProgramIds),
  }));

  const students: AllocationStudent[] = snapshot.students.map((student) => {
    const facts = {
      programId: student.programId,
      program: ref(student.programId),
      semester: student.semester,
      creditsCompleted: student.creditsCompleted,
      completedCourseIds: new Set(student.completedCourseIds),
    };
    const eligible = snapshot.courses
      .filter(
        (course) =>
          evaluateEligibility(facts, {
            id: course.courseId,
            minSemester: course.minSemester,
            minCredits: course.minCredits,
            eligiblePrograms: course.eligibleProgramIds.map(ref),
            prerequisites: course.prerequisiteCourseIds.map(ref),
          }).eligible,
      )
      .map((course) => course.courseId);

    return {
      studentId: student.studentId,
      sequence: student.sequence,
      semester: student.semester,
      programId: student.programId,
      expectedGraduationTerm: student.expectedGraduationTerm,
      preferences: student.preferences,
      eligibleCourseIds: new Set(eligible),
    };
  });

  return {
    term: snapshot.term,
    config: snapshot.config,
    randomSeed: snapshot.randomSeed,
    students,
    courses,
  };
}

/** The engine's input as JSON, for `allocation_runs.input_snapshot`. */
export function toStoredInput(input: AllocationInput): StoredAllocationInput {
  return {
    term: input.term,
    config: input.config,
    randomSeed: input.randomSeed,
    students: input.students.map((student) => ({
      studentId: student.studentId,
      sequence: student.sequence,
      semester: student.semester,
      programId: student.programId,
      expectedGraduationTerm: student.expectedGraduationTerm,
      preferences: [...student.preferences],
      eligibleCourseIds: [...student.eligibleCourseIds].sort(),
    })),
    courses: input.courses.map((course) => ({
      courseId: course.courseId,
      code: course.code,
      name: course.name,
      capacity: course.capacity,
      relevantProgramIds: [...course.relevantProgramIds].sort(),
    })),
  };
}

function isStoredInput(value: unknown): value is StoredAllocationInput {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<StoredAllocationInput>;
  return (
    isAcademicTerm(candidate.term) &&
    isAllocationConfig(candidate.config) &&
    typeof candidate.randomSeed === 'number' &&
    Array.isArray(candidate.students) &&
    Array.isArray(candidate.courses)
  );
}

/** Rebuilds the engine's input from a stored snapshot, for a verification run. */
export function fromStoredInput(value: unknown): AllocationInput {
  if (!isStoredInput(value)) {
    throw new Error('The stored input snapshot is not a valid allocation input');
  }
  return {
    term: value.term as AcademicTerm,
    config: value.config,
    randomSeed: value.randomSeed,
    students: value.students.map((student) => ({
      ...student,
      expectedGraduationTerm: student.expectedGraduationTerm as AcademicTerm,
      eligibleCourseIds: new Set(student.eligibleCourseIds),
    })),
    courses: value.courses.map((course) => ({
      ...course,
      relevantProgramIds: new Set(course.relevantProgramIds),
    })),
  };
}
