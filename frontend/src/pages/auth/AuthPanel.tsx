import { useRef, type ReactNode } from 'react';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useFocusOnMount } from '../../hooks/useFocusOnMount';
import styles from './AuthPanel.module.css';

export interface AuthPanelProps {
  kicker: string;
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
 * The frame shared by the activation, forgot-password, reset and account pages:
 * one narrow card, the same heading structure, and one live region each for a
 * notice and an error.
 *
 * Extracted rather than copied so all four pages announce and focus the same
 * way — the heading takes focus on mount, as `PageHeader` does inside the app,
 * so a keyboard user lands on the page's name after navigating to it.
 */
export function AuthPanel({
  kicker,
  title,
  lead,
  error,
  notice,
  children,
  footer,
}: AuthPanelProps) {
  useDocumentTitle(title);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useFocusOnMount(headingRef);

  return (
    <div className={styles.layout}>
      <section className={styles.panel} aria-labelledby="auth-title">
        <p className={styles.kicker}>{kicker}</p>
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
