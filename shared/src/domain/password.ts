/**
 * The one password policy, used by the strength hint the student sees while
 * typing and by the zod schema the server validates with. Keeping it here means
 * the hint can never promise something the server then refuses.
 */

/** Long enough to resist guessing; length is the only hard requirement. */
export const PASSWORD_MIN_LENGTH = 10;

/** bcrypt only reads the first 72 bytes, and huge inputs are a DoS vector. */
export const PASSWORD_MAX_LENGTH = 128;

export const PASSWORD_STRENGTHS = ['too-short', 'weak', 'fair', 'strong'] as const;
export type PasswordStrength = (typeof PASSWORD_STRENGTHS)[number];

export interface PasswordAssessment {
  strength: PasswordStrength;
  /** Whether the server will accept it at all. */
  acceptable: boolean;
  /** What would make it stronger, in plain English. Empty when strong. */
  suggestions: string[];
}

/** The four things that make a password harder to guess, beyond its length. */
function varietyOf(password: string): number {
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/];
  return classes.filter((pattern) => pattern.test(password)).length;
}

/**
 * Advisory only: the strength is a hint, never a gate. Anything at least
 * PASSWORD_MIN_LENGTH characters long is accepted, because rules that force
 * particular characters push people towards predictable substitutions.
 */
export function assessPassword(password: string): PasswordAssessment {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return {
      strength: 'too-short',
      acceptable: false,
      suggestions: [`Use at least ${PASSWORD_MIN_LENGTH} characters.`],
    };
  }

  const variety = varietyOf(password);
  const suggestions: string[] = [];
  if (password.length < 16) {
    suggestions.push('A longer password, or a phrase of a few words, is harder to guess.');
  }
  if (variety < 3) {
    suggestions.push('Mixing upper and lower case, numbers or punctuation helps.');
  }

  // Length carries more weight than variety, which is how guessing actually works.
  const strength: PasswordStrength =
    password.length >= 16 || (password.length >= 12 && variety >= 3)
      ? 'strong'
      : password.length >= 12 || variety >= 3
        ? 'fair'
        : 'weak';

  return { strength, acceptable: true, suggestions: strength === 'strong' ? [] : suggestions };
}
