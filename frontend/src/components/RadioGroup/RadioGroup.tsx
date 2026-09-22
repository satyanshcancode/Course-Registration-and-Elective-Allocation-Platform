import { useId, type ReactNode } from 'react';
import styles from './RadioGroup.module.css';

export interface RadioOption<T extends string> {
  value: T;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}

export interface RadioGroupProps<T extends string> {
  legend: string;
  name: string;
  options: readonly RadioOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  /** Lay options out in a row on wide screens. */
  inline?: boolean;
}

/**
 * A <fieldset> of native radios. Generic over the value union, so
 * onChange receives e.g. 'FCFS' | 'PREFERENCE_PRIORITY', not a bare string.
 */
export function RadioGroup<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
  hint,
  error,
  required,
  inline,
}: RadioGroupProps<T>) {
  const baseId = useId();
  const hintId = hint ? `${baseId}-hint` : undefined;
  const errorId = error ? `${baseId}-error` : undefined;

  return (
    <fieldset
      className={styles.group}
      aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
      aria-invalid={error ? true : undefined}
      data-inline={inline ? 'true' : undefined}
    >
      <legend className={styles.legend} data-required={required ? 'true' : undefined}>
        {legend}
      </legend>
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      <div className={styles.options}>
        {options.map((option) => {
          const id = `${baseId}-${option.value}`;
          return (
            <div key={option.value} className={styles.option}>
              <input
                id={id}
                type="radio"
                name={name}
                value={option.value}
                className={styles.radio}
                checked={value === option.value}
                disabled={option.disabled}
                required={required}
                aria-describedby={option.description ? `${id}-description` : undefined}
                onChange={() => {
                  onChange(option.value);
                }}
              />
              <label htmlFor={id} className={styles.label}>
                {option.label}
              </label>
              {option.description && (
                <p id={`${id}-description`} className={styles.description}>
                  {option.description}
                </p>
              )}
            </div>
          );
        })}
      </div>
      {error && (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      )}
    </fieldset>
  );
}
