/**
 * Student records, as an administrator maintains them.
 *
 * Students never self-register and never edit their own academic data, so every
 * write here is an administrator's: create, edit, invite, deactivate, and the
 * CSV import.
 *
 * Two rules worth naming:
 *
 * **Creating a student and inviting them are one transaction.** The invitation
 * is sent INSIDE it, so a mail failure rolls the account back rather than
 * leaving one nobody can reach. (The import is the deliberate exception: see
 * `importStudents`.)
 *
 * **Deactivation keeps everything.** It flips `users.is_active`; no row is ever
 * deleted, so submissions, enrollments, waitlist entries and history stay whole.
 */
import {
  ADMIN_STUDENT_PAGE_SIZE,
  isAcademicTerm,
  STUDENT_CSV_COLUMNS,
  type AcademicTerm,
  type AdminReferenceData,
  type AdminStudentDetail,
  type AdminStudentListItem,
  type AdminStudentPage,
  type AdminStudentQuery,
  type AdminStudentStatus,
  type CreateStudentRequest,
  type CreateStudentResult,
  type CsvImportReport,
  type CsvImportRow,
  type UpdateStudentRequest,
} from '@course-reg/shared';
import type { PoolClient } from 'pg';
import { isConstraintViolation, PG_ERROR } from '../database/pgErrors.js';
import { withTransaction, type TransactionPool } from '../database/transaction.js';
import type {
  AdminStudentRecord,
  AdminStudentRepository,
  StudentWrite,
} from '../repositories/adminStudentRepository.js';
import type { AuditLogRepository } from '../repositories/auditLogRepository.js';
import { AppError } from '../utils/appError.js';
import { CsvParseError, readCsvTable } from '../utils/csv.js';
import { logger } from '../utils/logger.js';
import type { AccountService } from './accountService.js';
import type { AccountTokenRepository } from '../repositories/accountTokenRepository.js';
import type { ActivityService } from './activityService.js';
import { emptyImportReport, summariseImport, type ImportOutcome } from './importReport.js';
import { judgeStudentRow, type ParsedStudentRow, type RowContext } from './importRules.js';

export const STUDENT_ACTIONS = {
  CREATED: 'STUDENT_CREATED',
  UPDATED: 'STUDENT_UPDATED',
  DEACTIVATED: 'STUDENT_DEACTIVATED',
  REACTIVATED: 'STUDENT_REACTIVATED',
  IMPORTED: 'STUDENTS_IMPORTED',
} as const;

export interface AdminStudentService {
  list(query: AdminStudentQuery): Promise<AdminStudentPage>;
  get(rollNumber: string): Promise<AdminStudentDetail>;
  create(actorUserId: string, request: CreateStudentRequest): Promise<CreateStudentResult>;
  update(
    actorUserId: string,
    rollNumber: string,
    request: UpdateStudentRequest,
  ): Promise<AdminStudentListItem>;
  /** Mints a fresh invitation, which invalidates the outstanding one. */
  resendInvitation(actorUserId: string, rollNumber: string): Promise<AdminStudentListItem>;
  setActive(
    actorUserId: string,
    rollNumber: string,
    isActive: boolean,
    reason: string | undefined,
  ): Promise<AdminStudentListItem>;
  /** Judges the file and writes nothing. */
  previewImport(csv: string): Promise<CsvImportReport>;
  /** Judges the file again and writes every `ok` row in ONE transaction. */
  importStudents(actorUserId: string, csv: string): Promise<CsvImportReport>;
  referenceData(): Promise<AdminReferenceData>;
}

export interface AdminStudentServiceDependencies {
  pool: TransactionPool;
  students: AdminStudentRepository;
  tokens: AccountTokenRepository;
  activityService: ActivityService;
  accountService: AccountService;
  /** Repositories bound to a transaction's client. */
  studentsFor: (client: PoolClient) => AdminStudentRepository;
  auditLogsFor: (client: PoolClient) => AuditLogRepository;
  /** Every course code and name, for the completed-courses picker. */
  listAllCourses: () => Promise<{ code: string; name: string }[]>;
  listDepartments: () => Promise<{ code: string; name: string }[]>;
}

export function statusOf(record: {
  isActive: boolean;
  hasPassword: boolean;
}): AdminStudentStatus {
  // Deactivation wins: an account that was never activated and then deactivated
  // is INACTIVE, because that is what decides whether it can be used.
  if (!record.isActive) {
    return 'INACTIVE';
  }
  return record.hasPassword ? 'ACTIVE' : 'INVITED';
}

