import type { EligibilityResult } from '@course-reg/shared';
import { describe, expect, it } from 'vitest';
import { cartActionFor, describeMove, moveItem, type CartSnapshot } from './cartActions';

const open: CartSnapshot = { codes: [], editable: true, blockedReason: null };
const eligible: EligibilityResult = { eligible: true };
const ineligible: EligibilityResult = {
  eligible: false,
  reasons: [{ type: 'SEMESTER_TOO_LOW', required: 7, actual: 3 }],
};

describe('cartActionFor', () => {
  it('draws nothing without a cart', () => {
    expect(cartActionFor('CS401', eligible, null)).toBeNull();
  });

  it('offers to add an eligible course that is not in the cart', () => {
    expect(cartActionFor('CS401', eligible, open)).toEqual({ kind: 'add' });
  });

  it('offers to remove a course already in the cart, with its rank', () => {
    const cart = { ...open, codes: ['CS402', 'CS401'] };
    expect(cartActionFor('CS401', eligible, cart)).toEqual({ kind: 'remove', rank: 2 });
  });

  it('explains ineligibility instead of offering an add button', () => {
    expect(cartActionFor('CS401', ineligible, open)).toEqual({
      kind: 'ineligible',
      reasons: [{ type: 'SEMESTER_TOO_LOW', required: 7, actual: 3 }],
    });
  });

  it('says the cart is full once five courses are ranked', () => {
    const cart = { ...open, codes: ['A', 'B', 'C', 'D', 'E'] };
    expect(cartActionFor('CS401', eligible, cart)).toEqual({ kind: 'full', max: 5 });
  });

  it('locks every course once the cart is submitted, including the ranked ones', () => {
    const cart: CartSnapshot = {
      codes: ['CS401'],
      editable: false,
      blockedReason: 'You have already submitted your preferences.',
    };
    const locked = { kind: 'locked', reason: 'You have already submitted your preferences.' };
    expect(cartActionFor('CS401', eligible, cart)).toEqual(locked);
    expect(cartActionFor('CS999', eligible, cart)).toEqual(locked);
  });
});

describe('moveItem', () => {
  it('moves an item up', () => {
    expect(moveItem(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'c', 'b']);
  });

  it('moves an item down', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
  });

  it('leaves the list alone when the target is outside it', () => {
    expect(moveItem(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
    expect(moveItem(['a', 'b'], 1, 2)).toEqual(['a', 'b']);
  });
});

describe('describeMove', () => {
  it('reads out the new position', () => {
    expect(describeMove('Cloud Security', 1, 3)).toBe('Cloud Security moved to choice 1 of 3.');
  });
});
