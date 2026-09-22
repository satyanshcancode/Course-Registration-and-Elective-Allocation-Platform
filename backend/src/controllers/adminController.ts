import type { AdminPing } from '@course-reg/shared';
import type { RequestHandler } from 'express';
import { getAuth } from '../middleware/requireAuth.js';
import type { AdminCourseService } from '../services/adminCourseService.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { courseCodeSchema, updateCapacitySchema } from '../validation/courseSchemas.js';
import { parseInput } from '../validation/parse.js';

export interface AdminController {
  ping: RequestHandler;
  listCourses: RequestHandler;
  updateCapacity: RequestHandler;
}

export function createAdminController(adminCourseService: AdminCourseService): AdminController {
  return {
    ping(req, res) {
      const body: AdminPing = { status: 'ok', adminId: getAuth(req).userId };
      sendSuccess(res, body);
    },

    async listCourses(_req, res) {
      sendSuccess(res, await adminCourseService.listOfferings());
    },

    async updateCapacity(req, res) {
      const code = parseInput(courseCodeSchema, req.params.code);
      const change = parseInput(updateCapacitySchema, req.body);
      const updated = await adminCourseService.updateCapacity(getAuth(req).userId, code, change);
      sendSuccess(res, updated, {
        message: `${updated.code} capacity is now ${updated.capacity}.`,
      });
    },
  };
}
