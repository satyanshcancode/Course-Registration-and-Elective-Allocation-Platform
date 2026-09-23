import { describe, expect, it } from 'vitest';
import {
  evaluateEligibility,
  type EligibilityCourse,
  type EligibilityStudent,
} from './eligibilityRules.js';

const CSE = { id: 'cse', code: 'CSE', name: 'Computer Science and Engineering' };
const ECE = { id: 'ece', code: 'ECE', name: 'Electronics and Communication' };
const ME = { id: 'me', code: 'ME', name: 'Mechanical Engineering' };

const dataStructures = { id: 'ds', code: 'CS201', name: 'Data Structures' };
const probability = { id: 'prob', code: 'MA201', name: 'Probability and Statistics' };

const course: EligibilityCourse = {
  id: 'ai',
  minSemester: 5,
  minCredits: 80,
  eligiblePrograms: [CSE, ECE],
  prerequisites: [dataStructures, probability],
};

const eligibleStudent: EligibilityStudent = {
  programId: 'cse',
  program: { code: CSE.code, name: CSE.name },
  semester: 6,
  creditsCompleted: 100,
  completedCourseIds: new Set(['ds', 'prob']),
};

const mechanicalStudent: EligibilityStudent = {
  ...eligibleStudent,
  programId: ME.id,
  program: { code: ME.code, name: ME.name },
};

describe('evaluateEligibility', () => {
  it('accepts a student who meets every rule', () => {
    expect(evaluateEligibility(eligibleStudent, course)).toEqual({ eligible: true });
  });

  it('treats a course without eligible programs as open to all', () => {
    expect(
      evaluateEligibility(mechanicalStudent, { ...course, eligiblePrograms: [] }).eligible,
    ).toBe(true);
  });

  it('names the student’s programme and the allowed ones', () => {
    expect(evaluateEligibility(mechanicalStudent, course)).toEqual({
      eligible: false,
      reasons: [
        {
          type: 'PROGRAM_NOT_ALLOWED',
          program: { code: 'ME', name: ME.name },
          allowedPrograms: [
            { code: 'CSE', name: CSE.name },
            { code: 'ECE', name: ECE.name },
          ],
        },
      ],
    });
  });

  it('reports every failing rule at once, one reason per missing prerequisite', () => {
    const student: EligibilityStudent = {
      ...mechanicalStudent,
      semester: 3,
      creditsCompleted: 40,
      completedCourseIds: new Set<string>(),
    };

    expect(evaluateEligibility(student, course)).toEqual({
      eligible: false,
      reasons: [
        {
          type: 'PROGRAM_NOT_ALLOWED',
          program: { code: 'ME', name: ME.name },
          allowedPrograms: [
            { code: 'CSE', name: CSE.name },
            { code: 'ECE', name: ECE.name },
          ],
        },
        { type: 'SEMESTER_TOO_LOW', required: 5, actual: 3 },
        { type: 'CREDITS_TOO_LOW', required: 80, actual: 40 },
        { type: 'PREREQUISITE_MISSING', course: { code: 'CS201', name: 'Data Structures' } },
        {
          type: 'PREREQUISITE_MISSING',
          course: { code: 'MA201', name: 'Probability and Statistics' },
        },
      ],
    });
  });

  it('reports only the prerequisite that is actually missing', () => {
    const student = { ...eligibleStudent, completedCourseIds: new Set(['ds']) };
    expect(evaluateEligibility(student, course)).toEqual({
      eligible: false,
      reasons: [
        {
          type: 'PREREQUISITE_MISSING',
          course: { code: 'MA201', name: 'Probability and Statistics' },
        },
      ],
    });
  });

  it('rejects a course the student has already passed', () => {
    const student = { ...eligibleStudent, completedCourseIds: new Set(['ds', 'prob', 'ai']) };
    expect(evaluateEligibility(student, course)).toEqual({
      eligible: false,
      reasons: [{ type: 'ALREADY_COMPLETED' }],
    });
  });

  it('accepts boundary values (exact semester and credits)', () => {
    const student = { ...eligibleStudent, semester: 5, creditsCompleted: 80 };
    expect(evaluateEligibility(student, course).eligible).toBe(true);
  });
});
