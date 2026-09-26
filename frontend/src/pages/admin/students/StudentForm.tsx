import type {
  AdminReferenceData,
  AdminStudentListItem,
  ApiFieldError,
  CreateStudentRequest,
} from '@course-reg/shared';
import { Save } from 'lucide-react';
import { useState, type SubmitEvent } from 'react';
import { Button } from '../../../components/Button';
import { CodeMultiSelect } from '../../../components/CodeMultiSelect';
import { FormField } from '../../../components/FormField';
import { Input } from '../../../components/Input';
import { Select } from '../../../components/Select';
import styles from './StudentForm.module.css';

export interface StudentFormValues {
  rollNumber: string;
  name: string;
  email: string;
  program: string;
  semester: string;
  creditsCompleted: string;
  expectedGraduationTerm: string;
  completedCourses: string[];
}

export type StudentFormErrors = Partial<Record<keyof StudentFormValues, string>>;

export interface StudentFormProps {
  reference: AdminReferenceData;
  /** Undefined when creating. Editing keeps the roll number editable. */
  existing?: AdminStudentListItem;
  completedCourses?: readonly string[];
  errors: StudentFormErrors;
  submitting: boolean;
  onSubmit: (request: CreateStudentRequest) => void;
  onCancel: () => void;
}

const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8];

export function emptyStudentForm(): StudentFormValues {
  return {
    rollNumber: '',
    name: '',
    email: '',
    program: '',
    semester: '1',
    creditsCompleted: '0',
    expectedGraduationTerm: '',
    completedCourses: [],
  };
}

/**
 * Validates what the server validates, in the same words where it can, so the
 * form catches a typo without a round trip. The server's answer is still
 * authoritative — it owns uniqueness, which no client can know.
 */
export function validateStudentForm(values: StudentFormValues): StudentFormErrors {
  const errors: StudentFormErrors = {};

  if (!/^[A-Z0-9]{4,20}$/.test(values.rollNumber.trim().toUpperCase())) {
    errors.rollNumber = 'A roll number is 4 to 20 letters or digits.';
  }
  if (values.name.trim() === '') {
    errors.name = 'Enter the student’s name.';
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(values.email.trim())) {
    errors.email = 'Enter a valid e-mail address.';
  }
  if (values.program === '') {
    errors.program = 'Choose a programme.';
  }
  const credits = Number(values.creditsCompleted);
  if (!/^\d+$/.test(values.creditsCompleted.trim()) || credits > 400) {
    errors.creditsCompleted = 'Enter a whole number of credits, 0 to 400.';
  }
  if (!/^\d{4}-(SPRING|FALL)$/.test(values.expectedGraduationTerm.trim().toUpperCase())) {
    errors.expectedGraduationTerm = 'Use a term like 2028-SPRING.';
  }
  return errors;
}

/** Field errors the server sent, mapped onto this form's field names. */
export function readServerErrors(fieldErrors: ApiFieldError[] | undefined): StudentFormErrors {
  const errors: StudentFormErrors = {};
  const fields: (keyof StudentFormValues)[] = [
    'rollNumber',
    'name',
    'email',
    'program',
    'semester',
    'creditsCompleted',
    'expectedGraduationTerm',
    'completedCourses',
  ];
  for (const error of fieldErrors ?? []) {
    const field = fields.find((candidate) => candidate === error.field);
    if (field) {
      errors[field] = error.message;
    }
  }
  return errors;
}

export function toFormValues(
  student: AdminStudentListItem,
  completedCourses: readonly string[],
): StudentFormValues {
  return {
    rollNumber: student.rollNumber,
    name: student.name,
    email: student.email,
    program: student.program.code,
    semester: String(student.semester),
    creditsCompleted: String(student.creditsCompleted),
    expectedGraduationTerm: student.expectedGraduationTerm,
    completedCourses: [...completedCourses],
  };
}

/**
 * The create/edit form for a student's record.
 *
 * Everything on it is the registrar's to set, because it is what eligibility and
 * priority are judged on — a student choosing their own semester or completed
 * courses would decide their own place in the allocation.
 *
 * Every field is always sent, so a half-filled submission can never blank a
 * column the form did not show.
 */
