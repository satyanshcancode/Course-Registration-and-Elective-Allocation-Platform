import {
  COURSE_DESCRIPTION_MAX_LENGTH,
  COURSE_NAME_MAX_LENGTH,
  type CreateCourseRequest,
} from '@course-reg/shared';
import { z } from 'zod';
import { programCodeSchema } from './adminStudentSchemas.js';

/**
 * Mirrors courses_code_format_check. Deliberately stricter than the catalogue's
 * read-side `courseCodeSchema`, which is lenient so an old URL still resolves:
 * what may be CREATED has to match the column exactly.
 */
export const newCourseCodeSchema = z
  .string({ error: 'Enter a course code.' })
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2,4}[0-9]{3}$/, 'A course code is 2 to 4 letters then 3 digits, e.g. CS401.');

const departmentCodeSchema = z
  .string({ error: 'Choose a department.' })
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2,10}$/, 'Choose a department.');

/** De-duplicated: the join tables' primary keys would reject a repeat. */
function codeList<Schema extends z.ZodType<string>>(schema: Schema, max: number, error: string) {
  return z
    .array(schema, { error })
    .max(max, `That is too many (at most ${max}).`)
    .transform((codes) => [...new Set(codes)]);
}

export const courseWriteSchema = z.object({
  name: z
    .string({ error: 'Enter the course name.' })
    .trim()
    .min(1, 'Enter the course name.')
    .max(COURSE_NAME_MAX_LENGTH, `Keep the name under ${COURSE_NAME_MAX_LENGTH} characters.`),
  credits: z
    .number({ error: 'Enter the credits.' })
    .int('Credits are whole numbers.')
    .min(1, 'A course carries at least 1 credit.')
    .max(10, 'A course carries at most 10 credits.'),
  department: departmentCodeSchema,
  description: z
    .string()
    .trim()
    .max(
      COURSE_DESCRIPTION_MAX_LENGTH,
      `Keep the description under ${COURSE_DESCRIPTION_MAX_LENGTH} characters.`,
    )
    .default(''),
  minSemester: z
    .number({ error: 'Choose the earliest semester.' })
    .int('Semesters are whole numbers.')
    .min(1, 'Semesters run from 1 to 8.')
    .max(8, 'Semesters run from 1 to 8.'),
  minCredits: z
    .number({ error: 'Enter the credits required.' })
    .int('Enter a whole number of credits.')
    .min(0, 'Credits required cannot be negative.')
    .max(400, 'That is more credits than any programme has.'),
  prerequisites: codeList(newCourseCodeSchema, 20, 'Choose the prerequisite courses.'),
  eligiblePrograms: codeList(programCodeSchema, 50, 'Choose the eligible programmes.'),
  relevantPrograms: codeList(programCodeSchema, 50, 'Choose the relevant programmes.'),
});

export const createCourseSchema = courseWriteSchema
  .extend({ code: newCourseCodeSchema })
  .refine((course) => !course.prerequisites.includes(course.code), {
    error: 'A course cannot be its own prerequisite.',
    path: ['prerequisites'],
  }) satisfies z.ZodType<CreateCourseRequest>;
