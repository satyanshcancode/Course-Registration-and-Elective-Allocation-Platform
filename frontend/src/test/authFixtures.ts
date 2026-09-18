import type { ApiFailure, ApiResponse, CurrentUser } from '@course-reg/shared';

export const studentUser: CurrentUser = {
  id: 'b2f5b3a0-0000-4000-8000-000000000001',
  email: 'aarav.sharma@university.edu',
  role: 'STUDENT',
  student: {
    name: 'Aarav Sharma',
    rollNumber: 'CSE24901',
    program: { code: 'BTECH-CSE', name: 'B.Tech Computer Science and Engineering' },
    semester: 6,
    creditsCompleted: 112,
  },
};

export const adminUser: CurrentUser = {
  id: 'b2f5b3a0-0000-4000-8000-000000000002',
  email: 'admin@university.edu',
  role: 'ADMIN',
};

export const notSignedIn: ApiFailure = {
  success: false,
  data: null,
  message: 'Please sign in to continue.',
};

export const invalidCredentials: ApiFailure = {
  success: false,
  data: null,
  message: 'Incorrect e-mail or password.',
};

export function ok<T>(data: T): ApiResponse<T> {
  return { success: true, data };
}
