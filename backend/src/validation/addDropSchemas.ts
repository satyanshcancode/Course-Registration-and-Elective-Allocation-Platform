import { WINDOW_REASON_LENGTH } from '@course-reg/shared';
import { z } from 'zod';
import { courseCodeSchema } from './courseSchemas.js';

/**
 * Optional flags are given an explicit default rather than left undefined: the
 * parsed body IS what the idempotency ledger stores and compares, so the same
 * request must always serialise identically.
 */
export const dropSchema = z.object({
  code: courseCodeSchema,
  leaveWaitlists: z.boolean().default(false),
});

export const addSchema = z.object({
  code: courseCodeSchema,
  waitlistIfFull: z.boolean().default(false),
});

export const swapSchema = z.object({
  fromCode: courseCodeSchema,
  toCode: courseCodeSchema,
});

export const waitlistActionSchema = z.object({ code: courseCodeSchema });

/**
 * PUT /api/admin/registration-window/add-drop. Both ends or neither: a period
 * with only an opening time would be one that never closes, which the database
 * CHECK refuses anyway.
 */
export const addDropPeriodSchema = z
  .object({
    opensAt: z.iso.datetime({ message: 'Choose when add/drop opens.' }).nullable(),
    closesAt: z.iso.datetime({ message: 'Choose when add/drop closes.' }).nullable(),
    reason: z.string().trim().max(WINDOW_REASON_LENGTH.max).optional(),
  })
  .refine((value) => (value.opensAt === null) === (value.closesAt === null), {
    message: 'Give both an opening and a closing time, or clear the period entirely.',
    path: ['closesAt'],
  })
  .refine(
    (value) =>
      value.opensAt === null ||
      value.closesAt === null ||
      Date.parse(value.closesAt) > Date.parse(value.opensAt),
    { message: 'Add/drop must close after it opens.', path: ['closesAt'] },
  );
