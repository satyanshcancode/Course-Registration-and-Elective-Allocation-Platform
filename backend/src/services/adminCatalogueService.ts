/**
 * The course catalogue as an administrator maintains it: creating a course,
 * editing its rules, retiring it, and the CSV import.
 *
 * Distinct from `adminCourseService`, which is about an OFFERING's seats in one
 * registration window. This service never touches capacity.
 *
 * The rule that shapes it: **a course is retired, never deleted.** A course that
 * has ever been offered is referenced by submissions, enrollments, waitlist
 * entries and stored allocation results, so deleting it would destroy the
 * evidence that a run was reproducible. And it cannot even be retired while a
 * window that is OPEN or later offers it, because that would change what
 * students are registering for — the service refuses first, and migration 0012's
 * trigger is the final guard.
 */
import {
  COURSE_CSV_COLUMNS,
  type AdminCatalogue,
  type AdminCourseRecord as AdminCourseDto,
  type CreateCourseRequest,
  type CsvImportReport,
  type CsvImportRow,
  type UpdateCourseRequest,
} from '@course-reg/shared';
import type { PoolClient } from 'pg';
import { isConstraintViolation, PG_ERROR } from '../database/pgErrors.js';
import { withTransaction, type TransactionPool } from '../database/transaction.js';
import type {
  AdminCourseRecord,
  AdminCourseRepository,
  CourseWrite,
} from '../repositories/adminCourseRepository.js';
import type { AuditLogRepository } from '../repositories/auditLogRepository.js';
import { AppError } from '../utils/appError.js';
import { CsvParseError, readCsvTable } from '../utils/csv.js';
import { emptyImportReport, summariseImport, type ImportOutcome } from './importReport.js';
import { judgeCourseRow, type ParsedCourseRow, type RowContext } from './importRules.js';

export const COURSE_ACTIONS = {
  CREATED: 'COURSE_CREATED',
  UPDATED: 'COURSE_UPDATED',
  DEACTIVATED: 'COURSE_DEACTIVATED',
  REACTIVATED: 'COURSE_REACTIVATED',
  IMPORTED: 'COURSES_IMPORTED',
} as const;

/** A window at DRAFT is still being planned; anything later is live. */
function liveUses(record: AdminCourseRecord): string[] {
  return record.offeredIn
    .filter((use) => use.status !== 'DRAFT')
    .map((use) => `${use.windowName} (${use.status.toLowerCase()})`);
}

export function toCourseDto(record: AdminCourseRecord): AdminCourseDto {
  const live = liveUses(record);
  return {
    code: record.code,
    name: record.name,
    credits: record.credits,
    department: record.department,
    description: record.description,
    minSemester: record.minSemester,
    minCredits: record.minCredits,
    prerequisites: record.prerequisites,
    eligiblePrograms: record.eligiblePrograms,
    relevantPrograms: record.relevantPrograms,
    isActive: record.isActive,
    offeredIn: record.offeredIn,
    canDeactivate: record.isActive && live.length === 0,
  };
}

export interface AdminCatalogueService {
  list(): Promise<AdminCatalogue>;
  get(code: string): Promise<AdminCourseDto>;
  create(actorUserId: string, request: CreateCourseRequest): Promise<AdminCourseDto>;
  update(actorUserId: string, code: string, request: UpdateCourseRequest): Promise<AdminCourseDto>;
  setActive(
    actorUserId: string,
    code: string,
    isActive: boolean,
    reason: string | undefined,
  ): Promise<AdminCourseDto>;
  previewImport(csv: string): Promise<CsvImportReport>;
  importCourses(actorUserId: string, csv: string): Promise<CsvImportReport>;
}

export interface AdminCatalogueServiceDependencies {
  pool: TransactionPool;
  courses: AdminCourseRepository;
  coursesFor: (client: PoolClient) => AdminCourseRepository;
  auditLogsFor: (client: PoolClient) => AuditLogRepository;
}

function toWrite(request: UpdateCourseRequest): CourseWrite {
  return {
    name: request.name,
    credits: request.credits,
    departmentCode: request.department,
    description: request.description,
    minSemester: request.minSemester,
    minCredits: request.minCredits,
    prerequisites: request.prerequisites,
    eligiblePrograms: request.eligiblePrograms,
    relevantPrograms: request.relevantPrograms,
  };
}

/** What an audit row records about a course, old and new. */
function auditShape(record: AdminCourseRecord) {
  return {
    name: record.name,
    credits: record.credits,
    department: record.department.code,
    description: record.description,
    minSemester: record.minSemester,
    minCredits: record.minCredits,
    prerequisites: record.prerequisites.map((course) => course.code),
    eligiblePrograms: record.eligiblePrograms.map((program) => program.code),
    relevantPrograms: record.relevantPrograms.map((program) => program.code),
  };
}

