import type { RequestHandler } from 'express';
import { getAuth, requireStudentId } from '../middleware/requireAuth.js';
import type { AllocationService } from '../services/allocationService.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { runAllocationSchema, runIdSchema } from '../validation/allocationSchemas.js';
import { parseInput } from '../validation/parse.js';

export interface AllocationController {
  preview: RequestHandler;
  run: RequestHandler;
  listRuns: RequestHandler;
  getRun: RequestHandler;
  verifyRun: RequestHandler;
  myResults: RequestHandler;
}

export function createAllocationController(service: AllocationService): AllocationController {
  return {
    async preview(req, res) {
      getAuth(req);
      sendSuccess(res, await service.preview());
    },

    async run(req, res) {
      const { reason } = parseInput(runAllocationSchema, req.body);
      const { userId } = getAuth(req);
      const detail = await service.run(userId, reason);
      sendSuccess(res, detail, {
        message: `Allocation complete: ${detail.metrics?.allocated ?? 0} students placed.`,
      });
    },

    async listRuns(req, res) {
      getAuth(req);
      sendSuccess(res, await service.listRuns());
    },

    async getRun(req, res) {
      getAuth(req);
      sendSuccess(res, await service.getRun(parseInput(runIdSchema, req.params.id)));
    },

    async verifyRun(req, res) {
      const { userId } = getAuth(req);
      sendSuccess(res, await service.verify(parseInput(runIdSchema, req.params.id), userId));
    },

    async myResults(req, res) {
      // The caller's own results: no student id is read from the request.
      sendSuccess(res, await service.getStudentResults(requireStudentId(req)));
    },
  };
}
