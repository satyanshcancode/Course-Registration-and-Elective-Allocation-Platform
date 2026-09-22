import { useId, type InputHTMLAttributes, type ReactNode, type Ref } from 'react';
import styles from './Checkbox.module.css';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
  /** Extra explanation under the label. */
  description?: ReactNode;
  ref?: Ref<HTMLInputElement>;
}

/** A native checkbox with a drawn box; the whole label is the click target. */
export function Checkbox({ label, description, id, className, ref, ...rest }: CheckboxProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const descriptionId = description ? `${inputId}-description` : undefined;

  return (
    <div className={[styles.option, className].filter(Boolean).join(' ')}>
      <input
        ref={ref}
        id={inputId}
        type="checkbox"
        className={styles.box}
        aria-describedby={descriptionId}
        {...rest}
      />
      <label htmlFor={inputId} className={styles.label}>
        {label}
      </label>
      {description && (
        <p id={descriptionId} className={styles.description}>
          {description}
        </p>
      )}
    </div>
  );
}
