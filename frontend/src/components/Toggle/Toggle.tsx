import styles from './Toggle.module.css';

export interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Identifies the control in tests and forms. */
  name?: string;
}

/**
 * An on/off switch for a setting that applies immediately — a catalogue
 * filter, not a field you submit.
 *
 * It is a real `role="switch"` button rather than a styled div: the label is
 * the button's own text, so it is clickable and read out, Space and Enter work
 * without a key handler, and `aria-checked` is what announces the state.
 */
export function Toggle({ label, checked, onChange, name }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      name={name}
      aria-checked={checked}
      className={styles.toggle}
      onClick={() => {
        onChange(!checked);
      }}
    >
      <span className={styles.track} aria-hidden="true">
        <span className={styles.knob} />
      </span>
      {label}
    </button>
  );
}
