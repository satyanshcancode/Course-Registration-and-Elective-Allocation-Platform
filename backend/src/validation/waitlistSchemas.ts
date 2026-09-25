import { WITHDRAW_REASON_LENGTH } from '@course-reg/shared';
import { z } from 'zod';

/** A reason is required: a withdrawal is an admin acting on a student's seat. */
export const withdrawEnrollmentSchema = z.object({
  reason: z
    .string({ error: 'Give a reason for the withdrawal.' })
    .trim()
    .min(
      WITHDRAW_REASON_LENGTH.min,
      `Give a reason of at least ${WITHDRAW_REASON_LENGTH.min} characters.`,
    )
    .max(
      WITHDRAW_REASON_LENGTH.max,
      `Keep the reason under ${WITHDRAW_REASON_LENGTH.max} characters.`,
    ),
});

export const enrollmentIdSchema = z.string().uuid('Unknown enrollment.');
