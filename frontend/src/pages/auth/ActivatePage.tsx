import { assessPassword, type ActivationCheck } from '@course-reg/shared';
import { KeyRound } from 'lucide-react';
import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router';
import { activateAccount, checkActivationToken, resetPassword } from '../../api/accountApi';
import { unwrap } from '../../api/unwrap';
import { Button } from '../../components/Button';
import { PasswordField } from '../../components/PasswordField';
import { Skeleton } from '../../components/Skeleton';
import { useAsync } from '../../hooks/useAsync';
import { useAuth } from '../../hooks/useAuth';
import { homePathFor } from '../../utils/authRedirects';
import { AuthPanel } from './AuthPanel';
import styles from './ActivatePage.module.css';

export interface ActivatePageProps {
  /**
   * Activation sets a first password; a reset replaces one. The mechanics are
   * identical, so one page serves both routes and only the words differ.
   */
  mode: 'activate' | 'reset';
}

const WORDS = {
  activate: {
    kicker: 'Welcome',
    title: 'Set your password',
    lead: 'Choose a password and you will be signed in straight away.',
    submit: 'Set password and sign in',
    submitting: 'Setting your password…',
  },
  reset: {
    kicker: 'Account recovery',
    title: 'Choose a new password',
    lead: 'Setting a new password signs you out on every other device.',
    submit: 'Save password and sign in',
    submitting: 'Saving your password…',
  },
} as const;

/**
 * The page an invitation or reset link opens.
 *
 * The link is checked BEFORE the form is drawn, so somebody arriving with a
 * spent or expired link is told so instead of typing a password for nothing.
 * The check answers the same way for an unknown, used and expired token, which
 * is why there is one message for all three.
 */
export function ActivatePage({ mode }: ActivatePageProps) {
  const words = WORDS[mode];
  const { state, adopt } = useAuth();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  const { state: check } = useAsync<ActivationCheck>(
    async (signal) =>
      token === ''
        ? { valid: false, reason: 'unusable' }
        : unwrap(await checkActivationToken(token, signal)),
    { key: token },
  );

  // The form is only worth focusing once the link is known to be usable.
  const usable = check.status === 'success' && check.data.valid;
  useEffect(() => {
    if (usable) {
      passwordRef.current?.focus();
    }
  }, [usable]);

  // Signed in — either already, or by the submit that just succeeded. There is
  // no "page they asked for" here: an invitation link is the start of a session,
  // so it always lands on their own home.
  if (state.status === 'authenticated') {
    return <Navigate to={homePathFor(state.user.role)} replace />;
  }

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setServerError(null);

    const assessment = assessPassword(password);
    if (!assessment.acceptable) {
      const message = assessment.suggestions[0] ?? 'Choose a longer password.';
      setFieldError(message);
      passwordRef.current?.focus();
      return;
    }
    setFieldError(undefined);

    setSubmitting(true);
    const response = await (mode === 'activate'
      ? activateAccount({ token, password })
      : resetPassword({ token, password }));
    setSubmitting(false);

    if (response.success) {
      // The server set the session cookie and returned the user; adopting it
      // makes the redirect above fire.
      adopt(response.data);
      return;
    }
    const field = response.errors?.find((error) => error.field === 'password');
    setFieldError(field?.message);
    setServerError(response.message);
    passwordRef.current?.focus();
  };

  if (check.status !== 'success' && check.status !== 'error') {
    return (
      <AuthPanel kicker={words.kicker} title={words.title}>
        <div className={styles.loading} aria-busy="true">
          <Skeleton width="60%" />
          <Skeleton width="100%" />
          <Skeleton width="40%" />
          <p className="visually-hidden">Checking your link…</p>
        </div>
      </AuthPanel>
    );
  }

  // Narrowed to 'success' from here, so `verdict` is a real ActivationCheck.
  const verdict = check.status === 'success' ? check.data : null;

  if (check.status === 'error' || !verdict?.valid) {
    return (
      <AuthPanel
        kicker={words.kicker}
        title="That link is no longer usable"
        error={
          check.status === 'error'
            ? check.message
            : 'It may have already been used, expired, or been replaced by a newer one.'
        }
        footer={
          <>
            <p>
              Ask for a new one: <Link to="/forgot-password">send me a new link</Link>.
            </p>
            <p>
              Already have a password? <Link to="/login">Sign in</Link>.
            </p>
          </>
        }
      >
        <p className={styles.help}>
          {mode === 'activate'
            ? 'Invitations last 48 hours, and a newer invitation always replaces an older one. If you have several e-mails, open the most recent. Otherwise the registrar can send you another.'
            : 'Reset links last 48 hours and work once. Requesting a new one is safe.'}
        </p>
      </AuthPanel>
    );
  }

  return (
    <AuthPanel
      kicker={words.kicker}
      title={words.title}
      lead={words.lead}
      error={serverError}
      notice={
        <>
          Setting the password for <strong>{verdict.email}</strong>.
          {mode === 'activate' &&
            ' Your programme, semester, credits and completed courses are maintained by the registrar, so there is nothing else to fill in.'}
        </>
      }
    >
      <form
        className={styles.form}
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
        noValidate
      >
        {/* Lets a password manager associate the saved password with this account. */}
        <input
          type="email"
          name="email"
          value={verdict.email}
          autoComplete="username"
          readOnly
          hidden
        />
        <PasswordField
          ref={passwordRef}
          id="new-password"
          label="New password"
          name="password"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          error={fieldError}
          showStrength
          required
        />
        <Button type="submit" variant="primary" fullWidth iconStart={KeyRound} loading={submitting}>
          {submitting ? words.submitting : words.submit}
        </Button>
      </form>
    </AuthPanel>
  );
}
