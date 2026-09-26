import type { AdminWindowDetail } from '@course-reg/shared';
import { CalendarClock } from 'lucide-react';
import { useState } from 'react';
import { setAddDropPeriod } from '../../../api/addDropApi';
import { Button } from '../../../components/Button';
import { FormField } from '../../../components/FormField';
import { Input } from '../../../components/Input';
import { Textarea } from '../../../components/Textarea';
import { fromDateTimeLocal, toDateTimeLocal } from '../../../utils/windowForm';
import styles from './AddDropPeriodForm.module.css';

export interface AddDropPeriodFormProps {
  detail: AdminWindowDetail;
  onSaved: (detail: AdminWindowDetail, message: string) => void;
}

interface Errors {
  opensAt?: string;
  closesAt?: string;
  form?: string;
}

/** Both ends or neither, and it must close after it opens. */
function validate(opensAt: string, closesAt: string): Errors {
  if (opensAt === '' && closesAt === '') {
    return {};
  }
  const errors: Errors = {};
  const opens = Date.parse(fromDateTimeLocal(opensAt));
  const closes = Date.parse(fromDateTimeLocal(closesAt));
  if (Number.isNaN(opens)) {
    errors.opensAt = 'Choose when add/drop opens, or clear both fields.';
  }
  if (Number.isNaN(closes)) {
    errors.closesAt = 'Choose when add/drop closes, or clear both fields.';
  } else if (!Number.isNaN(opens) && closes <= opens) {
    errors.closesAt = 'Add/drop must close after it opens.';
  }
  return errors;
}

/**
 * Schedules the period students may change their own enrolment in.
 *
 * It is not part of the frozen policy: extending add/drop changes no allocation
 * rule, so the server allows it on an ALLOCATED window — and only there, which
 * is why this form only appears once allocation has run.
 */
export function AddDropPeriodForm({ detail, onSaved }: AddDropPeriodFormProps) {
  const window = detail.window;
  const [opensAt, setOpensAt] = useState(
    window?.addDropOpensAt ? toDateTimeLocal(window.addDropOpensAt) : '',
  );
  const [closesAt, setClosesAt] = useState(
    window?.addDropClosesAt ? toDateTimeLocal(window.addDropClosesAt) : '',
  );
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  const scheduled = opensAt !== '' || closesAt !== '';

  const save = async () => {
    const found = validate(opensAt, closesAt);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      return;
    }
    setSaving(true);
    const response = await setAddDropPeriod({
      opensAt: scheduled ? fromDateTimeLocal(opensAt) : null,
      closesAt: scheduled ? fromDateTimeLocal(closesAt) : null,
      ...(reason.trim() ? { reason: reason.trim() } : {}),
    });
    setSaving(false);
    if (!response.success) {
      setErrors({ form: response.message });
      return;
    }
    setReason('');
    onSaved(response.data, response.message ?? 'The add/drop period has been saved.');
  };

  const clear = () => {
    setOpensAt('');
    setClosesAt('');
    setErrors({});
  };

  return (
    <div className={styles.form}>
      <p className={styles.lead}>
        While this period is open, students may drop their elective, add one that has a free seat,
        swap, or join and leave waitlists. Outside it, every such request is refused. A dropped seat
        always goes to the next eligible student waiting for it.
      </p>

      <div className={styles.dates}>
        <FormField label="Add/drop opens" error={errors.opensAt}>
          {(field) => (
            <Input
              {...field}
              type="datetime-local"
              value={opensAt}
              onChange={(event) => {
                setOpensAt(event.target.value);
              }}
            />
          )}
        </FormField>
        <FormField label="Add/drop closes" error={errors.closesAt}>
          {(field) => (
            <Input
              {...field}
              type="datetime-local"
              value={closesAt}
              onChange={(event) => {
                setClosesAt(event.target.value);
              }}
            />
          )}
        </FormField>
      </div>

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

      {errors.form && (
        <p className={styles.error} role="alert">
          {errors.form}
        </p>
      )}

      <div className={styles.actions}>
        <Button
          variant="primary"
          iconStart={CalendarClock}
          loading={saving}
          onClick={() => {
            void save();
          }}
        >
          {scheduled ? 'Save the add/drop period' : 'Clear the add/drop period'}
        </Button>
        {scheduled && (
          <Button variant="ghost" onClick={clear} disabled={saving}>
            Clear the dates
          </Button>
        )}
        {!scheduled && (
          <p className={styles.hint}>
            With no period scheduled, students cannot change their enrolment at all.
          </p>
        )}
      </div>
    </div>
  );
}
