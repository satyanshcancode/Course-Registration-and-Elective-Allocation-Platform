import { Mail } from 'lucide-react';
import { useRef, useState, type ChangeEvent, type SubmitEvent } from 'react';
import { Link } from 'react-router';
import { requestPasswordReset } from '../../api/accountApi';
import { Button } from '../../components/Button';
import { FormField } from '../../components/FormField';
import { Input } from '../../components/Input';
import { AuthPanel } from './AuthPanel';
import styles from './ForgotPasswordPage.module.css';

/** Mirrors the server's e-mail rule closely enough to catch a typo. */
function emailProblem(email: string): string | undefined {
  const trimmed = email.trim();
  if (trimmed === '') {
    return 'Enter your e-mail address.';
  }
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed) ? undefined : 'Enter a valid e-mail address.';
}

/**
 * Asks for a password reset link.
 *
 * **The answer never says whether the address exists.** The server replies with
 * one message either way, and this page shows exactly that message — so the
 * page cannot leak what the endpoint refuses to. That is also why the success
 * state replaces the form rather than sitting beside it: there is nothing to
 * retry differently, and inviting a second guess is the whole attack.
 */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const [serverError, setServerError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setEmail(event.target.value);
    if (fieldError) {
      setFieldError(emailProblem(event.target.value));
    }
  };

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setServerError(null);

    const problem = emailProblem(email);
    if (problem) {
      setFieldError(problem);
      emailRef.current?.focus();
      return;
    }
    setFieldError(undefined);

    setSubmitting(true);
    const response = await requestPasswordReset({ email: email.trim() });
    setSubmitting(false);

    if (response.success) {
      // The server's own wording, which is identical for a known and an
      // unknown address.
      setSent(response.message ?? 'If that address belongs to an account, a link is on its way.');
      return;
    }
    setServerError(response.message);
  };

  if (sent !== null) {
    return (
      <AuthPanel
        kicker="Account recovery"
        title="Check your inbox"
        notice={sent}
        footer={
          <p>
            <Link to="/login">Back to sign in</Link>
          </p>
        }
      >
        <div className={styles.sent}>
          <p className={styles.help}>
            The link works once and expires in 48 hours. If nothing arrives, check the spam folder —
            and if your account was created recently, look for the invitation e-mail instead.
          </p>
          <p className={styles.help}>Still stuck? The registrar can send you a new invitation.</p>
        </div>
      </AuthPanel>
    );
  }

  return (
    <AuthPanel
      kicker="Account recovery"
      title="Forgot your password?"
      lead="Enter your university e-mail address and we will send you a link to choose a new password."
      error={serverError}
      footer={
        <p>
          Remembered it? <Link to="/login">Sign in</Link>.
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
        <FormField label="E-mail address" id="email" error={fieldError} required>
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
              value={email}
              onChange={handleChange}
            />
          )}
        </FormField>
        <Button type="submit" variant="primary" fullWidth iconStart={Mail} loading={submitting}>
          {submitting ? 'Sending…' : 'Send me a link'}
        </Button>
      </form>
    </AuthPanel>
  );
}