export function createAdminCatalogueService({
  pool,
  courses,
  coursesFor,
  auditLogsFor,
}: AdminCatalogueServiceDependencies): AdminCatalogueService {
  async function reload(code: string): Promise<AdminCourseDto> {
    const record = await courses.findByCode(code);
    if (!record) {
      throw AppError.notFound(`No course with code ${code}.`);
    }
    return toCourseDto(record);
  }

  /**
   * A prerequisite or programme the database does not have. The repository's
   * row-count checks catch it; this turns it into a message beside the field.
   */
  function referenceError(error: unknown): AppError | null {
    if (isConstraintViolation(error, PG_ERROR.UNIQUE_VIOLATION, 'courses_code_key')) {
      const message = 'A course with that code already exists.';
      return new AppError(409, message, [{ field: 'code', message }]);
    }
    if (error instanceof Error && error.message.startsWith('Unknown department code')) {
      const message = 'Choose a department that exists.';
      return new AppError(400, message, [{ field: 'department', message }]);
    }
    if (error instanceof Error && error.message.startsWith('One of the codes given for')) {
      const message = 'One of the courses or programmes chosen no longer exists. Reload and retry.';
      return AppError.badRequest(message);
    }
    return null;
  }

  /** Reads and judges the whole file. Shared by the dry run and the confirm. */
  async function judgeFile(
    csv: string,
  ): Promise<ImportOutcome<ParsedCourseRow> | { fileError: string }> {
    let table;
    try {
      table = readCsvTable(csv, COURSE_CSV_COLUMNS);
    } catch (error) {
      if (error instanceof CsvParseError) {
        return { fileError: `Line ${error.line}: ${error.message}` };
      }
      throw error;
    }

    const [courseRefs, programs, departments] = await Promise.all([
      courses.listCourseRefs(),
      courses.listPrograms(),
      courses.listDepartments(),
    ]);
    const databaseCodes = new Set(courseRefs.map((course) => course.code));
    /** Codes claimed by EARLIER lines of this same file. */
    const seenCourseCodes = new Set<string>();

    const rows: CsvImportRow[] = [];
    const accepted: ParsedCourseRow[] = [];

    for (const record of table.records) {
      const context: RowContext = {
        existingRollNumbers: new Set(),
        existingEmails: new Set(),
        // A prerequisite may point at a course the database has OR one an
        // earlier line of this same file creates, which is why the rules are
        // written in a second pass below.
        existingCourseCodes: new Set([...databaseCodes, ...seenCourseCodes]),
        programCodes: new Set(programs.map((program) => program.code)),
        departmentCodes: new Set(departments.map((department) => department.code)),
        seenRollNumbers: new Set(),
        seenEmails: new Set(),
        seenCourseCodes,
      };
      const judgement = judgeCourseRow(record.values, context);
      rows.push({ line: record.line, values: record.values, verdict: judgement.verdict });
      if (judgement.parsed) {
        accepted.push(judgement.parsed);
        seenCourseCodes.add(judgement.parsed.code);
      }
    }
    return { rows, accepted };
  }

  return {
    async list() {
      const [records, departments, programs] = await Promise.all([
        courses.list(),
        courses.listDepartments(),
        courses.listPrograms(),
      ]);
      return { courses: records.map(toCourseDto), departments, programs };
    },

    get: reload,

    async create(actorUserId, request) {
      const write = toWrite(request);
      try {
        await withTransaction(pool, async (client) => {
          const repository = coursesFor(client);
          const courseId = await repository.create(request.code, write);
          await repository.replaceRules(courseId, write);
          await auditLogsFor(client).record({
            actorUserId,
            action: COURSE_ACTIONS.CREATED,
            entityType: 'course',
            entityId: courseId,
            newValue: {
              code: request.code,
              name: write.name,
              credits: write.credits,
              department: write.departmentCode,
              description: write.description,
              minSemester: write.minSemester,
              minCredits: write.minCredits,
              prerequisites: [...write.prerequisites],
              eligiblePrograms: [...write.eligiblePrograms],
              relevantPrograms: [...write.relevantPrograms],
            },
          });
        });
      } catch (error) {
        throw referenceError(error) ?? error;
      }
      return reload(request.code);
    },

    async update(actorUserId, code, request) {
      const write = toWrite(request);
      try {
        await withTransaction(pool, async (client) => {
          const repository = coursesFor(client);
          const before = await repository.lockByCode(code);
          if (!before) {
            throw AppError.notFound(`No course with code ${code}.`);
          }
          // A course cannot be its own prerequisite, whatever the client sent.
          if (request.prerequisites.includes(code)) {
            const message = 'A course cannot be its own prerequisite.';
            throw new AppError(400, message, [{ field: 'prerequisites', message }]);
          }
          await repository.update(before.id, write);
          await repository.replaceRules(before.id, write);
          await auditLogsFor(client).record({
            actorUserId,
            action: COURSE_ACTIONS.UPDATED,
            entityType: 'course',
            entityId: before.id,
            oldValue: { code: before.code, ...auditShape(before) },
            newValue: {
              code: before.code,
              name: write.name,
              credits: write.credits,
              department: write.departmentCode,
              description: write.description,
              minSemester: write.minSemester,
              minCredits: write.minCredits,
              prerequisites: [...write.prerequisites],
              eligiblePrograms: [...write.eligiblePrograms],
              relevantPrograms: [...write.relevantPrograms],
            },
          });
        });
      } catch (error) {
        throw referenceError(error) ?? error;
      }
      return reload(code);
    },

    async setActive(actorUserId, code, isActive, reason) {
      try {
        await withTransaction(pool, async (client) => {
          const repository = coursesFor(client);
          const record = await repository.lockByCode(code);
          if (!record) {
            throw AppError.notFound(`No course with code ${code}.`);
          }
          if (record.isActive === isActive) {
            throw AppError.badRequest(
              isActive ? `${code} is already active.` : `${code} is already retired.`,
            );
          }
          // The rule, checked here so the message can name the windows. The
          // trigger from migration 0012 is the backstop if this is ever wrong.
          const live = liveUses(record);
          if (!isActive && live.length > 0) {
            throw new AppError(
              409,
              `${code} is offered in ${live.join(', ')}, so it cannot be retired while students are registering for it. Retire it once that window's allocation is finished and it is no longer offered.`,
            );
          }
          await repository.setActive(record.id, isActive);
          await auditLogsFor(client).record({
            actorUserId,
            action: isActive ? COURSE_ACTIONS.REACTIVATED : COURSE_ACTIONS.DEACTIVATED,
            entityType: 'course',
            entityId: record.id,
            oldValue: { code, isActive: record.isActive },
            newValue: { code, isActive },
            ...(reason !== undefined && { reason }),
          });
        });
      } catch (error) {
        // The trigger fires only if the check above was somehow bypassed.
        if (isConstraintViolation(error, PG_ERROR.OBJECT_NOT_IN_PREREQUISITE_STATE) && !isActive) {
          throw new AppError(
            409,
            `${code} is offered in a registration window that is no longer a draft, so it cannot be retired.`,
          );
        }
        throw error;
      }
      return reload(code);
    },

    async previewImport(csv) {
      const judged = await judgeFile(csv);
      if ('fileError' in judged) {
        return emptyImportReport(judged.fileError);
      }
      return summariseImport(judged.rows, { applied: false, imported: 0, invitationsSent: null });
    },

    async importCourses(actorUserId, csv) {
      // Re-judged rather than trusting the preview the client saw.
      const judged = await judgeFile(csv);
      if ('fileError' in judged) {
        return emptyImportReport(judged.fileError);
      }
      const { rows, accepted } = judged;
      if (accepted.length === 0) {
        return summariseImport(rows, { applied: true, imported: 0, invitationsSent: null });
      }

      try {
        // ONE transaction. Rules are written in a second pass, so a prerequisite
        // may point at a course an earlier row of the same file created.
        await withTransaction(pool, async (client) => {
          const repository = coursesFor(client);
          const created: { id: string; row: ParsedCourseRow }[] = [];
          for (const row of accepted) {
            const id = await repository.create(row.code, {
              name: row.name,
              credits: row.credits,
              departmentCode: row.departmentCode,
              description: row.description,
              minSemester: row.minSemester,
              minCredits: row.minCredits,
              prerequisites: [],
              eligiblePrograms: [],
              relevantPrograms: [],
            });
            created.push({ id, row });
          }
          for (const { id, row } of created) {
            await repository.replaceRules(id, {
              name: row.name,
              credits: row.credits,
              departmentCode: row.departmentCode,
              description: row.description,
              minSemester: row.minSemester,
              minCredits: row.minCredits,
              prerequisites: row.prerequisites,
              eligiblePrograms: row.eligiblePrograms,
              relevantPrograms: row.relevantPrograms,
            });
          }
          await auditLogsFor(client).record({
            actorUserId,
            action: COURSE_ACTIONS.IMPORTED,
            entityType: 'course',
            entityId: `import:${new Date().toISOString()}`,
            newValue: { imported: created.length, codes: created.map(({ row }) => row.code) },
          });
        });
      } catch (error) {
        throw referenceError(error) ?? error;
      }

      return summariseImport(rows, {
        applied: true,
        imported: accepted.length,
        invitationsSent: null,
      });
    },
  };
}
