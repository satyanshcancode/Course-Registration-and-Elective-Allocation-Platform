/**
 * Running an allocation, previewing one, and proving a past one is
 * reproducible.
 *
 * The rules live in the engine (`backend/src/allocation/`), which is pure.
 * This file owns everything the engine refuses to touch: the database, the
 * clock, the transaction and the audit trail. Allocation for a closed window
 * can complete exactly once.
 */
import {
  type AllocationExplanation,
  type AllocationPreview,
  type AllocationPreviewMethod,
  type AllocationRunDetail,
  type AllocationRunSummary,
  type AllocationVerification,
  type RegistrationWindowSummary,
  type StudentAllocationResult,
  type StudentAllocationResults,
} from '@course-reg/shared';
import type { PoolClient } from 'pg';
import {
  allStrategies,
  hashOutput,
  runStrategy,
  strategyFor,
  type AllocationOutput,
  type AllocationResultRow,
} from '../allocation/index.js';
import { withTransaction, type TransactionPool } from '../database/transaction.js';
import type { AuditLogRepository } from '../repositories/auditLogRepository.js';
import type {
  AllocationRepository,
  AllocationRunRecord,
} from '../repositories/allocationRepository.js';
import type {
  NotificationRepository,
  PersonalNotification,
} from '../repositories/notificationRepository.js';
import type {
  RegistrationHistoryRepository,
  HistoryEntry,
} from '../repositories/registrationHistoryRepository.js';
import type { RegistrationWindowRepository } from '../repositories/registrationWindowRepository.js';
import { AppError } from '../utils/appError.js';
import { logger } from '../utils/logger.js';
import { injectFault } from '../utils/faultInjection.js';
import { fromStoredInput, toEngineInput, toStoredInput } from './allocationSnapshot.js';

/** Fault point a test can arm, to prove the rollback. See utils/faultInjection.ts. */
export const FAULT_MID_ALLOCATION = 'allocation.afterResultsWritten';

export interface AllocationService {
  /** Both methods on a fresh snapshot, side by side. Writes nothing. */
  preview(): Promise<AllocationPreview>;
  run(adminId: string, reason: string | undefined): Promise<AllocationRunDetail>;
  listRuns(): Promise<AllocationRunSummary[]>;
  getRun(runId: string): Promise<AllocationRunDetail>;
  verify(runId: string, adminId: string): Promise<AllocationVerification>;
  getStudentResults(studentId: string): Promise<StudentAllocationResults>;
}

export interface AllocationServiceDependencies {
  pool: TransactionPool;
  windows: RegistrationWindowRepository;
  allocations: AllocationRepository;
  auditLogs: AuditLogRepository;
  /** Bound to the transaction's own client; see docs/CONCURRENCY.md. */
  allocationsFor: (client: PoolClient) => AllocationRepository;
  windowsFor: (client: PoolClient) => RegistrationWindowRepository;
  historyFor: (client: PoolClient) => RegistrationHistoryRepository;
  notificationsFor: (client: PoolClient) => NotificationRepository;
  auditLogsFor: (client: PoolClient) => AuditLogRepository;
  now?: () => Date;
}

/** The sentence stored beside the structured explanation, for psql and logs. */
function sentenceFor(explanation: AllocationExplanation): string {
  switch (explanation.type) {
    case 'ALLOCATED':
      return `Allocated ${explanation.course.code} (choice ${explanation.preferenceRank}), ranked ${explanation.finalRank} of ${explanation.applicants}.`;
    case 'WAITLISTED':
      return `Waitlisted for ${explanation.course.code} at position ${explanation.waitlistPosition} (choice ${explanation.preferenceRank}).`;
    case 'NOT_ALLOCATED_HIGHER_CHOICE_GRANTED':
      return `Not allocated ${explanation.course.code}: choice ${explanation.grantedRank} (${explanation.grantedCourse.code}) was granted instead.`;
    case 'NOT_ALLOCATED_FULL':
      return `Not allocated ${explanation.course.code}: all ${explanation.capacity} seats went to higher-scoring applicants.`;
    case 'NOT_ALLOCATED_INELIGIBLE':
      return `Not allocated ${explanation.course.code}: no longer eligible at allocation time.`;
  }
}

