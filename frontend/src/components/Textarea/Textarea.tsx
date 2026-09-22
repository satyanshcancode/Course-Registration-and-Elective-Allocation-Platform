import type { Ref, TextareaHTMLAttributes } from 'react';
import styles from './Textarea.module.css';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  ref?: Ref<HTMLTextAreaElement>;
}

/** A multi-line text field. Wrap it in FormField for its label and messages. */
export function Textarea({ className, rows = 3, ref, ...rest }: TextareaProps) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={[styles.textarea, className].filter(Boolean).join(' ')}
      {...rest}
    />
  );
}
