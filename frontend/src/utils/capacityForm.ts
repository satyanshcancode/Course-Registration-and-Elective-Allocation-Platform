/** Client-side checks for the capacity form, on top of the input's native constraints. */
import { CAPACITY_LIMITS, CAPACITY_REASON_LENGTH } from '@course-reg/shared';

export interface CapacityFormValues {
  capacity: string;
  reason: string;
}

export type CapacityFormErrors = Partial<Record<keyof CapacityFormValues, string>>;

/** The offering's numbers the form is checked against. */
export interface CapacityContext {
  capacity: number;
  allocated: number;
}

/**
 * Every problem at once, keyed by field. The server checks the same rules
 * again (and the database CHECK last), so this is for fast, clear feedback.
 */
export function validateCapacityForm(
  values: CapacityFormValues,
  offering: CapacityContext,
): CapacityFormErrors {
  const errors: CapacityFormErrors = {};
  const text = values.capacity.trim();
  const capacity = Number(text);

  if (text === '') {
    errors.capacity = 'Enter the new capacity.';
  } else if (!/^\d+$/.test(text) || !Number.isSafeInteger(capacity)) {
    errors.capacity = 'Enter a whole number of seats.';
  } else if (capacity < offering.allocated) {
    errors.capacity = `Capacity can’t be lower than ${offering.allocated}: that many seats are already allocated.`;
  } else if (capacity > CAPACITY_LIMITS.max) {
    errors.capacity = `Capacity can be at most ${CAPACITY_LIMITS.max}.`;
  } else if (capacity === offering.capacity) {
    errors.capacity = `Capacity is already ${offering.capacity}.`;
  }

  const reason = values.reason.trim();
  if (reason.length < CAPACITY_REASON_LENGTH.min) {
    errors.reason = `Give a reason of at least ${CAPACITY_REASON_LENGTH.min} characters (it goes in the audit log).`;
  } else if (reason.length > CAPACITY_REASON_LENGTH.max) {
    errors.reason = `Keep the reason under ${CAPACITY_REASON_LENGTH.max} characters.`;
  }
  return errors;
}

export function hasErrors(errors: CapacityFormErrors): boolean {
  return Object.values(errors).some(Boolean);
}
