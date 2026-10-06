import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Icon } from '../Icon';
import styles from './Card.module.css';

export interface CardProps {
  title?: string;
  /** A decorative mark before the title, the way the target sets card headings. */
  titleIcon?: LucideIcon;
  /**
   * A status badge beside the title — what the card is about, rather than
   * something to do about it. It sits NEXT TO the heading rather than inside
   * it, so the heading's accessible name stays the title alone.
   */
  titleAside?: ReactNode;
  kicker?: string;
  headingLevel?: 2 | 3 | 4;
  /** Buttons or links aligned with the title. */
  actions?: ReactNode;
  /**
   * Let the body reach the card's own edges — for a table, whose rules run
   * the full width in the target rather than stopping inside a padding.
   */
  bodyFlush?: boolean;
  footer?: ReactNode;
  children: ReactNode;
}

/** A self-contained piece of content: a hairline-bordered <article>. */
export function Card({
  title,
  titleIcon,
  titleAside,
  kicker,
  headingLevel = 2,
  actions,
  bodyFlush = false,
  footer,
  children,
}: CardProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    <article className={styles.card} data-flush={bodyFlush ? 'true' : undefined}>
      {(title ?? actions) && (
        <header className={styles.header}>
          <div className={styles.titles}>
            {kicker && <p className={styles.kicker}>{kicker}</p>}
            {title && (
              <Heading className={styles.title}>
                {titleIcon && <Icon icon={titleIcon} size={24} className={styles.titleIcon} />}
                {title}
              </Heading>
            )}
            {titleAside}
          </div>
          {actions && <div className={styles.actions}>{actions}</div>}
        </header>
      )}
      <div className={styles.body}>{children}</div>
      {footer && <footer className={styles.footer}>{footer}</footer>}
    </article>
  );
}
