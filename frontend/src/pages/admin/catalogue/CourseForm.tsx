import type {
  AdminCatalogue,
  AdminCourseRecord,
  ApiFieldError,
  CreateCourseRequest,
} from '@course-reg/shared';
import { COURSE_DESCRIPTION_MAX_LENGTH, COURSE_NAME_MAX_LENGTH } from '@course-reg/shared';
import { Save } from 'lucide-react';
import { useState, type SubmitEvent } from 'react';
import { Button } from '../../../components/Button';
import { CodeMultiSelect } from '../../../components/CodeMultiSelect';
import { FormField } from '../../../components/FormField';
import { Input } from '../../../components/Input';
import { Select } from '../../../components/Select';
import { Textarea } from '../../../components/Textarea';
import styles from './CourseForm.module.css';

export interface CourseFormValues {
  code: string;
  name: string;
  credits: string;
  department: string;
  description: string;
  minSemester: string;
  minCredits: string;
  prerequisites: string[];
  eligiblePrograms: string[];
  relevantPrograms: string[];
}

export type CourseFormErrors = Partial<Record<keyof CourseFormValues, string>>;

export interface CourseFormProps {
  catalogue: AdminCatalogue;
  /** Undefined when creating. The code is fixed once a course exists. */
  existing?: AdminCourseRecord;
  errors: CourseFormErrors;
  submitting: boolean;
  onSubmit: (request: CreateCourseRequest) => void;
  onCancel: () => void;
}

export function emptyCourseForm(): CourseFormValues {
  return {
    code: '',
    name: '',
    credits: '4',
    department: '',
    description: '',
    minSemester: '1',
    minCredits: '0',
    prerequisites: [],
    eligiblePrograms: [],
    relevantPrograms: [],
  };
}

export function toCourseFormValues(course: AdminCourseRecord): CourseFormValues {
  return {
    code: course.code,
    name: course.name,
    credits: String(course.credits),
    department: course.department.code,
    description: course.description,
    minSemester: String(course.minSemester),
    minCredits: String(course.minCredits),
    prerequisites: course.prerequisites.map((item) => item.code),
    eligiblePrograms: course.eligiblePrograms.map((item) => item.code),
    relevantPrograms: course.relevantPrograms.map((item) => item.code),
  };
}

/** The same rules the server's schema applies, so a typo is caught here. */
export function validateCourseForm(values: CourseFormValues): CourseFormErrors {
  const errors: CourseFormErrors = {};
  const code = values.code.trim().toUpperCase();

  if (!/^[A-Z]{2,4}\d{3}$/.test(code)) {
    errors.code = 'A course code is 2 to 4 letters then 3 digits, e.g. CS401.';
  }
  if (values.name.trim() === '') {
    errors.name = 'Enter the course name.';
  } else if (values.name.trim().length > COURSE_NAME_MAX_LENGTH) {
    errors.name = `Keep the name under ${COURSE_NAME_MAX_LENGTH} characters.`;
  }
  if (values.department === '') {
    errors.department = 'Choose a department.';
  }
  if (values.description.length > COURSE_DESCRIPTION_MAX_LENGTH) {
    errors.description = `Keep the description under ${COURSE_DESCRIPTION_MAX_LENGTH} characters.`;
  }
  const minCredits = Number(values.minCredits);
  if (!/^\d+$/.test(values.minCredits.trim()) || minCredits > 400) {
    errors.minCredits = 'Enter a whole number of credits, 0 to 400.';
  }
  if (values.prerequisites.includes(code)) {
    errors.prerequisites = 'A course cannot be its own prerequisite.';
  }
  // A relevance bonus for a programme that may not take the course could never
  // fire, so it is a mistake rather than a preference.
  const unreachable =
    values.eligiblePrograms.length === 0
      ? []
      : values.relevantPrograms.filter((program) => !values.eligiblePrograms.includes(program));
  if (unreachable.length > 0) {
    errors.relevantPrograms = `${unreachable.join(', ')} cannot take this course, so the bonus would never apply.`;
  }
  return errors;
}

export function readCourseServerErrors(fieldErrors: ApiFieldError[] | undefined): CourseFormErrors {
  const errors: CourseFormErrors = {};
  const fields: (keyof CourseFormValues)[] = [
    'code',
    'name',
    'credits',
    'department',
    'description',
    'minSemester',
    'minCredits',
    'prerequisites',
    'eligiblePrograms',
    'relevantPrograms',
  ];
  for (const error of fieldErrors ?? []) {
    const field = fields.find((candidate) => candidate === error.field);
    if (field) {
      errors[field] = error.message;
    }
  }
  return errors;
}

const CREDITS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8];

/**
 * Create or edit a course record — the catalogue entry and its rules, not the
 * seats of any one offering.
 *
 * The code is fixed once the course exists: submissions, enrollments and stored
 * allocation results all refer to a course by code, so changing it would rewrite
 * what those rows mean.
 */
