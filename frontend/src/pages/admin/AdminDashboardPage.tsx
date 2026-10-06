import type {
  AdminCourseList,
  AdminCourseOffering,
  AdminWindowDetail,
  AllocationRunSummary,
} from '@course-reg/shared';
import {
  ArrowRight,
  BookOpen,
  CalendarClock,
  ClipboardCheck,
  Gauge,
  ListOrdered,
  ScrollText,
  Users,
} from 'lucide-react';
import { Link } from 'react-router';
import { getAllocationRuns } from '../../api/allocationApi';
import { getAdminCourses, getRegistrationWindow } from '../../api/adminApi';
import { unwrap } from '../../api/unwrap';
import { LinkButton } from '../../components/Button';
import { Card } from '../../components/Card';
import { DataTable } from '../../components/DataTable';
import type { Column } from '../../components/DataTable/tableLogic';
import { ErrorMessage } from '../../components/ErrorMessage';
import { Icon } from '../../components/Icon';
import { PageHeader } from '../../components/PageHeader';
import { Skeleton } from '../../components/Skeleton';
import { StatTile } from '../../components/StatTile';
import { StatusBadge } from '../../components/StatusBadge';
import { WindowCard } from '../../components/WindowCard';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useServerClock } from '../../hooks/useServerClock';
import { formatRate } from '../../utils/allocationText';
import { describeRequests } from '../../utils/courseText';
import { formatDemandRatio } from '../../utils/formatSeats';
import styles from './AdminDashboardPage.module.css';

const TOP_COURSES = 5;

interface AdminDashboardData {
  detail: AdminWindowDetail;
  courses: AdminCourseList;
  runs: AllocationRunSummary[];
  /** Server clock minus device clock, measured when the response arrived. */
  clockOffsetMs: number;
}

const columns: Column<AdminCourseOffering>[] = [
  { id: 'code', header: 'Code', key: 'code' },
  { id: 'name', header: 'Course', key: 'name' },
  {
    id: 'demand',
    header: 'Requests',
    key: 'demand',
    align: 'end',
    // Just the count: the ratio has a column of its own, right beside it.
    cell: (course) => describeRequests(course.demand),
  },
  {
    id: 'ratio',
    header: 'Demand ÷ seats',
    key: 'demandRatio',
    align: 'end',
    cell: (course) => formatDemandRatio(course.demand, course.capacity),
  },
];

