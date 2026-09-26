import type { RequestHandler } from 'express';
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  sessionCookieOptions,
} from '../config/session.js';
import { getAuth } from '../middleware/requireAuth.js';
import { RESET_REQUESTED_MESSAGE, type AccountService } from '../services/accountService.js';
import type { LoginResult } from '../services/authService.js';
import { sendSuccess } from '../utils/apiResponse.js';
import {
  activationTokenSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  setPasswordSchema,
} from '../validation/accountSchemas.js';
import { parseInput } from '../validation/parse.js';

export interface AccountController {
  checkToken: RequestHandler;
  activate: RequestHandler;
  forgotPassword: RequestHandler;
  resetPassword: RequestHandler;
  changePassword: RequestHandler;
}

export function createAccountController(
  accountService: AccountService,
  options: { cookieSecure: boolean },
): AccountController {
  const cookieOptions = sessionCookieOptions(options.cookieSecure);

  /**
   * Every path that sets a password answers like login does: the user in the
   * body, the session in the httpOnly cookie, the token nowhere else. The fresh
   * cookie also keeps THIS device signed in, since the change just invalidated
   * every token issued before it.
   */
  const sendSession = (
    res: Parameters<RequestHandler>[1],
    { user, token }: LoginResult,
    message: string,
  ): void => {
    res.cookie(SESSION_COOKIE_NAME, token, {
      ...cookieOptions,
      maxAge: SESSION_TTL_SECONDS * 1000,
    });
    sendSuccess(res, user, { message });
  };

  return {
    async checkToken(req, res) {
      const token = parseInput(activationTokenSchema, req.params.token);
      // Always 200: "that link is dead" is an answer, not an error, and a 404
      // here would let a guessed token be told apart from a spent one by status.
      sendSuccess(res, await accountService.checkToken(token));
    },

    async activate(req, res) {
      const request = parseInput(setPasswordSchema, req.body);
      sendSession(
        res,
        await accountService.activate(request),
        'Your account is ready. You are signed in.',
      );
    },

    async forgotPassword(req, res) {
      const { email } = parseInput(forgotPasswordSchema, req.body);
      await accountService.requestReset(email);
      // The same body and the same 200 whether or not the address exists.
      sendSuccess(res, null, { message: RESET_REQUESTED_MESSAGE });
    },

    async resetPassword(req, res) {
      const request = parseInput(setPasswordSchema, req.body);
      sendSession(
        res,
        await accountService.resetPassword(request),
        'Your password has been reset and you are signed in. Other devices have been signed out.',
      );
    },

    async changePassword(req, res) {
      const request = parseInput(changePasswordSchema, req.body);
      sendSession(
        res,
        await accountService.changePassword(getAuth(req).userId, request),
        'Your password has been changed. Other devices have been signed out.',
      );
    },
  };
}
