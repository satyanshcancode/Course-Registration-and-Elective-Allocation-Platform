import type { RegistrationWindowSummary } from '@course-reg/shared';
import { createContext, use, type ReactNode } from 'react';
import { getCurrentWindow } from '../api/courseApi';
import { unwrap } from '../api/unwrap';
import type { AsyncState } from '../types/asyncState';
import { useAsync } from './useAsync';

export interface RegistrationWindowData {
  window: RegistrationWindowSummary | null;
  /** Server clock minus device clock, measured when the window arrived. */
  clockOffsetMs: number;
}

export interface RegistrationWindowContextValue {
  state: AsyncState<RegistrationWindowData>;
  retry: () => void;
}

const RegistrationWindowContext = createContext<RegistrationWindowContextValue | null>(null);

/**
 * Loads the current registration window once per signed-in session area, so
 * the status banner, the countdown and the dashboard share one request and
 * one clock offset instead of each page fetching its own.
 */
export function RegistrationWindowProvider({ children }: { children: ReactNode }) {
  const { state, retry } = useAsync(async (signal) => {
    const current = unwrap(await getCurrentWindow(signal));
    return {
      window: current.window,
      clockOffsetMs: Date.parse(current.serverTime) - Date.now(),
    };
  });

  return <RegistrationWindowContext value={{ state, retry }}>{children}</RegistrationWindowContext>;
}

/** Null outside the provider, so a component can decide not to render. */
export function useRegistrationWindow(): RegistrationWindowContextValue | null {
  return use(RegistrationWindowContext);
}
