import type { RequestHandler } from 'express';
import { getAuth } from '../middleware/requireAuth.js';
import type { CatalogueService } from '../services/catalogueService.js';
import { sendSuccess } from '../utils/apiResponse.js';
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
      // A strong ETag from the content hash. The browser may keep the body but
      // must revalidate every time (no-cache), and it is never shared (private).
      res.set('ETag', `"${snapshot.version}"`);
      res.set('Cache-Control', 'private, no-cache');
      // req.fresh compares If-None-Match with the ETag set above.
      if (req.fresh) {
        res.status(304).end();
        return;
      }
      sendSuccess(res, snapshot);
    },
  };
}