/** One history row and one notification per student, from their own rows. */
function perStudentMessages(
  windowId: string,
  windowName: string,
  rows: readonly AllocationResultRow[],
): { history: HistoryEntry[]; notifications: PersonalNotification[] } {
  const byStudent = new Map<string, AllocationResultRow[]>();
  for (const row of rows) {
    byStudent.set(row.studentId, [...(byStudent.get(row.studentId) ?? []), row]);
  }

  const history: HistoryEntry[] = [];
  const notifications: PersonalNotification[] = [];

  for (const [studentId, studentRows] of byStudent) {
    const allocated = studentRows.find((row) => row.outcome === 'ALLOCATED');
    const waitlisted = studentRows.filter((row) => row.outcome === 'WAITLISTED');
    const eventType = allocated
      ? 'ALLOCATED'
      : waitlisted.length > 0
        ? 'WAITLISTED'
        : 'NOT_ALLOCATED';

    history.push({
      studentId,
      windowId,
      eventType,
      courseId: allocated?.courseId ?? null,
      details: {
        allocated: allocated ? { rank: allocated.rank, finalRank: allocated.finalRank } : null,
        waitlisted: waitlisted.map((row) => ({
          rank: row.rank,
          position: row.waitlistPosition,
        })),
      },
    });

    const course = allocated?.explanation.course;
    notifications.push({
      userId: studentId,
      type: 'ALLOCATION_RESULT',
      title: allocated
        ? `You have a seat in ${course?.code ?? ''} ${course?.name ?? ''}`.trim()
        : `Your ${windowName} allocation result`,
      body: allocated
        ? `Allocated your choice ${allocated.rank}. ${waitlisted.length > 0 ? `You are still waiting for ${waitlisted.length} higher ${waitlisted.length === 1 ? 'choice' : 'choices'}.` : 'Nothing further is needed.'}`
        : waitlisted.length > 0
          ? `No seat this round. You are on ${waitlisted.length} ${waitlisted.length === 1 ? 'waitlist' : 'waitlists'} and move up automatically when seats free up.`
          : 'No seat this round, and none of your choices had a waitlist you could join.',
    });
  }

  return { history, notifications };
}

