import type { AdminCourseList, AdminCourseOffering, AdminWindowDetail } from '@course-reg/shared';
import { CalendarClock } from 'lucide-react';
import { getAdminCourses, getRegistrationWindow } from '../../api/adminApi';
import { unwrap } from '../../api/unwrap';
import { LinkButton } from '../../components/Button';
import { Card } from '../../components/Card';
import { DataTable } from '../../components/DataTable';
import type { Column } from '../../components/DataTable/tableLogic';
import { ErrorMessage } from '../../components/ErrorMessage';
import { PageHeader } from '../../components/PageHeader';
import { Skeleton } from '../../components/Skeleton';
import { StatusBadge } from '../../components/StatusBadge';
import { useAsync } from '../../hooks/useAsync';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { describeDemand } from '../../utils/courseText';
import { formatDateTime } from '../../utils/formatDate';
import { formatDemandRatio } from '../../utils/formatSeats';
import styles from '../DashboardPage.module.css';
import dashboard from './AdminDashboardPage.module.css';

const TOP_COURSES = 5;

interface AdminDashboardData {
  detail: AdminWindowDetail;
  courses: AdminCourseList;
}

const columns: Column<AdminCourseOffering>[] = [
  { id: 'code', header: 'Code', key: 'code' },
  { id: 'name', header: 'Course', key: 'name' },
  {
    id: 'demand',
    header: 'Requests',
    key: 'demand',
    align: 'end',
    cell: (course) => describeDemand(course.demand, course.capacity),
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
    const [detail, courses] = await Promise.all([
      getRegistrationWindow(signal),
      getAdminCourses(signal),
    ]);
    return { detail: unwrap(detail), courses: unwrap(courses) };
  });

  const data = state.status === 'success' ? state.data : undefined;
  const topCourses = [...(data?.courses.items ?? [])]
    .sort((a, b) => b.demand - a.demand || a.code.localeCompare(b.code))
    .slice(0, TOP_COURSES);

  return (
    <>
      <PageHeader
        title="Dashboard"
        kicker="Administration · Registration"
        description="The registration window, demand and what still needs a decision."
        actions={
          <LinkButton to="/admin/registration-window" variant="primary" iconStart={CalendarClock}>
            Registration window
          </LinkButton>
        }
      >
        {data?.detail.window && (
          <p className={dashboard.status}>
            <StatusBadge kind="window" status={data.detail.window.status} />
            <span>
              {data.detail.window.name} · opens {formatDateTime(data.detail.window.startsAt)} ·
              closes {formatDateTime(data.detail.window.endsAt)}
            </span>
          </p>
        )}
      </PageHeader>

      <div className={styles.grid}>
        <div className={styles.primary}>
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
              <p className={dashboard.counts}>
                <strong>{data.detail.counts.offeredCourses}</strong> courses offered ·{' '}
                <strong>{data.detail.counts.eligibleStudents}</strong> of{' '}
                {data.detail.counts.totalStudents} students eligible for at least one ·{' '}
                <strong>{data.detail.counts.submissions}</strong> submissions so far
              </p>

              <Card title="Most demanded courses" kicker="Top 5" headingLevel={2}>
                <DataTable
                  caption="The five courses with the most submitted requests"
                  captionHidden
                  rows={topCourses}
                  columns={columns}
                  filterable={false}
                  paginated={false}
                  getRowId={(course) => course.code}
                  getRowTone={(course) => (course.oversubscribed ? 'warning' : undefined)}
                  emptyMessage="No requests have been submitted yet."
                />
              </Card>
            </>
          )}
        </div>

        {data?.detail.window && (
          <Card title="Policy" kicker="This window" headingLevel={2}>
            <dl className={styles.record}>
              <div>
                <dt>Status</dt>
                <dd>
                  <StatusBadge kind="window" status={data.detail.window.status} />
                </dd>
              </div>
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
    </>
  );
}
