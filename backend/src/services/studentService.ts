import type { StudentProfile } from '@course-reg/shared';
import type { StudentRepository } from '../repositories/studentRepository.js';
import { AppError } from '../utils/appError.js';

export interface StudentService {
  /** `studentId` must come from req.auth, never from the request itself. */
  getOwnProfile(studentId: string): Promise<StudentProfile>;
}

export function createStudentService(students: StudentRepository): StudentService {
  return {
    async getOwnProfile(studentId) {
      const profile = await students.findProfile(studentId);
      if (!profile) {
        throw AppError.notFound('Student profile not found.');
      }
      return profile;
    },
  };
}
