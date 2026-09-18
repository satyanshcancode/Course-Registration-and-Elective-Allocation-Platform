import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PREFERENCE_PRIORITY_CONFIG,
  FCFS_CONFIG,
  isAllocationConfig,
  isPreferencePriorityConfig,
  type AllocationConfig,
} from './allocationConfig.js';

describe('isAllocationConfig', () => {
  it('accepts both config variants', () => {
    expect(isAllocationConfig(FCFS_CONFIG)).toBe(true);
    expect(isAllocationConfig(DEFAULT_PREFERENCE_PRIORITY_CONFIG)).toBe(true);
  });

  it('accepts a config that went through JSON (string rank keys)', () => {
    const roundTripped: unknown = JSON.parse(JSON.stringify(DEFAULT_PREFERENCE_PRIORITY_CONFIG));
    expect(isAllocationConfig(roundTripped)).toBe(true);
  });

  it('rejects unknown methods, missing fields and negative points', () => {
    expect(isAllocationConfig(null)).toBe(false);
    expect(isAllocationConfig({ method: 'LOTTERY' })).toBe(false);
    expect(isAllocationConfig({ method: 'PREFERENCE_PRIORITY' })).toBe(false);
    expect(
      isAllocationConfig({
        ...DEFAULT_PREFERENCE_PRIORITY_CONFIG,
        preferenceWeights: { 1: 100, 2: 80, 3: 60, 4: 40 },
      }),
    ).toBe(false);
    expect(
      isAllocationConfig({
        ...DEFAULT_PREFERENCE_PRIORITY_CONFIG,
        priorityPoints: { finalYear: -5, programRelevance: 25, graduationUrgency: 40 },
      }),
    ).toBe(false);
  });
});

describe('isPreferencePriorityConfig', () => {
  it('narrows on the method discriminant', () => {
    const configs: AllocationConfig[] = [FCFS_CONFIG, DEFAULT_PREFERENCE_PRIORITY_CONFIG];
    const weights = configs.filter(isPreferencePriorityConfig).map((c) => c.preferenceWeights[1]);
    expect(weights).toEqual([100]);
  });
});
