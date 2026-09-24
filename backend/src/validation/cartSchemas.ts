import { MAX_PREFERENCES } from '@course-reg/shared';
import { z } from 'zod';
import { courseCodeSchema } from './courseSchemas.js';

/**
 * The whole cart, in rank order. An empty list is allowed: that clears the
 * draft. The server derives the ranks from this order.
 */
export const saveCartSchema = z.object({
  courseCodes: z
    .array(courseCodeSchema, { error: 'Send the course codes in rank order.' })
    .max(MAX_PREFERENCES, `You can rank at most ${MAX_PREFERENCES} courses.`),
});

export const submitSchema = z.object({
  courseCodes: z
    .array(courseCodeSchema, { error: 'Send the course codes you are submitting.' })
    .min(1, 'Add at least one course to your cart before submitting.')
    .max(MAX_PREFERENCES, `You can rank at most ${MAX_PREFERENCES} courses.`),
});

/** The client-generated key that makes a retried submit safe. */
export const idempotencyKeySchema = z.uuid({
  error: 'Send an Idempotency-Key header containing a UUID.',
});
