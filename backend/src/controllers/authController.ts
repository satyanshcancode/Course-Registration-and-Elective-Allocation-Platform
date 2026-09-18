import type { RequestHandler } from 'express';
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  sessionCookieOptions,
} from '../config/session.js';
import { getAuth } from '../middleware/requireAuth.js';
import type { AuthService } from '../services/authService.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { loginRequestSchema } from '../validation/authSchemas.js';
import { parseInput } from '../validation/parse.js';

export interface AuthController {
  login: RequestHandler;
  logout: RequestHandler;
  me: RequestHandler;
}

export function createAuthController(
  authService: AuthService,
  options: { cookieSecure: boolean },
): AuthController {
  const cookieOptions = sessionCookieOptions(options.cookieSecure);

  return {
    async login(req, res) {
      const credentials = parseInput(loginRequestSchema, req.body);
      const { user, token } = await authService.login(credentials, {
        ip: req.ip,
        userAgent: req.get('user-agent'),
      });
      res.cookie(SESSION_COOKIE_NAME, token, {
        ...cookieOptions,
        maxAge: SESSION_TTL_SECONDS * 1000,
      });
      // The token is deliberately NOT in the body: only the httpOnly cookie holds it.
      sendSuccess(res, user, { message: 'Signed in.' });
    },

    logout(_req, res) {
      res.clearCookie(SESSION_COOKIE_NAME, cookieOptions);
      sendSuccess(res, null, { message: 'Signed out.' });
    },

    async me(req, res) {
      const user = await authService.getCurrentUser(getAuth(req).userId);
      sendSuccess(res, user);
    },
  };
}
