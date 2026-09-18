import type { RequestHandler } from 'express';
import { AppError } from '../utils/appError.js';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(AppError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
};