export function createAllocationService({
  pool,
  windows,
  allocations,
  auditLogs,
  allocationsFor,
  windowsFor,
  historyFor,
  notificationsFor,
  auditLogsFor,
  now = () => new Date(),
}: AllocationServiceDependencies): AllocationService {
  /** The window this feature acts on, or a 404. */
  async function currentWindow(): Promise<{ id: string; summary: RegistrationWindowSummary }> {
    const window = await windows.findCurrent();
    if (!window) {
      throw AppError.notFound('There is no registration window yet.');
    }
    return window;
  }

  function toDetail(record: AllocationRunRecord, summary: RegistrationWindowSummary) {
    return {
      id: record.id,
      method: record.method,
      algorithmVersion: record.algorithmVersion,
      status: record.status,
      startedAt: record.startedAt.toISOString(),
      finishedAt: record.finishedAt?.toISOString() ?? null,
      errorMessage: record.errorMessage,
      metrics: record.metrics,
      triggeredBy: record.triggeredBy,
      window: summary,
      randomSeed: record.randomSeed,
      config: record.config,
      outputHash: record.outputHash,
      inputSize: record.inputSize,
    } satisfies AllocationRunDetail;
  }

  return {
    async preview() {
      const window = await currentWindow();
      const submissions = await allocations.countSubmissions(window.id);
      if (submissions === 0) {
        throw new AppError(409, 'Nothing to preview yet: no preferences have been submitted.');
      }
      const snapshot = await allocations.loadSnapshot(window.id);
      if (!snapshot) {
        throw AppError.notFound('The registration window could not be read.');
      }
      const input = toEngineInput(snapshot);

      const methods: AllocationPreviewMethod[] = allStrategies().map((strategy) => ({
        method: strategy.method,
        algorithmVersion: strategy.algorithmVersion,
        willBeUsed: strategy.method === snapshot.config.method,
        metrics: runStrategy(strategy, input).metrics,
      }));

      return {
        window: window.summary,
        submissions,
        randomSeed: snapshot.randomSeed,
        methods,
        serverTime: now().toISOString(),
      };
    },

    async run(adminId, reason) {
      const window = await currentWindow();
      // "Already run" first: after a successful run the window is ALLOCATED,
      // and the status message alone would not say why it is being refused.
      if (await allocations.hasCompletedRun(window.id)) {
        throw new AppError(409, 'Allocation has already been run for this window.');
      }
      if (window.summary.status !== 'CLOSED') {
        throw new AppError(
          409,
          `Allocation runs once registration has closed. This window is ${window.summary.status}.`,
        );
      }

      const detail = await windows.findCurrentDetail();
      if (!detail) {
        throw AppError.notFound('The registration window could not be read.');
      }
      const strategy = strategyFor(detail.policy.method);

      // Step 1, in its own transaction: the RUNNING row. The unique index
      // allows one per window, so a second attempt is refused here.
      const runId = await allocations.startRun({
        windowId: window.id,
        method: strategy.method,
        algorithmVersion: strategy.algorithmVersion,
        randomSeed: detail.randomSeed,
        config: detail.policy,
        inputSnapshot: {},
        triggeredBy: adminId,
      });

      try {
        // Step 2: everything else, in ONE transaction.
        await withTransaction(pool, async (client) => {
          const repository = allocationsFor(client);
          const locked = await repository.lockWindow(window.id);
          if (locked?.status !== 'CLOSED') {
            throw new AppError(409, 'The registration window changed while allocation started.');
          }

          const snapshot = await repository.loadSnapshot(window.id);
          if (!snapshot) {
            throw AppError.notFound('The registration window could not be read.');
          }
          const input = toEngineInput(snapshot);
          const output: AllocationOutput = runStrategy(strategy, input);

          await repository.saveInputSnapshot(runId, toStoredInput(input));
          const rows = output.results;
          await repository.saveResults(runId, rows, sentenceFor);
          await repository.saveEnrollments(window.id, rows);
          await repository.saveWaitlist(window.id, rows);

          // Test-only: proves everything above rolls back together.
          injectFault(FAULT_MID_ALLOCATION);

          const { history, notifications } = perStudentMessages(
            window.id,
            window.summary.name,
            rows,
          );
          await historyFor(client).recordMany(history);
          await notificationsFor(client).sendMany(notifications);
          await auditLogsFor(client).record({
            actorUserId: adminId,
            action: 'ALLOCATION_RUN',
            entityType: 'allocation_run',
            entityId: runId,
            newValue: {
              method: strategy.method,
              algorithmVersion: strategy.algorithmVersion,
              randomSeed: detail.randomSeed,
              allocated: output.metrics.allocated,
              waitlistEntries: output.metrics.waitlistEntries,
            },
            ...(reason ? { reason } : {}),
          });

          await repository.completeRun({
            runId,
            metrics: output.metrics,
            outputHash: hashOutput(output),
          });
          await windowsFor(client).setStatus(window.id, 'ALLOCATED');
        });
      } catch (error) {
        // Step 3, in a SEPARATE transaction: the rollback above took the
        // RUNNING row with it only if it was created inside it — it was not,
        // so it is still there and has to be marked FAILED.
        const message = error instanceof Error ? error.message : String(error);
        try {
          await allocations.failRun(runId, message);
        } catch (bookkeeping: unknown) {
          // Recording the failure must never replace the failure itself.
          logger.error('Could not mark the allocation run as failed', {
            runId,
            error: bookkeeping,
          });
        }
        throw error;
      }

      const record = await allocations.findRun(runId);
      if (!record) {
        throw new Error('The allocation run vanished after completing');
      }
      return toDetail(record, { ...window.summary, status: 'ALLOCATED' });
    },

    async listRuns() {
      const window = await windows.findCurrent();
      const records = await allocations.listRuns(window?.id ?? null);
      return records.map((record) => ({
        id: record.id,
        method: record.method,
        algorithmVersion: record.algorithmVersion,
        status: record.status,
        startedAt: record.startedAt.toISOString(),
        finishedAt: record.finishedAt?.toISOString() ?? null,
        errorMessage: record.errorMessage,
        metrics: record.metrics,
        triggeredBy: record.triggeredBy,
      }));
    },

    async getRun(runId) {
      const record = await allocations.findRun(runId);
      if (!record) {
        throw AppError.notFound('That allocation run does not exist.');
      }
      const window = await currentWindow();
      return toDetail(record, window.summary);
    },

    async verify(runId, adminId) {
      const record = await allocations.findRun(runId);
      if (!record) {
        throw AppError.notFound('That allocation run does not exist.');
      }
      if (record.status !== 'COMPLETED') {
        throw new AppError(409, 'Only a completed run can be verified.');
      }

      // The STORED snapshot goes back through the SAME strategy version. The
      // database has moved on since; the snapshot has not, which is the point.
      const input = fromStoredInput(await allocations.findInputSnapshot(runId));
      const strategy = strategyFor(record.method);
      const differences: string[] = [];
      if (strategy.algorithmVersion !== record.algorithmVersion) {
        differences.push(
          `The algorithm has changed since this run: it was ${record.algorithmVersion}, the code is now ${strategy.algorithmVersion}.`,
        );
      }

      const output = runStrategy(strategy, input);
      const recomputedHash = hashOutput(output);
      if (record.outputHash !== recomputedHash) {
        differences.push(
          `The re-run produced a different result (stored ${record.outputHash?.slice(0, 12) ?? 'none'}…, recomputed ${recomputedHash.slice(0, 12)}…).`,
        );
        const before = record.metrics;
        if (before && before.allocated !== output.metrics.allocated) {
          differences.push(
            `Allocated ${output.metrics.allocated} students, the run recorded ${before.allocated}.`,
          );
        }
      }

      // Reading is not a write, but "who checked this, and when" belongs in
      // the audit trail as much as the run itself does.
      await auditLogs.record({
        actorUserId: adminId,
        action: 'ALLOCATION_VERIFY',
        entityType: 'allocation_run',
        entityId: runId,
        newValue: { reproducible: differences.length === 0, recomputedHash },
      });

      return {
        runId,
        reproducible: differences.length === 0,
        storedHash: record.outputHash,
        recomputedHash,
        algorithmVersion: record.algorithmVersion,
        differences,
        checkedAt: now().toISOString(),
      };
    },

    async getStudentResults(studentId) {
      const serverTime = now().toISOString();
      const window = await windows.findCurrent();
      if (!window) {
        return {
          window: null,
          ranAt: null,
          method: null,
          allocated: null,
          results: [],
          serverTime,
        };
      }

      const run = await allocations.findLatestCompletedRun(window.id);
      if (!run) {
        return {
          window: window.summary,
          ranAt: null,
          method: null,
          allocated: null,
          results: [],
          serverTime,
        };
      }

      const stored = await allocations.findStudentResults(run.id, studentId);
      const results: StudentAllocationResult[] = stored.flatMap((row) => {
        const explanation = row.explanationDetail as AllocationExplanation | null;
        return explanation ? [{ outcome: row.outcome, explanation }] : [];
      });

      return {
        window: window.summary,
        ranAt: run.finishedAt?.toISOString() ?? null,
        method: run.method,
        allocated: results.find((result) => result.outcome === 'ALLOCATED')?.explanation ?? null,
        results,
        serverTime,
      };
    },
  };
}
