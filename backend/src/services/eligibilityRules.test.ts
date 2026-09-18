import { describe, expect, it } from 'vitest';
import {
  evaluateEligibility,
  type EligibilityCourse,
  type EligibilityStudent,
} from './eligibilityRules.js';

const course: EligibilityCourse = {
  id: 'ai',
  minSemester: 5,
  minCredits: 80,
  eligibleProgramIds: ['cse', 'ece'],
  prerequisiteCourseIds: ['ds', 'prob'],
};

const eligibleStudent: EligibilityStudent = {
  programId: 'cse',
  semester: 6,
  creditsCompleted: 100,
  completedCourseIds: new Set(['ds', 'prob']),
};

describe('evaluateEligibility', () => {
  it('accepts a student who meets every rule', () => {
    expect(evaluateEligibility(eligibleStudent, course)).toEqual({ eligible: true });
  });

  it('treats a course without eligible programs as open to all', () => {
    const student = { ...eligibleStudent, programId: 'me' };
    expect(evaluateEligibility(student, { ...course, eligibleProgramIds: [] }).eligible).toBe(true);
  });

  it('reports every failing rule at once', () => {
    const student: EligibilityStudent = {
      programId: 'me',
      semester: 3,
      creditsCompleted: 40,
      completedCourseIds: new Set(['ds']),
    };

    expect(evaluateEligibility(student, course)).toEqual({
      eligible: false,
      reasons: [
        { code: 'PROGRAM_NOT_ELIGIBLE' },
        { code: 'SEMESTER_TOO_LOW', requiredSemester: 5, currentSemester: 3 },
        { code: 'INSUFFICIENT_CREDITS', requiredCredits: 80, completedCredits: 40 },
        { code: 'MISSING_PREREQUISITES', missingCourseIds: ['prob'] },
      ],
    });
  });

  it('rejects a course the student has already passed', () => {
    const student = { ...eligibleStudent, completedCourseIds: new Set(['ds', 'prob', 'ai']) };
    expect(evaluateEligibility(student, course)).toEqual({
      eligible: false,
      reasons: [{ code: 'ALREADY_COMPLETED' }],
    });
  });

  it('accepts boundary values (exact semester and credits)', () => {
    const student = { ...eligibleStudent, semester: 5, creditsCompleted: 80 };
    expect(evaluateEligibility(student, course).eligible).toBe(true);
  });
});