export function AdminDashboardPage() {
  useDocumentTitle('Admin dashboard');
  const { state, retry } = useAsync<AdminDashboardData>(async (signal) => {
    // Independent requests, so they run together rather than one after the other.
    const [detail, courses, runs] = await Promise.all([
      getRegistrationWindow(signal),
      getAdminCourses(signal),
      getAllocationRuns(signal),
    ]);
    const loaded = unwrap(detail);
    return {
      detail: loaded,
      courses: unwrap(courses),
      runs: unwrap(runs),
      clockOffsetMs: Date.parse(loaded.serverTime) - Date.now(),
    };
  });

  const data = state.status === 'success' ? state.data : undefined;
  const clock = useServerClock(data?.clockOffsetMs ?? 0, data !== undefined);
  const topCourses = [...(data?.courses.items ?? [])]
    .sort((a, b) => b.demand - a.demand || a.code.localeCompare(b.code))
    .slice(0, TOP_COURSES);
  const seats = (data?.courses.items ?? []).reduce(
    (total, course) => ({
      held: total.held + course.allocated,
      capacity: total.capacity + course.capacity,
    }),
    { held: 0, capacity: 0 },
  );

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="The registration window, demand and what still needs a decision."
        actions={
          <div className={styles.headerActions}>
            {data?.detail.window && (
              <WindowCard window={data.detail.window} clock={clock} variant="name" />
            )}
            <LinkButton to="/admin/registration-window" variant="primary" iconStart={CalendarClock}>
              Registration window
            </LinkButton>
          </div>
        }
      />

      <div className={styles.page}>
        {state.status === 'error' && (
          <ErrorMessage
            title="The dashboard couldn’t be loaded"
            message={state.message}
            onRetry={retry}
          />
        )}
        {state.status === 'loading' && <Skeleton lines={6} />}

        {data && (
          <>
            <section className={styles.stats} aria-label="At a glance">
              <StatTile
                icon={BookOpen}
                tone="info"
                value={String(data.detail.counts.offeredCourses)}
                label="Courses offered"
                to="/admin/courses"
                linkLabel="View courses"
              />
              <StatTile
                icon={Users}
                tone="success"
                value={`${data.detail.counts.eligibleStudents}/${data.detail.counts.totalStudents}`}
                label="Students eligible for a course"
                to="/admin/students"
                linkLabel="View students"
              />
              <StatTile
                icon={ClipboardCheck}
                tone="accent"
                value={String(data.detail.counts.submissions)}
                label="Submissions so far"
                to="/admin/registration-window"
                linkLabel="View window"
              />
              <StatTile
                icon={Gauge}
                tone="warning"
                value={`${seats.held}/${seats.capacity}`}
                label="Seats held"
                to="/admin/courses"
                linkLabel="View seats"
              />
              {/* Four tiles, not five: a fifth wraps onto a row of its own at
                  1280 and reads as an orphan. The run count is the one that can
                  go, because the Allocation card below says more about the run
                  than its number does. */}
            </section>

            <div className={styles.row}>
              <Card title="Most demanded courses" titleIcon={ScrollText} headingLevel={2} bodyFlush>
                <DataTable
                  caption="The five courses with the most submitted requests"
                  captionHidden
                  rows={topCourses}
                  columns={columns}
                  filterable={false}
                  paginated={false}
                  bare
                  getRowId={(course) => course.code}
                  emptyMessage="No requests have been submitted yet."
                />
              </Card>

              {data.detail.window && (
                <Card
                  title="Policy"
                  titleIcon={CalendarClock}
                  titleAside={<StatusBadge kind="window" status={data.detail.window.status} />}
                  headingLevel={2}
                >
                  <dl className={styles.record}>
                    <div>
                      <dt>Allocation method</dt>
                      <dd>
                        {data.detail.policy?.method === 'FCFS'
                          ? 'First come, first served'
                          : 'Preference + Priority'}
                      </dd>
                    </div>
                    <div>
                      <dt>Policy</dt>
                      <dd>{data.detail.editable ? 'Editable (draft)' : 'Frozen'}</dd>
                    </div>
                    <div>
                      <dt>Tie-break seed</dt>
                      <dd className={styles.mono}>{data.detail.randomSeed ?? '—'}</dd>
                    </div>
                  </dl>
                </Card>
              )}
            </div>

            <AllocationSummary runs={data.runs} />
          </>
        )}
      </div>
    </>
  );
}

/** Once allocation has run, its headline numbers belong on the dashboard. */
function AllocationSummary({ runs }: { runs: readonly AllocationRunSummary[] }) {
  const completed = runs.find((run) => run.status === 'COMPLETED');
  const metrics = completed?.metrics;
  if (!completed || !metrics) {
    return null;
  }
  return (
    <Card
      title="Allocation"
      titleIcon={ListOrdered}
      titleAside={<StatusBadge kind="allocationRun" status={completed.status} />}
      headingLevel={2}
      actions={
        <Link to={`/admin/allocation-runs/${completed.id}`} className={styles.cardLink}>
          See the full run
          <Icon icon={ArrowRight} />
        </Link>
      }
    >
      <dl className={styles.facts}>
        <div>
          <dt>Method</dt>
          <dd>
            {completed.method === 'FCFS' ? 'First come, first served' : 'Preference + Priority'}
          </dd>
        </div>
        <div>
          <dt>Students placed</dt>
          <dd className={styles.figure}>
            {metrics.allocated} of {metrics.students}
          </dd>
        </div>
        <div>
          <dt>Got their first choice</dt>
          <dd className={styles.figure}>{formatRate(metrics.firstChoiceRate)}</dd>
        </div>
        <div>
          <dt>Waitlist entries</dt>
          <dd className={styles.figure}>{metrics.waitlistEntries}</dd>
        </div>
        <div>
          <dt>Justified envy</dt>
          <dd className={styles.figure}>{metrics.justifiedEnvy}</dd>
        </div>
      </dl>
    </Card>
  );
}
