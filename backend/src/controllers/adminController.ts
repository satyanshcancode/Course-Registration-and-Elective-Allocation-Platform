import type { AdminPing } from '@course-reg/shared';
import type { RequestHandler } from 'express';
import { getAuth } from '../middleware/requireAuth.js';
import { sendSuccess } from '../utils/apiResponse.js';

export interface AdminController {
  ping: RequestHandler;
}

export function createAdminController(): AdminController {
  return {
    ping(req, res) {
      const body: AdminPing = { status: 'ok', adminId: getAuth(req).userId };
      sendSuccess(res, body);
    },
  };
}
