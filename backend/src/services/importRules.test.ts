import { describe, expect, it } from 'vitest';
import { judgeCourseRow, judgeStudentRow, type RowContext } from './importRules.js';

const context: RowContext = {
  existingRollNumbers: new Set(['CSE26999']),
  existingEmails: new Set(['taken@university.edu']),
  existingCourseCodes: new Set(['CS201', 'CS301', 'MA201']),
  programCodes: new Set(['BTECH-CSE', 'BTECH-ECE']),
  departmentCodes: new Set(['CSE', 'ECE']),
  seenRollNumbers: new Set(),
  seenEmails: new Set(),
  seenCourseCodes: new Set(),
};

const studentRow = {
  rollNumber: 'CSE26001',
  name: 'Asha Menon',
  email: 'asha.menon@university.edu',
  program: 'BTECH-CSE',
  semester: '5',
  creditsCompleted: '88',
  expectedGraduationTerm: '2028-SPRING',
  completedCourses: 'MA201 CS201',
};

/** The column names of an invalid verdict, for terse assertions. */
function badColumns(verdict: ReturnType<typeof judgeStudentRow>['verdict']): string[] {
  return verdict.kind === 'invalid' ? verdict.errors.map((error) => error.column) : [];
}

describe('judgeStudentRow', () => {
  it('accepts a complete row and parses every column', () => {
    const judgement = judgeStudentRow(studentRow, context);

    expect(judgement.verdict).toEqual({ kind: 'ok' });
    expect(judgement.parsed).toEqual({
      rollNumber: 'CSE26001',
      name: 'Asha Menon',
      email: 'asha.menon@university.edu',
      programCode: 'BTECH-CSE',
      semester: 5,
      creditsCompleted: 88,
      expectedGraduationTerm: '2028-SPRING',
      completedCourses: ['MA201', 'CS201'],
    });
  });

  it('upper-cases codes and lower-cases the e-mail rather than failing on case', () => {
    const judgement = judgeStudentRow(
      {
        ...studentRow,
        rollNumber: 'cse26002',
        email: 'Asha.MENON@University.edu',
        program: 'btech-cse',
        completedCourses: 'ma201',
        expectedGraduationTerm: '2028-spring',
      },
      context,
    );

    expect(judgement.verdict).toEqual({ kind: 'ok' });
    expect(judgement.parsed).toMatchObject({
      rollNumber: 'CSE26002',
      email: 'asha.menon@university.edu',
      programCode: 'BTECH-CSE',
      completedCourses: ['MA201'],
      expectedGraduationTerm: '2028-SPRING',
    });
  });

  it('accepts an empty completed-courses cell', () => {
    const judgement = judgeStudentRow({ ...studentRow, completedCourses: '' }, context);
    expect(judgement.verdict).toEqual({ kind: 'ok' });
    expect(judgement.parsed?.completedCourses).toEqual([]);
  });

  it('reports EVERY bad column at once, not just the first', () => {
    const judgement = judgeStudentRow(
      {
        rollNumber: 'x',
        name: '',
        email: 'not-an-email',
        program: 'BTECH-NOPE',
        semester: '9',
        creditsCompleted: 'lots',
        expectedGraduationTerm: 'next year',
        completedCourses: 'CS999',
      },
      context,
    );

    expect(badColumns(judgement.verdict)).toEqual([
      'rollNumber',
      'name',
      'email',
      'program',
      'semester',
      'creditsCompleted',
      'expectedGraduationTerm',
      'completedCourses',
    ]);
    expect(judgement.parsed).toBeNull();
  });

  it('rejects a fractional semester instead of rounding it', () => {
    const judgement = judgeStudentRow({ ...studentRow, semester: '5.5' }, context);
    expect(badColumns(judgement.verdict)).toEqual(['semester']);
  });

  it('names an unknown completed course', () => {
    const judgement = judgeStudentRow({ ...studentRow, completedCourses: 'CS201 CS777' }, context);
    expect(judgement.verdict).toMatchObject({
      kind: 'invalid',
      errors: [{ column: 'completedCourses', message: expect.stringContaining('CS777') as string }],
    });
  });

  it('calls out a roll number the database already holds', () => {
    const judgement = judgeStudentRow({ ...studentRow, rollNumber: 'CSE26999' }, context);
    expect(judgement.verdict).toEqual({
      kind: 'duplicate',
      message: 'roll number CSE26999 is already taken',
    });
    expect(judgement.parsed).toBeNull();
  });

  it('calls out an e-mail the database already holds', () => {
    const judgement = judgeStudentRow({ ...studentRow, email: 'taken@university.edu' }, context);
    expect(judgement.verdict).toEqual({
      kind: 'duplicate',
      message: 'e-mail taken@university.edu is already taken',
    });
  });

  it('calls out a clash with an EARLIER line of the same file', () => {
    const withinFile: RowContext = {
      ...context,
      seenRollNumbers: new Set(['CSE26001']),
      seenEmails: new Set(['other@university.edu']),
    };
    expect(judgeStudentRow(studentRow, withinFile).verdict).toMatchObject({ kind: 'duplicate' });
    expect(
      judgeStudentRow({ ...studentRow, email: 'other@university.edu' }, context).verdict,
    ).toEqual({ kind: 'ok' });
    expect(
      judgeStudentRow(
        { ...studentRow, rollNumber: 'CSE26002', email: 'other@university.edu' },
        withinFile,
      ).verdict,
    ).toMatchObject({ kind: 'duplicate' });
  });

  it('prefers "invalid" over "duplicate": a malformed row is not an existing one', () => {
    const judgement = judgeStudentRow({ ...studentRow, rollNumber: 'CSE26999', name: '' }, context);
    expect(judgement.verdict.kind).toBe('invalid');
  });
});

