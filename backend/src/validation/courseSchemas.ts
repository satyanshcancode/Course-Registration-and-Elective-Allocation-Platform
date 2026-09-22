import {
  CAPACITY_LIMITS,
  CAPACITY_REASON_LENGTH,
  CATALOGUE_PAGE_SIZE,
  COURSE_SORT_KEYS,
  SORT_ORDERS,
  type CatalogueQuery,
} from '@course-reg/shared';
import { z } from 'zod';

/** Query strings are text: "true"/"false" (or absent) become booleans. */
const queryBoolean = z
  .enum(['true', 'false'], { error: 'Use true or false.' })
  .transform((value) => value === 'true');

/** An empty parameter (e.g. `?department=`) counts as not set. */
function optionalParam<Schema extends z.ZodType>(schema: Schema) {
  return z.preprocess((value) => (value === '' ? undefined : value), schema.optional());
}

export const courseCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2,6}[0-9]{2,4}[A-Z]?$/, 'Enter a course code like CS401.');

export const catalogueQuerySchema = z.object({
  search: optionalParam(z.string().trim().max(100, 'Search is too long.')),
  department: optionalParam(
    z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2,10}$/, 'Unknown department.'),
  ),
  credits: optionalParam(z.coerce.number().int().min(1).max(10)),
  onlyAvailable: optionalParam(queryBoolean),
  onlyEligible: optionalParam(queryBoolean),
  sort: optionalParam(z.enum(COURSE_SORT_KEYS, { error: 'Unknown sort order.' })),
  order: optionalParam(z.enum(SORT_ORDERS, { error: 'Use asc or desc.' })),
  page: optionalParam(z.coerce.number().int().min(1).max(10_000)),
  pageSize: optionalParam(
    z.coerce
      .number()
      .int()
      .min(1)
      .max(CATALOGUE_PAGE_SIZE.max, `Page size can be at most ${CATALOGUE_PAGE_SIZE.max}.`),
  ),
}) satisfies z.ZodType<CatalogueQuery>;

export const updateCapacitySchema = z.object({
  capacity: z
    .number({ error: 'Enter the new capacity as a whole number.' })
    .int('Enter a whole number.')
    .min(CAPACITY_LIMITS.min, `Capacity can't be negative.`)
    .max(CAPACITY_LIMITS.max, `Capacity can be at most ${CAPACITY_LIMITS.max}.`),
  reason: z
    .string({ error: 'Give a reason for the change.' })
    .trim()
    .min(
      CAPACITY_REASON_LENGTH.min,
      `Give a reason of at least ${CAPACITY_REASON_LENGTH.min} characters.`,
    )
    .max(
      CAPACITY_REASON_LENGTH.max,
      `Keep the reason under ${CAPACITY_REASON_LENGTH.max} characters.`,
    ),
});
