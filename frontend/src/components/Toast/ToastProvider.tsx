import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Toast } from './Toast';
import { ToastContext } from './ToastContext';
import styles from './Toast.module.css';
import type { ToastApi, ToastInput, ToastItem } from './toastTypes';

const DEFAULT_DURATION_MS = 6_000;
/** Older toasts give way so the stack never covers the page. */
const MAX_VISIBLE = 4;

let counter = 0;
const nextId = () => {
  counter += 1;
  return `toast-${counter}`;
};

/**
 * Owns the toast queue and renders the fixed, polite live region (top-right
 * on wide screens, above the bottom navigation on phones).
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback((input: ToastInput) => {
    const toast: ToastItem = {
      id: nextId(),
      tone: input.tone ?? 'info',
      title: input.title,
      duration: input.duration ?? DEFAULT_DURATION_MS,
      ...(input.message ? { message: input.message } : {}),
    };
    setToasts((current) => [...current, toast].slice(-MAX_VISIBLE));
    return toast.id;
  }, []);

  const api = useMemo<ToastApi>(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <section className={styles.region} aria-label="Notifications" aria-live="polite">
        <ol className={styles.list}>
          {toasts.map((toast) => (
            <Toast key={toast.id} toast={toast} onDismiss={dismiss} />
          ))}
        </ol>
      </section>
    </ToastContext.Provider>
  );
}
