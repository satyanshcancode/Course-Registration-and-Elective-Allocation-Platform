import {
  isPreferencePriorityConfig,
  PREFERENCE_RANKS,
  type AdminWindowDetail,
  type AllocationConfig,
} from '@course-reg/shared';
import { CalendarClock, Lock, LockOpen } from 'lucide-react';
import { useState } from 'react';
import {
  closeRegistrationWindow,
  getRegistrationWindow,
  openRegistrationWindow,
} from '../../api/adminApi';
import { unwrap } from '../../api/unwrap';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { ErrorMessage } from '../../components/ErrorMessage';
import { FormField } from '../../components/FormField';
import { Icon } from '../../components/Icon';
import { PageHeader } from '../../components/PageHeader';
import { Skeleton } from '../../components/Skeleton';
import { StatusBadge } from '../../components/StatusBadge';
import { Textarea } from '../../components/Textarea';
import { useToast } from '../../components/Toast';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { formatDateTime } from '../../utils/formatDate';
import { WindowPolicyForm } from './window/WindowPolicyForm';
import styles from './RegistrationWindowPage.module.css';

type WindowAction = 'open' | 'close';

const ACTION_COPY: Readonly<
  Record<WindowAction, { title: string; confirmLabel: string; button: string }>
> = {
  open: {
    title: 'Open registration?',
    confirmLabel: 'Open registration',
    button: 'Open registration',
  },
  close: {
    title: 'Close registration?',
    confirmLabel: 'Close registration',
    button: 'Close registration',
  },
};

