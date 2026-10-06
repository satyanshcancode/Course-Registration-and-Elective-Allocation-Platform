import type { Ref, SelectHTMLAttributes } from 'react';
import styles from './Select.module.css';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  'children' | 'size'
> {
  options: readonly SelectOption[];
  /** Optional first, empty choice such as "All programmes". */
  placeholder?: string;
  /**
   * `sm` matches the height and type size of a filter bar's other controls.
   * The default is the size a form field wants.
   */
  size?: 'sm' | 'md';
  ref?: Ref<HTMLSelectElement>;
}

/** A native <select> (best keyboard and screen-reader support), restyled. */
export function Select({
  options,
  placeholder,
  size = 'md',
  className,
  ref,
  ...rest
}: SelectProps) {
  return (
    <span className={[styles.wrapper, className].filter(Boolean).join(' ')}>
      {/* `size` on a <select> means "how many rows to show when open", which is
          not what this prop is about, so it is spent on a data attribute. */}
      <select ref={ref} className={styles.select} data-size={size} {...rest}>
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
