import type { LucideIcon } from 'lucide-react';
import styles from './Icon.module.css';

/** Icons sit on a 16/20/24px grid. */
export type IconSize = 16 | 20 | 24;

export interface IconProps {
  icon: LucideIcon;
  size?: IconSize;
  /**
   * Only for icons that stand alone and carry meaning. Most icons sit next to
   * visible text and must stay decorative (hidden from assistive technology).
   */
  label?: string;
  className?: string;
}

/** The single way to render an icon: Lucide, 1.5px absolute stroke. */
export function Icon({ icon: Glyph, size = 16, label, className }: IconProps) {
  return (
    <Glyph
      size={size}
      strokeWidth={1.5}
      nonScalingStroke
      className={[styles.icon, className].filter(Boolean).join(' ')}
      focusable="false"
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    />
  );
}
