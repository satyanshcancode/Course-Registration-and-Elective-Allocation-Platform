import type { ReactNode } from 'react';
import styles from './PagePlaceholder.module.css';

interface PagePlaceholderProps {
  title: string;
  children: ReactNode;
}

/** Temporary page body for routes whose features arrive in later phases. */
export function PagePlaceholder({ title, children }: PagePlaceholderProps) {
  return (
    <section className={styles.placeholder} aria-labelledby="page-title">
      <h1 id="page-title">{title}</h1>
      <div className={styles.body}>{children}</div>
    </section>
  );
}
