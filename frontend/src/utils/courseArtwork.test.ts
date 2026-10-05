import { describe, expect, it } from 'vitest';
import { ARTWORK_MOTIFS, hashCode, HUE_SPREAD, hueFor, motifForCourse } from './courseArtwork';

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

describe('hueFor', () => {
  it('is a hue angle, and the same every time', () => {
    const hue = hueFor('CSE', 'CS401');
    expect(hue).toBe(hueFor('cse', 'cs401'));
    expect(hue).toBeGreaterThanOrEqual(0);
    expect(hue).toBeLessThan(360);
  });

  it('keeps a department together: every course sits within the spread', () => {
    const centre = hashCode('CSE') % 360;
    for (const code of ['CS401', 'CS402', 'CS403', 'CS404', 'CS405', 'CS406']) {
      // Distance measured the short way round the colour wheel.
      const distance = Math.min(
        Math.abs(hueFor('CSE', code) - centre),
        360 - Math.abs(hueFor('CSE', code) - centre),
      );
      expect(distance).toBeLessThanOrEqual(HUE_SPREAD);
    }
  });

  it('gives two departments different colours', () => {
    expect(hueFor('CSE', 'CS401')).not.toBe(hueFor('MATH', 'CS401'));
  });
});

describe('motifForCourse', () => {
  it('always returns one of the motifs, stably', () => {
    expect(motifForCourse('CS401')).toBe(motifForCourse('cs401'));
    for (const code of ['CS401', 'CS402', 'MA201', 'EC301', 'ME101']) {
      expect(ARTWORK_MOTIFS).toContain(motifForCourse(code));
    }
  });

  it('does not draw a whole department with one motif', () => {
    const motifs = new Set(
      ['CS401', 'CS402', 'CS403', 'CS404', 'CS405', 'CS406'].map(motifForCourse),
    );
    expect(motifs.size).toBeGreaterThan(1);
  });
});
