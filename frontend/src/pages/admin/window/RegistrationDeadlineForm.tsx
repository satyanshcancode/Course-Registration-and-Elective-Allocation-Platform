import type { AdminWindowDetail } from '@course-reg/shared';
import { CalendarClock } from 'lucide-react';
import { useState, type SubmitEvent } from 'react';
import { updateRegistrationDeadline } from '../../../api/adminApi';
import { Button } from '../../../components/Button';
import { FormField } from '../../../components/FormField';
import { Input } from '../../../components/Input';
import { Notice } from '../../../components/Notice';
import { Textarea } from '../../../components/Textarea';
import { formatDateTime } from '../../../utils/formatDate';
import { fromDateTimeLocal, toDateTimeLocal } from '../../../utils/windowForm';
import styles from './RegistrationDeadlineForm.module.css';

export interface RegistrationDeadlineFormProps {
  detail: AdminWindowDetail;
  onSaved: (detail: AdminWindowDetail, message: string) => void;
}

interface Errors {
  endsAt?: string;
  form?: string;
}

function validate(endsAt: string, startsAtIso: string, serverTimeIso: string): Errors {
  if (!endsAt) {
    return { endsAt: 'Choose when registration closes.' };
  }
  const closes = Date.parse(fromDateTimeLocal(endsAt));
  if (Number.isNaN(closes)) {
    return { endsAt: 'Enter a valid date and time.' };
  }
  const opens = Date.parse(startsAtIso);
  if (!Number.isNaN(opens) && closes <= opens) {
    return { endsAt: 'Registration must close after it opens.' };
  }
  const serverNow = Date.parse(serverTimeIso);
  const now = Number.isNaN(serverNow) ? Date.now() : serverNow;
  if (closes <= now) {
    return {
      endsAt: 'Registration would already be over: move the closing time into the future.',
    };
  }
  return {};
}

export function RegistrationDeadlineForm({ detail, onSaved }: RegistrationDeadlineFormProps) {
  const window = detail.window;
  const [endsAt, setEndsAt] = useState(window?.endsAt ? toDateTimeLocal(window.endsAt) : '');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!window) {
      return;
    }

    const found = validate(endsAt, window.startsAt, detail.serverTime);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      return;
    }

    setSaving(true);
    const response = await updateRegistrationDeadline({
      endsAt: fromDateTimeLocal(endsAt),
      ...(reason.trim() ? { reason: reason.trim() } : {}),
    });
    setSaving(false);

    if (!response.success) {
      const fieldErrors: Errors = {};
      for (const err of response.errors ?? []) {
        if (err.field === 'endsAt') {
          fieldErrors.endsAt = err.message;
        }
      }
      setErrors(Object.keys(fieldErrors).length > 0 ? fieldErrors : { form: response.message });
      return;
    }

    setReason('');
    setErrors({});
    onSaved(response.data, response.message ?? 'Registration closing time updated.');
  };

  if (!window) {
    return null;
  }

  return (
    <form
      className={styles.form}
      noValidate
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
    >
      <p className={styles.lead}>
        Registration is open and the allocation policy is frozen. You can adjust the closing date
        and time without closing registration or altering policy settings.
      </p>

      <div className={styles.currentDeadline}>
        <span>Current closing time:</span>
        <strong>{formatDateTime(window.endsAt)}</strong>
      </div>

      <div className={styles.fields}>
        <FormField
          label="New closing time"
          error={errors.endsAt}
          hint="Must be in the future and after registration opened."
        >
          {(field) => (
            <Input
              {...field}
              type="datetime-local"
              value={endsAt}
              onChange={(event) => {
                setEndsAt(event.target.value);
                if (errors.endsAt) {
                  setErrors((prev) => ({ ...prev, endsAt: undefined }));
                }
              }}
            />
          )}
        </FormField>

        <FormField label="Reason" hint="Recorded in the audit log (optional).">
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
      </div>

      {errors.form && (
        <Notice tone="danger" live>
          {errors.form}
        </Notice>
      )}

      <div className={styles.actions}>
        <Button type="submit" variant="primary" iconStart={CalendarClock} loading={saving}>
          Save closing time
        </Button>
      </div>
    </form>
  );
}
