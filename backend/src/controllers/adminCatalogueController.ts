import type { RequestHandler } from 'express';
import { getAuth } from '../middleware/requireAuth.js';
import type { AdminCatalogueService } from '../services/adminCatalogueService.js';
import { sendSuccess } from '../utils/apiResponse.js';
import {
  courseWriteSchema,
  createCourseSchema,
  newCourseCodeSchema,
} from '../validation/adminCatalogueSchemas.js';
import { activationChangeSchema, csvImportSchema } from '../validation/adminStudentSchemas.js';
import { parseInput } from '../validation/parse.js';

export interface AdminCatalogueController {
  list: RequestHandler;
  get: RequestHandler;
  create: RequestHandler;
  update: RequestHandler;
  deactivate: RequestHandler;
  reactivate: RequestHandler;
  previewImport: RequestHandler;
  confirmImport: RequestHandler;
}

export function createAdminCatalogueController(
  service: AdminCatalogueService,
): AdminCatalogueController {
  const codeOf = (req: Parameters<RequestHandler>[0]): string =>
    parseInput(newCourseCodeSchema, req.params.code);

  return {
    async list(_req, res) {
      sendSuccess(res, await service.list());
    },

    async get(req, res) {
      sendSuccess(res, await service.get(codeOf(req)));
    },

    async create(req, res) {
      const request = parseInput(createCourseSchema, req.body);
      const course = await service.create(getAuth(req).userId, request);
      sendSuccess(res, course, {
        statusCode: 201,
        message: `${course.code} ${course.name} has been added to the catalogue.`,
      });
    },

    async update(req, res) {
      // The code is not editable: it is the course's public identity, and
      // submissions, enrollments and stored results all refer to it.
      const request = parseInput(courseWriteSchema, req.body);
      const course = await service.update(getAuth(req).userId, codeOf(req), request);
      sendSuccess(res, course, { message: `${course.code} has been saved.` });
    },

    async deactivate(req, res) {
      const { reason } = parseInput(activationChangeSchema, req.body ?? {});
      const course = await service.setActive(getAuth(req).userId, codeOf(req), false, reason);
      sendSuccess(res, course, {
        message: `${course.code} is retired. It stays in every window that already offers it, and cannot be added to a new one.`,
      });
    },

    async reactivate(req, res) {
      const { reason } = parseInput(activationChangeSchema, req.body ?? {});
      const course = await service.setActive(getAuth(req).userId, codeOf(req), true, reason);
      sendSuccess(res, course, { message: `${course.code} can be offered again.` });
    },

    async previewImport(req, res) {
      const { csv } = parseInput(csvImportSchema, req.body);
      sendSuccess(res, await service.previewImport(csv));
    },

    async confirmImport(req, res) {
      const { csv } = parseInput(csvImportSchema, req.body);
      const report = await service.importCourses(getAuth(req).userId, csv);
      sendSuccess(res, report, {
        message:
          report.fileError !== null
            ? 'That file could not be read, so nothing was imported.'
            : `${report.counts.imported} of ${report.counts.total} rows imported.`,
      });
    },
  };
}
