import { CircleAlert, Info, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Icon } from '../Icon';
import styles from './Notice.module.css';

export type NoticeTone = 'info' | 'warning' | 'danger' | 'success';

export interface NoticeProps {
  tone?: NoticeTone;
  /** Overrides the tone's own glyph. */
  icon?: LucideIcon;
  /**
   * Announce the notice when it appears, for something that has just gone
   * wrong. Leave it off for a standing explanation, which is read in place.
   */
  live?: boolean;
  children: ReactNode;
}

/** The glyph a tone brings with it, so no caller has to remember which. */
const TONE_ICONS: Record<NoticeTone, LucideIcon> = {
  info: Info,
  warning: TriangleAlert,
  danger: CircleAlert,
  success: Info,
};

/**
 * A tinted line of explanation above or below the thing it is about: why a
 * period is closed, how reordering works, what a policy page is for.
 *
 * It is not a dialog and it is not a toast — nothing is dismissed and nothing
 * is waited for. The icon is decorative, because the sentence beside it always
 * carries the meaning on its own.
 */
export function Notice({ tone = 'info', icon, live = false, children }: NoticeProps) {
  return (
    <p className={styles.notice} data-tone={tone} role={live ? 'alert' : undefined}>
      <Icon icon={icon ?? TONE_ICONS[tone]} className={styles.icon} />
      <span>{children}</span>
    </p>
  );
}
