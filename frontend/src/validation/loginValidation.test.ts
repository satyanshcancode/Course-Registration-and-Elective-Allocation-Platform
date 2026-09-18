import { describe, expect, it } from 'vitest';
import { firstInvalidField, hasErrors, validateLoginForm } from './loginValidation';

describe('validateLoginForm', () => {
  it('accepts a well-formed e-mail and password', () => {
    const errors = validateLoginForm({ email: ' admin@university.edu ', password: 'Admin@123' });
    expect(errors).toEqual({});
    expect(hasErrors(errors)).toBe(false);
  });

  it('requires both fields', () => {
    expect(validateLoginForm({ email: '', password: '' })).toEqual({
      email: 'Enter your e-mail address.',
      password: 'Enter your password.',
    });
  });

  it('rejects malformed e-mail addresses and over-long passwords', () => {
    expect(validateLoginForm({ email: 'admin@university', password: 'x'.repeat(129) })).toEqual({
      email: 'Enter a valid e-mail address, like name@university.edu.',
      password: 'Passwords are at most 128 characters.',
    });
  });

  it('falls back to the browser’s message when only native validation fails', () => {
    const errors = validateLoginForm(
      { email: 'a@b.co', password: 'secret' },
      { email: 'Browser says no.', password: '' },
    );
    expect(errors).toEqual({ email: 'Browser says no.' });
  });

  it('finds the first invalid field in form order', () => {
    expect(firstInvalidField({ password: 'x', email: 'y' })).toBe('email');
    expect(firstInvalidField({ password: 'x' })).toBe('password');
    expect(firstInvalidField({})).toBeUndefined();
  });
});
