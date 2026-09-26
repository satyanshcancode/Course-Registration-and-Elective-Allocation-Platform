import {
  HISTORY_EVENT_TYPES,
  HISTORY_MAX_PAGE_SIZE,
  NOTIFICATION_FILTERS,
} from '@course-reg/shared';
import { z } from 'zod';
import { courseCodeSchema } from './courseSchemas.js';

/** An empty parameter (e.g. `?type=`) counts as not set. */
function optionalParam<Schema extends z.ZodType>(schema: Schema) {
  return z.preprocess((value) => (value === '' ? undefined : value), schema.optional());
}

/**
 * The history cursor is the last row's id: digits only, so a hand-edited URL
 * reaches the query as a bigint or not at all.
 */
const historyCursorSchema = z.string().regex(/^\d{1,19}$/, 'Unknown position in the list.');

export const historyQuerySchema = z.object({
  type: optionalParam(z.enum(HISTORY_EVENT_TYPES, { error: 'Unknown event type.' })),
  course: optionalParam(courseCodeSchema),
  cursor: optionalParam(historyCursorSchema),
  limit: optionalParam(z.coerce.number().int().min(1).max(HISTORY_MAX_PAGE_SIZE)),
});

/**
 * The notification cursor is `<ISO created_at>|<uuid>`. It is checked here
 * rather than in the query, so a malformed one is a 400 and never a database
 * error about a bad timestamp.
 */
const notificationCursorSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\|[0-9a-fA-F-]{36}$/, 'Unknown position in the list.');

export const notificationQuerySchema = z.object({
  filter: optionalParam(z.enum(NOTIFICATION_FILTERS, { error: 'Use unread or all.' })),
  cursor: optionalParam(notificationCursorSchema),
});

export const notificationIdSchema = z.uuid('Unknown notification.');
