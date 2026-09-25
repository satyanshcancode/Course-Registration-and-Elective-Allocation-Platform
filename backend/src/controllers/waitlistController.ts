import type { RequestHandler } from 'express';
import { getAuth, requireStudentId } from '../middleware/requireAuth.js';
import type { WaitlistService } from '../services/waitlistService.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { courseCodeSchema } from '../validation/courseSchemas.js';
import { parseInput } from '../validation/parse.js';
import { enrollmentIdSchema, withdrawEnrollmentSchema } from '../validation/waitlistSchemas.js';

export interface WaitlistController {
  myWaitlist: RequestHandler;
  getAdminView: RequestHandler;
  withdraw: RequestHandler;
  processAll: RequestHandler;
}

/** "2 students promoted", or the plain truth that nobody moved. */
function promotionMessage(promoted: number, removed: number): string {
  if (promoted === 0) {
    return removed === 0
      ? 'No one was waiting for that seat.'
      : `Nobody could be promoted; ${removed} waitlist ${removed === 1 ? 'entry was' : 'entries were'} removed.`;
  }
  return `${promoted} ${promoted === 1 ? 'student' : 'students'} promoted.`;
}

export function createWaitlistController(service: WaitlistService): WaitlistController {
  return {
    async myWaitlist(req, res) {
      sendSuccess(res, await service.getStudentWaitlist(requireStudentId(req)));
    },

    async getAdminView(req, res) {
      // `?course=` (absent or empty) means "nothing selected yet".
      const raw = req.query.course;
      const code =
        typeof raw === 'string' && raw !== '' ? parseInput(courseCodeSchema, raw) : undefined;
      sendSuccess(res, await service.getAdminView(code));
    },

    async withdraw(req, res) {
      const enrollmentId = parseInput(enrollmentIdSchema, req.params.id);
      const { reason } = parseInput(withdrawEnrollmentSchema, req.body);
      const result = await service.withdraw(getAuth(req).userId, enrollmentId, reason);
      sendSuccess(res, result, {
        message: `${result.student.name} was withdrawn from ${result.course.code}. ${promotionMessage(
          result.promotions.promoted.length,
          result.promotions.removed.length,
        )}`,
      });
    },

    async processAll(req, res) {
      const result = await service.processAll(getAuth(req).userId);
      sendSuccess(res, result, {
        message: `${result.coursesChecked} ${result.coursesChecked === 1 ? 'course' : 'courses'} had a free seat. ${promotionMessage(
          result.promotions.promoted.length,
          result.promotions.removed.length,
        )}`,
      });
    },
  };
}
