import {
  WITHDRAW_REASON_LENGTH,
  type AdminWaitlistView,
  type EnrolledStudentRow,
  type PromotionSummary,
  type WaitingStudentRow,
} from '@course-reg/shared';
import { Hourglass } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router';
import { getAdminWaitlists, processWaitlists, withdrawEnrollment } from '../../api/waitlistApi';
import { unwrap } from '../../api/unwrap';
import { Button } from '../../components/Button';
import { CourseCode } from '../../components/CourseCode';
import { DataTable, type DataTableStatus } from '../../components/DataTable';
import type { Column } from '../../components/DataTable/tableLogic';
import { EmptyState } from '../../components/EmptyState';
import { FormField } from '../../components/FormField';
import { PageHeader } from '../../components/PageHeader';
import { SeatMeter } from '../../components/SeatMeter';
import { Select } from '../../components/Select';
import { StatusBadge } from '../../components/StatusBadge';
import { Textarea } from '../../components/Textarea';
import { useToast } from '../../components/Toast';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { ordinal } from '../../utils/allocationText';
import { describePromotions, describeRemoval } from '../../utils/waitlistText';
import styles from './AdminWaitlistsPage.module.css';

/** The course being looked at lives in the URL, so the view can be linked to. */
const COURSE_PARAM = 'course';

export function AdminWaitlistsPage() {
  useDocumentTitle('Waitlists');
  const [params, setParams] = useSearchParams();
  const code = params.get(COURSE_PARAM);
  const [withdrawing, setWithdrawing] = useState<EnrolledStudentRow | null>(null);
  const [sweeping, setSweeping] = useState(false);
  const toast = useToast();

  const load = useCallback(
    async (signal: AbortSignal) => unwrap(await getAdminWaitlists(code, signal)),
    [code],
  );
  const { state, retry } = useAsync(load);
  const view = state.status === 'success' ? state.data : undefined;

  const announce = (summary: PromotionSummary, title: string) => {
    toast.show({ tone: 'success', title, message: describePromotions(summary) });
    retry();
  };

  const handleWithdraw = async (reason: string) => {
    const target = withdrawing;
    if (!target) {
      return;
    }
    const response = await withdrawEnrollment(target.enrollmentId, reason);
    if (!response.success) {
      toast.show({ tone: 'danger', title: 'Nobody was withdrawn', message: response.message });
      return;
    }
    setWithdrawing(null);
    announce(
      response.data.promotions,
      `${target.student.name} was withdrawn from ${response.data.course.code}`,
    );
  };

  const handleSweep = async () => {
    setSweeping(true);
    const response = await processWaitlists();
    setSweeping(false);
    if (!response.success) {
      toast.show({
        tone: 'danger',
        title: 'Waitlists were not processed',
        message: response.message,
      });
      return;
    }
    announce(
      response.data.promotions,
      `${response.data.coursesChecked} ${response.data.coursesChecked === 1 ? 'course' : 'courses'} had a free seat`,
    );
  };

  const status: DataTableStatus =
    state.status === 'error'
      ? { kind: 'error', message: state.message, onRetry: retry }
      : state.status === 'success'
        ? { kind: 'ready' }
        : { kind: 'loading' };

  const allocated = view?.window?.status === 'ALLOCATED';

  return (
    <>
      <PageHeader
        title="Waitlists"
        kicker="Administration · Allocation"
        description="Queues for full courses, and the promotions that happen as seats free up."
        actions={
          allocated ? (
            <Button variant="secondary" loading={sweeping} onClick={() => void handleSweep()}>
              Process waitlists
            </Button>
          ) : undefined
        }
      />

      <div className={styles.body}>
        {view && !allocated && (
          <p className={styles.notice}>
            Waitlists exist once allocation has run. This window is{' '}
            <strong>{view.window?.status.toLowerCase() ?? 'not scheduled'}</strong>, so nobody is
            waiting yet and nothing can be promoted.
          </p>
        )}

        <FormField label="Course" hint="Pick a course to see who holds a seat and who is waiting.">
          {(control) => (
            <Select
              {...control}
              className={styles.picker}
              placeholder="Choose a course…"
              options={(view?.courses ?? []).map((course) => ({
                value: course.code,
                label: `${course.code} · ${course.name}`,
              }))}
              value={code ?? ''}
              onChange={(event) => {
                const next = event.target.value;
                // The chosen course lives in the URL, so the view can be linked.
                setParams(next ? { [COURSE_PARAM]: next } : {}, { replace: true });
              }}
            />
          )}
        </FormField>

        {view?.course ? (
          <CourseWaitlist view={view} onWithdraw={setWithdrawing} status={status} />
        ) : (
          <EmptyState title="No course chosen" icon={Hourglass}>
            <p>Pick a course above to see its roster and its queue.</p>
          </EmptyState>
        )}
      </div>

      <WithdrawDialog
        row={withdrawing}
        courseCode={view?.course?.code ?? ''}
        onCancel={() => {
          setWithdrawing(null);
        }}
        onConfirm={handleWithdraw}
      />
    </>
  );
}

