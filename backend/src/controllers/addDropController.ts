import { IDEMPOTENCY_KEY_HEADER, type AddDropOutcome } from '@course-reg/shared';
import type { RequestHandler } from 'express';
import { requireStudentId } from '../middleware/requireAuth.js';
import type { AddDropService } from '../services/addDropService.js';
import { sendSuccess } from '../utils/apiResponse.js';
import {
  addSchema,
  dropSchema,
  swapSchema,
  waitlistActionSchema,
} from '../validation/addDropSchemas.js';
import { idempotencyKeySchema } from '../validation/cartSchemas.js';
import { parseInput } from '../validation/parse.js';

export interface AddDropController {
  getView: RequestHandler;
  drop: RequestHandler;
  add: RequestHandler;
  swap: RequestHandler;
  joinWaitlist: RequestHandler;
  leaveWaitlist: RequestHandler;
}

/** What happened, in one line, for the toast. */
export function outcomeMessage(result: AddDropOutcome): string {
  switch (result.outcome) {
    case 'DROPPED': {
      const promoted = result.promotions.promoted.length;
      const passed =
        promoted === 0
          ? 'Nobody was waiting for it.'
          : `The seat went to the next student waiting for it.`;
      return `You dropped ${result.course.code}. ${passed}`;
    }
    case 'ADDED':
      return `You added ${result.course.code}. The seat is yours.`;
    case 'SWAPPED':
      return `You swapped ${result.from.code} for ${result.to.code}.`;
    case 'WAITLISTED':
      return result.courseWasFull
        ? `${result.course.code} is full, so you joined the waitlist at #${result.position}.`
        : `You joined the waitlist for ${result.course.code} at #${result.position}.`;
    case 'WAITLIST_LEFT':
      return `You left the waitlist for ${result.course.code}.`;
  }
}

export function createAddDropController(service: AddDropService): AddDropController {
  /** Every action reads its student from the session and its key from the header. */
  const key = (req: Parameters<RequestHandler>[0]) =>
    parseInput(idempotencyKeySchema, req.get(IDEMPOTENCY_KEY_HEADER));

  return {
    async getView(req, res) {
      // Always the caller's own page: no student id is read from the request.
      sendSuccess(res, await service.getView(requireStudentId(req)));
    },

    async drop(req, res) {
      const request = parseInput(dropSchema, req.body);
      const result = await service.drop(requireStudentId(req), key(req), request);
      sendSuccess(res, result, { message: outcomeMessage(result.result) });
    },

    async add(req, res) {
      const request = parseInput(addSchema, req.body);
      const result = await service.add(requireStudentId(req), key(req), request);
      sendSuccess(res, result, { message: outcomeMessage(result.result) });
    },

    async swap(req, res) {
      const request = parseInput(swapSchema, req.body);
      const result = await service.swap(requireStudentId(req), key(req), request);
      sendSuccess(res, result, { message: outcomeMessage(result.result) });
    },

    async joinWaitlist(req, res) {
      const request = parseInput(waitlistActionSchema, req.body);
      const result = await service.joinWaitlist(requireStudentId(req), key(req), request);
      sendSuccess(res, result, { message: outcomeMessage(result.result) });
    },

    async leaveWaitlist(req, res) {
      const request = parseInput(waitlistActionSchema, req.body);
      const result = await service.leaveWaitlist(requireStudentId(req), key(req), request);
      sendSuccess(res, result, { message: outcomeMessage(result.result) });
    },
  };
}
