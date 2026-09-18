import type { LoginRequest } from '@course-reg/shared';
import { useRef, useState, type ChangeEvent, type SubmitEvent } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from '../../hooks/useAuth';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import type { LoginNotice } from '../../types/auth';
import { postLoginPath, readLoginLocationState } from '../../utils/authRedirects';
import {
  firstInvalidField,
  hasErrors,
  isLoginField,
  PASSWORD_MAX_LENGTH,
  validateLoginForm,
  type LoginField,
  type LoginFormErrors,
} from '../../validation/loginValidation';
import styles from './LoginPage.module.css';

const NOTICES: Record<LoginNotice, string> = {
  'session-expired': 'Your session expired. Please sign in again.',
  'signed-out': 'You have been signed out.',
};

const INITIAL_VALUES: LoginRequest = { email: '', password: '' };

export function LoginPage() {
  useDocumentTitle('Sign in');
  const { state, login } = useAuth();
  const { from, notice } = readLoginLocationState(useLocation().state);

  const [values, setValues] = useState<LoginRequest>(INITIAL_VALUES);
  const [errors, setErrors] = useState<LoginFormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  // Already signed in, or just signed in: go to the requested page or home.
  if (state.status === 'authenticated') {
    return <Navigate to={postLoginPath(state.user.role, from)} replace />;
  }

  // Called from event handlers only (refs are never read during render).
  const inputFor = (field: LoginField) => (field === 'email' ? emailRef : passwordRef).current;

  const focusFirstInvalid = (found: LoginFormErrors) => {
    const field = firstInvalidField(found);
    if (field) {
      inputFor(field)?.focus();
    }
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const field = event.target.name as LoginField;
    const next = { ...values, [field]: event.target.value };
    setValues(next);
    // Once a field has an error, re-check it as the user types.
    if (errors[field]) {
      setErrors((current) => ({ ...current, [field]: validateLoginForm(next)[field] }));
    }
  };

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setServerError(null);

    const found = validateLoginForm(values, {
      email: inputFor('email')?.validationMessage,
      password: inputFor('password')?.validationMessage,
    });
    setErrors(found);
    if (hasErrors(found)) {
      focusFirstInvalid(found);
      return;
    }

    setSubmitting(true);
    const response = await login({ email: values.email.trim(), password: values.password });
    setSubmitting(false);

    if (response.success) {
      return; // AuthProvider now holds the user; the <Navigate> above takes over.
    }
    const fieldErrors: LoginFormErrors = {};
    for (const error of response.errors ?? []) {
      if (isLoginField(error.field)) {
        fieldErrors[error.field] = error.message;
      }
    }
    setErrors(fieldErrors);
    setServerError(response.message);
    if (hasErrors(fieldErrors)) {
      focusFirstInvalid(fieldErrors);
    } else {
      inputFor('password')?.focus();
    }
  };

  const describedBy = (field: LoginField) => (errors[field] ? `${field}-error` : undefined);

  return (
    <section className={styles.page} aria-labelledby="login-title">
      <h1 id="login-title">Sign in</h1>
      <p className={styles.lead}>Use your university e-mail address and password.</p>

      {notice && (
        <p className={styles.notice} role="status">
          {NOTICES[notice]}
        </p>
      )}

      <div className={styles.alert} role="alert">
        {serverError && <p>{serverError}</p>}
      </div>

      <form
        className={styles.form}
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
        noValidate
      >
        <div className={styles.field}>
          <label htmlFor="email">E-mail address</label>
          <input
            ref={emailRef}
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            maxLength={254}
            value={values.email}
            onChange={handleChange}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={describedBy('email')}
          />
          {errors.email && (
            <p id="email-error" className={styles.error}>
              {errors.email}
            </p>
          )}
        </div>

        <div className={styles.field}>
          <label htmlFor="password">Password</label>
          <div className={styles.passwordRow}>
            <input
              ref={passwordRef}
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              maxLength={PASSWORD_MAX_LENGTH}
              value={values.password}
              onChange={handleChange}
              aria-invalid={errors.password ? true : undefined}
              aria-describedby={describedBy('password')}
            />
            <button
              type="button"
              className={styles.toggle}
              aria-controls="password"
              aria-pressed={showPassword}
              onClick={() => {
                setShowPassword((shown) => !shown);
              }}
            >
              {showPassword ? 'Hide password' : 'Show password'}
            </button>
          </div>
          {errors.password && (
            <p id="password-error" className={styles.error}>
              {errors.password}
            </p>
          )}
        </div>

        <button type="submit" className={styles.submit} disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </section>
  );
}
