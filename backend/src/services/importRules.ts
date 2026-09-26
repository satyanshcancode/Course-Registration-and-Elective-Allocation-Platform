/**
 * Judging one line of a CSV import.
 *
 * Pure: a row, plus what already exists, in — a verdict out. No database, no
 * clock. That is what lets the dry run and the confirm reach the SAME verdict
 * for the same file, which is the promise the preview makes.
 *
 * The verdicts are deliberately three, not two:
 *   ok        — valid and new;
 *   duplicate — valid, but the roll number, e-mail or code is taken (by the
 *               database, or by an earlier line of the same file);
 *   invalid   — unusable, with one message per bad column.
 *
 * Nothing here decides what to WRITE. The service does that, and only for rows
 * this returns `ok` for.
 */
import {
  type CSV_LIST_SEPARATOR,
  isAcademicTerm,
  type CsvCellError,
  type CsvRowVerdict,
} from '@course-reg/shared';
import { readCsvList } from '../utils/csv.js';

/**
 * How CSV_LIST_SEPARATOR reads in a message. Written out rather than derived,
 * because the separator is a literal constant and a conditional on it would be
 * dead code. The type below is the guard: if the shared separator ever stops
 * being a space, this stops compiling and the wording must be updated with it.
 */
type SeparatorIsASpace = typeof CSV_LIST_SEPARATOR extends ' ' ? 'a space' : never;
const SEPARATOR_WORD: SeparatorIsASpace = 'a space';

export interface RowContext {
  /** Codes/numbers already in the database. */
  existingRollNumbers: ReadonlySet<string>;
  existingEmails: ReadonlySet<string>;
  existingCourseCodes: ReadonlySet<string>;
  programCodes: ReadonlySet<string>;
  departmentCodes: ReadonlySet<string>;
  /** Roll numbers and e-mails claimed by EARLIER lines of the same file. */
  seenRollNumbers: ReadonlySet<string>;
  seenEmails: ReadonlySet<string>;
  seenCourseCodes: ReadonlySet<string>;
}

/** A row that passed validation, ready for the service to write. */
export interface ParsedStudentRow {
  rollNumber: string;
  name: string;
  email: string;
  programCode: string;
  semester: number;
  creditsCompleted: number;
  expectedGraduationTerm: string;
  completedCourses: string[];
}

export interface ParsedCourseRow {
  code: string;
  name: string;
  credits: number;
  departmentCode: string;
  description: string;
  minSemester: number;
  minCredits: number;
  prerequisites: string[];
  eligiblePrograms: string[];
  relevantPrograms: string[];
}

export type RowJudgement<T> =
  { verdict: CsvRowVerdict; parsed: T } | { verdict: CsvRowVerdict; parsed: null };

/** Collects one message per bad column, so a row reports every problem at once. */
class Problems {
  private readonly errors: CsvCellError[] = [];

  add(column: string, message: string): void {
    this.errors.push({ column, message });
  }

  get any(): boolean {
    return this.errors.length > 0;
  }

  get list(): CsvCellError[] {
    return this.errors;
  }
}

/** A required, length-bounded text cell. */
function text(
  problems: Problems,
  values: Record<string, string>,
  column: string,
  max: number,
): string {
  const value = values[column] ?? '';
  if (value === '') {
    problems.add(column, 'is required');
  } else if (value.length > max) {
    problems.add(column, `must be ${max} characters or fewer`);
  }
  return value;
}

/** A whole number in range. Rejects "5.5" and "5x" rather than rounding them. */
function integer(
  problems: Problems,
  values: Record<string, string>,
  column: string,
  min: number,
  max: number,
): number {
  const raw = values[column] ?? '';
  if (raw === '') {
    problems.add(column, 'is required');
    return Number.NaN;
  }
  if (!/^-?\d+$/.test(raw)) {
    problems.add(column, `must be a whole number (got "${raw}")`);
    return Number.NaN;
  }
  const value = Number(raw);
  if (value < min || value > max) {
    problems.add(column, `must be between ${min} and ${max} (got ${value})`);
  }
  return value;
}

/** A space-separated list of codes, each of which must already exist. */
function codeList(
  problems: Problems,
  values: Record<string, string>,
  column: string,
  known: ReadonlySet<string>,
  noun: string,
): string[] {
  const codes = readCsvList(values[column] ?? '').map((code) => code.toUpperCase());
  const unknown = codes.filter((code) => !known.has(code));
  if (unknown.length > 0) {
    problems.add(
      column,
      `${unknown.length === 1 ? `no ${noun}` : `no ${noun}s`} with ${unknown.length === 1 ? 'code' : 'codes'} ${unknown.join(', ')} (separate several with ${SEPARATOR_WORD})`,
    );
  }
  const duplicates = codes.filter((code, index) => codes.indexOf(code) !== index);
  if (duplicates.length > 0) {
    problems.add(column, `lists ${[...new Set(duplicates)].join(', ')} more than once`);
  }
  return codes;
}

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const ROLL_NUMBER_PATTERN = /^[A-Z0-9]{4,20}$/;
const COURSE_CODE_PATTERN = /^[A-Z]{2,4}\d{3}$/;

