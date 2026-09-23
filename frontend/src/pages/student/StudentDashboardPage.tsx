import type {
  CurrentWindowResponse,
  EligibilityOverview,
  UnreadNotificationCount,
} from '@course-reg/shared';
import { BadgeCheck, BookOpen, Bell } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { apiClient } from '../../api/apiClient';
import { getCurrentWindow } from '../../api/courseApi';
import { getEligibility } from '../../api/eligibilityApi';
import { unwrap } from '../../api/unwrap';
import { LinkButton } from '../../components/Button';
import { Card } from '../../components/Card';
import { ErrorMessage } from '../../components/ErrorMessage';
import { PageHeader } from '../../components/PageHeader';
import { RegistrationStatusBanner } from '../../components/RegistrationStatusBanner';
import { Skeleton } from '../../components/Skeleton';
import { StatusBadge } from '../../components/StatusBadge';
import { useCurrentStudent } from '../../hooks/useAuth';
import { useDashboardSections } from '../../hooks/useDashboardSections';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useServerClock } from '../../hooks/useServerClock';
import type { AsyncState } from '../../types/asyncState';
import { describeCountdown } from '../../utils/countdown';
import { describeEligibilityCount } from '../../utils/eligibilityText';
import { formatDateTime } from '../../utils/formatDate';
import styles from '../DashboardPage.module.css';
import dashboard from './StudentDashboardPage.module.css';

/** The window plus the clock offset measured when it arrived. */
interface RegistrationSection {
  window: CurrentWindowResponse['window'];
  clockOffsetMs: number;
}

interface DashboardData extends Record<string, unknown> {
  registration: RegistrationSection;
  eligibility: EligibilityOverview;
  notifications: UnreadNotificationCount;
}

/** What the student should do next, given where the window is. */
function nextSteps(status: string | undefined): string[] {
  switch (status) {
    case 'DRAFT':
      return [
        'Run the eligibility pre-check so nothing is a surprise on the day.',
        'Browse the catalogue and note the courses you want most.',
        'Come back when registration opens to rank and submit them.',
      ];
    case 'OPEN':
      return [
        'Rank up to five courses in your cart, most wanted first.',
        'Submit before the window closes — a saved draft is not a submission.',
        'Check the seat counts: demand changes what is realistic.',
      ];
    case 'CLOSED':
      return [
        'Allocation runs shortly; nothing more to do right now.',
        'Watch your notifications for the result.',
      ];
    case 'ALLOCATED':
      return [
        'Check your results and your place on any waitlist.',
        'Use add/drop if your timetable needs a change.',
      ];
    default:
      return ['Registration has not been scheduled yet. Check back soon.'];
  }
}

