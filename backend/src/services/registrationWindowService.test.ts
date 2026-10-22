import type { RegistrationWindowStatus } from '@course-reg/shared';
import type { PoolClient } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import type { AuditLogInput, AuditLogRepository } from '../repositories/auditLogRepository.js';
import type { CourseCatalogueRepository } from '../repositories/courseCatalogueRepository.js';
import type { NotificationRepository } from '../repositories/notificationRepository.js';
import type { RegistrationWindowRepository } from '../repositories/registrationWindowRepository.js';
import type { WindowDetailRecord } from '../types/catalogue.js';
import { AppError } from '../utils/appError.js';
import {
  createRegistrationWindowService,
  WINDOW_AUDIT_ACTIONS,
} from './registrationWindowService.js';

function createFakePool() {
  const statements: string[] = [];
  const client = {
    query: vi.fn((sql: string) => {
      statements.push(sql);
      return Promise.resolve({});
    }),
    release: vi.fn(),
  };
  const pool = {
    connect: () => Promise.resolve(client as unknown as PoolClient),
  };
  return { pool, client, statements };
}

function makeWindow(status: RegistrationWindowStatus = 'OPEN'): WindowDetailRecord {
  return {
    id: 'window-111',
    summary: {
      name: 'Fall 2026',
      term: '2026-FALL',
      status,
      startsAt: '2026-09-21T10:00:00.000Z',
      endsAt: '2026-10-05T18:00:00.000Z',
      addDropOpensAt: null,
      addDropClosesAt: null,
    },
    policy: { method: 'FCFS' },
    randomSeed: 12345,
  };
}

