import { assessPassword, type ApiFieldError } from '@course-reg/shared';
import { KeyRound } from 'lucide-react';
import { useRef, useState, type SubmitEvent } from 'react';
import { changePassword } from '../api/accountApi';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { PageHeader } from '../components/PageHeader';
import { PasswordField } from '../components/PasswordField';
import { useToast } from '../components/Toast';
import { useAuth } from '../hooks/useAuth';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import styles from './AccountPage.module.css';

interface Errors {
  currentPassword?: string;
  newPassword?: string;
}

/**
 * The signed-in user's own account: who they are, and changing their password.
 *
 * One page for BOTH roles — an administrator changes their own password here
 * too — so it is registered under `/student/account` and `/admin/account` and
 * takes everything it shows from `useAuth`.
 *
 * A student's academic record is deliberately read-only here: programme,
 * semester, credits and completed courses are the registrar's to maintain, and
 * letting a student edit what decides their eligibility would undo the point of
 * the eligibility check.
 */
export function AccountPage() {
  useDocumentTitle('Account');
  const { state, adopt } = useAuth();
  const toast = useToast();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const currentRef = useRef<HTMLInputElement>(null);
  const newRef = useRef<HTMLInputElement>(null);

  if (state.status !== 'authenticated') {
    // The route guard means this cannot be reached; it keeps the type honest.
    return null;
  }
  const { user } = state;

  const focusFirst = (found: Errors) => {
    (found.currentPassword ? currentRef : newRef).current?.focus();
  };

  const readFieldErrors = (fieldErrors: ApiFieldError[] | undefined): Errors => {
    const found: Errors = {};
    for (const error of fieldErrors ?? []) {
      if (error.field === 'currentPassword' || error.field === 'newPassword') {
        found[error.field] = error.message;
      }
    }
    return found;
  };

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setServerError(null);

    const found: Errors = {};
    if (currentPassword === '') {
      found.currentPassword = 'Enter your current password.';
    }
    const assessment = assessPassword(newPassword);
    if (!assessment.acceptable) {
      found.newPassword = assessment.suggestions[0] ?? 'Choose a longer password.';
    } else if (newPassword === currentPassword) {
      found.newPassword = 'The new password must be different from the current one.';
    }
    setErrors(found);
    if (found.currentPassword ?? found.newPassword) {
      focusFirst(found);
      return;
    }

    setSubmitting(true);
    const response = await changePassword({ currentPassword, newPassword });
    setSubmitting(false);

    if (response.success) {
      // The change invalidated every session issued earlier, including this
      // one; the response carried a fresh cookie, so adopting it keeps this
      // device signed in while the others are signed out.
      adopt(response.data);
      setCurrentPassword('');
      setNewPassword('');
      setErrors({});
      toast.show({
        tone: 'success',
        title: 'Password changed',
        message: 'You are still signed in here. Every other device has been signed out.',
      });
      return;
    }

    const fieldErrors = readFieldErrors(response.errors);
    setErrors(fieldErrors);
    if (fieldErrors.currentPassword ?? fieldErrors.newPassword) {
      focusFirst(fieldErrors);
    } else {
      setServerError(response.message);
      currentRef.current?.focus();
    }
  };

  return (
    <>
      <PageHeader
        title="Account"
        kicker={user.role === 'ADMIN' ? 'Registrar staff' : 'Your account'}
        description="Who you are signed in as, and your password."
      />

      <div className={styles.body}>
        <Card title="Signed in as">
          <dl className={styles.record}>
            <div className={styles.entry}>
              <dt>E-mail</dt>
              <dd>{user.email}</dd>
            </div>
            <div className={styles.entry}>
              <dt>Role</dt>
              <dd>{user.role === 'ADMIN' ? 'Administrator' : 'Student'}</dd>
            </div>
            {user.role === 'STUDENT' && (
              <>
                <div className={styles.entry}>
                  <dt>Name</dt>
                  <dd>{user.student.name}</dd>
                </div>
                <div className={styles.entry}>
                  <dt>Roll number</dt>
                  <dd className={styles.mono}>{user.student.rollNumber}</dd>
                </div>
                <div className={styles.entry}>
                  <dt>Programme</dt>
                  <dd>
                    {user.student.program.name}{' '}
                    <span className={styles.muted}>({user.student.program.code})</span>
                  </dd>
                </div>
                <div className={styles.entry}>
                  <dt>Semester</dt>
                  <dd>
                    {user.student.semester}{' '}
                    <span className={styles.muted}>
                      · {user.student.creditsCompleted} credits completed
                    </span>
                  </dd>
                </div>
              </>
            )}
          </dl>
          {user.role === 'STUDENT' && (
            <p className={styles.note}>
              Your academic record is maintained by the registrar. If anything here is wrong, ask
              them to correct it — it is what your eligibility is judged on.
            </p>
          )}
        </Card>

        <Card title="Change password">
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
            <PasswordField
              ref={currentRef}
              id="current-password"
              label="Current password"
              name="currentPassword"
              autoComplete="current-password"
              value={currentPassword}
              onChange={setCurrentPassword}
              error={errors.currentPassword}
              required
            />
            <PasswordField
              ref={newRef}
              id="new-password"
              label="New password"
              name="newPassword"
              autoComplete="new-password"
              value={newPassword}
              onChange={setNewPassword}
              error={errors.newPassword}
              hint="Changing it signs you out on every other device."
              showStrength
              required
            />
            <div className={styles.actions}>
              <Button type="submit" variant="primary" iconStart={KeyRound} loading={submitting}>
                {submitting ? 'Changing password…' : 'Change password'}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