/**
 * The column's format check and the write schema both guarantee this, so a
 * value that is not a term means the database has been edited by hand — worth
 * an error rather than a cast that pretends otherwise.
 */
function requireTerm(value: string): AcademicTerm {
  if (!isAcademicTerm(value)) {
    throw new Error(`students.expected_graduation_term holds "${value}", which is not a term`);
  }
  return value;
}

function toListItem(
  record: AdminStudentRecord,
  invitationExpiresAt: Date | undefined,
): AdminStudentListItem {
  return {
    rollNumber: record.rollNumber,
    name: record.name,
    email: record.email,
    program: record.program,
    semester: record.semester,
    creditsCompleted: record.creditsCompleted,
    expectedGraduationTerm: requireTerm(record.expectedGraduationTerm),
    status: statusOf(record),
    invitationPending: invitationExpiresAt !== undefined,
  };
}

function toWrite(request: CreateStudentRequest): StudentWrite {
  return {
    rollNumber: request.rollNumber,
    name: request.name,
    email: request.email,
    programCode: request.program,
    semester: request.semester,
    creditsCompleted: request.creditsCompleted,
    expectedGraduationTerm: request.expectedGraduationTerm,
    completedCourses: request.completedCourses,
  };
}

/** Turns the two uniqueness constraints into a message beside the right field. */
function uniquenessError(error: unknown): AppError | null {
  if (isConstraintViolation(error, PG_ERROR.UNIQUE_VIOLATION, 'students_roll_number_key')) {
    const message = 'That roll number already belongs to another student.';
    return new AppError(409, message, [{ field: 'rollNumber', message }]);
  }
  if (isConstraintViolation(error, PG_ERROR.UNIQUE_VIOLATION, 'users_email_key')) {
    const message = 'That e-mail address already belongs to another account.';
    return new AppError(409, message, [{ field: 'email', message }]);
  }
  return null;
}

