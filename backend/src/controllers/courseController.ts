import type { RequestHandler } from 'express';
import { getAuth } from '../middleware/requireAuth.js';
import type { CatalogueService } from '../services/catalogueService.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { etagMatches } from '../utils/etag.js';
import { catalogueQuerySchema, courseCodeSchema } from '../validation/courseSchemas.js';
import { parseInput } from '../validation/parse.js';

export interface CourseController {
  getCurrentWindow: RequestHandler;
  listCatalogue: RequestHandler;
  getCourse: RequestHandler;
  getSeats: RequestHandler;
}

export function createCourseController(catalogueService: CatalogueService): CourseController {
  return {
    async getCurrentWindow(_req, res) {
      sendSuccess(res, await catalogueService.getCurrentWindow());
    },

    async listCatalogue(req, res) {
      const query = parseInput(catalogueQuerySchema, req.query);
      // Personal fields depend on who asks: the viewer comes from the session.
      sendSuccess(res, await catalogueService.listCatalogue(getAuth(req), query));
    },

    async getCourse(req, res) {
      const code = parseInput(courseCodeSchema, req.params.code);
      sendSuccess(res, await catalogueService.getCourse(getAuth(req), code));
    },

    async getSeats(req, res) {
      const snapshot = await catalogueService.getSeats();
      const etag = `"${snapshot.version}"`;
      // A strong ETag from the content hash. Caches must revalidate every time
      // (no-cache), and the response is never shared (private).
      res.set('ETag', etag);
      res.set('Cache-Control', 'private, no-cache');
      if (etagMatches(req.get('If-None-Match'), etag)) {
        res.status(304).end();
        return;
      }
      sendSuccess(res, snapshot);
    },
  };
}
