import type { StudentProfile, UnreadNotificationCount } from '@course-reg/shared';
import type { NotificationRepository } from '../repositories/notificationRepository.js';
import type { StudentRepository } from '../repositories/studentRepository.js';
import { AppError } from '../utils/appError.js';

export interface StudentService {
  /** `studentId` must come from req.auth, never from the request itself. */
  getOwnProfile(studentId: string): Promise<StudentProfile>;
  /** Unread notifications for the caller, for the dashboard. */
  countUnreadNotifications(studentId: string): Promise<UnreadNotificationCount>;
}

export function createStudentService(
  students: StudentRepository,
  notifications: NotificationRepository,
): StudentService {
  return {
    async getOwnProfile(studentId) {
      const profile = await students.findProfile(studentId);
      if (!profile) {
        throw AppError.notFound('Student profile not found.');
      }
      return profile;
    },

    async countUnreadNotifications(studentId) {
      return { unread: await notifications.countUnread(studentId) };
    },
  };
}