export function createAdminStudentService({
  pool,
  students,
  tokens,
  activityService,
  accountService,
  studentsFor,
  auditLogsFor,
  listAllCourses,
  listDepartments,
}: AdminStudentServiceDependencies): AdminStudentService {
  /** Re-reads a student for the response, after a write has committed. */
  async function reload(rollNumber: string): Promise<AdminStudentListItem> {
    const record = await students.findByRollNumber(rollNumber);
    if (!record) {
      throw AppError.notFound(`No student with roll number ${rollNumber}.`);
    }
    const outstanding = await tokens.findOutstanding(record.userId, 'ACTIVATION');
    return toListItem(record, outstanding?.expiresAt);
  }

  async function requireStudent(rollNumber: string): Promise<AdminStudentRecord> {
    const record = await students.findByRollNumber(rollNumber);
    if (!record) {
      throw AppError.notFound(`No student with roll number ${rollNumber}.`);
    }
    return record;
  }

  /** The existing codes an import row is judged against, read once per file. */
  async function importContext(
    rows: readonly { values: Record<string, string> }[],
  ): Promise<Omit<RowContext, 'seenRollNumbers' | 'seenEmails' | 'seenCourseCodes'>> {
    const rollNumbers = rows.map((row) => (row.values.rollNumber ?? '').toUpperCase());
    const emails = rows.map((row) => (row.values.email ?? '').toLowerCase());
    const [existingRollNumbers, existingEmails, courses, programs, departments] = await Promise.all([
      students.findExistingRollNumbers(rollNumbers.filter(Boolean)),
      students.findExistingEmails(emails.filter(Boolean)),
      listAllCourses(),
      students.listPrograms(),
      listDepartments(),
    ]);
    return {
      existingRollNumbers,
      existingEmails,
      existingCourseCodes: new Set(courses.map((course) => course.code)),
      programCodes: new Set(programs.map((program) => program.code)),
      departmentCodes: new Set(departments.map((department) => department.code)),
    };
  }

  /**
   * Reads the file and judges every row. Shared by the dry run and the confirm,
   * which is what makes the preview trustworthy: the same function decides both.
   */
  async function judgeFile(
    csv: string,
  ): Promise<ImportOutcome<ParsedStudentRow> | { fileError: string }> {
    let table;
    try {
      table = readCsvTable(csv, STUDENT_CSV_COLUMNS);
    } catch (error) {
      if (error instanceof CsvParseError) {
        return { fileError: `Line ${error.line}: ${error.message}` };
      }
      throw error;
    }

    const base = await importContext(table.records);
    // Claimed by earlier lines: this is what makes a file that repeats a roll
    // number report BOTH rows rather than failing on a constraint mid-import.
    const seenRollNumbers = new Set<string>();
    const seenEmails = new Set<string>();

    const rows: CsvImportRow[] = [];
    const accepted: ParsedStudentRow[] = [];

    for (const record of table.records) {
      const judgement = judgeStudentRow(record.values, {
        ...base,
        seenRollNumbers,
        seenEmails,
        seenCourseCodes: new Set(),
      });
      rows.push({ line: record.line, values: record.values, verdict: judgement.verdict });
      if (judgement.parsed) {
        accepted.push(judgement.parsed);
        seenRollNumbers.add(judgement.parsed.rollNumber);
        seenEmails.add(judgement.parsed.email);
      }
    }
    return { rows, accepted };
  }

  return {
    async list(query) {
      const pageSize = query.pageSize ?? ADMIN_STUDENT_PAGE_SIZE;
      const page = query.page ?? 1;
      const { items, total } = await students.list({
        search: query.search,
        program: query.program,
        semester: query.semester,
        status: query.status,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });
      // One extra query for the whole page, never one per row.
      const outstanding = await tokens.findOutstandingFor(items.map((item) => item.userId));
      const programs = await students.listPrograms();

      return {
        items: items.map((item) => toListItem(item, outstanding.get(item.userId))),
        total,
        page,
        pageSize,
        pageCount: Math.max(1, Math.ceil(total / pageSize)),
        programs: programs.map(({ code, name }) => ({ code, name })),
      };
    },

    async get(rollNumber) {
      const record = await requireStudent(rollNumber);
      // Their own status and timeline, in exactly the shapes the student's own
      // pages use, so one set of formatters renders both.
      const [outstanding, completedCourses, status, history] = await Promise.all([
        tokens.findOutstanding(record.userId, 'ACTIVATION'),
        students.findCompletedCourseCodes(record.userId),
        activityService.getStatus(record.userId),
        activityService.getHistory(record.userId, {}),
      ]);
      const courses = await listAllCourses();
      const nameOf = new Map(courses.map((course) => [course.code, course.name]));

      return {
        student: toListItem(record, outstanding?.expiresAt),
        completedCourses: completedCourses.map((code) => ({
          code,
          name: nameOf.get(code) ?? code,
        })),
        status,
        history: history.events,
        invitationExpiresAt: outstanding?.expiresAt.toISOString() ?? null,
      };
    },

    async create(actorUserId, request) {
      const write = toWrite(request);
      try {
        await withTransaction(pool, async (client) => {
          const repository = studentsFor(client);
          const userId = await repository.create(write);
          await repository.replaceCompletedCourses(userId, write.completedCourses);
          await auditLogsFor(client).record({
            actorUserId,
            action: STUDENT_ACTIONS.CREATED,
            entityType: 'student',
            entityId: userId,
            newValue: { ...write, completedCourses: [...write.completedCourses] },
          });
          // Inside the transaction on purpose: a mail failure must not leave an
          // account whose owner can never be told how to reach it.
          await accountService.invite(client, {
            userId,
            email: write.email,
            name: write.name,
            actorUserId,
            resent: false,
          });
        });
      } catch (error) {
        throw uniquenessError(error) ?? error;
      }
      return { student: await reload(write.rollNumber), invitationSent: true };
    },

    async update(actorUserId, rollNumber, request) {
      const write = toWrite(request);
      try {
        await withTransaction(pool, async (client) => {
          const repository = studentsFor(client);
          // Locked, so two administrators editing the same student serialise
          // rather than interleaving halves of two edits.
          const before = await repository.lockByRollNumber(rollNumber);
          if (!before) {
            throw AppError.notFound(`No student with roll number ${rollNumber}.`);
          }
          const previousCourses = await repository.findCompletedCourseCodes(before.userId);
          await repository.update(before.userId, write);
          await repository.replaceCompletedCourses(before.userId, write.completedCourses);
          await auditLogsFor(client).record({
            actorUserId,
            action: STUDENT_ACTIONS.UPDATED,
            entityType: 'student',
            entityId: before.userId,
            oldValue: {
              rollNumber: before.rollNumber,
              name: before.name,
              email: before.email,
              program: before.program.code,
              semester: before.semester,
              creditsCompleted: before.creditsCompleted,
              expectedGraduationTerm: before.expectedGraduationTerm,
              completedCourses: previousCourses,
            },
            newValue: { ...write, completedCourses: [...write.completedCourses] },
          });
        });
      } catch (error) {
        throw uniquenessError(error) ?? error;
      }
      return reload(write.rollNumber);
    },

    async resendInvitation(actorUserId, rollNumber) {
      const record = await requireStudent(rollNumber);
      if (record.hasPassword) {
        throw AppError.badRequest(
          `${record.name} has already set a password. Send a password reset instead of a new invitation.`,
        );
      }
      if (!record.isActive) {
        throw AppError.badRequest(
          `${record.name}'s account is deactivated. Reactivate it before sending an invitation.`,
        );
      }

      // Minting the new link consumes the old one, so the earlier e-mail stops
      // working the moment this one is sent.
      await withTransaction(pool, (client) =>
        accountService.invite(client, {
          userId: record.userId,
          email: record.email,
          name: record.name,
          actorUserId,
          resent: true,
        }),
      );
      return reload(rollNumber);
    },

    async setActive(actorUserId, rollNumber, isActive, reason) {
      await withTransaction(pool, async (client) => {
        const repository = studentsFor(client);
        const record = await repository.lockByRollNumber(rollNumber);
        if (!record) {
          throw AppError.notFound(`No student with roll number ${rollNumber}.`);
        }
        if (record.isActive === isActive) {
          throw AppError.badRequest(
            isActive
              ? `${record.name}'s account is already active.`
              : `${record.name}'s account is already deactivated.`,
          );
        }
        await client.query('UPDATE users SET is_active = $2 WHERE id = $1', [
          record.userId,
          isActive,
        ]);
        await auditLogsFor(client).record({
          actorUserId,
          action: isActive ? STUDENT_ACTIONS.REACTIVATED : STUDENT_ACTIONS.DEACTIVATED,
          entityType: 'user',
          entityId: record.userId,
          oldValue: { isActive: record.isActive },
          newValue: { isActive },
          ...(reason !== undefined && { reason }),
        });
      });
      return reload(rollNumber);
    },

    async previewImport(csv) {
      const judged = await judgeFile(csv);
      if ('fileError' in judged) {
        return emptyImportReport(judged.fileError);
      }
      return summariseImport(judged.rows, { applied: false, imported: 0, invitationsSent: null });
    },

    async importStudents(actorUserId, csv) {
      // Judged AGAIN here rather than trusting the preview: the database may
      // have changed since, and the client's copy of the verdicts is not a
      // credential. Nothing is imported unless this pass says so.
      const judged = await judgeFile(csv);
      if ('fileError' in judged) {
        return emptyImportReport(judged.fileError);
      }
      const { rows, accepted } = judged;
      if (accepted.length === 0) {
        return summariseImport(rows, { applied: true, imported: 0, invitationsSent: 0 });
      }

      // ONE transaction for every valid row: a failure part-way through leaves
      // the file entirely unimported rather than half applied.
      const invited = await withTransaction(pool, async (client) => {
        const repository = studentsFor(client);
        const created: { userId: string; row: ParsedStudentRow }[] = [];

        for (const row of accepted) {
          const userId = await repository.create({
            rollNumber: row.rollNumber,
            name: row.name,
            email: row.email,
            programCode: row.programCode,
            semester: row.semester,
            creditsCompleted: row.creditsCompleted,
            expectedGraduationTerm: row.expectedGraduationTerm,
            completedCourses: row.completedCourses,
          });
          await repository.replaceCompletedCourses(userId, row.completedCourses);
          created.push({ userId, row });
        }

        await auditLogsFor(client).record({
          actorUserId,
          action: STUDENT_ACTIONS.IMPORTED,
          entityType: 'student',
          // One row for the batch, naming what went in: the individual accounts
          // are identifiable by roll number.
          entityId: `import:${new Date().toISOString()}`,
          newValue: {
            imported: created.length,
            rollNumbers: created.map(({ row }) => row.rollNumber),
          },
        });

        // Unlike a single create, a failing invitation does NOT roll the import
        // back: thirty accounts should not be lost because the thirtieth e-mail
        // bounced. The report says how many went out, and each can be resent.
        let sent = 0;
        for (const { userId, row } of created) {
          try {
            await accountService.invite(client, {
              userId,
              email: row.email,
              name: row.name,
              actorUserId,
              resent: false,
            });
            sent += 1;
          } catch (error) {
            logger.error('Failed to send an invitation during a CSV import', {
              rollNumber: row.rollNumber,
              error,
            });
          }
        }
        return sent;
      });

      return summariseImport(rows, {
        applied: true,
        imported: accepted.length,
        invitationsSent: invited,
      });
    },

    async referenceData() {
      const [programs, departments, courses] = await Promise.all([
        students.listPrograms(),
        listDepartments(),
        listAllCourses(),
      ]);
      return {
        programs: programs.map(({ code, name }) => ({ code, name })),
        departments,
        courses,
      };
    },
  };
}
