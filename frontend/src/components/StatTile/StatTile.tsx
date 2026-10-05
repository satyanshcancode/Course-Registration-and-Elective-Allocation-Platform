import { ArrowRight, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router';
import { Icon } from '../Icon';
import styles from './StatTile.module.css';

export type StatTone = 'info' | 'danger' | 'success' | 'warning' | 'accent';

export interface StatTileProps {
  icon: LucideIcon;
  tone: StatTone;
  /** The figure itself, e.g. "13 / 20". */
  value: string;
  label: string;
  /** Where the figure can be read in full. */
  to: string;
  linkLabel: string;
}

/**
 * One headline number: a tinted icon tile, the figure, what it counts, and a
 * link to the page that explains it. The tone tints the tile only — the figure
 * and its label already say everything the colour hints at.
 */
export function StatTile({ icon, tone, value, label, to, linkLabel }: StatTileProps) {
  return (
    <article className={styles.tile}>
      <span className={styles.icon} data-tone={tone}>
        <Icon icon={icon} size={20} />
      </span>
      <p className={styles.value}>{value}</p>
      <p className={styles.label}>{label}</p>
      <Link to={to} className={styles.link}>
        {linkLabel}
        <Icon icon={ArrowRight} />
      </Link>
    </article>
  );
}