export function StudentForm({
  reference,
  existing,
  completedCourses = [],
  errors: serverErrors,
  submitting,
  onSubmit,
  onCancel,
}: StudentFormProps) {
  const [values, setValues] = useState<StudentFormValues>(() =>
    existing ? toFormValues(existing, completedCourses) : emptyStudentForm(),
  );
  const [localErrors, setLocalErrors] = useState<StudentFormErrors>({});
  const errors: StudentFormErrors = { ...localErrors, ...serverErrors };

  const set = <Field extends keyof StudentFormValues>(
    field: Field,
    value: StudentFormValues[Field],
  ) => {
    setValues((current) => ({ ...current, [field]: value }));
    // Re-check a field that is already showing an error as it is corrected.
    if (localErrors[field]) {
      setLocalErrors((current) => ({ ...current, [field]: undefined }));
    }
  };

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = validateStudentForm(values);
    setLocalErrors(found);
    if (Object.values(found).some(Boolean)) {
      return;
    }
    onSubmit({
      rollNumber: values.rollNumber.trim().toUpperCase(),
      name: values.name.trim(),
      email: values.email.trim().toLowerCase(),
      program: values.program,
      semester: Number(values.semester),
      creditsCompleted: Number(values.creditsCompleted),
      // Validated above, so this is a real term.
      expectedGraduationTerm: values.expectedGraduationTerm
        .trim()
        .toUpperCase() as CreateStudentRequest['expectedGraduationTerm'],
      completedCourses: values.completedCourses,
    });
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <div className={styles.grid}>
        <FormField label="Roll number" error={errors.rollNumber} required>
          {(control) => (
            <Input
              {...control}
              name="rollNumber"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={20}
              value={values.rollNumber}
              onChange={(event) => {
                set('rollNumber', event.target.value.toUpperCase());
              }}
            />
          )}
        </FormField>

        <FormField label="Full name" error={errors.name} required>
          {(control) => (
            <Input
              {...control}
              name="name"
              autoComplete="off"
              maxLength={120}
              value={values.name}
              onChange={(event) => {
                set('name', event.target.value);
              }}
            />
          )}
        </FormField>

        <FormField
          label="E-mail address"
          hint={
            existing === undefined
              ? 'The invitation is sent here.'
              : 'Changing this does not re-send the invitation.'
          }
          error={errors.email}
          required
        >
          {(control) => (
            <Input
              {...control}
              name="email"
              type="email"
              inputMode="email"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={254}
              value={values.email}
              onChange={(event) => {
                set('email', event.target.value);
              }}
            />
          )}
        </FormField>

        <FormField label="Programme" error={errors.program} required>
          {(control) => (
            <Select
              {...control}
              name="program"
              placeholder="Choose a programme"
              options={reference.programs.map((program) => ({
                value: program.code,
                label: `${program.name} (${program.code})`,
              }))}
              value={values.program}
              onChange={(event) => {
                set('program', event.target.value);
              }}
            />
          )}
        </FormField>

        <FormField label="Semester" error={errors.semester} required>
          {(control) => (
            <Select
              {...control}
              name="semester"
              options={SEMESTERS.map((semester) => ({
                value: String(semester),
                label: `Semester ${semester}`,
              }))}
              value={values.semester}
              onChange={(event) => {
                set('semester', event.target.value);
              }}
            />
          )}
        </FormField>

        <FormField
          label="Credits completed"
          hint="Counts towards a course's minimum credits."
          error={errors.creditsCompleted}
          required
        >
          {(control) => (
            <Input
              {...control}
              name="creditsCompleted"
              type="number"
              inputMode="numeric"
              min={0}
              max={400}
              value={values.creditsCompleted}
              onChange={(event) => {
                set('creditsCompleted', event.target.value);
              }}
            />
          )}
        </FormField>

        <FormField
          label="Expected graduation term"
          hint="Graduating in the window's own term earns the urgency bonus."
          error={errors.expectedGraduationTerm}
          required
        >
          {(control) => (
            <Input
              {...control}
              name="expectedGraduationTerm"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="2028-SPRING"
              maxLength={11}
              value={values.expectedGraduationTerm}
              onChange={(event) => {
                set('expectedGraduationTerm', event.target.value.toUpperCase());
              }}
            />
          )}
        </FormField>
      </div>

      <CodeMultiSelect
        label="Completed courses"
        hint="What the prerequisite check reads. Search by code or name."
        error={errors.completedCourses}
        options={reference.courses}
        value={values.completedCourses}
        onChange={(codes) => {
          set('completedCourses', codes);
        }}
        itemName={{ one: 'course', other: 'courses' }}
      />

      <div className={styles.actions}>
        <Button type="submit" variant="primary" iconStart={Save} loading={submitting}>
          {submitting
            ? 'Saving…'
            : existing === undefined
              ? 'Create and send invitation'
              : 'Save changes'}
        </Button>
        <Button type="button" variant="ghost" disabled={submitting} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
