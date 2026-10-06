import {
  isPreferencePriorityConfig,
  PREFERENCE_RANKS,
  type AdminWindowDetail,
  type AllocationConfig,
} from '@course-reg/shared';
import { ArrowLeftRight, CalendarClock, Gauge, Lock, LockOpen, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import {
  closeRegistrationWindow,
  getRegistrationWindow,
  openRegistrationWindow,
} from '../../api/adminApi';
import { unwrap } from '../../api/unwrap';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { ErrorMessage } from '../../components/ErrorMessage';
import { FormField } from '../../components/FormField';
import { Notice } from '../../components/Notice';
import { PageHeader } from '../../components/PageHeader';
import { Skeleton } from '../../components/Skeleton';
import { StatusBadge } from '../../components/StatusBadge';
import { Textarea } from '../../components/Textarea';
import { useToast } from '../../components/Toast';
import { WindowCard } from '../../components/WindowCard';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useServerClock } from '../../hooks/useServerClock';
import { formatDateTime } from '../../utils/formatDate';
import { AddDropPeriodForm } from './window/AddDropPeriodForm';
import { WindowPolicyForm } from './window/WindowPolicyForm';
import styles from './RegistrationWindowPage.module.css';

type WindowAction = 'open' | 'close';

/** A window detail with the server's clock measured where it arrived. */
interface Measured {
  detail: AdminWindowDetail;
  /** Server clock minus device clock, for the countdown. */
  clockOffsetMs: number;
}

const measured = (detail: AdminWindowDetail): Measured => ({
  detail,
  clockOffsetMs: Date.parse(detail.serverTime) - Date.now(),
});

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
  const { state, retry } = useAsync(async (signal) =>
    measured(unwrap(await getRegistrationWindow(signal))),
  );
  const toast = useToast();
  const [saved, setSaved] = useState<Measured | null>(null);
  const [action, setAction] = useState<WindowAction | null>(null);
  const [reason, setReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  // The newest detail wins: a save or an open/close replaces the loaded one.
  const current = saved ?? (state.status === 'success' ? state.data : undefined);
  const detail = current?.detail;
  const clock = useServerClock(current?.clockOffsetMs ?? 0, current !== undefined);

  const runAction = async (which: WindowAction) => {
    const request = reason.trim() ? { reason: reason.trim() } : {};
    const response = await (which === 'open'
      ? openRegistrationWindow(request)
      : closeRegistrationWindow(request));
    if (!response.success) {
      setActionError(response.message);
      return;
    }
    setSaved(measured(response.data));
    setAction(null);
    setReason('');
    setActionError(null);
    toast.show({ tone: 'success', title: response.message ?? 'Registration window updated.' });
  };

  return (
    <>
      <PageHeader
        title="Registration window"
        description="Schedule the window, choose the allocation policy, then open registration."
        actions={
          detail?.window && (
            <>
              <WindowCard window={detail.window} clock={clock} variant="name" />
              {detail.window.status === 'DRAFT' && (
                <Button
                  variant="primary"
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
                  variant="primary"
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
      />

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
            <Card
              title="This window"
              titleIcon={Gauge}
              titleAside={<StatusBadge kind="window" status={detail.window.status} />}
              headingLevel={2}
            >
              <div role="group" aria-label="This window at a glance">
                <dl className={styles.figures}>
                  <div>
                    <dt>Opens</dt>
                    <dd className={styles.figure}>{formatDateTime(detail.window.startsAt)}</dd>
                  </div>
                  <div>
                    <dt>Closes</dt>
                    <dd className={styles.figure}>{formatDateTime(detail.window.endsAt)}</dd>
                  </div>
                  <div>
                    <dt>Courses offered</dt>
                    <dd className={styles.figure}>{detail.counts.offeredCourses}</dd>
                  </div>
                  <div>
                    <dt>Students eligible for at least one</dt>
                    <dd className={styles.figure}>
                      {detail.counts.eligibleStudents} of {detail.counts.totalStudents}
                    </dd>
                  </div>
                  <div>
                    <dt>Submissions so far</dt>
                    <dd className={styles.figure}>{detail.counts.submissions}</dd>
                  </div>
                </dl>
              </div>
            </Card>

            {detail.editable ? (
              <Card
                title="Window and policy"
                titleIcon={CalendarClock}
                titleAside={<StatusBadge kind="window" status={detail.window.status} />}
                headingLevel={2}
              >
                <WindowPolicyForm
                  detail={detail}
                  onSaved={(updated, message) => {
                    setSaved(measured(updated));
                    toast.show({ tone: 'success', title: message });
                  }}
                />
              </Card>
            ) : (
              <FrozenPolicy detail={detail} />
            )}

            {/* Add/drop follows allocation, so the period only exists here. */}
            {detail.window.status === 'ALLOCATED' && (
              <Card title="Add/drop period" titleIcon={ArrowLeftRight} headingLevel={2}>
                <AddDropPeriodForm
                  detail={detail}
                  onSaved={(updated, message) => {
                    setSaved(measured(updated));
                    toast.show({ tone: 'success', title: message });
                  }}
                />
              </Card>
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
                <Notice tone="danger" live>
                  {actionError}
                </Notice>
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
      titleIcon={ShieldCheck}
      headingLevel={2}
      actions={
        <Badge tone="neutral" icon={Lock}>
          Policy frozen
        </Badge>
      }
      footer={`${detail.counts.offeredCourses} courses offered in ${detail.window?.name}.`}
    >
      <div className={styles.frozen}>
        <Notice icon={Lock}>
          The policy was frozen when registration opened, so students are judged by the rules they
          submitted against. The database rejects a change to these values even if it is attempted
          directly.
        </Notice>
        {detail.policy && <PolicySummary policy={detail.policy} randomSeed={detail.randomSeed} />}
      </div>
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