export function CourseForm({
  catalogue,
  existing,
  errors: serverErrors,
  submitting,
  onSubmit,
  onCancel,
}: CourseFormProps) {
  const [values, setValues] = useState<CourseFormValues>(() =>
    existing ? toCourseFormValues(existing) : emptyCourseForm(),
  );
  const [localErrors, setLocalErrors] = useState<CourseFormErrors>({});
  const errors: CourseFormErrors = { ...localErrors, ...serverErrors };

  const set = <Field extends keyof CourseFormValues>(
    field: Field,
    value: CourseFormValues[Field],
  ) => {
    setValues((current) => ({ ...current, [field]: value }));
    if (localErrors[field]) {
      setLocalErrors((current) => ({ ...current, [field]: undefined }));
    }
  };

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = validateCourseForm(values);
    setLocalErrors(found);
    if (Object.values(found).some(Boolean)) {
      return;
    }
    onSubmit({
      code: values.code.trim().toUpperCase(),
      name: values.name.trim(),
      credits: Number(values.credits),
      department: values.department,
      description: values.description.trim(),
      minSemester: Number(values.minSemester),
      minCredits: Number(values.minCredits),
      prerequisites: values.prerequisites,
      eligiblePrograms: values.eligiblePrograms,
      relevantPrograms: values.relevantPrograms,
    });
  };

  const programOptions = catalogue.programs.map((program) => ({
    code: program.code,
    name: program.name,
  }));

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <div className={styles.grid}>
        <FormField
          label="Course code"
          hint={existing ? 'The code cannot change once a course exists.' : 'e.g. CS410'}
          error={errors.code}
          required
        >
          {(control) => (
            <Input
              {...control}
              name="code"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={7}
              readOnly={existing !== undefined}
              value={values.code}
              onChange={(event) => {
                set('code', event.target.value.toUpperCase());
              }}
            />
          )}
        </FormField>

        <FormField label="Course name" error={errors.name} required>
          {(control) => (
            <Input
              {...control}
              name="name"
              autoComplete="off"
              maxLength={COURSE_NAME_MAX_LENGTH}
              value={values.name}
              onChange={(event) => {
                set('name', event.target.value);
              }}
            />
          )}
        </FormField>

        <FormField label="Department" error={errors.department} required>
          {(control) => (
            <Select
              {...control}
              name="department"
              placeholder="Choose a department"
              options={catalogue.departments.map((department) => ({
                value: department.code,
                label: `${department.name} (${department.code})`,
              }))}
              value={values.department}
              onChange={(event) => {
                set('department', event.target.value);
              }}
            />
          )}
        </FormField>

        <FormField label="Credits" error={errors.credits} required>
          {(control) => (
            <Select
              {...control}
              name="credits"
              options={CREDITS.map((credits) => ({
                value: String(credits),
                label: `${credits} ${credits === 1 ? 'credit' : 'credits'}`,
              }))}
              value={values.credits}
              onChange={(event) => {
                set('credits', event.target.value);
              }}
            />
          )}
        </FormField>

        <FormField
          label="Earliest semester"
          hint="Students below this are not eligible."
          error={errors.minSemester}
          required
        >
          {(control) => (
            <Select
              {...control}
              name="minSemester"
              options={SEMESTERS.map((semester) => ({
                value: String(semester),
                label: `Semester ${semester}`,
              }))}
              value={values.minSemester}
              onChange={(event) => {
                set('minSemester', event.target.value);
              }}
            />
          )}
        </FormField>

        <FormField
          label="Credits required"
          hint="0 for no credit requirement."
          error={errors.minCredits}
          required
        >
          {(control) => (
            <Input
              {...control}
              name="minCredits"
              type="number"
              inputMode="numeric"
              min={0}
              max={400}
              value={values.minCredits}
              onChange={(event) => {
                set('minCredits', event.target.value);
              }}
            />
          )}
        </FormField>
      </div>

      <FormField
        label="Description"
        hint="Shown on the course page in the catalogue."
        error={errors.description}
      >
        {(control) => (
          <Textarea
            {...control}
            name="description"
            rows={4}
            maxLength={COURSE_DESCRIPTION_MAX_LENGTH}
            value={values.description}
            onChange={(event) => {
              set('description', event.target.value);
            }}
          />
        )}
      </FormField>

      <CodeMultiSelect
        label="Prerequisites"
        hint="Courses a student must have passed first."
        error={errors.prerequisites}
        options={catalogue.courses.map((course) => ({ code: course.code, name: course.name }))}
        value={values.prerequisites}
        onChange={(codes) => {
          set('prerequisites', codes);
        }}
        excluded={existing ? [existing.code] : []}
        itemName={{ one: 'course', other: 'courses' }}
      />

      <CodeMultiSelect
        label="Eligible programmes"
        hint="Leave empty to open the course to every programme."
        error={errors.eligiblePrograms}
        options={programOptions}
        value={values.eligiblePrograms}
        onChange={(codes) => {
          set('eligiblePrograms', codes);
        }}
        itemName={{ one: 'programme', other: 'programmes' }}
      />

      <CodeMultiSelect
        label="Programme relevance"
        hint="These programmes' students get the relevance priority bonus."
        error={errors.relevantPrograms}
        options={programOptions}
        value={values.relevantPrograms}
        onChange={(codes) => {
          set('relevantPrograms', codes);
        }}
        itemName={{ one: 'programme', other: 'programmes' }}
      />

      <div className={styles.actions}>
        <Button type="submit" variant="primary" iconStart={Save} loading={submitting}>
          {submitting ? 'Saving…' : existing === undefined ? 'Add course' : 'Save changes'}
        </Button>
        <Button type="button" variant="ghost" disabled={submitting} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