export function StudentDashboardPage() {
  useDocumentTitle('Dashboard');
  const user = useCurrentStudent();
  // Three independent requests, together: one failure must not blank the page.
  const { sections, retry } = useDashboardSections<DashboardData>({
    registration: async (signal) => {
      const current = unwrap(await getCurrentWindow(signal));
      // Measured once, where reading the device clock is a side effect of the
      // request rather than something that happens during render.
      return { window: current.window, clockOffsetMs: Date.parse(current.serverTime) - Date.now() };
    },
    eligibility: async (signal) => unwrap(await getEligibility(signal)),
    notifications: async (signal) =>
      unwrap(
        await apiClient.get<UnreadNotificationCount>('/students/me/notifications/unread-count', {
          signal,
        }),
      ),
  });

  const registration =
    sections.registration.status === 'success' ? sections.registration.data : undefined;
  const clock = useServerClock(registration?.clockOffsetMs ?? 0, registration !== undefined);

  if (!user) {
    return null;
  }
  const { student } = user;
  const windowSummary = registration?.window ?? null;
  const countdown = windowSummary ? describeCountdown(windowSummary, clock) : null;

  return (
    <>
      <PageHeader
        title="Dashboard"
        kicker="Registration"
        description={`Signed in as ${student.name} · ${student.rollNumber}`}
        actions={
          <LinkButton to="/student/courses" variant="primary" iconStart={BookOpen}>
            Browse courses
          </LinkButton>
        }
      >
        <RegistrationStatusBanner />
      </PageHeader>

      <div className={styles.grid}>
        <div className={styles.primary}>
          <Section
            title="Registration window"
            kicker="Schedule"
            state={sections.registration}
            onRetry={() => {
              retry('registration');
            }}
          >
            {(data) =>
              data.window ? (
                <div className={dashboard.window}>
                  <p className={dashboard.windowLine}>
                    <StatusBadge kind="window" status={data.window.status} />
                    <span className={dashboard.windowName}>{data.window.name}</span>
                  </p>
                  {countdown && <p className={dashboard.countdown}>{countdown.text}</p>}
                  <dl className={dashboard.schedule}>
                    <div>
                      <dt>Opens</dt>
                      <dd>{formatDateTime(data.window.startsAt)}</dd>
                    </div>
                    <div>
                      <dt>Closes</dt>
                      <dd>{formatDateTime(data.window.endsAt)}</dd>
                    </div>
                  </dl>
                </div>
              ) : (
                <p>No registration window has been scheduled yet.</p>
              )
            }
          </Section>

          <Section
            title="Eligibility"
            kicker="Pre-check"
            state={sections.eligibility}
            onRetry={() => {
              retry('eligibility');
            }}
          >
            {(data) => (
              <div className={dashboard.eligibility}>
                <p className={dashboard.count}>
                  {describeEligibilityCount(data.summary.eligibleCount, data.summary.totalCount)}
                </p>
                <p className={dashboard.muted}>
                  Based on your programme, semester {data.student.semester},{' '}
                  {data.student.creditsCompleted} credits and {data.student.completedCourses.length}{' '}
                  passed courses.
                </p>
                <Link to="/student/eligibility" className={dashboard.link}>
                  <BadgeCheck aria-hidden="true" className={dashboard.linkIcon} />
                  See the full pre-check
                </Link>
              </div>
            )}
          </Section>

          <Card title="What to do next" kicker="Guidance" headingLevel={2}>
            <ol className={dashboard.steps}>
              {nextSteps(windowSummary?.status).map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </Card>
        </div>

        <div className={dashboard.side}>
          <Section
            title="Notifications"
            kicker="Inbox"
            state={sections.notifications}
            onRetry={() => {
              retry('notifications');
            }}
          >
            {(data) => (
              <p className={dashboard.notifications}>
                <Bell aria-hidden="true" className={dashboard.linkIcon} />
                {data.unread === 0
                  ? 'Nothing unread.'
                  : `${data.unread} unread ${data.unread === 1 ? 'message' : 'messages'}.`}
              </p>
            )}
          </Section>

          <Card title="Your record" kicker="Student" headingLevel={2}>
            <dl className={styles.record}>
              <div>
                <dt>Programme</dt>
                <dd>{student.program.name}</dd>
              </div>
              <div>
                <dt>Roll number</dt>
                <dd className={styles.mono}>{student.rollNumber}</dd>
              </div>
              <div>
                <dt>Semester</dt>
                <dd className={styles.mono}>{student.semester}</dd>
              </div>
              <div>
                <dt>Credits completed</dt>
                <dd className={styles.mono}>{student.creditsCompleted}</dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}

interface SectionProps<T> {
  title: string;
  kicker: string;
  state: AsyncState<T>;
  onRetry: () => void;
  children: (data: T) => ReactNode;
}

/** One dashboard card with its own loading, error-with-retry and success states. */
function Section<T>({ title, kicker, state, onRetry, children }: SectionProps<T>) {
  return (
    <Card title={title} kicker={kicker} headingLevel={2}>
      {state.status === 'loading' && <Skeleton lines={3} />}
      {state.status === 'error' && (
        <ErrorMessage
          title={`${title} couldn’t be loaded`}
          message={state.message}
          onRetry={onRetry}
        />
      )}
      {state.status === 'success' && children(state.data)}
    </Card>
  );
}
