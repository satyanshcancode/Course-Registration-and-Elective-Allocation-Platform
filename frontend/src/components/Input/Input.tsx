import type { InputHTMLAttributes, Ref } from 'react';
import styles from './Input.module.css';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  ref?: Ref<HTMLInputElement>;
  /** Monospaced, tabular digits (for codes and numbers). */
  mono?: boolean;
}

/** A text-like input. Wrap it in FormField for its label and messages. */
export function Input({ className, mono, ref, ...rest }: InputProps) {
  return (
    <input
      ref={ref}
      className={[styles.input, className].filter(Boolean).join(' ')}
      data-mono={mono ? 'true' : undefined}
      {...rest}
    />
  );
}
