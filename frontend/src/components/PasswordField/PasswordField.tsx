import { assessPassword, PASSWORD_MAX_LENGTH, type PasswordStrength } from '@course-reg/shared';
import { Eye, EyeOff } from 'lucide-react';
import { useId, useState, type ChangeEvent, type Ref } from 'react';
import { describePasswordStrength, passwordStrengthSteps } from '../../utils/accountText';
import { Button } from '../Button';
import { FormField } from '../FormField';
import { Input } from '../Input';
import styles from './PasswordField.module.css';

export interface PasswordFieldProps {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  /** Draws the strength meter and its suggestions. Off for "current password". */
  showStrength?: boolean;
  /** 'new-password' for a password being chosen, 'current-password' otherwise. */
  autoComplete: 'new-password' | 'current-password';
  required?: boolean;
  id?: string;
  ref?: Ref<HTMLInputElement>;
}

const STEPS = [1, 2, 3, 4];

/**
 * A password input with Show/Hide and, when a password is being CHOSEN, a
 * strength hint.
 *
 * The hint is advisory and says so: the only rule the server enforces is the
 * minimum length, and `assessPassword` — the same shared function the server's
 * schema uses — decides both the wording and whether it is acceptable, so the
 * hint can never promise something the server then refuses.
 *
 * The strength is announced politely rather than assertively: it changes on
 * every keystroke, and an assertive region would interrupt typing.
 */
export function PasswordField({
  label,
  name,
  value,
  onChange,
  error,
  hint,
  showStrength = false,
  autoComplete,
  required,
  id,
  ref,
}: PasswordFieldProps) {
  const [shown, setShown] = useState(false);
  const meterId = useId();

  const assessment = assessPassword(value);
  const strength: PasswordStrength = assessment.strength;
  const filled = value === '' ? 0 : passwordStrengthSteps(strength);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(event.target.value);
  };

  return (
    <div className={styles.field}>
      <FormField label={label} id={id} error={error} hint={hint} required={required}>
        {(control) => (
          <div className={styles.row}>
            <Input
              {...control}
              ref={ref}
              name={name}
              type={shown ? 'text' : 'password'}
              autoComplete={autoComplete}
              autoCapitalize="none"
              spellCheck={false}
              maxLength={PASSWORD_MAX_LENGTH}
              value={value}
              onChange={handleChange}
              aria-describedby={
                [control['aria-describedby'], showStrength && value !== '' ? meterId : null]
                  .filter(Boolean)
                  .join(' ') || undefined
              }
            />
            <Button
              variant="secondary"
              iconStart={shown ? EyeOff : Eye}
              aria-controls={control.id}
              aria-pressed={shown}
              onClick={() => {
                setShown((current) => !current);
              }}
            >
              {shown ? 'Hide password' : 'Show password'}
            </Button>
          </div>
        )}
      </FormField>

      {showStrength && value !== '' && (
        <div className={styles.strength} id={meterId}>
          <div className={styles.steps} data-strength={strength} aria-hidden="true">
            {STEPS.map((step) => (
              <span
                key={step}
                className={styles.step}
                data-on={step <= filled ? 'true' : 'false'}
              />
            ))}
          </div>
          {/* The word carries the meaning; the bars only repeat it. */}
          <p className={styles.label} data-strength={strength} aria-live="polite">
            {describePasswordStrength(strength)}
            {!assessment.acceptable && ' — not long enough yet'}
          </p>
          {assessment.suggestions.length > 0 && (
            <ul className={styles.suggestions}>
              {assessment.suggestions.map((suggestion) => (
                <li key={suggestion}>{suggestion}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
