import type { StudentProfile } from '@course-reg/shared';
import type { Pool } from 'pg';
import { mapStudentProfileRow } from './mappers.js';
import type { StudentProfileRow } from './rows.js';

export interface StudentRepository {
  findProfile(studentId: string): Promise<StudentProfile | null>;
}

export function createStudentRepository(pool: Pick<Pool, 'query'>): StudentRepository {
  return {
    async findProfile(studentId) {
      const result = await pool.query<StudentProfileRow>(
        `SELECT s.user_id, u.email, s.name, s.roll_number, s.semester, s.credits_completed,
                s.expected_graduation_term, p.code AS program_code, p.name AS program_name
         FROM students s
         JOIN users u ON u.id = s.user_id
         JOIN programs p ON p.id = s.program_id
         WHERE s.user_id = $1`,
        [studentId],
      );
      const row = result.rows[0];
      return row ? mapStudentProfileRow(row) : null;
    },
  };
}
