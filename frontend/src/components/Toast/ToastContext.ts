import { createContext, useContext } from 'react';
import type { ToastApi } from './toastTypes';

export const ToastContext = createContext<ToastApi | null>(null);

/** Shows short, non-blocking confirmations: useToast().show({ title: 'Cart saved' }). */
export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used inside <ToastProvider>');
  }
  return context;
}
