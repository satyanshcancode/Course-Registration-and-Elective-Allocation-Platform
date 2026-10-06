import { describe, expect, it } from 'vitest';
import { COURSE_PHOTOS, hashCode, photoForCourse, photoUrlFor } from './coursePhoto';

describe('hashCode', () => {
  it('is stable, and different for different strings', () => {
    expect(hashCode('CSE')).toBe(hashCode('CSE'));
    expect(hashCode('CSE')).not.toBe(hashCode('ECE'));
  });

  it('stays a non-negative 32-bit integer', () => {
    for (const value of ['', 'A', 'CSE', 'a very long department name indeed']) {
      const hash = hashCode(value);
      expect(Number.isInteger(hash)).toBe(true);
      expect(hash).toBeGreaterThanOrEqual(0);
      expect(hash).toBeLessThanOrEqual(0xffffffff);
    }
  });
});

describe('photoForCourse', () => {
  it('always returns one of the photographs that exist', () => {
    for (const code of ['CS401', 'CS402', 'MA201', 'ME301', 'EC210']) {
      expect(COURSE_PHOTOS).toContain(photoForCourse(code));
    }
  });

  it('gives a course the same photograph every time, whatever the case', () => {
    expect(photoForCourse('CS401')).toBe(photoForCourse('cs401'));
  });

  it('spreads a catalogue over most of the set rather than repeating one', () => {
    const codes = Array.from({ length: 20 }, (_, i) => `CS${401 + i}`);
    const chosen = new Set(codes.map(photoForCourse));
    expect(chosen.size).toBeGreaterThanOrEqual(8);
  });
});

describe('photoUrlFor', () => {
  it('points at a file this repository serves, not at anyone else', () => {
    expect(photoUrlFor('CS401')).toMatch(/^\/course-photos\/[a-z-]+\.jpg$/);
  });
});
