import type { AllocationPreview, AllocationRunSummary } from '@course-reg/shared';
import { CalendarClock, ListOrdered, Play } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { getAllocationRuns, previewAllocation, runAllocation } from '../../api/allocationApi';
import { unwrap } from '../../api/unwrap';
import { Button, LinkButton } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DataTable } from '../../components/DataTable';
import type { Column } from '../../components/DataTable/tableLogic';
import { EmptyState } from '../../components/EmptyState';
import { ErrorMessage } from '../../components/ErrorMessage';
import { PageHeader } from '../../components/PageHeader';
import { Skeleton } from '../../components/Skeleton';
import { StatusBadge } from '../../components/StatusBadge';
import { useToast } from '../../components/Toast';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { getRegistrationWindow } from '../../api/adminApi';
import { formatDateTime } from '../../utils/formatDate';
import { formatRate } from '../../utils/allocationText';
import styles from './allocation/AllocationRunsPage.module.css';
import { MethodComparison } from './allocation/MethodComparison';

export function AllocationRunsPage() {
  useDocumentTitle('Allocation runs');
  const toast = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [preview, setPreview] = useState<AllocationPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const page = useAsync(async (signal) => ({
    window: unwrap(await getRegistrationWindow(signal)),
    runs: unwrap(await getAllocationRuns(signal)),
  }));

  const data = page.state.status === 'success' ? page.state.data : undefined;
  const detail = data?.window;
  const window = detail?.window ?? null;
  const method = detail?.policy?.method ?? null;
  const runs = data?.runs ?? [];
  const completed = runs.find((run) => run.status === 'COMPLETED');

  const loadPreview = () => {
    setPreviewing(true);
    setPreviewError(null);
    void previewAllocation().then((response) => {
      setPreviewing(false);
      if (response.success) {
        setPreview(response.data);
      } else {
        setPreviewError(response.message);
      }
    });
  };

  const confirmRun = async () => {
    const response = await runAllocation('Run from the allocation runs page');
    if (!response.success) {
      toast.show({ tone: 'warning', title: 'Allocation did not run', message: response.message });
      setConfirmOpen(false);
      return;
    }
    setConfirmOpen(false);
    toast.show({
      tone: 'success',
      title: 'Allocation complete',
      message: `${response.data.metrics?.allocated ?? 0} students placed.`,
    });
    page.retry();
  };

  return (
    <>
      <PageHeader
        title="Allocation runs"
        kicker="Administration · Allocation"
        description="Compare the two methods, run the one this window froze, and prove afterwards that the result reproduces."
        actions={
          <LinkButton to="/admin/registration-window" variant="ghost" iconStart={CalendarClock}>
            Registration window
          </LinkButton>
        }
      />

      <div className={styles.body}>
        {page.state.status === 'error' && (
          <ErrorMessage
            title="This page couldn’t be loaded"
            message={page.state.message}
            onRetry={page.retry}
          />
        )}
        {!data && page.state.status !== 'error' && (
          <div className={styles.skeleton} aria-hidden="true">
            <Skeleton height="5rem" />
            <Skeleton height="12rem" />
          </div>
        )}

        {window && (
          <section className={styles.stage} aria-labelledby="stage-heading">
            <h2 id="stage-heading" className={styles.heading}>
              {window.name}
            </h2>
            <p className={styles.stageStatus}>
              <StatusBadge kind="window" status={window.status} />
              <span>
                {detail?.counts.submissions ?? 0} submitted ·{' '}
                {method === 'FCFS' ? 'First come, first served' : 'Preference + Priority'} · seed{' '}
                {detail?.randomSeed ?? '—'}
              </span>
            </p>

            {window.status === 'DRAFT' && (
              <p className={styles.note}>
                Allocation runs after registration has opened and closed.{' '}
                <Link to="/admin/registration-window">Schedule and open the window</Link> first.
              </p>
            )}

            {window.status === 'OPEN' && (
              <p className={styles.note}>
                Registration is still open, so the preferences are not final. Allocation runs once
                the window is closed —{' '}
                <Link to="/admin/registration-window">close it on the window page</Link> when the
                deadline passes.
              </p>
            )}

            {window.status === 'ALLOCATED' && completed && (
              <p className={styles.note}>
                Allocation has already run for this window. It can only be done once;{' '}
                <Link to={`/admin/allocation-runs/${completed.id}`}>open the run</Link> to see what
                it decided.
              </p>
            )}

            {window.status === 'CLOSED' && (
              <div className={styles.actions}>
                <Button variant="secondary" onClick={loadPreview} loading={previewing}>
                  {preview ? 'Refresh preview' : 'Preview both methods'}
                </Button>
                <Button
                  variant="primary"
                  iconStart={Play}
                  onClick={() => {
                    setConfirmOpen(true);
                  }}
                >
                  Run allocation
                </Button>
              </div>
            )}
            {previewError && <p className={styles.previewError}>{previewError}</p>}
          </section>
        )}

        {preview && (
          <section className={styles.preview} aria-labelledby="preview-heading">
            <h2 id="preview-heading" className={styles.heading}>
              Preview · {preview.submissions} submissions
            </h2>
            <p className={styles.note}>
              Both methods were run on a fresh snapshot of this window. Nothing was written.
            </p>
            <MethodComparison
              methods={preview.methods}
              caption={`First come, first served compared with Preference + Priority for ${preview.window.name}`}
            />
            <TradeOffs preview={preview} />
          </section>
        )}

        {data && (
          <section aria-labelledby="runs-heading" className={styles.runs}>
            <h2 id="runs-heading" className={styles.heading}>
              Runs
            </h2>
            {runs.length === 0 ? (
              <EmptyState title="No allocation runs yet" icon={ListOrdered} headingLevel={3}>
                <p>
                  Each run is stored with its seed, configuration and input snapshot, so its result
                  can be reproduced exactly afterwards.
                </p>
              </EmptyState>
            ) : (
              <DataTable
                caption="Allocation runs"
                captionHidden
                rows={runs}
                columns={runColumns}
                getRowId={(run) => run.id}
                filterable={false}
                paginated={false}
                itemName={{ one: 'run', other: 'runs' }}
              />
            )}
          </section>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        tone="danger"
        title="Run allocation now?"
        message={
          <>
            <p>
              Every submitted preference list will be allocated with{' '}
              <strong>
                {method === 'FCFS' ? 'first come, first served' : 'Preference + Priority'}
              </strong>
              , the method this window froze when it opened.
            </p>
            <p>
              Seats and waitlist places are written immediately and the window becomes ALLOCATED.{' '}
              <strong>This can only be done once.</strong>
            </p>
          </>
        }
        confirmLabel="Run allocation"
        onConfirm={confirmRun}
        onCancel={() => {
          setConfirmOpen(false);
        }}
      />
    </>
  );
}

/** What the numbers mean, without claiming one method is always right. */
function TradeOffs({ preview }: { preview: AllocationPreview }) {
  const fcfs = preview.methods.find((method) => method.method === 'FCFS');
  const scored = preview.methods.find((method) => method.method === 'PREFERENCE_PRIORITY');
  if (!fcfs || !scored) {
    return null;
  }

  return (
    <div className={styles.tradeoffs}>
      <h3 className={styles.subheading}>What the difference means</h3>
      <ul>
        <li>
          <strong>First come, first served</strong> gave {formatRate(fcfs.metrics.firstChoiceRate)}{' '}
          of students their first choice and left {fcfs.metrics.justifiedEnvy}{' '}
          {fcfs.metrics.justifiedEnvy === 1 ? 'case' : 'cases'} of justified envy: a student wanted
          a course that admitted someone scoring lower for it. It rewards whoever pressed Submit
          first, which is the behaviour this project set out to replace.
        </li>
        <li>
          <strong>Preference + Priority</strong> gave {formatRate(scored.metrics.firstChoiceRate)}{' '}
          their first choice and leaves {scored.metrics.justifiedEnvy} by construction. No student
          loses a seat to someone who scored lower for that course.
        </li>
        <li>
          Neither is free: scoring decides who <em>deserves</em> a seat using rules the registrar
          chose — final year, programme relevance, graduation urgency — so the fairness it buys is
          only as good as those rules. First come, first served needs no such judgement, and treats
          a fast connection as merit.
        </li>
      </ul>
    </div>
  );
}

const runColumns: Column<AllocationRunSummary>[] = [
  {
    id: 'started',
    header: 'Started',
    accessor: (run) => run.startedAt,
    cell: (run) => (
      <Link to={`/admin/allocation-runs/${run.id}`}>{formatDateTime(run.startedAt)}</Link>
    ),
  },
  {
    id: 'method',
    header: 'Method',
    accessor: (run) => run.method,
    cell: (run) => (run.method === 'FCFS' ? 'First come, first served' : 'Preference + Priority'),
  },
  { id: 'version', header: 'Algorithm', key: 'algorithmVersion' },
  {
    id: 'status',
    header: 'Status',
    accessor: (run) => run.status,
    cell: (run) => <StatusBadge kind="allocationRun" status={run.status} />,
  },
  {
    id: 'allocated',
    header: 'Allocated',
    align: 'end',
    accessor: (run) => run.metrics?.allocated ?? null,
    cell: (run) => run.metrics?.allocated ?? '—',
  },
  {
    id: 'envy',
    header: 'Justified envy',
    align: 'end',
    accessor: (run) => run.metrics?.justifiedEnvy ?? null,
    cell: (run) => run.metrics?.justifiedEnvy ?? '—',
  },
];