function CourseWaitlist({
  view,
  status,
  onWithdraw,
}: {
  view: AdminWaitlistView;
  status: DataTableStatus;
  onWithdraw: (row: EnrolledStudentRow) => void;
}) {
  const course = view.course;
  if (!course) {
    return null;
  }

  const rosterColumns: Column<EnrolledStudentRow>[] = [
    {
      id: 'name',
      header: 'Student',
      accessor: (row) => row.student.name,
      sortable: true,
    },
    { id: 'email', header: 'Email', accessor: (row) => row.student.email },
    {
      id: 'choice',
      header: 'Their choice',
      accessor: (row) => row.preferenceRank,
      cell: (row) => (row.preferenceRank ? ordinal(row.preferenceRank) : '—'),
    },
    {
      id: 'source',
      header: 'How',
      accessor: (row) => (row.source === 'WAITLIST_PROMOTION' ? 'Promoted' : 'Allocation'),
    },
    {
      id: 'actions',
      header: 'Actions',
      accessor: () => null,
      searchable: false,
      cell: (row) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            onWithdraw(row);
          }}
        >
          Withdraw
        </Button>
      ),
    },
  ];

  const waitlistColumns: Column<WaitingStudentRow>[] = [
    {
      id: 'position',
      header: 'Position',
      key: 'storedPosition',
      sortable: true,
      align: 'end',
      // The stored position is what orders the queue; the live one is shown.
      cell: (row) => (row.position === null ? '—' : `#${row.position}`),
    },
    { id: 'name', header: 'Student', accessor: (row) => row.student.name },
    {
      id: 'choice',
      header: 'Their choice',
      accessor: (row) => row.preferenceRank,
      cell: (row) => ordinal(row.preferenceRank),
    },
    { id: 'score', header: 'Score', key: 'score', sortable: true, align: 'end' },
    {
      id: 'status',
      header: 'Status',
      accessor: (row) => row.status,
      cell: (row) => (
        <span className={styles.statusCell}>
          <StatusBadge kind="waitlist" status={row.status} />
          {row.reason && <span className={styles.reason}>{describeRemoval(row.reason)}</span>}
        </span>
      ),
    },
  ];

  return (
    <>
      <section aria-labelledby="course-heading" className={styles.course}>
        <h2 id="course-heading" className={styles.courseTitle}>
          <CourseCode code={course.code} /> {course.name}
        </h2>
        <SeatMeter
          allocated={course.allocated}
          capacity={course.capacity}
          label={`Seats in ${course.code}`}
        />
      </section>

      <DataTable
        caption={`Students holding a seat in ${course.code}`}
        rows={view.enrolled}
        columns={rosterColumns}
        getRowId={(row) => row.enrollmentId}
        status={status}
        filterable={false}
        itemName={{ one: 'student', other: 'students' }}
        emptyTitle="Nobody holds a seat"
        emptyMessage="Every seat in this course is still free."
      />

      <DataTable
        caption={`Students waiting for a seat in ${course.code}`}
        rows={view.waitlist}
        columns={waitlistColumns}
        getRowId={(row) => `${row.student.email}-${row.storedPosition}`}
        status={status}
        filterable={false}
        itemName={{ one: 'entry', other: 'entries' }}
        emptyTitle="Nobody is waiting"
        emptyMessage="No student is queued for this course."
      />
    </>
  );
}

/**
 * Withdrawing takes a seat away from a named student, so the reason is
 * required: it goes into the audit log and into the student's notification.
 */
function WithdrawDialog({
  row,
  courseCode,
  onCancel,
  onConfirm,
}: {
  row: EnrolledStudentRow | null;
  courseCode: string;
  onCancel: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    const trimmed = reason.trim();
    if (trimmed.length < WITHDRAW_REASON_LENGTH.min) {
      setError(`Give a reason of at least ${WITHDRAW_REASON_LENGTH.min} characters.`);
      return;
    }
    setError(null);
    await onConfirm(trimmed);
    setReason('');
  };

  return (
    <ConfirmDialog
      open={row !== null}
      title={row ? `Withdraw ${row.student.name}?` : 'Withdraw student'}
      tone="danger"
      confirmLabel="Withdraw"
      message={
        <>
          <p>
            Their seat in {courseCode} is released, and the next eligible student waiting for it
            takes it straight away. If that student gives up a lower-ranked seat to move, theirs is
            offered on too.
          </p>
          <FormField
            label="Reason"
            hint="Recorded in the audit log and sent to the student."
            error={error ?? undefined}
            required
          >
            {(control) => (
              <Textarea
                {...control}
                rows={3}
                maxLength={WITHDRAW_REASON_LENGTH.max}
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value);
                }}
              />
            )}
          </FormField>
        </>
      }
      onConfirm={confirm}
      onCancel={() => {
        setReason('');
        setError(null);
        onCancel();
      }}
    />
  );
}
