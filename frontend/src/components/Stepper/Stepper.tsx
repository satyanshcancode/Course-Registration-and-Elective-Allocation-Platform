import styles from './Stepper.module.css';

export interface StepperProps {
  /** The steps, in order, e.g. ['Select', 'Review', 'Submit']. */
  steps: readonly string[];
  /** Which step the reader is on; anything before it counts as done. */
  current: string;
  /** Accessible name of the list, e.g. "Submitting". */
  label: string;
}

/**
 * Where someone is in a short sequence of steps.
 *
 * An ordered list, because the steps ARE a sequence, and the current one says
 * so in words as well as in colour. It is a progress indicator rather than a
 * set of controls: moving between steps is what the page's own buttons do, so
 * there is nothing here to click.
 */
export function Stepper({ steps, current, label }: StepperProps) {
  const currentIndex = steps.indexOf(current);
  return (
    <ol className={styles.stepper} aria-label={label}>
      {steps.map((step, index) => (
        <li
          key={step}
          className={styles.step}
          data-state={index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'todo'}
        >
          <span className={styles.number} aria-hidden="true">
            {index + 1}
          </span>
          <span className={styles.label}>
            {step}
            {index === currentIndex && <span className="visually-hidden"> (current step)</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}
