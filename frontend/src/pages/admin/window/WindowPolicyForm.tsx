import type { AdminWindowDetail, AllocationMethod } from '@course-reg/shared';
import { Save } from 'lucide-react';
import { useRef, useState, type SubmitEvent } from 'react';
import { updateRegistrationWindow } from '../../../api/adminApi';
import { Button } from '../../../components/Button';
import { FormField } from '../../../components/FormField';
import { Input } from '../../../components/Input';
import { RadioGroup } from '../../../components/RadioGroup';
import { Textarea } from '../../../components/Textarea';
import {
  hasWindowErrors,
  newRandomSeed,
  policyForMethod,
  toFormValues,
  toUpdateRequest,
  validateWindowForm,
  type WindowFormErrors,
  type WindowFormValues,
} from '../../../utils/windowForm';
import { OfferedCourses } from './OfferedCourses';
import { PolicyFields } from './PolicyFields';
import styles from './WindowPolicyForm.module.css';

export interface WindowPolicyFormProps {
  detail: AdminWindowDetail;
  onSaved: (detail: AdminWindowDetail, message: string) => void;
}

const METHOD_OPTIONS: readonly { value: AllocationMethod; label: string; description: string }[] = [
  {
    value: 'PREFERENCE_PRIORITY',
    label: 'Preference + Priority',
    description: 'Scores each request by its rank plus priority points; ties broken by the seed.',
  },
  {
    value: 'FCFS',
    label: 'First come, first served',
    description: 'Server-side submission order only. No scoring.',
  },
];

/** Field errors the server sends back, mapped onto this form's field names. */
const SERVER_FIELDS: Readonly<Record<string, keyof WindowFormErrors>> = {
  name: 'name',
  term: 'term',
  startsAt: 'startsAt',
  endsAt: 'endsAt',
  courseCodes: 'courseCodes',
  policy: 'policy',
  randomSeed: 'randomSeed',
};

const TERM_PATTERN = String.raw`\d{4}-(SPRING|FALL)`;

export function WindowPolicyForm({ detail, onSaved }: WindowPolicyFormProps) {
  const [values, setValues] = useState<WindowFormValues>(() => toFormValues(detail));
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<WindowFormErrors>({});
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const change = (patch: Partial<WindowFormValues>) => {
    setValues((current) => ({ ...current, ...patch }));
  };

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = validateWindowForm(values);
    setErrors(found);
    if (hasWindowErrors(found)) {
      nameRef.current?.focus();
      return;
    }

    setSaving(true);
    const response = await updateRegistrationWindow(toUpdateRequest(values, reason));
    setSaving(false);
    if (response.success) {
      setReason('');
      onSaved(response.data, response.message ?? 'Registration window saved.');
      return;
    }

    // Field errors go next to their field; anything else (e.g. the 409 when
    // the policy is already frozen) goes above the buttons.
    const fromServer: WindowFormErrors = {};
    for (const fieldError of response.errors ?? []) {
      const field = SERVER_FIELDS[fieldError.field.split('.')[0] ?? ''];
      if (field) {
        fromServer[field] = fieldError.message;
      }
    }
    setErrors(hasWindowErrors(fromServer) ? fromServer : { form: response.message });
  };

  return (
    <form
      className={styles.form}
      noValidate
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
    >
      <div className={styles.row}>
        <FormField label="Window name" error={errors.name} required>
          {(field) => (
            <Input
              {...field}
              ref={nameRef}
              value={values.name}
              maxLength={80}
              autoComplete="off"
              onChange={(event) => {
                change({ name: event.target.value });
              }}
            />
          )}
        </FormField>
        <FormField label="Academic term" hint="e.g. 2026-FALL" error={errors.term} required>
          {(field) => (
            <Input
              {...field}
              value={values.term}
              pattern={TERM_PATTERN}
              autoComplete="off"
              onChange={(event) => {
                change({ term: event.target.value.toUpperCase() });
              }}
            />
          )}
        </FormField>
      </div>

      <div className={styles.row}>
        <FormField label="Registration opens" error={errors.startsAt} required>
          {(field) => (
            <Input
              {...field}
              type="datetime-local"
              value={values.startsAt}
              max={values.endsAt || undefined}
              onChange={(event) => {
                change({ startsAt: event.target.value });
              }}
            />
          )}
        </FormField>
        <FormField label="Registration closes" error={errors.endsAt} required>
          {(field) => (
            <Input
              {...field}
              type="datetime-local"
              value={values.endsAt}
              min={values.startsAt || undefined}
              onChange={(event) => {
                change({ endsAt: event.target.value });
              }}
            />
          )}
        </FormField>
      </div>

      <OfferedCourses
        courses={detail.courses}
        selected={values.courseCodes}
        error={errors.courseCodes}
        onChange={(courseCodes) => {
          change({ courseCodes });
        }}
      />

      <RadioGroup
        legend="Allocation method"
        name="allocationMethod"
        options={METHOD_OPTIONS}
        value={values.policy.method}
        required
        onChange={(method) => {
          change({ policy: policyForMethod(method, values.policy) });
        }}
      />

      {/* The chosen method decides which settings exist at all. */}
      <PolicyFields
        policy={values.policy}
        randomSeed={values.randomSeed}
        error={errors.policy}
        seedError={errors.randomSeed}
        onPolicyChange={(policy) => {
          change({ policy });
        }}
        onSeedChange={(randomSeed) => {
          change({ randomSeed });
        }}
        onGenerateSeed={() => {
          change({ randomSeed: newRandomSeed() });
        }}
      />

      <FormField label="Reason for this change" hint="Recorded in the audit log (optional).">
        {(field) => (
          <Textarea
            {...field}
            rows={2}
            maxLength={500}
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
            }}
          />
        )}
      </FormField>

      {errors.form && (
        <p className={styles.formError} role="alert">
          {errors.form}
        </p>
      )}

      <div className={styles.actions}>
        <Button type="submit" iconStart={Save} loading={saving}>
          Save window
        </Button>
        <p className={styles.note}>Settings can only be changed while the window is a draft.</p>
      </div>
    </form>
  );
}
