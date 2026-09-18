import { DEFAULT_PREFERENCE_PRIORITY_CONFIG } from '@course-reg/shared';
import { describe, expect, it } from 'vitest';
import {
  mapEnrollmentRow,
  mapPreferenceSubmissionRow,
  mapRegistrationWindowRow,
  mapStudentRow,
  mapUserRow,
  RowMappingError,
} from './mappers.js';
import type {
  EnrollmentRow,
  PreferenceSubmissionRow,
  RegistrationWindowRow,
  UserRow,
} from './rows.js';

const at = new Date('2026-09-01T09:00:00.000Z');

const windowRow: RegistrationWindowRow = {
  id: 'w1',
  name: 'Fall 2026',
  term: '2026-FALL',
  starts_at: at,
  ends_at: new Date('2026-09-15T17:00:00.000Z'),
  status: 'DRAFT',
  allocation_method: 'PREFERENCE_PRIORITY',
  // JSONB round-trips object keys as strings.
  config: JSON.parse(JSON.stringify(DEFAULT_PREFERENCE_PRIORITY_CONFIG)) as unknown,
  random_seed: '2026091801',
  created_at: at,
  updated_at: at,
};

describe('mappers', () => {
  it('maps a user without exposing the password hash', () => {
    const row: UserRow = {
      id: 'u1',
      email: 'a@university.edu',
      password_hash: '$2b$10$secret',
      role: 'ADMIN',
      created_at: at,
      updated_at: at,
    };

    expect(mapUserRow(row)).toEqual({
      id: 'u1',
      email: 'a@university.edu',
      role: 'ADMIN',
      createdAt: '2026-09-01T09:00:00.000Z',
    });
  });

  it('maps a registration window, validating config and converting BIGINT seed', () => {
    const window = mapRegistrationWindowRow(windowRow);

    expect(window.randomSeed).toBe(2026091801);
    expect(window.config.method).toBe('PREFERENCE_PRIORITY');
    expect(window.startsAt).toBe('2026-09-01T09:00:00.000Z');
  });

  it('rejects rows that break the contract', () => {
    expect(() => mapRegistrationWindowRow({ ...windowRow, status: 'PAUSED' })).toThrow(
      RowMappingError,
    );
    expect(() => mapRegistrationWindowRow({ ...windowRow, config: { method: 'LOTTERY' } })).toThrow(
      RowMappingError,
    );
    expect(() =>
      mapStudentRow({
        user_id: 's1',
        user_role: 'STUDENT',
        roll_number: 'CSE22001',
        name: 'Test',
        program_id: 'p1',
        semester: 5,
        credits_completed: 80,
        expected_graduation_term: 'next year',
        created_at: at,
        updated_at: at,
      }),
    ).toThrow(RowMappingError);
  });

  it('maps submissions into the draft/submitted discriminated union', () => {
    const draft: PreferenceSubmissionRow = {
      id: 'p1',
      student_id: 's1',
      window_id: 'w1',
      status: 'DRAFT',
      idempotency_key: null,
      submitted_at: null,
      submission_sequence: null,
      created_at: at,
      updated_at: at,
    };
    const submitted = mapPreferenceSubmissionRow({
      ...draft,
      status: 'SUBMITTED',
      idempotency_key: 'k1',
      submitted_at: at,
      submission_sequence: '17',
    });

    expect(mapPreferenceSubmissionRow(draft).status).toBe('DRAFT');
    expect(submitted.status).toBe('SUBMITTED');
    if (submitted.status === 'SUBMITTED') {
      expect(submitted.submissionSequence).toBe(17);
    }
  });

  it('maps enrollments into the active/dropped discriminated union', () => {
    const row: EnrollmentRow = {
      id: 'e1',
      student_id: 's1',
      window_id: 'w1',
      course_id: 'c1',
      status: 'DROPPED',
      source: 'ALLOCATION',
      enrolled_at: at,
      dropped_at: new Date('2026-09-20T10:00:00.000Z'),
      created_at: at,
      updated_at: at,
    };

    expect(mapEnrollmentRow(row)).toMatchObject({
      status: 'DROPPED',
      droppedAt: '2026-09-20T10:00:00.000Z',
    });
    expect(() => mapEnrollmentRow({ ...row, dropped_at: null })).toThrow(RowMappingError);
  });
});
