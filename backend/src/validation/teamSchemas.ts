import { z } from 'zod';
import { emailSchema } from './accountSchemas.js';

/**
 * There is deliberately NO `role` field anywhere in this file. A co-admin is
 * the only thing these endpoints can create, and `teamRepository.createCoAdmin`
 * writes the literal, so no request body can choose what role an account gets.
 */
export const inviteCoAdminSchema = z.object({
  name: z
    .string({ error: 'Enter a name.' })
    .trim()
    .min(1, 'Enter a name.')
    .max(120, 'Keep the name under 120 characters.'),
  email: emailSchema,
});

export const teamMemberIdSchema = z.uuid({ error: 'Unknown team member.' });

export const setTeamMemberActiveSchema = z.object({
  reason: z.string().trim().max(500, 'Keep the reason under 500 characters.').optional(),
});
