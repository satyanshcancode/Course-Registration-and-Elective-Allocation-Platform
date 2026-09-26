import type { RequestHandler } from 'express';
import { requireStudentId } from '../middleware/requireAuth.js';
import type { ActivityService } from '../services/activityService.js';
import { sendSuccess } from '../utils/apiResponse.js';
import {
  historyQuerySchema,
  notificationIdSchema,
  notificationQuerySchema,
} from '../validation/activitySchemas.js';
import { parseInput } from '../validation/parse.js';

export interface ActivityController {
  getStatus: RequestHandler;
  getHistory: RequestHandler;
  getNotifications: RequestHandler;
  markNotificationRead: RequestHandler;
  markAllNotificationsRead: RequestHandler;
}

/** "3 marked as read", or the honest answer that they already were. */
function readMessage(marked: number): string {
  return marked === 0
    ? 'Nothing left to mark.'
    : `${marked} ${marked === 1 ? 'notification' : 'notifications'} marked as read.`;
}

export function createActivityController(service: ActivityService): ActivityController {
  return {
    // Identity comes from the verified session only, never from the request.
    async getStatus(req, res) {
      sendSuccess(res, await service.getStatus(requireStudentId(req)));
    },

    async getHistory(req, res) {
      const query = parseInput(historyQuerySchema, req.query);
      sendSuccess(res, await service.getHistory(requireStudentId(req), query));
    },

    async getNotifications(req, res) {
      const { filter = 'all', cursor } = parseInput(notificationQuerySchema, req.query);
      sendSuccess(res, await service.getNotifications(requireStudentId(req), { filter, cursor }));
    },

    async markNotificationRead(req, res) {
      const id = parseInput(notificationIdSchema, req.params.id);
      const result = await service.markNotificationRead(requireStudentId(req), id);
      sendSuccess(res, result, { message: readMessage(result.marked) });
    },

    async markAllNotificationsRead(req, res) {
      const result = await service.markAllNotificationsRead(requireStudentId(req));
      sendSuccess(res, result, { message: readMessage(result.marked) });
    },
  };
}
