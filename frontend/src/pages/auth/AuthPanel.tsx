import type { LucideIcon } from 'lucide-react';
import { useRef, type ReactNode } from 'react';
import { Icon } from '../../components/Icon';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useFocusOnMount } from '../../hooks/useFocusOnMount';
import styles from './AuthPanel.module.css';

export interface AuthPanelProps {
  /** A mark above the title, set in the same tinted tile the app's lists use. */
  icon: LucideIcon;
  title: string;
  lead?: ReactNode;
  /**
   * A message the user must not miss (a dead link, a wrong password). Kept in
   * the DOM even when empty so what is inserted into it is announced.
   */
  error?: string | null;
  /** Confirmation or guidance, announced politely. */
  notice?: ReactNode;
  children: ReactNode;
  /** Sign-in and forgot-password links under the form. */
  footer?: ReactNode;
}

/**
 * The frame shared by the sign-in, activation, reset and forgot-password pages:
 * one narrow card, the same heading structure, and one live region each for a
 * notice and an error.
 *
 * Extracted rather than copied so all of them announce and focus the same
 * way — the heading takes focus on mount, as `PageHeader` does inside the app,
 * so a keyboard user lands on the page's name after navigating to it.
 */
export function AuthPanel({ icon, title, lead, error, notice, children, footer }: AuthPanelProps) {
  useDocumentTitle(title);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useFocusOnMount(headingRef);

  return (
    <div className={styles.layout}>
      <section className={styles.panel} aria-labelledby="auth-title">
        <span className={styles.mark} aria-hidden="true">
          <Icon icon={icon} size={20} />
        </span>
        <h1 id="auth-title" ref={headingRef} tabIndex={-1} className={styles.title}>
          {title}
        </h1>
        {lead && <p className={styles.lead}>{lead}</p>}

        {notice && (
          <div className={styles.notice} role="status">
            {notice}
          </div>
        )}
        <div className={styles.alert} role="alert">
          {error && <p>{error}</p>}
        </div>

        {children}

        {footer && <div className={styles.footer}>{footer}</div>}
      </section>
    </div>
  );
}
