import {
  readCartProblems,
  type CartProblem,
  type PreferenceCart,
  type SubmissionReceipt,
} from '@course-reg/shared';
import { createContext, use, useCallback, useState, type ReactNode } from 'react';
import type { ClientFailure } from '../api/apiClient';
import { getCart, saveCart, submitCart } from '../api/registrationApi';
import { unwrap } from '../api/unwrap';
import type { AsyncState } from '../types/asyncState';
import type { CartSnapshot } from '../utils/cartActions';
import { useAsync } from './useAsync';

/** A save that was refused, with the problems placed against their courses. */
export interface CartRefusal {
  ok: false;
  message: string;
  problems: CartProblem[];
  /** null when the server could not be reached at all. */
  httpStatus: number | null;
}

export type SaveResult = { ok: true; cart: PreferenceCart } | CartRefusal;
export type SubmitResult = { ok: true; receipt: SubmissionReceipt } | CartRefusal;

export interface CartContextValue {
  /** The first load; afterwards the cart below is the newest the server sent. */
  state: AsyncState<PreferenceCart>;
  cart: PreferenceCart | null;
  /** Course codes in rank order — the working list the pages reorder. */
  codes: string[];
  /** What the buttons need to decide what to draw. */
  snapshot: CartSnapshot | null;
  saving: boolean;
  reload: () => void;
  /** Replaces the whole cart. The order given becomes the ranks. */
  save: (codes: readonly string[]) => Promise<SaveResult>;
  add: (code: string) => Promise<SaveResult>;
  remove: (code: string) => Promise<SaveResult>;
  /** The key must be generated once per attempt and reused for every retry. */
  submit: (codes: readonly string[], idempotencyKey: string) => Promise<SubmitResult>;
}

const CartContext = createContext<CartContextValue | null>(null);

/** An ApiFailure as the cart UI needs it: the message, the structured
 *  problems, and the HTTP status (null when the server was never reached). */
function refusal(response: { message: string; details?: unknown }): CartRefusal {
  return {
    ok: false,
    message: response.message,
    problems: readCartProblems(response.details),
    httpStatus: (response as ClientFailure).httpStatus ?? null,
  };
}

/**
 * One cart for the whole student area: the catalogue's add/remove buttons, the
 * nav count and the cart page all read and write this, so a course added from
 * a card is in the cart the moment the cart page renders.
 */
export function CartProvider({ children }: { children: ReactNode }) {
  const { state, retry } = useAsync(async (signal) => unwrap(await getCart(signal)));
  // The newest cart the server confirmed, which replaces the loaded one.
  const [confirmed, setConfirmed] = useState<PreferenceCart | null>(null);
  const [saving, setSaving] = useState(false);

  const cart = confirmed ?? (state.status === 'success' ? state.data : null);

  const reload = useCallback(() => {
    setConfirmed(null);
    retry();
  }, [retry]);

  const save = useCallback(async (codes: readonly string[]): Promise<SaveResult> => {
    setSaving(true);
    try {
      const response = await saveCart([...codes]);
      if (!response.success) {
        return refusal(response);
      }
      setConfirmed(response.data);
      return { ok: true, cart: response.data };
    } finally {
      setSaving(false);
    }
  }, []);

  const submit = useCallback(
    async (codes: readonly string[], idempotencyKey: string): Promise<SubmitResult> => {
      setSaving(true);
      try {
        const response = await submitCart([...codes], idempotencyKey);
        if (!response.success) {
          return refusal(response);
        }
        // Re-read: the cart is now submitted, locked and carries the receipt.
        void getCart().then((next) => {
          if (next.success) {
            setConfirmed(next.data);
          }
        });
        return { ok: true, receipt: response.data };
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  const codes = cart?.items.map((item) => item.code) ?? [];

  const add = useCallback(
    (code: string) => save([...(cart?.items.map((item) => item.code) ?? []), code]),
    [cart, save],
  );
  const remove = useCallback(
    (code: string) =>
      save((cart?.items.map((item) => item.code) ?? []).filter((item) => item !== code)),
    [cart, save],
  );

  const snapshot: CartSnapshot | null = cart
    ? { codes, editable: cart.editable, blockedReason: cart.submitBlockedReason }
    : null;

  return (
    <CartContext
      value={{ state, cart, codes, snapshot, saving, reload, save, add, remove, submit }}
    >
      {children}
    </CartContext>
  );
}

/** Null outside the student area, so a shared component can render nothing. */
export function useCart(): CartContextValue | null {
  return use(CartContext);
}

/** Throws outside the provider; for pages that only exist inside it. */
export function useCartOrThrow(): CartContextValue {
  const context = use(CartContext);
  if (!context) {
    throw new Error('useCartOrThrow must be used inside a CartProvider');
  }
  return context;
}
