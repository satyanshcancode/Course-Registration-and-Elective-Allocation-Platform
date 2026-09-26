import {
  MAX_PREFERENCES,
  type HistoryPage,
  type RegistrationWindowSummary,
  type CurrentWindowResponse,
  type EligibilityOverview,
  type PreferenceCart,
  type StudentAllocationResults,
  type UnreadNotificationCount,
} from '@course-reg/shared';
import { BadgeCheck, Bell, BookOpen, History, ListChecks, ShoppingCart } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { getMyHistory } from '../../api/activityApi';
import { apiClient } from '../../api/apiClient';
import { getCurrentWindow } from '../../api/courseApi';
import { getMyAllocationResults } from '../../api/allocationApi';
import { getEligibility } from '../../api/eligibilityApi';
import { unwrap } from '../../api/unwrap';
import { LinkButton } from '../../components/Button';
import { Card } from '../../components/Card';
import { Icon } from '../../components/Icon';
import { ErrorMessage } from '../../components/ErrorMessage';
import { PageHeader } from '../../components/PageHeader';
import { RegistrationStatusBanner } from '../../components/RegistrationStatusBanner';
import { Skeleton } from '../../components/Skeleton';
import { StatusBadge } from '../../components/StatusBadge';
import { useCurrentStudent } from '../../hooks/useAuth';
import { useCart } from '../../hooks/useCart';
import { useDashboardSections } from '../../hooks/useDashboardSections';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import type { AsyncState } from '../../types/asyncState';
import { describeEligibilityCount } from '../../utils/eligibilityText';
import { formatDateTime, formatRelative } from '../../utils/formatDate';
import { describeHistoryEvent, historyEventIcon } from '../../utils/historyText';
import styles from '../DashboardPage.module.css';
import dashboard from './StudentDashboardPage.module.css';

interface DashboardData extends Record<string, unknown> {
  registration: CurrentWindowResponse;
  eligibility: EligibilityOverview;
  notifications: UnreadNotificationCount;
  results: StudentAllocationResults;
  activity: HistoryPage;
}

/** How many events the dashboard shows before linking to the full history. */
const RECENT_EVENTS = 5;

/**
 * What the student should do next, given the window, their cart AND their
 * result. Once allocation has run, what to say depends on the add/drop period:
 * "use add/drop" is unhelpful advice while it is closed.
 *
 * `now` is the server's clock, passed in. A `now` of 0 means it has not arrived
 * yet, which reads as "before the period opens" — the cautious answer.
 */
function nextSteps(
  window: RegistrationWindowSummary | null | undefined,
  cart: PreferenceCart | null,
  results: StudentAllocationResults | null,
  now: number,
): string[] {
  const status = window?.status;
  if (status === 'ALLOCATED' && results?.ranAt) {
    const waiting = results.results.filter((row) => row.outcome === 'WAITLISTED').length;
    const queued =
      waiting > 0
        ? `You are on ${waiting} ${waiting === 1 ? 'waitlist' : 'waitlists'} and move up automatically when seats free up.`
        : 'You are not waiting for anything else.';
    const held = results.allocated ?? results.held;
    return held
      ? [
          `You have a seat in ${held.course.code} ${held.course.name}.`,
          queued,
          addDropStep(window, now, 'change'),
        ]
      : [
          'No seat this round. Open your results to see how close you came on each course.',
          queued,
          addDropStep(window, now, 'find'),
        ];
  }

  if (status === 'OPEN' && cart) {
    if (cart.status === 'SUBMITTED') {
      return [
        `Your ${cart.items.length} preferences are submitted${cart.reference ? ` (${cart.reference})` : ''}. They can’t be changed now.`,
        'Allocation runs once the window closes; you’ll get a notification.',
      ];
    }
    if (cart.items.length === 0) {
      return [
        'Add courses to your cart from the catalogue, most wanted first.',
        `You can rank up to ${MAX_PREFERENCES}.`,
        'Submit before the window closes — a saved draft is not a submission.',
      ];
    }
    return [
      `You have ${cart.items.length} of ${MAX_PREFERENCES} courses ranked. Check the order.`,
      'Submit before the window closes — a saved draft is not a submission.',
      'Seat counts change: check what is realistic before you submit.',
    ];
  }

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
        addDropStep(window, now, 'change'),
      ];
    default:
      return ['Registration has not been scheduled yet. Check back soon.'];
  }
}

/** The add/drop line, which depends entirely on whether the period is open. */
function addDropStep(
  window: RegistrationWindowSummary | null | undefined,
  now: number,
  intent: 'change' | 'find',
): string {
  const opensAt = window?.addDropOpensAt;
  const closesAt = window?.addDropClosesAt;
  if (!opensAt || !closesAt) {
    return 'Add/drop has not been scheduled yet; you will be notified when it opens.';
  }
  if (now < Date.parse(opensAt)) {
    return `Add/drop opens ${formatDateTime(opensAt)}, and you can change your enrolment then.`;
  }
  if (now >= Date.parse(closesAt)) {
    return `Add/drop closed ${formatDateTime(closesAt)}, so your enrolment is final.`;
  }
  return intent === 'change'
    ? `Add/drop is open until ${formatDateTime(closesAt)}: drop or swap your course if your timetable needs it.`
    : `Add/drop is open until ${formatDateTime(closesAt)}: add a course that still has seats, or join a waitlist.`;
}

