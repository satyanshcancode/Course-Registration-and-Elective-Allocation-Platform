import type {
  AllocationMetrics,
  AllocationRunDetail,
  AllocationVerification,
  CourseAllocationMetric,
} from '@course-reg/shared';
import { ArrowLeft, ShieldCheck, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router';
import { getAllocationRun, verifyAllocationRun } from '../../api/allocationApi';
import { isNotFound, unwrap } from '../../api/unwrap';
import { Badge } from '../../components/Badge';
import { Button, LinkButton } from '../../components/Button';
import { CourseCode } from '../../components/CourseCode';
import { DataTable } from '../../components/DataTable';
import type { Column } from '../../components/DataTable/tableLogic';
import { EmptyState } from '../../components/EmptyState';
import { ErrorMessage } from '../../components/ErrorMessage';
import { Icon } from '../../components/Icon';
import { PageHeader } from '../../components/PageHeader';
import { Skeleton } from '../../components/Skeleton';
import { StatusBadge } from '../../components/StatusBadge';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { formatAverageRank, formatRate } from '../../utils/allocationText';
import { formatDateTime } from '../../utils/formatDate';
import styles from './allocation/AllocationRunsPage.module.css';

export function AllocationRunDetailPage() {
  const { id = '' } = useParams();
  const { state, retry } = useAsync(async (signal) => unwrap(await getAllocationRun(id, signal)), {
    key: id,
  });
  const run = state.status === 'success' ? state.data : undefined;
  useDocumentTitle(run ? `Allocation run · ${run.method}` : 'Allocation run');

  return (
    <>
      <PageHeader
        title="Allocation run"
        kicker="Administration · Allocation"
        description={
          run
            ? `${run.method === 'FCFS' ? 'First come, first served' : 'Preference + Priority'} · ${run.algorithmVersion}`
            : undefined
        }
        actions={
          <LinkButton to="/admin/allocation-runs" variant="ghost" iconStart={ArrowLeft}>
            All runs
          </LinkButton>
        }
      />

      <div className={styles.body}>
        {state.status === 'error' &&
          (isNotFound(state.error) ? (
            <EmptyState title="That run doesn’t exist">
              <p>It may have been from another window, or the link may be wrong.</p>
            </EmptyState>
          ) : (
            <ErrorMessage
              title="This run couldn’t be loaded"
              message={state.message}
              onRetry={retry}
            />
          ))}

        {!run && state.status !== 'error' && (
          <div className={styles.skeleton} aria-hidden="true">
            <Skeleton height="6rem" />
            <Skeleton height="14rem" />
          </div>
        )}

        {run && (
          <>
            <RunSummary run={run} />
            {run.metrics ? (
              <>
                <MetricsPanel metrics={run.metrics} />
                <CourseTable courses={run.metrics.courses} />
              </>
            ) : (
              <EmptyState title="This run produced no metrics" headingLevel={2}>
                <p>
                  {run.errorMessage ??
                    'The run did not complete, so there is nothing to summarise.'}
                </p>
              </EmptyState>
            )}
            <VerifyPanel runId={run.id} />
          </>
        )}
      </div>
    </>
  );
}

function RunSummary({ run }: { run: AllocationRunDetail }) {
  return (
    <section className={styles.stage} aria-labelledby="summary-heading">
      <h2 id="summary-heading" className={styles.heading}>
        Summary
      </h2>
      <p className={styles.stageStatus}>
        <StatusBadge kind="allocationRun" status={run.status} />
        <span>{run.window.name}</span>
      </p>
      <dl className={styles.facts}>
        <div>
          <dt>Started</dt>
          <dd>{formatDateTime(run.startedAt)}</dd>
        </div>
        <div>
          <dt>Finished</dt>
          <dd>{run.finishedAt ? formatDateTime(run.finishedAt) : '—'}</dd>
        </div>
        <div>
          <dt>Algorithm version</dt>
          <dd className={styles.mono}>{run.algorithmVersion}</dd>
        </div>
        <div>
          <dt>Tie-break seed</dt>
          <dd className={styles.mono}>{run.randomSeed}</dd>
        </div>
        <div>
          <dt>Input snapshot</dt>
          <dd>
            {run.inputSize.students} students · {run.inputSize.courses} courses
          </dd>
        </div>
        <div>
          <dt>Output hash</dt>
          <dd className={styles.mono}>{run.outputHash?.slice(0, 16) ?? '—'}…</dd>
        </div>
      </dl>

      <details className={styles.config}>
        <summary>Configuration snapshot</summary>
        <pre>{JSON.stringify(run.config, null, 2)}</pre>
      </details>
    </section>
  );
}

/** A slim bar is enough for a rate; DESIGN.md bans pies and decoration. */
function Rate({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className={styles.rate}>
      <p className={styles.rateLabel}>
        <span>{label}</span>
        <span className={styles.rateValue}>{formatRate(value)}</span>
      </p>
      <div
        className={styles.bar}
        role="meter"
        aria-label={label}
        aria-valuenow={Math.round(value * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={formatRate(value)}
      >
        <span className={styles.barFill} style={{ inlineSize: `${Math.round(value * 100)}%` }} />
      </div>
      {note && <p className={styles.rateNote}>{note}</p>}
    </div>
  );
}

function MetricsPanel({ metrics }: { metrics: AllocationMetrics }) {
  return (
    <section className={styles.metrics} aria-labelledby="metrics-heading">
      <h2 id="metrics-heading" className={styles.heading}>
        Outcome
      </h2>
      <div className={styles.rates}>
        <Rate
          label="Got their first choice"
          value={metrics.firstChoiceRate}
          note={`${metrics.allocated} of ${metrics.students} students were allocated something.`}
        />
        <Rate label="Got one of their top three" value={metrics.topThreeRate} />
        <Rate
          label="Seats filled"
          value={metrics.seatUtilisation}
          note={`${metrics.seatsFilled} of ${metrics.seatsOffered} offered seats.`}
        />
      </div>
      <dl className={styles.facts}>
        <div>
          <dt>Average rank allocated</dt>
          <dd>{formatAverageRank(metrics.averageAllocatedRank)}</dd>
        </div>
        <div>
          <dt>Students with nothing</dt>
          <dd>{metrics.unallocated}</dd>
        </div>
        <div>
          <dt>Waitlist entries</dt>
          <dd>{metrics.waitlistEntries}</dd>
        </div>
        <div>
          <dt>Justified envy</dt>
          <dd>{metrics.justifiedEnvy}</dd>
        </div>
        <div>
          <dt>Time to compute</dt>
          <dd>{metrics.runtimeMs} ms</dd>
        </div>
      </dl>
    </section>
  );
}

const courseColumns: Column<CourseAllocationMetric>[] = [
  {
    id: 'code',
    header: 'Code',
    accessor: (course) => course.course.code,
    cell: (course) => <CourseCode code={course.course.code} size="sm" />,
  },
  { id: 'name', header: 'Course', accessor: (course) => course.course.name },
  { id: 'capacity', header: 'Seats', key: 'capacity', align: 'end' },
  { id: 'applicants', header: 'Applicants', key: 'applicants', align: 'end' },
  { id: 'allocated', header: 'Allocated', key: 'allocated', align: 'end' },
  { id: 'waitlisted', header: 'Waitlisted', key: 'waitlisted', align: 'end' },
  {
    id: 'cutoff',
    header: 'Cut-off score',
    align: 'end',
    accessor: (course) => course.cutoffScore,
    cell: (course) => course.cutoffScore ?? '—',
  },
  {
    id: 'demand',
    header: 'Demand',
    accessor: (course) => (course.oversubscribed ? 'Oversubscribed' : 'Within capacity'),
    cell: (course) =>
      course.oversubscribed ? (
        <Badge tone="warning" icon={TrendingUp}>
          Oversubscribed
        </Badge>
      ) : (
        <span className={styles.muted}>Within capacity</span>
      ),
  },
];

function CourseTable({ courses }: { courses: readonly CourseAllocationMetric[] }) {
  return (
    <section aria-labelledby="courses-heading" className={styles.runs}>
      <h2 id="courses-heading" className={styles.heading}>
        Per course
      </h2>
      <DataTable
        caption="How each course fared in this run"
        captionHidden
        rows={[...courses]}
        columns={courseColumns}
        getRowId={(course) => course.course.code}
        filterable={false}
        paginated={false}
        itemName={{ one: 'course', other: 'courses' }}
        getRowTone={(course) => (course.oversubscribed ? 'warning' : undefined)}
      />
    </section>
  );
}

function VerifyPanel({ runId }: { runId: string }) {
  const [result, setResult] = useState<AllocationVerification | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const verify = () => {
    setChecking(true);
    setError(null);
    void verifyAllocationRun(runId).then((response) => {
      setChecking(false);
      if (response.success) {
        setResult(response.data);
      } else {
        setError(response.message);
      }
    });
  };

  return (
    <section className={styles.verify} aria-labelledby="verify-heading">
      <h2 id="verify-heading" className={styles.heading}>
        Reproducibility
      </h2>
      <p className={styles.note}>
        The stored input snapshot is run again through the same strategy version and the result is
        compared with the hash recorded at the time. Nothing is written except a line in the audit
        log.
      </p>
      <Button variant="secondary" iconStart={ShieldCheck} onClick={verify} loading={checking}>
        Verify reproducibility
      </Button>

      {error && <p className={styles.previewError}>{error}</p>}
      {result && (
        <div className={styles.verdict} data-reproducible={String(result.reproducible)}>
          <p className={styles.verdictLine}>
            <Icon icon={ShieldCheck} />
            <strong>{result.reproducible ? 'Reproducible' : 'Not reproducible'}</strong>
            <span>checked {formatDateTime(result.checkedAt)}</span>
          </p>
          <p className={styles.mono}>{result.recomputedHash}</p>
          {result.differences.length > 0 && (
            <ul>
              {result.differences.map((difference) => (
                <li key={difference}>{difference}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
