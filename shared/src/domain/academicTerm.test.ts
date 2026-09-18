import { describe, expect, it } from 'vitest';
import { addTerms, compareTerms, isAcademicTerm, parseTerm } from './academicTerm.js';

describe('academic terms', () => {
  it('validates the YYYY-SEASON format', () => {
    expect(isAcademicTerm('2026-FALL')).toBe(true);
    expect(isAcademicTerm('2026-SPRING')).toBe(true);
    expect(isAcademicTerm('2026-fall')).toBe(false);
    expect(isAcademicTerm('26-FALL')).toBe(false);
    expect(isAcademicTerm(2026)).toBe(false);
  });

  it('parses a term', () => {
    expect(parseTerm('2027-SPRING')).toEqual({ year: 2027, season: 'SPRING' });
  });

  it('orders spring before fall and years chronologically', () => {
    expect(compareTerms('2026-SPRING', '2026-FALL')).toBeLessThan(0);
    expect(compareTerms('2026-FALL', '2027-SPRING')).toBeLessThan(0);
    expect(compareTerms('2026-FALL', '2026-FALL')).toBe(0);
    expect(compareTerms('2028-SPRING', '2026-FALL')).toBeGreaterThan(0);
  });

  it('adds and subtracts whole terms', () => {
    expect(addTerms('2026-FALL', 1)).toBe('2027-SPRING');
    expect(addTerms('2026-FALL', 3)).toBe('2028-SPRING');
    expect(addTerms('2026-FALL', -1)).toBe('2026-SPRING');
    expect(addTerms('2026-SPRING', -3)).toBe('2024-FALL');
    expect(addTerms('2026-FALL', 0)).toBe('2026-FALL');
  });
});
