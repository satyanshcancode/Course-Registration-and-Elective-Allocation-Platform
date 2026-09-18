import { PREFERENCE_RANKS, type PreferenceRank } from './enums.js';

/** Points awarded for ranking a course at a given position (P1..P5). */
export type PreferenceWeights = Record<PreferenceRank, number>;

/** Mock priority bonuses added on top of the preference weight. */
export interface PriorityPoints {
  finalYear: number;
  programRelevance: number;
  graduationUrgency: number;
}

/** First-come-first-served baseline: ordered by server-side submission sequence. */
export interface FcfsAllocationConfig {
  method: 'FCFS';
}

/** score = preferenceWeights[rank] + applicable priorityPoints; ties broken by seeded RNG. */
export interface PreferencePriorityAllocationConfig {
  method: 'PREFERENCE_PRIORITY';
  preferenceWeights: PreferenceWeights;
  priorityPoints: PriorityPoints;
}

/** Discriminated on `method`; stored as JSONB in registration_windows.config. */
export type AllocationConfig = FcfsAllocationConfig | PreferencePriorityAllocationConfig;

export const DEFAULT_PREFERENCE_WEIGHTS: PreferenceWeights = {
  1: 100,
  2: 80,
  3: 60,
  4: 40,
  5: 20,
};

export const DEFAULT_PRIORITY_POINTS: PriorityPoints = {
  finalYear: 20,
  programRelevance: 25,
  graduationUrgency: 40,
};

export const DEFAULT_PREFERENCE_PRIORITY_CONFIG: PreferencePriorityAllocationConfig = {
  method: 'PREFERENCE_PRIORITY',
  preferenceWeights: DEFAULT_PREFERENCE_WEIGHTS,
  priorityPoints: DEFAULT_PRIORITY_POINTS,
};

export const FCFS_CONFIG: FcfsAllocationConfig = { method: 'FCFS' };

/** Narrows a known config to the preference-priority variant. */
export function isPreferencePriorityConfig(
  config: AllocationConfig,
): config is PreferencePriorityAllocationConfig {
  return config.method === 'PREFERENCE_PRIORITY';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isPreferenceWeights(value: unknown): value is PreferenceWeights {
  // JSON object keys are strings, so rank 1 arrives as "1".
  return isRecord(value) && PREFERENCE_RANKS.every((rank) => isNonNegativeNumber(value[rank]));
}

function isPriorityPoints(value: unknown): value is PriorityPoints {
  return (
    isRecord(value) &&
    isNonNegativeNumber(value.finalYear) &&
    isNonNegativeNumber(value.programRelevance) &&
    isNonNegativeNumber(value.graduationUrgency)
  );
}

/** Runtime check for untrusted input, e.g. a JSONB column or a request body. */
export function isAllocationConfig(value: unknown): value is AllocationConfig {
  if (!isRecord(value)) {
    return false;
  }
  switch (value.method) {
    case 'FCFS':
      return true;
    case 'PREFERENCE_PRIORITY':
      return isPreferenceWeights(value.preferenceWeights) && isPriorityPoints(value.priorityPoints);
    default:
      return false;
  }
}
