import { describe, expect, it } from 'vitest';
import { firstNameOf, greetingFor } from './greeting';

/** A local Date at the given hour, which is what the greeting reads. */
function at(hour: number): Date {
  return new Date(2026, 9, 5, hour, 30);
}

describe('greetingFor', () => {
  it('says morning until noon, afternoon until five, evening after that', () => {
    expect(greetingFor(at(0))).toBe('Good morning');
    expect(greetingFor(at(11))).toBe('Good morning');
    expect(greetingFor(at(12))).toBe('Good afternoon');
    expect(greetingFor(at(16))).toBe('Good afternoon');
    expect(greetingFor(at(17))).toBe('Good evening');
    expect(greetingFor(at(23))).toBe('Good evening');
  });
});

describe('firstNameOf', () => {
  it('greets someone by the first word of their name', () => {
    expect(firstNameOf('Aarav Sharma')).toBe('Aarav');
    expect(firstNameOf('Kabir Singh Kulkarni')).toBe('Kabir');
  });

  it('keeps a single-word name whole', () => {
    expect(firstNameOf('Meera')).toBe('Meera');
  });

  it('never returns an empty greeting for a name that is only spaces', () => {
    expect(firstNameOf('  ')).toBe('');
  });
});
