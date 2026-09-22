import type { Ref, SelectHTMLAttributes } from 'react';
import styles from './Select.module.css';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  options: readonly SelectOption[];
  /** Optional first, empty choice such as "All programmes". */
  placeholder?: string;
  ref?: Ref<HTMLSelectElement>;
}

/** A native <select> (best keyboard and screen-reader support), restyled. */
export function Select({ options, placeholder, className, ref, ...rest }: SelectProps) {
  return (
    <span className={[styles.wrapper, className].filter(Boolean).join(' ')}>
      <select ref={ref} className={styles.select} {...rest}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
    </span>
  );
}
