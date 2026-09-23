import {
  ALLOCATION_METHODS,
  PREFERENCE_RANKS,
  POLICY_POINT_LIMITS,
  RANDOM_SEED_LIMITS,
  WINDOW_NAME_LENGTH,
  WINDOW_REASON_LENGTH,
  isAcademicTerm,
  type AllocationConfig,
  type UpdateWindowRequest,
} from '@course-reg/shared';
import { z } from 'zod';
import { courseCodeSchema } from './courseSchemas.js';

/** A points value on the shared 0–100 scale (weights and priority bonuses). */
const policyPoints = z
  .number({ error: 'Enter a number between 0 and 100.' })
  .int('Use whole points.')
  .min(POLICY_POINT_LIMITS.min, 'Points cannot be negative.')
  .max(POLICY_POINT_LIMITS.max, `Points can be at most ${POLICY_POINT_LIMITS.max}.`);

/**
 * { "1": 100, ..., "5": 20 } — every rank must be present, and the weights
 * must not increase: a lower choice may never be worth more than a higher one.
 */
const preferenceWeightsSchema = z
  .object(
    Object.fromEntries(PREFERENCE_RANKS.map((rank) => [rank, policyPoints])) as Record<
      `${(typeof PREFERENCE_RANKS)[number]}`,
      typeof policyPoints
    >,
  )
  .refine(
    (weights) =>
      PREFERENCE_RANKS.every((rank, index) => {
        const previous = PREFERENCE_RANKS[index - 1];
        return previous === undefined || weights[rank] <= weights[previous];
      }),
    'Preference weights must not increase: P1 is worth at least as much as P2, and so on.',
  );

const priorityPointsSchema = z.object({
  finalYear: policyPoints,
  programRelevance: policyPoints,
  graduationUrgency: policyPoints,
});

/**
 * The AllocationConfig union, validated by its `method` discriminant: FCFS
 * carries no weights at all, so sending them is a mistake worth reporting.
 */
export const allocationConfigSchema = z.discriminatedUnion(
  'method',
  [
    z.object({ method: z.literal('FCFS') }).strict(),
    z
      .object({
        method: z.literal('PREFERENCE_PRIORITY'),
        preferenceWeights: preferenceWeightsSchema,
        priorityPoints: priorityPointsSchema,
      })
      .strict(),
  ],
  { error: `Choose one of: ${ALLOCATION_METHODS.join(', ')}.` },
) satisfies z.ZodType<AllocationConfig>;

const isoDateTime = z
  .string({ error: 'Enter a date and time.' })
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Enter a valid date and time.');

export const updateWindowSchema = z
  .object({
    name: z
      .string({ error: 'Name the registration window.' })
      .trim()
      .min(WINDOW_NAME_LENGTH.min, `Use at least ${WINDOW_NAME_LENGTH.min} characters.`)
      .max(WINDOW_NAME_LENGTH.max, `Keep the name under ${WINDOW_NAME_LENGTH.max} characters.`),
    term: z
      .string({ error: 'Choose the academic term.' })
      .trim()
      .toUpperCase()
      .refine(isAcademicTerm, 'Use a term like 2026-FALL.'),
    startsAt: isoDateTime,
    endsAt: isoDateTime,
    courseCodes: z
      .array(courseCodeSchema, { error: 'Choose the courses this window offers.' })
      .max(500, 'That is more courses than a window can offer.'),
    policy: allocationConfigSchema,
    randomSeed: z
      .number()
      .int('The seed must be a whole number.')
      .min(RANDOM_SEED_LIMITS.min, 'The seed cannot be negative.')
      .max(RANDOM_SEED_LIMITS.max, 'The seed is too large.')
      .optional(),
    reason: z.string().trim().max(WINDOW_REASON_LENGTH.max).optional(),
  })
  .refine((value) => Date.parse(value.endsAt) > Date.parse(value.startsAt), {
    error: 'Registration must close after it opens.',
    path: ['endsAt'],
  }) satisfies z.ZodType<UpdateWindowRequest>;

export const windowActionSchema = z.object({
  reason: z.string().trim().max(WINDOW_REASON_LENGTH.max).optional(),
});
