/**
 * What the cart button on a course should offer, decided in one place so the
 * catalogue cards, the catalogue table and the course detail page can never
 * disagree.
 *
 * Nothing here is authorisation: the server re-checks eligibility, the window
 * and the limit on every save. This only decides what to draw.
 */
import {
  MAX_PREFERENCES,
  type EligibilityResult,
  type IneligibilityReason,
} from '@course-reg/shared';

/** The data-action a delegated click carries. */
export const CART_ACTIONS = { add: 'cart-add', remove: 'cart-remove' } as const;

export type CartAction =
  | { kind: 'add' }
  | { kind: 'remove'; rank: number }
  | { kind: 'full'; max: number }
  | { kind: 'ineligible'; reasons: readonly IneligibilityReason[] }
  | { kind: 'locked'; reason: string };

/** The parts of the loaded cart this decision needs. */
export interface CartSnapshot {
  /** Course codes in rank order. */
  codes: readonly string[];
  editable: boolean;
  /** Why the cart is locked, in the student's words. */
  blockedReason: string | null;
}

/**
 * `null` when there is no cart to act on at all (an admin, or the window has
 * not been published), which means: draw nothing.
 */
export function cartActionFor(
  code: string,
  eligibility: EligibilityResult | undefined,
  cart: CartSnapshot | null,
): CartAction | null {
  if (!cart) {
    return null;
  }
  const rank = cart.codes.indexOf(code) + 1;
  if (rank > 0) {
    return cart.editable
      ? { kind: 'remove', rank }
      : { kind: 'locked', reason: cart.blockedReason ?? 'Your preferences are locked.' };
  }
  if (!cart.editable) {
    return { kind: 'locked', reason: cart.blockedReason ?? 'Your preferences are locked.' };
  }
  if (eligibility && !eligibility.eligible) {
    return { kind: 'ineligible', reasons: eligibility.reasons };
  }
  if (cart.codes.length >= MAX_PREFERENCES) {
    return { kind: 'full', max: MAX_PREFERENCES };
  }
  return { kind: 'add' };
}

/** Moves the item at `from` one place towards `to`, returning a new array. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const moved = [...items];
  const [item] = moved.splice(from, 1);
  if (item === undefined || to < 0 || to >= items.length) {
    return [...items];
  }
  moved.splice(to, 0, item);
  return moved;
}

/** "Cloud Security moved to choice 1 of 3." — read out after a reorder. */
export function describeMove(name: string, rank: number, total: number): string {
  return `${name} moved to choice ${rank} of ${total}.`;
}
