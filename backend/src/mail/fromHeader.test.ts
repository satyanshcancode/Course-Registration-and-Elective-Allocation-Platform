import { describe, expect, it } from 'vitest';
import { formatFromHeader } from './fromHeader.js';

describe('formatFromHeader', () => {
  it('pairs a bare address with the display name', () => {
    expect(formatFromHeader('no-reply@university.edu', 'Allocademy')).toBe(
      '"Allocademy" <no-reply@university.edu>',
    );
  });

  it('leaves a value that is already a whole header alone', () => {
    // What .env.example ships, and what existing .env files carry: wrapping it
    // again would nest one header inside another.
    expect(formatFromHeader('Allocademy <no-reply@university.edu>', 'University Registrar')).toBe(
      'Allocademy <no-reply@university.edu>',
    );
  });

  it('returns the address alone when no name is set', () => {
    expect(formatFromHeader('no-reply@university.edu', undefined)).toBe('no-reply@university.edu');
    expect(formatFromHeader('no-reply@university.edu', '   ')).toBe('no-reply@university.edu');
  });

  it('escapes a name that would otherwise break the header', () => {
    expect(formatFromHeader('no-reply@university.edu', 'Registrar, Admissions')).toBe(
      '"Registrar, Admissions" <no-reply@university.edu>',
    );
    expect(formatFromHeader('no-reply@university.edu', 'The "Big" U\\')).toBe(
      '"The \\"Big\\" U\\\\" <no-reply@university.edu>',
    );
  });

  it('trims either setting', () => {
    expect(formatFromHeader('  no-reply@university.edu  ', '  Allocademy  ')).toBe(
      '"Allocademy" <no-reply@university.edu>',
    );
  });
});