const courseRow = {
  code: 'CS410',
  name: 'Distributed Systems',
  credits: '4',
  department: 'CSE',
  description: 'Consensus and replication.',
  minSemester: '5',
  minCredits: '80',
  prerequisites: 'CS301',
  eligiblePrograms: 'BTECH-CSE BTECH-ECE',
  relevantPrograms: 'BTECH-CSE',
};

describe('judgeCourseRow', () => {
  it('accepts a complete row and parses every column', () => {
    const judgement = judgeCourseRow(courseRow, context);

    expect(judgement.verdict).toEqual({ kind: 'ok' });
    expect(judgement.parsed).toEqual({
      code: 'CS410',
      name: 'Distributed Systems',
      credits: 4,
      departmentCode: 'CSE',
      description: 'Consensus and replication.',
      minSemester: 5,
      minCredits: 80,
      prerequisites: ['CS301'],
      eligiblePrograms: ['BTECH-CSE', 'BTECH-ECE'],
      relevantPrograms: ['BTECH-CSE'],
    });
  });

  it('accepts empty rule lists and an empty description', () => {
    const judgement = judgeCourseRow(
      {
        ...courseRow,
        description: '',
        prerequisites: '',
        eligiblePrograms: '',
        relevantPrograms: '',
      },
      context,
    );
    expect(judgement.verdict).toEqual({ kind: 'ok' });
    expect(judgement.parsed).toMatchObject({
      description: '',
      prerequisites: [],
      eligiblePrograms: [],
      relevantPrograms: [],
    });
  });

  it('rejects a malformed course code', () => {
    expect(badColumns(judgeCourseRow({ ...courseRow, code: 'CS4100' }, context).verdict)).toEqual([
      'code',
    ]);
  });

  it('rejects a course that is its own prerequisite', () => {
    const judgement = judgeCourseRow(
      { ...courseRow, code: 'CS301', prerequisites: 'CS301' },
      context,
    );
    // CS301 also already exists, but "invalid" wins over "duplicate".
    expect(judgement.verdict).toMatchObject({
      kind: 'invalid',
      errors: [{ column: 'prerequisites', message: 'cannot include the course itself' }],
    });
  });

  it('rejects a relevance bonus for a programme that may not take the course', () => {
    const judgement = judgeCourseRow(
      { ...courseRow, eligiblePrograms: 'BTECH-CSE', relevantPrograms: 'BTECH-ECE' },
      context,
    );
    expect(judgement.verdict).toMatchObject({
      kind: 'invalid',
      errors: [
        { column: 'relevantPrograms', message: expect.stringContaining('BTECH-ECE') as string },
      ],
    });
  });

  it('allows a relevance bonus when the course is open to every programme', () => {
    const judgement = judgeCourseRow(
      { ...courseRow, eligiblePrograms: '', relevantPrograms: 'BTECH-ECE' },
      context,
    );
    expect(judgement.verdict).toEqual({ kind: 'ok' });
  });

  it('rejects a list that repeats a code', () => {
    const judgement = judgeCourseRow(
      { ...courseRow, eligiblePrograms: 'BTECH-CSE BTECH-CSE' },
      context,
    );
    expect(judgement.verdict).toMatchObject({
      kind: 'invalid',
      errors: [
        {
          column: 'eligiblePrograms',
          message: expect.stringContaining('more than once') as string,
        },
      ],
    });
  });

  it('calls out a course code that already exists', () => {
    expect(judgeCourseRow({ ...courseRow, code: 'CS201' }, context).verdict).toEqual({
      kind: 'duplicate',
      message: 'course code CS201 already exists',
    });
  });

  it('calls out a code claimed by an earlier line of the same file', () => {
    const judgement = judgeCourseRow(courseRow, {
      ...context,
      seenCourseCodes: new Set(['CS410']),
    });
    expect(judgement.verdict).toMatchObject({ kind: 'duplicate' });
  });
});
