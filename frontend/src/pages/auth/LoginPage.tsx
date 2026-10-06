import type { LoginRequest } from '@course-reg/shared';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { useRef, useState, type ChangeEvent, type SubmitEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router';
import { Button } from '../../components/Button';
import { FormField } from '../../components/FormField';
import { Input } from '../../components/Input';
import { useAuth } from '../../hooks/useAuth';
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
import { AuthPanel } from './AuthPanel';
import styles from './LoginPage.module.css';

const NOTICES: Record<LoginNotice, string> = {
  'session-expired': 'Your session expired. Please sign in again.',
  'signed-out': 'You have been signed out.',
};

const INITIAL_VALUES: LoginRequest = { email: '', password: '' };

export function LoginPage() {
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

  return (
    <AuthPanel
      icon={LogIn}
      title="Sign in"
      variant="split"
      lead="Use your university e-mail address and password. Accounts are created by the registrar. If you have an invitation e-mail, open its link to set your password."
      notice={notice ? NOTICES[notice] : undefined}
      error={serverError}
      footer={
        <p>
          <Link to="/forgot-password">Forgot your password?</Link>
        </p>
      }
    >
      <form
        className={styles.form}
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
        noValidate
      >
        <FormField label="E-mail address" id="email" error={errors.email} required>
          {(control) => (
            <Input
              {...control}
              ref={emailRef}
              name="email"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={254}
              value={values.email}
              onChange={handleChange}
            />
          )}
        </FormField>

        <FormField label="Password" id="password" error={errors.password} required>
          {(control) => (
            <div className={styles.passwordRow}>
              <Input
                {...control}
                ref={passwordRef}
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                maxLength={PASSWORD_MAX_LENGTH}
                value={values.password}
                onChange={handleChange}
              />
              <Button
                variant="secondary"
                iconStart={showPassword ? EyeOff : Eye}
                aria-controls="password"
                aria-pressed={showPassword}
                onClick={() => {
                  setShowPassword((shown) => !shown);
                }}
              >
                {showPassword ? 'Hide password' : 'Show password'}
              </Button>
            </div>
          )}
        </FormField>

        <Button type="submit" variant="primary" fullWidth iconStart={LogIn} loading={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthPanel>
  );
}