export function StudentDashboardPage() {
  useDocumentTitle('Dashboard');
  const user = useCurrentStudent();
  const cart = useCart();
  // Three independent requests, together: one failure must not blank the page.
  const { sections, retry } = useDashboardSections<DashboardData>({
    registration: async (signal) => unwrap(await getCurrentWindow(signal)),
    eligibility: async (signal) => unwrap(await getEligibility(signal)),
    notifications: async (signal) =>
      unwrap(
        await apiClient.get<UnreadNotificationCount>('/students/me/notifications/unread-count', {
          signal,
        }),
      ),
    results: async (signal) => unwrap(await getMyAllocationResults(signal)),
    activity: async (signal) => unwrap(await getMyHistory({ limit: RECENT_EVENTS }, signal)),
  });

  const registration =
    sections.registration.status === 'success' ? sections.registration.data : undefined;

  if (!user) {
    return null;
  }
  const { student } = user;
  const windowSummary = registration?.window ?? null;

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

          <Section
            title="Recent activity"
            kicker="Your record"
            state={sections.activity}
            onRetry={() => {
              retry('activity');
            }}
          >
            {(data) => <RecentActivity page={data} />}
          </Section>

          <Card title="What to do next" kicker="Guidance" headingLevel={2}>
            <ol className={dashboard.steps}>
              {nextSteps(
                windowSummary,
                cart?.cart ?? null,
                sections.results.status === 'success' ? sections.results.data : null,
                // The SERVER's clock: a device set to the wrong date must not
                // be told add/drop is still open.
                registration ? Date.parse(registration.serverTime) : 0,
              ).map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </Card>
        </div>

        <div className={dashboard.side}>
          <Section
            title="Your result"
            kicker="Allocation"
            state={sections.results}
            onRetry={() => {
              retry('results');
            }}
          >
            {(data) => <ResultSummary results={data} />}
          </Section>

          <Card title="Your cart" kicker="Preferences" headingLevel={2}>
            <CartSummary cart={cart?.cart ?? null} />
          </Card>

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

/** The last few events, in the words the history page uses. */
function RecentActivity({ page }: { page: HistoryPage }) {
  if (page.events.length === 0) {
    return (
      <p className={dashboard.muted}>
        Nothing has happened yet. Submissions, allocation and add/drop changes all appear here.
      </p>
    );
  }
  return (
    <div className={dashboard.eligibility}>
      <ol className={dashboard.activity}>
        {page.events.map((event) => (
          <li key={event.id}>
            <Icon icon={historyEventIcon(event.detail.type)} size={16} />
            <span className={dashboard.activityText}>
              {describeHistoryEvent(event)}{' '}
              <time dateTime={event.at} className={dashboard.muted}>
                {formatRelative(event.at)}
              </time>
            </span>
          </li>
        ))}
      </ol>
      <Link to="/student/history" className={dashboard.link}>
        <History aria-hidden="true" className={dashboard.linkIcon} />
        See your full history
      </Link>
    </div>
  );
}

/** The outcome at a glance, once allocation has run. */
function ResultSummary({ results }: { results: StudentAllocationResults }) {
  if (!results.ranAt) {
    return <p className={dashboard.muted}>Results appear once allocation has run.</p>;
  }
  // A course added during add/drop was never part of the run, so it has no
  // explanation to show — only the seat itself.
  const held = results.allocated ?? results.held;
  return (
    <div className={dashboard.eligibility}>
      <p className={dashboard.count}>
        {held ? `${held.course.code} ${held.course.name}` : 'No seat this round'}
      </p>
      <p className={dashboard.muted}>
        {results.allocated
          ? `Your choice ${results.allocated.preferenceRank}.${
              // A seat can arrive after the run, off the waitlist.
              results.allocated.type === 'PROMOTED' ? ' Promoted from the waitlist.' : ''
            }`
          : results.held
            ? 'You took this seat yourself during add/drop.'
            : 'You are on the waitlist for the courses you ranked.'}
      </p>
      <Link to="/student/results" className={dashboard.link}>
        <ListChecks aria-hidden="true" className={dashboard.linkIcon} />
        See why
      </Link>
    </div>
  );
}

/** The cart at a glance, with the one link that continues the flow. */
function CartSummary({ cart }: { cart: PreferenceCart | null }) {
  if (!cart) {
    return <Skeleton lines={2} />;
  }
  if (cart.status === 'SUBMITTED') {
    return (
      <div className={dashboard.eligibility}>
        <p className={dashboard.count}>Submitted</p>
        <p className={dashboard.muted}>
          {cart.items.length} {cart.items.length === 1 ? 'choice' : 'choices'}
          {cart.reference ? ` · ${cart.reference}` : ''}
        </p>
        <Link to="/student/cart" className={dashboard.link}>
          <ShoppingCart aria-hidden="true" className={dashboard.linkIcon} />
          See your receipt
        </Link>
      </div>
    );
  }
  return (
    <div className={dashboard.eligibility}>
      <p className={dashboard.count}>
        {cart.items.length} of {MAX_PREFERENCES} ranked
      </p>
      <p className={dashboard.muted}>
        {cart.items.length === 0
          ? 'Nothing ranked yet. Add courses from the catalogue.'
          : `${cart.totalCredits} credits. Not submitted yet.`}
      </p>
      <Link to="/student/cart" className={dashboard.link}>
        <ShoppingCart aria-hidden="true" className={dashboard.linkIcon} />
        Open your cart
      </Link>
    </div>
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
