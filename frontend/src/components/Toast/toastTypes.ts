export type ToastTone = 'success' | 'info' | 'warning' | 'danger';

export interface ToastInput {
  tone?: ToastTone;
  title: string;
  message?: string;
  /** Milliseconds before it disappears; 0 keeps it until dismissed. Default 6000. */
  duration?: number;
}

export interface ToastItem extends Required<Omit<ToastInput, 'message'>> {
  id: string;
  message?: string;
}

export interface ToastApi {
  /** Shows a toast and returns its id. */
  show: (toast: ToastInput) => string;
  dismiss: (id: string) => void;
}
