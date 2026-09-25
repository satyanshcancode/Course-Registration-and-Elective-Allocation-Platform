import { Ellipsis } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router';
import { Icon } from '../components/Icon';
import styles from './MobileNav.module.css';
import type { NavItem } from './navigation';

interface MobileNavProps {
  label: string;
  items: readonly NavItem[];
  itemBadge?: (item: NavItem) => ReactNode;
}

/**
 * Phones only (hidden by CSS elsewhere): a fixed bottom bar with the main
 * destinations, and "More" opening the rest in a sheet above it.
 */
export function MobileNav({ label, items, itemBadge }: MobileNavProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const sheetId = useId();
  const containerRef = useRef<HTMLElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const { pathname } = useLocation();

  const primary = items.filter((item) => item.primaryOnMobile);
  const secondary = items.filter((item) => !item.primaryOnMobile);
  const moreIsCurrent = secondary.some((item) => pathname.startsWith(item.to));

  useEffect(() => {
    if (!moreOpen) {
      return undefined;
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) {
        setMoreOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMoreOpen(false);
        moreButtonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [moreOpen]);

  const close = () => {
    setMoreOpen(false);
  };

  return (
    <nav className={styles.mobileNav} aria-label={label} ref={containerRef}>
      <ul className={styles.sheet} id={sheetId} hidden={!moreOpen}>
        {secondary.map((item) => (
          <li key={item.to}>
            <NavLink to={item.to} className={styles.sheetLink} onClick={close}>
              <Icon icon={item.icon} size={20} />
              <span>{item.label}</span>
              {itemBadge?.(item) && <span className={styles.badge}>{itemBadge(item)}</span>}
            </NavLink>
          </li>
        ))}
      </ul>
      <ul className={styles.bar}>
        {primary.map((item) => (
          <li key={item.to}>
            <NavLink to={item.to} className={styles.barLink} onClick={close}>
              <Icon icon={item.icon} size={20} />
              <span className={styles.barLabel}>
                {item.shortLabel ?? item.label}
                {itemBadge?.(item) && <span className={styles.badge}>{itemBadge(item)}</span>}
              </span>
            </NavLink>
          </li>
        ))}
        {secondary.length > 0 && (
          <li>
            <button
              ref={moreButtonRef}
              type="button"
              className={styles.barLink}
              aria-expanded={moreOpen}
              aria-controls={sheetId}
              data-current={moreIsCurrent ? 'true' : undefined}
              onClick={() => {
                setMoreOpen((open) => !open);
              }}
            >
              <Icon icon={Ellipsis} size={20} />
              <span className={styles.barLabel}>More</span>
            </button>
          </li>
        )}
      </ul>
    </nav>
  );
}
