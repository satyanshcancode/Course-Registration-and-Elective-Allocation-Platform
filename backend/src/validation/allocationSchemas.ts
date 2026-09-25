import { z } from 'zod';

export const ALLOCATION_REASON_LENGTH = 500;

/**
 * Running allocation is irreversible, so the request has to say so explicitly:
 * a stray POST cannot allocate a whole cohort by accident.
 */
/** A run id from the URL. */
export const runIdSchema = z.uuid({ error: 'Not a valid allocation run id.' });

export const runAllocationSchema = z.object({
  confirm: z.literal(true, {
    error: 'Confirm that allocation should run; it can only be done once.',
  }),
  reason: z.string().trim().max(ALLOCATION_REASON_LENGTH).optional(),
});
