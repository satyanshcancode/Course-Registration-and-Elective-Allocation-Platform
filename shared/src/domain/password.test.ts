import { describe, expect, it } from 'vitest';
import { assessPassword, PASSWORD_MIN_LENGTH } from './password.js';

describe('assessPassword', () => {
  it('refuses anything shorter than the minimum, and says the minimum', () => {
    const assessment = assessPassword('a'.repeat(PASSWORD_MIN_LENGTH - 1));
    expect(assessment).toEqual({
      strength: 'too-short',
      acceptable: false,
      suggestions: [`Use at least ${PASSWORD_MIN_LENGTH} characters.`],
    });
  });

  it('accepts a password of exactly the minimum length', () => {
    expect(assessPassword('a'.repeat(PASSWORD_MIN_LENGTH)).acceptable).toBe(true);
  });

  it('accepts a long, single-case password without demanding punctuation', () => {
    const assessment = assessPassword('correcthorsebatterystaple');
    expect(assessment).toEqual({ strength: 'strong', acceptable: true, suggestions: [] });
  });

  it('rates length above variety', () => {
    // 10 characters with three classes is only fair; 16 plain ones are strong.
    expect(assessPassword('Ab3defghij').strength).toBe('fair');
    expect(assessPassword('abcdefghijklmnop').strength).toBe('strong');
  });

  it('calls a short, single-case password weak and says what would help', () => {
    const assessment = assessPassword('abcdefghij');
    expect(assessment.strength).toBe('weak');
    expect(assessment.acceptable).toBe(true);
    expect(assessment.suggestions).toHaveLength(2);
  });

  it('counts a mix of cases, digits and punctuation as variety', () => {
    expect(assessPassword('Passw0rd!x12').strength).toBe('strong');
  });

  it('never suggests anything about a password it calls strong', () => {
    for (const password of ['correcthorsebatterystaple', 'Passw0rd!x12']) {
      expect(assessPassword(password).suggestions).toEqual([]);
    }
  });
});
