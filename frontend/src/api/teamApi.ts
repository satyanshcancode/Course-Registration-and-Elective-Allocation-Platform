import type {
  ApiResponse,
  InviteCoAdminRequest,
  InviteCoAdminResult,
  SetTeamMemberActiveRequest,
  TeamList,
} from '@course-reg/shared';
import { apiClient } from './apiClient';

/**
 * Staff accounts. Every call here answers 403 for a co-administrator; the
 * hidden navigation item and the route guard only save them a wasted trip.
 */
export function getTeam(signal?: AbortSignal): Promise<ApiResponse<TeamList>> {
  return apiClient.get<TeamList>('/admin/team', { signal });
}

export function inviteCoAdmin(
  request: InviteCoAdminRequest,
): Promise<ApiResponse<InviteCoAdminResult>> {
  return apiClient.post<InviteCoAdminResult>('/admin/team', { body: request });
}

export function resendTeamInvitation(id: string): Promise<ApiResponse<TeamList>> {
  return apiClient.post<TeamList>(`/admin/team/${encodeURIComponent(id)}/invitation`);
}

export function setTeamMemberActive(
  id: string,
  isActive: boolean,
  request: SetTeamMemberActiveRequest = {},
): Promise<ApiResponse<TeamList>> {
  const action = isActive ? 'reactivate' : 'deactivate';
  return apiClient.post<TeamList>(`/admin/team/${encodeURIComponent(id)}/${action}`, {
    body: request,
  });
}
