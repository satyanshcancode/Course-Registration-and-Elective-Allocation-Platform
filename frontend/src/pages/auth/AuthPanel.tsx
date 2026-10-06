import type { LucideIcon } from 'lucide-react';
import { useRef, type ReactNode } from 'react';
import { Icon } from '../../components/Icon';
import { Wordmark } from '../../layouts/Wordmark';
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
  /**
   * `card` is the narrow centred card. `split` is the sign-in page: the form on
   * the paper beside a decorative green panel (shown from 64rem up).
   */
  variant?: 'card' | 'split';
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
export function AuthPanel({
  icon,
  title,
  lead,
  error,
  notice,
  children,
  footer,
  variant = 'card',
}: AuthPanelProps) {
  useDocumentTitle(title);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useFocusOnMount(headingRef);

  return (
    <div className={styles.layout} data-variant={variant}>
      {variant === 'split' && <BrandPanel />}
      <section className={styles.panel} data-variant={variant} aria-labelledby="auth-title">
        <span className={styles.mark} aria-hidden="true">
          <Icon icon={icon} size={20} />
        </span>
        <h1
          id="auth-title"
          ref={headingRef}
          tabIndex={-1}
          className={styles.title}
          data-variant={variant}
        >
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

/**
 * Decoration for the sign-in page. Everything said here is also said, or is
 * unnecessary, elsewhere on the page, so it is hidden from assistive technology
 * and made inert: the wordmark inside it is a second link to the header's.
 */
function BrandPanel() {
  return (
    <div className={styles.brand} aria-hidden="true" inert>
      <div className={styles.brandWordmark}>
        <Wordmark to="/" />
      </div>
      <div className={styles.brandCopy}>
        <p className={styles.brandHeadline}>
          Find out what you can take, and whether there is room.
        </p>
        <p className={styles.brandLead}>
          Check your eligibility, rank the courses you want and watch the seats in each one as they
          fill.
        </p>
      </div>
      <svg className={styles.cube} viewBox="0 0 160 160" focusable="false">
        {/* The space that was open: a larger box, drawn open on the dark ground. */}
        <path className={styles.cubeFrame} d="M80 16 L144 48 L80 80 L16 48 Z" />
        <path className={styles.cubeFrame} d="M16 48 L16 104 L80 136 L80 80 Z" />
        <path className={styles.cubeFrame} d="M144 48 L144 104 L80 136 L80 80 Z" />
        {/* The seat that is taken, inside it. */}
        <path className={styles.cubeTop} d="M78 46 L111 62 L78 78 L45 62 Z" />
        <path className={styles.cubeLeft} d="M45 62 L45 91 L78 107 L78 78 Z" />
        <path className={styles.cubeRight} d="M111 62 L111 91 L78 107 L78 78 Z" />
      </svg>
    </div>
  );
}
