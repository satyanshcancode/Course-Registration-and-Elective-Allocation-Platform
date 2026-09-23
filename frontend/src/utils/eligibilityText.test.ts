import { INELIGIBILITY_REASON_TYPES, type IneligibilityReason } from '@course-reg/shared';
import { describe, expect, it } from 'vitest';
import { describeEligibilityCount, describeReason } from './eligibilityText';

const cases: [IneligibilityReason, string][] = [
  [
    {
      type: 'PROGRAM_NOT_ALLOWED',
      program: { code: 'ME', name: 'Mechanical Engineering' },
      allowedPrograms: [
        { code: 'CSE', name: 'Computer Science' },
        { code: 'ECE', name: 'Electronics' },
      ],
    },
    'Open to CSE and ECE only — you’re in ME',
  ],
  [{ type: 'SEMESTER_TOO_LOW', required: 5, actual: 4 }, 'Needs semester 5 — you’re in semester 4'],
  [{ type: 'CREDITS_TOO_LOW', required: 80, actual: 44 }, 'Needs 80 credits — you have 44'],
  [
    { type: 'PREREQUISITE_MISSING', course: { code: 'CS201', name: 'Data Structures' } },
    'Complete CS201 Data Structures first',
  ],
  [{ type: 'ALREADY_COMPLETED' }, 'You’ve already passed this course'],
];

describe('describeReason', () => {
  it.each(cases)('%o', (reason, text) => {
    expect(describeReason(reason)).toBe(text);
  });

  it('covers every member of the reason union', () => {
    // The formatter's `never` check makes an unhandled type a compile error;
    // this keeps the test table from falling behind the union too.
    expect(new Set(cases.map(([reason]) => reason.type))).toEqual(
      new Set(INELIGIBILITY_REASON_TYPES),
    );
  });

  it('names a single allowed programme without a list', () => {
    expect(
      describeReason({
        type: 'PROGRAM_NOT_ALLOWED',
        program: { code: 'BBA', name: 'Business' },
        allowedPrograms: [{ code: 'CSE', name: 'Computer Science' }],
      }),
    ).toBe('Open to CSE only — you’re in BBA');
  });
});

describe('describeEligibilityCount', () => {
  it('counts the courses the student can take', () => {
    expect(describeEligibilityCount(12, 20)).toBe('You’re eligible for 12 of 20 courses');
    expect(describeEligibilityCount(1, 1)).toBe('You’re eligible for 1 of 1 course');
    expect(describeEligibilityCount(0, 0)).toBe('No courses are offered yet');
  });
});
