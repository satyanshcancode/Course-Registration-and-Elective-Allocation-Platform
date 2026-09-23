import type { RequestHandler } from 'express';
import { requireStudentId } from '../middleware/requireAuth.js';
import type { EligibilityService } from '../services/eligibilityService.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { courseCodeSchema } from '../validation/courseSchemas.js';
import { parseInput } from '../validation/parse.js';

export interface EligibilityController {
  getOverview: RequestHandler;
  getCourse: RequestHandler;
}

export function createEligibilityController(
  eligibilityService: EligibilityService,
): EligibilityController {
  return {
    async getOverview(req, res) {
      // The student is always the caller: never an id from the URL or body.
      sendSuccess(res, await eligibilityService.getOverview(requireStudentId(req)));
    },

    async getCourse(req, res) {
      const code = parseInput(courseCodeSchema, req.params.code);
      sendSuccess(res, await eligibilityService.getCourse(requireStudentId(req), code));
    },
  };
}
