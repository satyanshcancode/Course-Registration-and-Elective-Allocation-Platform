import { useRef, type ReactNode } from 'react';
import { useFocusOnMount } from '../../hooks/useFocusOnMount';
import styles from './PageHeader.module.css';

export interface PageHeaderProps {
  title: string;
  /** Small uppercase label above the title, e.g. "Fall 2026 · Registration". */
  kicker?: string;
  description?: ReactNode;
  /** Page-level actions, right-aligned on wide screens. */
  actions?: ReactNode;
  /** A status line under the title (later: the registration window status). */
  children?: ReactNode;
  /**
   * Stays under the app header while the page scrolls (default true). Only
   * inside AppShell, whose top bar is sticky too; phones never stick.
   */
  sticky?: boolean;
  /** Moves focus to the <h1> when the page mounts (default true). */
  focusOnMount?: boolean;
}

export function PageHeader({
  title,
  kicker,
  description,
  actions,
  children,
  sticky = true,
  focusOnMount = true,
}: PageHeaderProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useFocusOnMount(headingRef, focusOnMount);

  return (
    <header className={styles.header} data-sticky={sticky ? 'true' : undefined}>
      <div className={styles.titles}>
        {kicker && <p className={styles.kicker}>{kicker}</p>}
        {/* tabIndex -1: focusable by script (route changes), not by Tab. */}
        <h1 ref={headingRef} tabIndex={-1} className={styles.title}>
          {title}
        </h1>
        {description && <p className={styles.description}>{description}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
      {children && <div className={styles.status}>{children}</div>}
    </header>
  );
}
