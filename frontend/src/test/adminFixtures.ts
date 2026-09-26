import type {
  AdminCatalogue,
  AdminCourseRecord,
  AdminReferenceData,
  AdminStudentDetail,
  AdminStudentListItem,
  AdminStudentPage,
  CsvImportReport,
  CsvImportRow,
} from '@course-reg/shared';

/** Fixtures for the administrator's student and catalogue screens. */

export const referenceData: AdminReferenceData = {
  programs: [
    { code: 'BTECH-CSE', name: 'B.Tech Computer Science and Engineering' },
    { code: 'BTECH-ECE', name: 'B.Tech Electronics and Communication' },
  ],
  departments: [
    { code: 'CSE', name: 'Computer Science' },
    { code: 'ECE', name: 'Electronics' },
  ],
  courses: [
    { code: 'CS201', name: 'Data Structures' },
    { code: 'CS301', name: 'Operating Systems' },
    { code: 'MA201', name: 'Linear Algebra' },
  ],
};

export function studentListItem(
  overrides: Partial<AdminStudentListItem> = {},
): AdminStudentListItem {
  return {
    rollNumber: 'CSE26001',
    name: 'Asha Menon',
    email: 'asha.menon@university.edu',
    program: { code: 'BTECH-CSE', name: 'B.Tech Computer Science and Engineering' },
    semester: 5,
    creditsCompleted: 88,
    expectedGraduationTerm: '2028-SPRING',
    status: 'INVITED',
    invitationPending: true,
    ...overrides,
  };
}

export function studentPage(
  items: AdminStudentListItem[] = [studentListItem()],
  overrides: Partial<AdminStudentPage> = {},
): AdminStudentPage {
  return {
    items,
    total: items.length,
    page: 1,
    pageSize: 20,
    pageCount: 1,
    programs: referenceData.programs,
    ...overrides,
  };
}

/**
 * A live invitation, relative to now rather than a fixed date: the expiry
 * wording is computed against the clock, so a hard-coded timestamp would start
 * reading "expired" the moment it passed.
 */
export function invitationExpiringSoon(hours = 40): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

export function studentDetail(overrides: Partial<AdminStudentDetail> = {}): AdminStudentDetail {
  return {
    student: studentListItem(),
    completedCourses: [{ code: 'CS201', name: 'Data Structures' }],
    status: {
      window: null,
      submission: null,
      held: null,
      waiting: [],
      addDrop: {
        opensAt: null,
        closesAt: null,
        open: false,
        closedReason: 'No add/drop period has been scheduled yet.',
      },
      serverTime: '2026-09-01T10:00:00.000Z',
    },
    history: [],
    invitationExpiresAt: invitationExpiringSoon(),
    ...overrides,
  };
}

export function courseRecord(overrides: Partial<AdminCourseRecord> = {}): AdminCourseRecord {
  return {
    code: 'CS410',
    name: 'Distributed Systems',
    credits: 4,
    department: { code: 'CSE', name: 'Computer Science' },
    description: 'Consensus, replication and fault tolerance.',
    minSemester: 5,
    minCredits: 80,
    prerequisites: [{ code: 'CS301', name: 'Operating Systems' }],
    eligiblePrograms: [{ code: 'BTECH-CSE', name: 'B.Tech Computer Science and Engineering' }],
    relevantPrograms: [{ code: 'BTECH-CSE', name: 'B.Tech Computer Science and Engineering' }],
    isActive: true,
    offeredIn: [],
    canDeactivate: true,
    ...overrides,
  };
}

export function catalogue(
  courses: AdminCourseRecord[] = [courseRecord()],
  overrides: Partial<AdminCatalogue> = {},
): AdminCatalogue {
  return {
    courses,
    departments: referenceData.departments,
    programs: referenceData.programs,
    ...overrides,
  };
}

/** A report whose counts are derived from its rows, as the server's are. */
export function importReport(
  rows: CsvImportRow[],
  overrides: Partial<CsvImportReport> = {},
): CsvImportReport {
  const count = (kind: CsvImportRow['verdict']['kind']) =>
    rows.filter((row) => row.verdict.kind === kind).length;
  return {
    applied: false,
    rows,
    counts: {
      total: rows.length,
      ok: count('ok'),
      duplicate: count('duplicate'),
      invalid: count('invalid'),
      imported: 0,
    },
    fileError: null,
    invitationsSent: null,
    ...overrides,
  };
}

export function okRow(line: number, values: Record<string, string>): CsvImportRow {
  return { line, values, verdict: { kind: 'ok' } };
}

export function invalidRow(
  line: number,
  values: Record<string, string>,
  column: string,
  message: string,
): CsvImportRow {
  return { line, values, verdict: { kind: 'invalid', errors: [{ column, message }] } };
}

export function duplicateRow(
  line: number,
  values: Record<string, string>,
  message: string,
): CsvImportRow {
  return { line, values, verdict: { kind: 'duplicate', message } };
}