export function judgeStudentRow(
  values: Record<string, string>,
  context: RowContext,
): RowJudgement<ParsedStudentRow> {
  const problems = new Problems();

  // Roll numbers and course codes are upper-case in the database, so a file
  // typed in lower case is accepted rather than rejected on a formality.
  const rollNumber = (values.rollNumber ?? '').toUpperCase();
  if (rollNumber === '') {
    problems.add('rollNumber', 'is required');
  } else if (!ROLL_NUMBER_PATTERN.test(rollNumber)) {
    problems.add('rollNumber', 'must be 4 to 20 letters or digits');
  }

  const name = text(problems, values, 'name', 120);

  const email = (values.email ?? '').toLowerCase();
  if (email === '') {
    problems.add('email', 'is required');
  } else if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    problems.add('email', 'is not a valid e-mail address');
  }

  const programCode = (values.program ?? '').toUpperCase();
  if (programCode === '') {
    problems.add('program', 'is required');
  } else if (!context.programCodes.has(programCode)) {
    problems.add('program', `no programme with code ${programCode}`);
  }

  const semester = integer(problems, values, 'semester', 1, 8);
  const creditsCompleted = integer(problems, values, 'creditsCompleted', 0, 400);

  const expectedGraduationTerm = (values.expectedGraduationTerm ?? '').toUpperCase();
  if (expectedGraduationTerm === '') {
    problems.add('expectedGraduationTerm', 'is required');
  } else if (!isAcademicTerm(expectedGraduationTerm)) {
    problems.add('expectedGraduationTerm', 'must look like 2028-SPRING or 2028-FALL');
  }

  const completedCourses = codeList(
    problems,
    values,
    'completedCourses',
    context.existingCourseCodes,
    'course',
  );

  if (problems.any) {
    return { verdict: { kind: 'invalid', errors: problems.list }, parsed: null };
  }

  // Only a row that is otherwise valid can be a duplicate: reporting "already
  // exists" about a row whose e-mail is malformed would be misleading.
  const clash =
    context.existingRollNumbers.has(rollNumber) || context.seenRollNumbers.has(rollNumber)
      ? `roll number ${rollNumber} is already taken`
      : context.existingEmails.has(email) || context.seenEmails.has(email)
        ? `e-mail ${email} is already taken`
        : null;

  const parsed: ParsedStudentRow = {
    rollNumber,
    name,
    email,
    programCode,
    semester,
    creditsCompleted,
    expectedGraduationTerm,
    completedCourses,
  };
  return clash === null
    ? { verdict: { kind: 'ok' }, parsed }
    : { verdict: { kind: 'duplicate', message: clash }, parsed: null };
}

export function judgeCourseRow(
  values: Record<string, string>,
  context: RowContext,
): RowJudgement<ParsedCourseRow> {
  const problems = new Problems();

  const code = (values.code ?? '').toUpperCase();
  if (code === '') {
    problems.add('code', 'is required');
  } else if (!COURSE_CODE_PATTERN.test(code)) {
    problems.add('code', 'must be 2 to 4 letters then 3 digits, e.g. CS401');
  }

  const name = text(problems, values, 'name', 120);
  const credits = integer(problems, values, 'credits', 1, 10);

  const departmentCode = (values.department ?? '').toUpperCase();
  if (departmentCode === '') {
    problems.add('department', 'is required');
  } else if (!context.departmentCodes.has(departmentCode)) {
    problems.add('department', `no department with code ${departmentCode}`);
  }

  const description = values.description ?? '';
  if (description.length > 2000) {
    problems.add('description', 'must be 2000 characters or fewer');
  }

  const minSemester = integer(problems, values, 'minSemester', 1, 8);
  const minCredits = integer(problems, values, 'minCredits', 0, 400);

  const prerequisites = codeList(
    problems,
    values,
    'prerequisites',
    context.existingCourseCodes,
    'course',
  );
  if (prerequisites.includes(code)) {
    problems.add('prerequisites', 'cannot include the course itself');
  }

  const eligiblePrograms = codeList(
    problems,
    values,
    'eligiblePrograms',
    context.programCodes,
    'programme',
  );
  const relevantPrograms = codeList(
    problems,
    values,
    'relevantPrograms',
    context.programCodes,
    'programme',
  );
  // A relevance bonus for a programme that may not take the course at all is a
  // rule that can never fire, so it is a mistake worth naming.
  const irrelevant =
    eligiblePrograms.length === 0
      ? []
      : relevantPrograms.filter((program) => !eligiblePrograms.includes(program));
  if (irrelevant.length > 0) {
    problems.add(
      'relevantPrograms',
      `${irrelevant.join(', ')} cannot take this course, so the relevance bonus would never apply`,
    );
  }

  if (problems.any) {
    return { verdict: { kind: 'invalid', errors: problems.list }, parsed: null };
  }

  const clash =
    context.existingCourseCodes.has(code) || context.seenCourseCodes.has(code)
      ? `course code ${code} already exists`
      : null;

  const parsed: ParsedCourseRow = {
    code,
    name,
    credits,
    departmentCode,
    description,
    minSemester,
    minCredits,
    prerequisites,
    eligiblePrograms,
    relevantPrograms,
  };
  return clash === null
    ? { verdict: { kind: 'ok' }, parsed }
    : { verdict: { kind: 'duplicate', message: clash }, parsed: null };
}
