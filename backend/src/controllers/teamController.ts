import type { RequestHandler } from 'express';
import { getAuth } from '../middleware/requireAuth.js';
import type { TeamService } from '../services/teamService.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { parseInput } from '../validation/parse.js';
import {
  inviteCoAdminSchema,
  setTeamMemberActiveSchema,
  teamMemberIdSchema,
} from '../validation/teamSchemas.js';

export interface TeamController {
  list: RequestHandler;
  invite: RequestHandler;
  resendInvitation: RequestHandler;
  deactivate: RequestHandler;
  reactivate: RequestHandler;
}

export function createTeamController(service: TeamService): TeamController {
  const memberIdOf = (req: Parameters<RequestHandler>[0]): string =>
    parseInput(teamMemberIdSchema, req.params.id);
  const reasonOf = (req: Parameters<RequestHandler>[0]): string | undefined =>
    parseInput(setTeamMemberActiveSchema, req.body ?? {}).reason;

  return {
    async list(req, res) {
      sendSuccess(res, await service.list(getAuth(req).userId));
    },

    async invite(req, res) {
      const request = parseInput(inviteCoAdminSchema, req.body);
      const result = await service.invite(getAuth(req).userId, request);
      sendSuccess(res, result, {
        statusCode: 201,
        message: `Invitation sent to ${result.member.email}.`,
      });
    },

    async resendInvitation(req, res) {
      const team = await service.resendInvitation(getAuth(req).userId, memberIdOf(req));
      sendSuccess(res, team, { message: 'A new invitation is on its way.' });
    },

    async deactivate(req, res) {
      const team = await service.setActive(
        getAuth(req).userId,
        memberIdOf(req),
        false,
        reasonOf(req),
      );
      sendSuccess(res, team, { message: 'The account is deactivated and signed out.' });
    },

    async reactivate(req, res) {
      const team = await service.setActive(
        getAuth(req).userId,
        memberIdOf(req),
        true,
        reasonOf(req),
      );
      sendSuccess(res, team, { message: 'The account is active again.' });
    },
  };
}