describe('registrationWindowService.updateDeadline', () => {
  const NOW = new Date('2026-09-22T12:00:00.000Z');

  function setup(windowRecord: WindowDetailRecord | null = makeWindow('OPEN')) {
    const { pool, statements } = createFakePool();
    const recordedAudits: AuditLogInput[] = [];
    const updatedDeadlines: { windowId: string; endsAt: Date }[] = [];

    const mockRepo: RegistrationWindowRepository = {
      findCurrent: vi.fn().mockResolvedValue(windowRecord?.summary ?? null),
      findCurrentDetail: vi.fn().mockResolvedValue(windowRecord),
      findCourseOptions: vi.fn().mockResolvedValue([]),
      countWindow: vi
        .fn()
        .mockResolvedValue({ offeredCourses: 2, submissions: 0, totalStudents: 10 }),
      findAllEligibilityFacts: vi.fn().mockResolvedValue([]),
      lockById: vi.fn().mockResolvedValue(windowRecord),
      updatePolicy: vi.fn().mockResolvedValue(undefined),
      replaceOfferings: vi.fn().mockResolvedValue(undefined),
      setStatus: vi.fn().mockResolvedValue(undefined),
      setAddDropPeriod: vi.fn().mockResolvedValue(undefined),
      updateDeadline: vi.fn().mockImplementation((windowId: string, endsAt: Date) => {
        updatedDeadlines.push({ windowId, endsAt });
        if (windowRecord) {
          windowRecord.summary.endsAt = endsAt.toISOString();
        }
        return Promise.resolve();
      }),
      findAllStudentUserIds: vi.fn().mockResolvedValue([]),
    };

    const mockAuditLogs: AuditLogRepository = {
      record: vi.fn().mockImplementation((entry: AuditLogInput) => {
        recordedAudits.push(entry);
        return Promise.resolve();
      }),
    };

    const mockCatalogue: CourseCatalogueRepository = {
      listOfferings: vi.fn().mockResolvedValue([]),
    } as unknown as CourseCatalogueRepository;

    const mockNotifications: NotificationRepository = {
      broadcast: vi.fn().mockResolvedValue(undefined),
    } as unknown as NotificationRepository;

    const service = createRegistrationWindowService({
      pool,
      windows: mockRepo,
      catalogue: mockCatalogue,
      windowsFor: () => mockRepo,
      auditLogsFor: () => mockAuditLogs,
      notificationsFor: () => mockNotifications,
      now: () => NOW,
    });

    return { service, mockRepo, mockAuditLogs, statements, updatedDeadlines, recordedAudits };
  }

  it('updates the deadline and records an audit log when window is OPEN', async () => {
    const window = makeWindow('OPEN');
    const { service, updatedDeadlines, recordedAudits, statements } = setup(window);
    const newDeadline = '2026-10-15T18:00:00.000Z';

    const detail = await service.updateDeadline('admin-user-1', {
      endsAt: newDeadline,
      reason: 'Extension granted',
    });

    expect(updatedDeadlines).toEqual([{ windowId: 'window-111', endsAt: new Date(newDeadline) }]);
    expect(recordedAudits).toEqual([
      {
        actorUserId: 'admin-user-1',
        action: WINDOW_AUDIT_ACTIONS.updateDeadline,
        entityType: 'registration_window',
        entityId: 'window-111',
        oldValue: { endsAt: '2026-10-05T18:00:00.000Z' },
        newValue: { endsAt: newDeadline },
        reason: 'Extension granted',
      },
    ]);
    expect(statements).toEqual(['BEGIN', 'COMMIT']);
    expect(detail.window?.endsAt).toBe(newDeadline);
  });

  it('shortens the deadline to a future time', async () => {
    const window = makeWindow('OPEN');
    const { service, updatedDeadlines } = setup(window);
    const newDeadline = '2026-09-25T18:00:00.000Z';

    await service.updateDeadline('admin-user-1', { endsAt: newDeadline });

    expect(updatedDeadlines).toHaveLength(1);
    expect(updatedDeadlines[0]?.endsAt).toEqual(new Date(newDeadline));
  });

  it('refuses to update deadline when window is DRAFT', async () => {
    const { service, updatedDeadlines, recordedAudits } = setup(makeWindow('DRAFT'));

    await expect(
      service.updateDeadline('admin-user-1', { endsAt: '2026-10-15T18:00:00.000Z' }),
    ).rejects.toThrow(AppError);

    expect(updatedDeadlines).toHaveLength(0);
    expect(recordedAudits).toHaveLength(0);
  });

  it('refuses to update deadline when window is CLOSED', async () => {
    const { service } = setup(makeWindow('CLOSED'));

    await expect(
      service.updateDeadline('admin-user-1', { endsAt: '2026-10-15T18:00:00.000Z' }),
    ).rejects.toThrow(AppError);
  });

  it('refuses to update deadline when window is ALLOCATED', async () => {
    const { service } = setup(makeWindow('ALLOCATED'));

    await expect(
      service.updateDeadline('admin-user-1', { endsAt: '2026-10-15T18:00:00.000Z' }),
    ).rejects.toThrow(AppError);
  });

  it('refuses a deadline in the past', async () => {
    const { service, updatedDeadlines, recordedAudits } = setup(makeWindow('OPEN'));
    const pastDeadline = '2026-09-21T18:00:00.000Z'; // before NOW (2026-09-22)

    await expect(service.updateDeadline('admin-user-1', { endsAt: pastDeadline })).rejects.toThrow(
      'future',
    );

    expect(updatedDeadlines).toHaveLength(0);
    expect(recordedAudits).toHaveLength(0);
  });

  it('refuses a deadline that is before startsAt', async () => {
    const { service, updatedDeadlines, recordedAudits } = setup(makeWindow('OPEN'));
    const beforeStartsAt = '2026-09-20T10:00:00.000Z'; // before startsAt (2026-09-21T10:00)

    await expect(
      service.updateDeadline('admin-user-1', { endsAt: beforeStartsAt }),
    ).rejects.toThrow('after it opens');

    expect(updatedDeadlines).toHaveLength(0);
    expect(recordedAudits).toHaveLength(0);
  });

  it('refuses when no registration window exists', async () => {
    const { service } = setup(null);

    await expect(
      service.updateDeadline('admin-user-1', { endsAt: '2026-10-15T18:00:00.000Z' }),
    ).rejects.toThrow('There is no registration window yet.');
  });
});
