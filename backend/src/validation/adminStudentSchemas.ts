import {
  ADMIN_STUDENT_MAX_PAGE_SIZE,
  ADMIN_STUDENT_STATUSES,
  CSV_MAX_BYTES,
  isAcademicTerm,
  type AdminStudentQuery,
  type CreateStudentRequest,
} from '@course-reg/shared';
import { z } from 'zod';
import { emailSchema } from './accountSchemas.js';

/** An empty parameter (e.g. `?program=`) counts as not set. */
function optionalParam<Schema extends z.ZodType>(schema: Schema) {
  return z.preprocess((value) => (value === '' ? undefined : value), schema.optional());
}

/** Mirrors students_roll_number_format_check. */
export const rollNumberSchema = z
  .string({ error: 'Enter a roll number.' })
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{4,20}$/, 'A roll number is 4 to 20 letters or digits.');

export const programCodeSchema = z
  .string({ error: 'Choose a programme.' })
  .trim()
  .toUpperCase()
  .regex(/^[A-Z][A-Z0-9-]{1,19}$/, 'Choose a programme.');

const courseCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2,4}[0-9]{3}$/, 'Each completed course must be a code like CS401.');

export const adminStudentQuerySchema = z.object({
  search: optionalParam(z.string().trim().max(100, 'Search is too long.')),
  program: optionalParam(programCodeSchema),
  semester: optionalParam(z.coerce.number().int().min(1).max(8)),
  status: optionalParam(z.enum(ADMIN_STUDENT_STATUSES, { error: 'Unknown status.' })),
  page: optionalParam(z.coerce.number().int().min(1).max(10_000)),
  pageSize: optionalParam(
    z.coerce
      .number()
      .int()
      .min(1)
      .max(ADMIN_STUDENT_MAX_PAGE_SIZE, `Page size can be at most ${ADMIN_STUDENT_MAX_PAGE_SIZE}.`),
  ),
}) satisfies z.ZodType<AdminStudentQuery>;

export const studentWriteSchema = z.object({
  rollNumber: rollNumberSchema,
  name: z
    .string({ error: 'Enter the student’s name.' })
    .trim()
    .min(1, 'Enter the student’s name.')
    .max(120, 'That name is too long.'),
  email: emailSchema,
  program: programCodeSchema,
  semester: z
    .number({ error: 'Choose a semester.' })
    .int('Semesters are whole numbers.')
    .min(1, 'Semesters run from 1 to 8.')
    .max(8, 'Semesters run from 1 to 8.'),
  creditsCompleted: z
    .number({ error: 'Enter the credits completed.' })
    .int('Enter a whole number of credits.')
    .min(0, 'Credits cannot be negative.')
    .max(400, 'That is more credits than any programme has.'),
  // The predicate narrows the output to AcademicTerm, so the schema satisfies
  // CreateStudentRequest without a cast.
  expectedGraduationTerm: z
    .string({ error: 'Enter the expected graduation term.' })
    .trim()
    .toUpperCase()
    .refine(isAcademicTerm, 'Use a term like 2028-SPRING.'),
  completedCourses: z
    .array(courseCode, { error: 'Choose the courses the student has passed.' })
    .max(200, 'That is too many completed courses.')
    // The same course twice would violate the table's primary key; de-duplicating
    // here is kinder than reporting a constraint violation.
    .transform((codes) => [...new Set(codes)]),
}) satisfies z.ZodType<CreateStudentRequest>;

export const activationChangeSchema = z.object({
  reason: z.string().trim().max(500, 'Keep the reason under 500 characters.').optional(),
});

/**
 * A CSV upload. The size is capped here as well as in the browser, because a
 * limit only the client enforces is not a limit.
 */
export const csvImportSchema = z.object({
  csv: z
    .string({ error: 'Choose a CSV file.' })
    .min(1, 'That file is empty.')
    .refine((value) => Buffer.byteLength(value, 'utf8') <= CSV_MAX_BYTES, {
      error: `That file is larger than ${Math.round(CSV_MAX_BYTES / 1024)} KB.`,
    }),
});
