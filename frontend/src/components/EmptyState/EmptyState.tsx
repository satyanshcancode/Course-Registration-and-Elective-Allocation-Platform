import { Inbox, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Icon } from '../Icon';
import styles from './EmptyState.module.css';

export interface EmptyStateProps {
  title: string;
  /** What this space will contain, or what to do next. */
  children?: ReactNode;
  icon?: LucideIcon;
  action?: ReactNode;
  headingLevel?: 2 | 3;
}

/** Shown where content would be: says why it's empty and what happens next. */
export function EmptyState({
  title,
  children,
  icon = Inbox,
  action,
  headingLevel = 2,
}: EmptyStateProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    <section className={styles.empty}>
      <span className={styles.mark}>
        <Icon icon={icon} size={20} />
      </span>
      <div className={styles.text}>
        <Heading className={styles.title}>{title}</Heading>
        {children && <div className={styles.body}>{children}</div>}
        {action && <div className={styles.action}>{action}</div>}
      </div>
    </section>
  );
}
