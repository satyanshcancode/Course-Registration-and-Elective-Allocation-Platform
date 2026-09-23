import type { AdminPing } from '@course-reg/shared';
import type { RequestHandler } from 'express';
import { getAuth } from '../middleware/requireAuth.js';
import type { AdminCourseService } from '../services/adminCourseService.js';
import type { RegistrationWindowService } from '../services/registrationWindowService.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { courseCodeSchema, updateCapacitySchema } from '../validation/courseSchemas.js';
import { parseInput } from '../validation/parse.js';
import { updateWindowSchema, windowActionSchema } from '../validation/windowSchemas.js';

export interface AdminController {
  ping: RequestHandler;
  listCourses: RequestHandler;
  updateCapacity: RequestHandler;
  getWindow: RequestHandler;
  updateWindow: RequestHandler;
  openWindow: RequestHandler;
  closeWindow: RequestHandler;
}

export interface AdminControllerServices {
  adminCourseService: AdminCourseService;
  registrationWindowService: RegistrationWindowService;
}

export function createAdminController({
  adminCourseService,
  registrationWindowService,
}: AdminControllerServices): AdminController {
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

    async getWindow(_req, res) {
      sendSuccess(res, await registrationWindowService.getDetail());
    },

    async updateWindow(req, res) {
      const change = parseInput(updateWindowSchema, req.body);
      const detail = await registrationWindowService.updateWindow(getAuth(req).userId, change);
      sendSuccess(res, detail, { message: 'Registration window saved.' });
    },

    async openWindow(req, res) {
      const request = parseInput(windowActionSchema, req.body ?? {});
      const detail = await registrationWindowService.open(getAuth(req).userId, request);
      sendSuccess(res, detail, {
        message: 'Registration is open. The allocation policy is now frozen.',
      });
    },

    async closeWindow(req, res) {
      const request = parseInput(windowActionSchema, req.body ?? {});
      const detail = await registrationWindowService.close(getAuth(req).userId, request);
      sendSuccess(res, detail, { message: 'Registration is closed.' });
    },
  };
}
