/**
 * The admin registration-window form: converting between the API's DTO and
 * the shape the controls need, and the checks that run before saving.
 *
 * The policy is held as the shared `AllocationConfig` union itself, so the
 * form renders whatever the chosen method actually needs — no optional fields
 * that only apply "sometimes", and no casts.
 */
import {
  DEFAULT_PREFERENCE_PRIORITY_CONFIG,
  FCFS_CONFIG,
  isAcademicTerm,
  isPreferencePriorityConfig,
  POLICY_POINT_LIMITS,
  PREFERENCE_RANKS,
  RANDOM_SEED_LIMITS,
  WINDOW_NAME_LENGTH,
  type AdminWindowDetail,
  type AllocationConfig,
  type AllocationMethod,
  type PreferenceRank,
  type UpdateWindowRequest,
} from '@course-reg/shared';

export interface WindowFormValues {
  name: string;
  term: string;
  /** "YYYY-MM-DDTHH:mm", the value a datetime-local input uses. */
  startsAt: string;
  endsAt: string;
  courseCodes: string[];
  policy: AllocationConfig;
  randomSeed: number;
}

export type WindowFormErrors = Partial<Record<keyof WindowFormValues | 'form', string>>;

/** A datetime-local value in the browser's own time zone. */
export function toDateTimeLocal(isoDateTime: string): string {
  const date = new Date(isoDateTime);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Back to an ISO instant; the browser reads the value as local time. */
export function fromDateTimeLocal(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

export function toFormValues(detail: AdminWindowDetail): WindowFormValues {
  return {
    name: detail.window?.name ?? '',
    term: detail.window?.term ?? '',
    startsAt: detail.window ? toDateTimeLocal(detail.window.startsAt) : '',
    endsAt: detail.window ? toDateTimeLocal(detail.window.endsAt) : '',
    courseCodes: detail.courses.filter((course) => course.offered).map((course) => course.code),
    policy: detail.policy ?? DEFAULT_PREFERENCE_PRIORITY_CONFIG,
    randomSeed: detail.randomSeed ?? 0,
  };
}

export function toUpdateRequest(values: WindowFormValues, reason?: string): UpdateWindowRequest {
  const term = values.term.trim().toUpperCase();
  // validateWindowForm runs first and reports this to the admin; reaching here
  // with a bad term would be a bug, not user input.
  if (!isAcademicTerm(term)) {
    throw new Error(`Invalid academic term: ${term}`);
  }
  const request: UpdateWindowRequest = {
    name: values.name.trim(),
    term,
    startsAt: fromDateTimeLocal(values.startsAt),
    endsAt: fromDateTimeLocal(values.endsAt),
    courseCodes: values.courseCodes,
    policy: values.policy,
    randomSeed: values.randomSeed,
  };
  if (reason?.trim()) {
    request.reason = reason.trim();
  }
  return request;
}

/** Switching method keeps nothing from the other one: the unions don't overlap. */
export function policyForMethod(
  method: AllocationMethod,
  current: AllocationConfig,
): AllocationConfig {
  if (method === current.method) {
    return current;
  }
  return method === 'FCFS' ? FCFS_CONFIG : DEFAULT_PREFERENCE_PRIORITY_CONFIG;
}

export function withWeight(
  policy: AllocationConfig,
  rank: PreferenceRank,
  value: number,
): AllocationConfig {
  if (!isPreferencePriorityConfig(policy)) {
    return policy;
  }
  return { ...policy, preferenceWeights: { ...policy.preferenceWeights, [rank]: value } };
}

export function withPriorityPoint(
  policy: AllocationConfig,
  key: keyof (typeof DEFAULT_PREFERENCE_PRIORITY_CONFIG)['priorityPoints'],
  value: number,
): AllocationConfig {
  if (!isPreferencePriorityConfig(policy)) {
    return policy;
  }
  return { ...policy, priorityPoints: { ...policy.priorityPoints, [key]: value } };
}

/** P1 >= P2 >= … >= P5, checked live as the admin types. */
export function firstIncreasingRank(policy: AllocationConfig): PreferenceRank | null {
  if (!isPreferencePriorityConfig(policy)) {
    return null;
  }
  const rise = PREFERENCE_RANKS.find((rank, index) => {
    const previous = PREFERENCE_RANKS[index - 1];
    return (
      previous !== undefined && policy.preferenceWeights[rank] > policy.preferenceWeights[previous]
    );
  });
  return rise ?? null;
}

function inRange(value: number): boolean {
  return (
    Number.isInteger(value) && value >= POLICY_POINT_LIMITS.min && value <= POLICY_POINT_LIMITS.max
  );
}

/** Every problem at once, keyed by field. The server checks all of it again. */
export function validateWindowForm(values: WindowFormValues): WindowFormErrors {
  const errors: WindowFormErrors = {};

  const name = values.name.trim();
  if (name.length < WINDOW_NAME_LENGTH.min) {
    errors.name = `Use at least ${WINDOW_NAME_LENGTH.min} characters.`;
  } else if (name.length > WINDOW_NAME_LENGTH.max) {
    errors.name = `Keep the name under ${WINDOW_NAME_LENGTH.max} characters.`;
  }

  if (!isAcademicTerm(values.term.trim().toUpperCase())) {
    errors.term = 'Use a term like 2026-FALL.';
  }

  const startsAt = Date.parse(fromDateTimeLocal(values.startsAt));
  const endsAt = Date.parse(fromDateTimeLocal(values.endsAt));
  if (Number.isNaN(startsAt)) {
    errors.startsAt = 'Choose when registration opens.';
  }
  if (Number.isNaN(endsAt)) {
    errors.endsAt = 'Choose when registration closes.';
  } else if (!Number.isNaN(startsAt) && endsAt <= startsAt) {
    errors.endsAt = 'Registration must close after it opens.';
  }

  if (values.courseCodes.length === 0) {
    errors.courseCodes = 'Choose at least one course to offer.';
  }

  if (isPreferencePriorityConfig(values.policy)) {
    const { preferenceWeights, priorityPoints } = values.policy;
    const rise = firstIncreasingRank(values.policy);
    if (!PREFERENCE_RANKS.every((rank) => inRange(preferenceWeights[rank]))) {
      errors.policy = `Every preference weight must be a whole number between ${POLICY_POINT_LIMITS.min} and ${POLICY_POINT_LIMITS.max}.`;
    } else if (rise !== null) {
      errors.policy = `P${rise} can’t be worth more than P${rise - 1}: a lower choice must never score higher.`;
    } else if (!Object.values(priorityPoints).every(inRange)) {
      errors.policy = `Every priority bonus must be a whole number between ${POLICY_POINT_LIMITS.min} and ${POLICY_POINT_LIMITS.max}.`;
    }
  }

  if (
    !Number.isInteger(values.randomSeed) ||
    values.randomSeed < RANDOM_SEED_LIMITS.min ||
    values.randomSeed > RANDOM_SEED_LIMITS.max
  ) {
    errors.randomSeed = 'The seed must be a whole number between 0 and 4294967295.';
  }

  return errors;
}

export function hasWindowErrors(errors: WindowFormErrors): boolean {
  return Object.values(errors).some(Boolean);
}

/** A fresh tie-break seed, in the range the database accepts. */
export function newRandomSeed(): number {
  return Math.floor(Math.random() * (RANDOM_SEED_LIMITS.max + 1));
}
