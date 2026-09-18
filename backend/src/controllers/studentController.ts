import type { RequestHandler } from 'express';
import { requireStudentId } from '../middleware/requireAuth.js';
import type { StudentService } from '../services/studentService.js';
import { sendSuccess } from '../utils/apiResponse.js';

export interface StudentController {
  getMyProfile: RequestHandler;
}

export function createStudentController(studentService: StudentService): StudentController {
  return {
    async getMyProfile(req, res) {
      // Identity comes from the verified session only (see CLAUDE.md).
      const profile = await studentService.getOwnProfile(requireStudentId(req));
      sendSuccess(res, profile);
    },
  };
}
