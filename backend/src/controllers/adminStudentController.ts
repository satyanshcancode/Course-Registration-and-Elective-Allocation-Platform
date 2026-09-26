import type { RequestHandler } from 'express';
import { getAuth } from '../middleware/requireAuth.js';
import type { AdminStudentService } from '../services/adminStudentService.js';
import { sendSuccess } from '../utils/apiResponse.js';
import {
  activationChangeSchema,
  adminStudentQuerySchema,
  csvImportSchema,
  rollNumberSchema,
  studentWriteSchema,
} from '../validation/adminStudentSchemas.js';
import { parseInput } from '../validation/parse.js';

export interface AdminStudentController {
  list: RequestHandler;
  get: RequestHandler;
  create: RequestHandler;
  update: RequestHandler;
  resendInvitation: RequestHandler;
  deactivate: RequestHandler;
  reactivate: RequestHandler;
  previewImport: RequestHandler;
  confirmImport: RequestHandler;
  referenceData: RequestHandler;
}

export function createAdminStudentController(service: AdminStudentService): AdminStudentController {
  /** The roll number always comes from the path, validated before any query. */
  const rollNumberOf = (req: Parameters<RequestHandler>[0]): string =>
    parseInput(rollNumberSchema, req.params.rollNumber);

  return {
    async list(req, res) {
      sendSuccess(res, await service.list(parseInput(adminStudentQuerySchema, req.query)));
    },

    async get(req, res) {
      sendSuccess(res, await service.get(rollNumberOf(req)));
    },

    async create(req, res) {
      const request = parseInput(studentWriteSchema, req.body);
      const result = await service.create(getAuth(req).userId, request);
      sendSuccess(res, result, {
        statusCode: 201,
        message: `${result.student.name} has been created and invited by e-mail.`,
      });
    },

    async update(req, res) {
      const request = parseInput(studentWriteSchema, req.body);
      const student = await service.update(getAuth(req).userId, rollNumberOf(req), request);
      sendSuccess(res, student, { message: `${student.name}'s record has been saved.` });
    },

    async resendInvitation(req, res) {
      const student = await service.resendInvitation(getAuth(req).userId, rollNumberOf(req));
      sendSuccess(res, student, {
        message: `A new invitation is on its way to ${student.email}. The previous link no longer works.`,
      });
    },

    async deactivate(req, res) {
      const { reason } = parseInput(activationChangeSchema, req.body ?? {});
      const student = await service.setActive(
        getAuth(req).userId,
        rollNumberOf(req),
        false,
        reason,
      );
      sendSuccess(res, student, {
        message: `${student.name} can no longer sign in. Their record and history are unchanged.`,
      });
    },

    async reactivate(req, res) {
      const { reason } = parseInput(activationChangeSchema, req.body ?? {});
      const student = await service.setActive(getAuth(req).userId, rollNumberOf(req), true, reason);
      sendSuccess(res, student, { message: `${student.name} can sign in again.` });
    },

    async previewImport(req, res) {
      const { csv } = parseInput(csvImportSchema, req.body);
      // A dry run: nothing is written, whatever the verdicts say.
      sendSuccess(res, await service.previewImport(csv));
    },

    async confirmImport(req, res) {
      const { csv } = parseInput(csvImportSchema, req.body);
      const report = await service.importStudents(getAuth(req).userId, csv);
      sendSuccess(res, report, {
        message:
          report.fileError !== null
            ? 'That file could not be read, so nothing was imported.'
            : `${report.counts.imported} of ${report.counts.total} rows imported, ${report.invitationsSent ?? 0} invited by e-mail.`,
      });
    },

    async referenceData(_req, res) {
      sendSuccess(res, await service.referenceData());
    },
  };
}