export function RegistrationWindowPage() {
  useDocumentTitle('Registration window');
  const { state, retry } = useAsync(async (signal) => unwrap(await getRegistrationWindow(signal)));
  const toast = useToast();
  const [saved, setSaved] = useState<AdminWindowDetail | null>(null);
  const [action, setAction] = useState<WindowAction | null>(null);
  const [reason, setReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  // The newest detail wins: a save or an open/close replaces the loaded one.
  const detail = saved ?? (state.status === 'success' ? state.data : undefined);

  const runAction = async (which: WindowAction) => {
    const request = reason.trim() ? { reason: reason.trim() } : {};
    const response = await (which === 'open'
      ? openRegistrationWindow(request)
      : closeRegistrationWindow(request));
    if (!response.success) {
      setActionError(response.message);
      return;
    }
    setSaved(response.data);
    setAction(null);
    setReason('');
    setActionError(null);
    toast.show({ tone: 'success', title: response.message ?? 'Registration window updated.' });
  };

  return (
    <>
      <PageHeader
        title="Registration window"
        kicker="Administration · Registration"
        description="Schedule the window, choose the allocation policy, then open registration."
        actions={
          detail?.window && (
            <>
              {detail.window.status === 'DRAFT' && (
                <Button
                  iconStart={LockOpen}
                  onClick={() => {
                    setActionError(null);
                    setAction('open');
                  }}
                >
                  {ACTION_COPY.open.button}
                </Button>
              )}
              {detail.window.status === 'OPEN' && (
                <Button
                  variant="danger"
                  iconStart={Lock}
                  onClick={() => {
                    setActionError(null);
                    setAction('close');
                  }}
                >
                  {ACTION_COPY.close.button}
                </Button>
              )}
            </>
          )
        }
      >
        {detail?.window && (
          <p className={styles.status}>
            <StatusBadge kind="window" status={detail.window.status} />
            <span>
              Opens {formatDateTime(detail.window.startsAt)} · closes{' '}
              {formatDateTime(detail.window.endsAt)}
            </span>
          </p>
        )}
      </PageHeader>

      <div className={styles.body}>
        {state.status === 'error' && (
          <ErrorMessage
            title="The registration window couldn’t be loaded"
            message={state.message}
            onRetry={retry}
          />
        )}
        {state.status === 'loading' && !detail && <Skeleton lines={6} />}

        {detail && !detail.window && (
          <EmptyState title="No registration window has been created yet" icon={CalendarClock}>
            <p>Seed the database or create a window to schedule registration for the term.</p>
          </EmptyState>
        )}

        {detail?.window && (
          <>
            <section className={styles.counts} aria-label="This window at a glance">
              <p>
                <strong>{detail.counts.offeredCourses}</strong> courses offered ·{' '}
                <strong>{detail.counts.eligibleStudents}</strong> of {detail.counts.totalStudents}{' '}
                students eligible for at least one · <strong>{detail.counts.submissions}</strong>{' '}
                submissions so far
              </p>
            </section>

            {detail.editable ? (
              <Card title="Window and policy" kicker="Draft" headingLevel={2}>
                <WindowPolicyForm
                  detail={detail}
                  onSaved={(updated, message) => {
                    setSaved(updated);
                    toast.show({ tone: 'success', title: message });
                  }}
                />
              </Card>
            ) : (
              <FrozenPolicy detail={detail} />
            )}
          </>
        )}
      </div>

      {action && detail?.window && (
        <ConfirmDialog
          open
          title={ACTION_COPY[action].title}
          tone={action === 'close' ? 'danger' : 'default'}
          confirmLabel={ACTION_COPY[action].confirmLabel}
          message={
            <div className={styles.confirm}>
              {action === 'open' ? (
                <>
                  <p>
                    Students will be able to submit preferences for{' '}
                    <strong>{detail.counts.offeredCourses}</strong> courses, and every student gets
                    a notification.
                  </p>
                  <p>
                    <strong>This freezes the policy.</strong> The allocation method, preference
                    weights, priority points, tie-break seed and the set of offered courses can no
                    longer be changed. Seats per course can still be adjusted.
                  </p>
                </>
              ) : (
                <p>
                  Students can no longer submit or change their preferences. Allocation runs after
                  the window closes.
                </p>
              )}
              <FormField label="Reason" hint="Recorded in the audit log (optional).">
                {(field) => (
                  <Textarea
                    {...field}
                    rows={2}
                    maxLength={500}
                    value={reason}
                    onChange={(event) => {
                      setReason(event.target.value);
                    }}
                  />
                )}
              </FormField>
              {actionError && (
                <p className={styles.error} role="alert">
                  {actionError}
                </p>
              )}
            </div>
          }
          onConfirm={() => runAction(action)}
          onCancel={() => {
            setAction(null);
            setActionError(null);
          }}
        />
      )}
    </>
  );
}

/** The read-only view once registration has opened. */
function FrozenPolicy({ detail }: { detail: AdminWindowDetail }) {
  return (
    <Card
      title="Allocation policy"
      kicker="Frozen"
      headingLevel={2}
      actions={
        <p className={styles.frozen}>
          <Icon icon={Lock} size={16} />
          Policy frozen
        </p>
      }
    >
      <p className={styles.frozenNote}>
        The policy was frozen when registration opened, so students are judged by the rules they
        submitted against. The database rejects a change to these values even if it is attempted
        directly.
      </p>
      {detail.policy && <PolicySummary policy={detail.policy} randomSeed={detail.randomSeed} />}
      <p className={styles.offered}>
        {detail.counts.offeredCourses} courses offered in {detail.window?.name}.
      </p>
    </Card>
  );
}

function PolicySummary({
  policy,
  randomSeed,
}: {
  policy: AllocationConfig;
  randomSeed: number | null;
}) {
  if (!isPreferencePriorityConfig(policy)) {
    return (
      <dl className={styles.summary}>
        <div>
          <dt>Method</dt>
          <dd>First come, first served</dd>
        </div>
        <div>
          <dt>Order</dt>
          <dd>Server-side submission sequence</dd>
        </div>
      </dl>
    );
  }

  return (
    <dl className={styles.summary}>
      <div>
        <dt>Method</dt>
        <dd>Preference + Priority</dd>
      </div>
      <div>
        <dt>Preference weights</dt>
        <dd className={styles.mono}>
          {PREFERENCE_RANKS.map((rank) => `P${rank} ${policy.preferenceWeights[rank]}`).join(' · ')}
        </dd>
      </div>
      <div>
        <dt>Priority points</dt>
        <dd className={styles.mono}>
          Final year {policy.priorityPoints.finalYear} · Programme relevance{' '}
          {policy.priorityPoints.programRelevance} · Graduation urgency{' '}
          {policy.priorityPoints.graduationUrgency}
        </dd>
      </div>
      <div>
        <dt>Tie-break seed</dt>
        <dd className={styles.mono}>{randomSeed}</dd>
      </div>
    </dl>
  );
}
