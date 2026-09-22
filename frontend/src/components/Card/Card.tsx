import type { ReactNode } from 'react';
import styles from './Card.module.css';

export interface CardProps {
  title?: string;
  kicker?: string;
  headingLevel?: 2 | 3 | 4;
  /** Buttons or links aligned with the title. */
  actions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

/** A self-contained piece of content: a hairline-bordered <article>, no shadow. */
export function Card({ title, kicker, headingLevel = 2, actions, footer, children }: CardProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    <article className={styles.card}>
      {(title ?? actions) && (
        <header className={styles.header}>
          <div>
            {kicker && <p className={styles.kicker}>{kicker}</p>}
            {title && <Heading className={styles.title}>{title}</Heading>}
          </div>
          {actions && <div className={styles.actions}>{actions}</div>}
        </header>
      )}
      <div className={styles.body}>{children}</div>
      {footer && <footer className={styles.footer}>{footer}</footer>}
    </article>
  );
}
