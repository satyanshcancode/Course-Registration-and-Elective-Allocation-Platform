import { CircleAlert } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { Icon } from '../Icon';
import styles from './FormField.module.css';

/** Props FormField hands to its control so label, hint and error are wired up. */
export interface FieldControlProps {
  id: string;
  required?: boolean;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
}

export interface FormFieldProps {
  label: string;
  /** Guidance shown under the label, e.g. "Your university e-mail address". */
  hint?: ReactNode;
  /** Shown with an icon and linked to the control via aria-describedby. */
  error?: string;
  required?: boolean;
  /** Visually hide the label (it stays the control's accessible name). */
  labelHidden?: boolean;
  id?: string;
  children: (control: FieldControlProps) => ReactNode;
}

/**
 * Label + hint + error around one form control. Always use this for inputs:
 *
 *   <FormField label="E-mail" error={errors.email} required>
 *     {(control) => <Input {...control} type="email" />}
 *   </FormField>
 */
export function FormField({
  label,
  hint,
  error,
  required,
  labelHidden,
  id,
  children,
}: FormFieldProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  const control: FieldControlProps = { id: controlId };
  if (required) {
    control.required = true;
  }
  if (describedBy) {
    control['aria-describedby'] = describedBy;
  }
  if (error) {
    control['aria-invalid'] = true;
  }

  return (
    <div className={styles.field} data-invalid={error ? 'true' : undefined}>
      <label
        htmlFor={controlId}
        className={labelHidden ? 'visually-hidden' : styles.label}
        data-required={required ? 'true' : undefined}
      >
        {label}
      </label>
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      {children(control)}
      {error && (
        <p id={errorId} className={styles.error}>
          <Icon icon={CircleAlert} />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
