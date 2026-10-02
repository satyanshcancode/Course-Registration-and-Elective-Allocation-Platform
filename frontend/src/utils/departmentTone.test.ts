import { describe, expect, it } from 'vitest';
import { departmentTone, DEPARTMENT_TONES } from './departmentTone';

describe('departmentTone', () => {
  it('is stable for a code, and ignores case', () => {
    expect(departmentTone('CSE')).toBe(departmentTone('CSE'));
    expect(departmentTone('cse')).toBe(departmentTone('CSE'));
  });

  it('only ever returns a tone the stylesheet defines', () => {
    for (const code of ['CSE', 'ECE', 'ME', 'MATH', 'MGMT', '', 'X', 'VERY-LONG-CODE']) {
      expect(DEPARTMENT_TONES).toContain(departmentTone(code));
    }
  });

  it('spreads the seed’s five departments across different tones', () => {
    const tones = ['CSE', 'ECE', 'ME', 'MATH', 'MGMT'].map(departmentTone);
    // Not necessarily all five, but a hash that put them all on one colour
    // would make the spine useless.
    expect(new Set(tones).size).toBeGreaterThanOrEqual(3);
  });
});
