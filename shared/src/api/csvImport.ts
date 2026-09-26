/**
 * CSV import, in two steps: a dry run that judges every row, then a confirm
 * that writes the valid ones in ONE transaction.
 *
 * The preview and the confirm answer with the SAME `CsvImportReport`, so the
 * screen that lists the problems before the import is the screen that reports
 * what happened afterwards. `applied` is what tells them apart.
 */

/** What a single line of the file is worth. */
export type CsvRowVerdict =
  /** Valid and new: it will be (or was) created. */
  | { kind: 'ok' }
  /** Valid, but something already has this roll number, e-mail or code. */
  | { kind: 'duplicate'; message: string }
  /** Unusable: one message per bad column. */
  | { kind: 'invalid'; errors: CsvCellError[] };

export interface CsvCellError {
  /** The CSV column, e.g. "email" — or "(row)" for a whole-row problem. */
  column: string;
  message: string;
}

export interface CsvImportRow {
  /** 1-based line number in the uploaded file, header excluded. */
  line: number;
  /** The columns as they were read, for showing the row back unchanged. */
  values: Record<string, string>;
  verdict: CsvRowVerdict;
}

export interface CsvImportReport {
  /** False for the dry run, true once the rows were written. */
  applied: boolean;
  rows: CsvImportRow[];
  counts: {
    total: number;
    ok: number;
    duplicate: number;
    invalid: number;
    /** Rows actually written; 0 for a dry run. */
    imported: number;
  };
  /** Set when the file itself could not be read at all (no rows are reported). */
  fileError: string | null;
  /**
   * For students: how many invitation e-mails went out. Null when the import
   * sends none (courses) or was a dry run.
   */
  invitationsSent: number | null;
}

/** POST body of both the preview and the confirm endpoints. */
export interface CsvImportRequest {
  /** The file's text, as read in the browser. */
  csv: string;
}

/** Cap on an uploaded file, checked in the browser and again on the server. */
export const CSV_MAX_BYTES = 512 * 1024;

/** Cap on rows, so one paste cannot create thousands of accounts by accident. */
export const CSV_MAX_ROWS = 1000;

export const STUDENT_CSV_COLUMNS = [
  'rollNumber',
  'name',
  'email',
  'program',
  'semester',
  'creditsCompleted',
  'expectedGraduationTerm',
  'completedCourses',
] as const;

export const COURSE_CSV_COLUMNS = [
  'code',
  'name',
  'credits',
  'department',
  'description',
  'minSemester',
  'minCredits',
  'prerequisites',
  'eligiblePrograms',
  'relevantPrograms',
] as const;

/** Lists inside one cell are separated by this, e.g. "CS201 CS202". */
export const CSV_LIST_SEPARATOR = ' ';

/** Quotes a value for a CSV cell, doubling any quote inside it (RFC 4180). */
export function toCsvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/** One CSV line from its cells. */
export function toCsvLine(cells: readonly string[]): string {
  return cells.map(toCsvCell).join(',');
}

/**
 * A template file: the header row plus one example, so the expected format of
 * every column — and of the space-separated lists — is visible at a glance.
 */
export function buildCsvTemplate(columns: readonly string[], example: readonly string[]): string {
  return `${toCsvLine(columns)}\n${toCsvLine(example)}\n`;
}

export const STUDENT_CSV_EXAMPLE = [
  'CSE26001',
  'Asha Menon',
  'asha.menon@university.edu',
  'BTECH-CSE',
  '5',
  '88',
  '2028-SPRING',
  'MA201 CS201',
] as const;

export const COURSE_CSV_EXAMPLE = [
  'CS410',
  'Distributed Systems',
  '4',
  'CSE',
  'Consensus, replication and fault tolerance in systems that span machines.',
  '5',
  '80',
  'CS301',
  'BTECH-CSE BTECH-ECE',
  'BTECH-CSE',
] as const;
