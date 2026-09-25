import {
  CAPACITY_LIMITS,
  CAPACITY_REASON_LENGTH,
  type AdminCourseOffering,
  type UpdateCapacityResult,
} from '@course-reg/shared';
import { CircleAlert } from 'lucide-react';
import { useId, useRef, useState, type SubmitEvent } from 'react';
import { updateCapacity } from '../../../api/adminApi';
import { Button } from '../../../components/Button';
import { FormField } from '../../../components/FormField';
import { Icon } from '../../../components/Icon';
import { Input } from '../../../components/Input';
import { Modal } from '../../../components/Modal';
import { Textarea } from '../../../components/Textarea';
import {
  hasErrors,
  validateCapacityForm,
  type CapacityFormErrors,
  type CapacityFormValues,
} from '../../../utils/capacityForm';
import styles from './EditCapacityDialog.module.css';

export interface EditCapacityDialogProps {
  /** The offering being edited; null keeps the dialog closed. */
  offering: AdminCourseOffering | null;
  onClose: () => void;
  onSaved: (result: UpdateCapacityResult) => void;
}

/**
 * "Edit capacity" in a native <dialog>. The form keeps native constraints
 * (required, min, max, step) for semantics and autofill, and TypeScript
 * validation shows every problem inline; the server's answer can add more.
 */
export function EditCapacityDialog({ offering, onClose, onSaved }: EditCapacityDialogProps) {
  return (
    <Modal
      open={offering !== null}
      onClose={onClose}
      title={offering ? `Edit capacity · ${offering.code}` : 'Edit capacity'}
      description={offering?.name}
      size="sm"
    >
      {/* Keyed so each opening starts with a fresh form. */}
      {offering && (
        <CapacityForm
          key={offering.code}
          offering={offering}
          onCancel={onClose}
          onSaved={onSaved}
        />
      )}
    </Modal>
  );
}

function CapacityForm({
  offering,
  onCancel,
  onSaved,
}: {
  offering: AdminCourseOffering;
  onCancel: () => void;
  onSaved: (result: UpdateCapacityResult) => void;
}) {
  const formId = useId();
  const capacityRef = useRef<HTMLInputElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const [values, setValues] = useState<CapacityFormValues>({
    capacity: String(offering.capacity),
    reason: '',
  });
  const [errors, setErrors] = useState<CapacityFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const focusFirstError = (found: CapacityFormErrors) => {
    (found.capacity ? capacityRef : reasonRef).current?.focus();
  };

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = validateCapacityForm(values, offering);
    setErrors(found);
    setFormError(null);
    if (hasErrors(found)) {
      focusFirstError(found);
      return;
    }

    setSaving(true);
    const response = await updateCapacity(offering.code, {
      capacity: Number(values.capacity),
      reason: values.reason.trim(),
    });
    setSaving(false);
    if (response.success) {
      onSaved(response.data);
      return;
    }
    // Field errors from the server go next to their fields; anything else on top.
    const fromServer: CapacityFormErrors = {};
    for (const fieldError of response.errors ?? []) {
      if (fieldError.field === 'capacity' || fieldError.field === 'reason') {
        fromServer[fieldError.field] = fieldError.message;
      }
    }
    setErrors(fromServer);
    if (hasErrors(fromServer)) {
      focusFirstError(fromServer);
    } else {
      setFormError(response.message);
    }
  };

  return (
    <form
      id={formId}
      className={styles.form}
      noValidate
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
    >
      <dl className={styles.numbers}>
        <div>
          <dt>Capacity</dt>
          <dd>{offering.capacity}</dd>
        </div>
        <div>
          <dt>Allocated</dt>
          <dd>{offering.allocated}</dd>
        </div>
        <div>
          <dt>Requests</dt>
          <dd>{offering.demand}</dd>
        </div>
      </dl>

      {formError && (
        <p className={styles.formError} role="alert">
          <Icon icon={CircleAlert} />
          <span>{formError}</span>
        </p>
      )}

      <FormField
        label="New capacity"
        hint={
          offering.allocated > 0
            ? `No lower than ${offering.allocated}, the seats already allocated. At most ${CAPACITY_LIMITS.max}.`
            : `Whole seats, up to ${CAPACITY_LIMITS.max}.`
        }
        error={errors.capacity}
        required
      >
        {(control) => (
          <Input
            {...control}
            ref={capacityRef}
            type="number"
            name="capacity"
            inputMode="numeric"
            min={offering.allocated}
            max={CAPACITY_LIMITS.max}
            step={1}
            mono
            className={styles.capacity}
            value={values.capacity}
            onChange={(event) => {
              setValues((current) => ({ ...current, capacity: event.target.value }));
            }}
          />
        )}
      </FormField>

      <FormField
        label="Reason"
        hint="Recorded in the audit log with the old and new capacity."
        error={errors.reason}
        required
      >
        {(control) => (
          <Textarea
            {...control}
            ref={reasonRef}
            name="reason"
            minLength={CAPACITY_REASON_LENGTH.min}
            maxLength={CAPACITY_REASON_LENGTH.max}
            value={values.reason}
            onChange={(event) => {
              setValues((current) => ({ ...current, reason: event.target.value }));
            }}
          />
        )}
      </FormField>

      <div className={styles.actions}>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={saving}>
          {saving ? 'Saving…' : 'Save capacity'}
        </Button>
      </div>
    </form>
  );
}
