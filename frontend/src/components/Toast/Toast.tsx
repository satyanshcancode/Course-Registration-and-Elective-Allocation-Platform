import { CircleAlert, CircleCheck, Info, TriangleAlert, X, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Icon } from '../Icon';
import styles from './Toast.module.css';
import type { ToastItem, ToastTone } from './toastTypes';

const TONE_ICONS: Record<ToastTone, LucideIcon> = {
  success: CircleCheck,
  info: Info,
  warning: TriangleAlert,
  danger: CircleAlert,
};

export interface ToastProps {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}

/** One notification. Hovering or focusing it pauses the countdown. */
export function Toast({ toast, onDismiss }: ToastProps) {
  const [paused, setPaused] = useState(false);
  const { id, duration } = toast;

  useEffect(() => {
    if (duration <= 0 || paused) {
      return undefined;
    }
    const timer = setTimeout(() => {
      onDismiss(id);
    }, duration);
    return () => {
      clearTimeout(timer);
    };
  }, [id, duration, paused, onDismiss]);

  return (
    <li
      className={styles.toast}
      data-tone={toast.tone}
      // The region is already polite; only errors interrupt.
      role={toast.tone === 'danger' ? 'alert' : undefined}
      onMouseEnter={() => {
        setPaused(true);
      }}
      onMouseLeave={() => {
        setPaused(false);
      }}
      onFocus={() => {
        setPaused(true);
      }}
      onBlur={() => {
        setPaused(false);
      }}
    >
      <Icon icon={TONE_ICONS[toast.tone]} size={20} className={styles.icon} />
      <div className={styles.text}>
        <p className={styles.title}>{toast.title}</p>
        {toast.message && <p className={styles.message}>{toast.message}</p>}
      </div>
      <button
        type="button"
        className={styles.dismiss}
        onClick={() => {
          onDismiss(id);
        }}
      >
        <Icon icon={X} />
        <span className="visually-hidden">Dismiss notification</span>
      </button>
    </li>
  );
}
