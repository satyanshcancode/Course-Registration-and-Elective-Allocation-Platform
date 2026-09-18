import type { LoginRequest } from '@course-reg/shared';

export type LoginField = keyof LoginRequest;

export type LoginFormErrors = Partial<Record<LoginField, string>>;

/** Same order as the form, so "first invalid field" is well defined. */
export const LOGIN_FIELDS: readonly LoginField[] = ['email', 'password'];

export const PASSWORD_MAX_LENGTH = 128;

export function isLoginField(value: string): value is LoginField {
  return (LOGIN_FIELDS as readonly string[]).includes(value);
}

// Deliberately simple: something@something.tld. The server validates properly.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email: string): string | undefined {
  const value = email.trim();
  if (value === '') {
    return 'Enter your e-mail address.';
  }
  if (!EMAIL_PATTERN.test(value)) {
    return 'Enter a valid e-mail address, like name@university.edu.';
  }
  return undefined;
}

export function validatePassword(password: string): string | undefined {
  if (password === '') {
    return 'Enter your password.';
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Passwords are at most ${PASSWORD_MAX_LENGTH} characters.`;
  }
  return undefined;
}

const VALIDATORS: Record<LoginField, (value: string) => string | undefined> = {
  email: validateEmail,
  password: validatePassword,
};

/**
 * TypeScript rules for the sign-in form. `nativeMessages` are the browser's
 * own constraint-validation messages (input.validationMessage); they are used
 * only when our rules pass, so native checks still apply but our wording wins.
 */
export function validateLoginForm(
  values: LoginRequest,
  nativeMessages: Partial<Record<LoginField, string>> = {},
): LoginFormErrors {
  return LOGIN_FIELDS.reduce<LoginFormErrors>((errors, field) => {
    const nativeMessage = nativeMessages[field];
    const message =
      VALIDATORS[field](values[field]) ?? (nativeMessage === '' ? undefined : nativeMessage);
    return message ? { ...errors, [field]: message } : errors;
  }, {});
}

export function firstInvalidField(errors: LoginFormErrors): LoginField | undefined {
  return LOGIN_FIELDS.find((field) => errors[field] !== undefined);
}

export function hasErrors(errors: LoginFormErrors): boolean {
  return firstInvalidField(errors) !== undefined;
}
