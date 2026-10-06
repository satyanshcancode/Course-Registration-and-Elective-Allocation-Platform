import {
  MAX_PREFERENCES,
  type HistoryPage,
  type RegistrationWindowSummary,
  type EligibilityOverview,
  type PreferenceCart,
  type StudentAllocationResults,
} from '@course-reg/shared';
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  CircleCheck,
  Clock,
  GraduationCap,
  ScanSearch,
  ShoppingCart,
  SquareCheckBig,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { getMyHistory } from '../../api/activityApi';
import { getMyAllocationResults } from '../../api/allocationApi';
import { getEligibility } from '../../api/eligibilityApi';
import { unwrap } from '../../api/unwrap';
import { LinkButton } from '../../components/Button';
import { Card } from '../../components/Card';
import { Icon } from '../../components/Icon';
import { ErrorMessage } from '../../components/ErrorMessage';
import { PageHeader } from '../../components/PageHeader';
import { ProgressRing } from '../../components/ProgressRing';
import { Skeleton } from '../../components/Skeleton';
import { StatTile } from '../../components/StatTile';
import { StatusBadge } from '../../components/StatusBadge';
import { useCurrentStudent } from '../../hooks/useAuth';
import { useCart } from '../../hooks/useCart';
import { useDashboardSections } from '../../hooks/useDashboardSections';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import {
  useRegistrationWindow,
  type RegistrationWindowData,
} from '../../hooks/useRegistrationWindow';
import { useServerClock } from '../../hooks/useServerClock';
import type { AsyncState } from '../../types/asyncState';
import { describeCountdown } from '../../utils/countdown';
import { firstNameOf, greetingFor } from '../../utils/greeting';
import { formatDateTime, formatRelative } from '../../utils/formatDate';
import { describeHistoryEvent, historyEventIcon } from '../../utils/historyText';
import { WINDOW_STEPS, windowStepIndex } from '../../utils/windowTimeline';
import styles from './StudentDashboardPage.module.css';

interface DashboardData extends Record<string, unknown> {
  eligibility: EligibilityOverview;
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
        'Submit before the window closes: a saved draft is not a submission.',
      ];
    }
    return [
      `You have ${cart.items.length} of ${MAX_PREFERENCES} courses ranked. Check the order.`,
      'Submit before the window closes: a saved draft is not a submission.',
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
        'Submit before the window closes: a saved draft is not a submission.',
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
  // The window comes from the student area's provider rather than a request of
  // this page's own: the sidebar card, the greeting and this page's timeline
  // then share one request AND one measurement of the server's clock.
  const registration = useRegistrationWindow();
  const windowState: AsyncState<RegistrationWindowData> = registration?.state ?? {
    status: 'loading',
  };
  const windowData = windowState.status === 'success' ? windowState.data : undefined;

  // Three independent requests, together: one failure must not blank the page.
  // The unread count is not among them either — the shell's bell loads it once
  // for the whole student area.
  const { sections, retry } = useDashboardSections<DashboardData>({
    eligibility: async (signal) => unwrap(await getEligibility(signal)),
    results: async (signal) => unwrap(await getMyAllocationResults(signal)),
    activity: async (signal) => unwrap(await getMyHistory({ limit: RECENT_EVENTS }, signal)),
  });

  const eligibility =
    sections.eligibility.status === 'success' ? sections.eligibility.data : undefined;
  const results = sections.results.status === 'success' ? sections.results.data : null;

  // The server's clock, so neither the greeting nor the countdown can be moved
  // by a device set to the wrong date.
  const clock = useServerClock(windowData?.clockOffsetMs ?? 0, windowData !== undefined);

  if (!user) {
    return null;
  }
  const { student } = user;
  const windowSummary = windowData?.window ?? null;
  const waitlisted = results?.results.filter((row) => row.outcome === 'WAITLISTED').length ?? 0;
  const held = results?.allocated ?? results?.held ?? null;

  return (
    <>
      <PageHeader
        title={`${greetingFor(clock)}, ${firstNameOf(student.name)}`}
        titleAside={
          <span className={styles.wave} aria-hidden="true">
            {' '}
            👋
          </span>
        }
        description={
          windowSummary
            ? `Here’s your registration overview for ${windowSummary.name}.`
            : 'Here’s your registration overview.'
        }
        actions={<WindowPill window={windowSummary} clock={clock} />}
      />

      <div className={styles.page}>
        <section className={styles.stats} aria-label="At a glance">
          <StatTile
            icon={BookOpen}
            tone="info"
            value={
              eligibility
                ? `${eligibility.summary.eligibleCount} / ${eligibility.summary.totalCount}`
                : '—'
            }
            label="Eligible courses"
            to="/student/eligibility"
            linkLabel="View eligible"
          />
          <StatTile
            icon={ShoppingCart}
            tone="danger"
            value={cart ? String(cart.cart?.items.length ?? 0) : '—'}
            label="In your cart"
            to="/student/cart"
            linkLabel="View cart"
          />
          <StatTile
            icon={CircleCheck}
            tone="success"
            value={results ? String(held ? 1 : 0) : '—'}
            label="Confirmed"
            to="/student/results"
            linkLabel="View results"
          />
          <StatTile
            icon={Clock}
            tone="warning"
            value={results ? String(waitlisted) : '—'}
            label="On waitlist"
            to="/student/waitlist"
            linkLabel="View waitlist"
          />
        </section>

        <div className={styles.row}>
          <Section
            title="Registration window"
            icon={CalendarDays}
            state={windowState}
            titleAside={
              windowSummary ? (
                <StatusBadge kind="window" status={windowSummary.status} />
              ) : undefined
            }
            onRetry={() => {
              registration?.retry();
            }}
          >
            {(data) =>
              data.window ? <WindowTimeline window={data.window} clock={clock} /> : <NoWindow />
            }
          </Section>

          <Section
            title="Your allocation"
            icon={GraduationCap}
            state={sections.results}
            action={
              results?.ranAt ? (
                <Link to="/student/results" className={styles.cardLink}>
                  View all
                  <Icon icon={ArrowRight} />
                </Link>
              ) : undefined
            }
            onRetry={() => {
              retry('results');
            }}
          >
            {(data) => <Allocation results={data} />}
          </Section>
        </div>

        <div className={styles.row}>
          <Section
            title="Eligibility status"
            icon={SquareCheckBig}
            state={sections.eligibility}
            onRetry={() => {
              retry('eligibility');
            }}
          >
            {(data) => <EligibilityStatus overview={data} />}
          </Section>

          <Section
            title="Recent activity"
            icon={Clock}
            state={sections.activity}
            action={
              <Link to="/student/history" className={styles.cardLink}>
                View all
                <Icon icon={ArrowRight} />
              </Link>
            }
            onRetry={() => {
              retry('activity');
            }}
          >
            {(data) => <RecentActivity page={data} />}
          </Section>
        </div>

        <Card title="What to do next" headingLevel={2}>
          <ol className={styles.steps}>
            {nextSteps(
              windowSummary,
              cart?.cart ?? null,
              results,
              windowData ? clock.getTime() : 0,
            ).map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </Card>
      </div>
    </>
  );
}

/** The window's status and its live countdown, beside the greeting. */
function WindowPill({ window, clock }: { window: RegistrationWindowSummary | null; clock: Date }) {
  if (!window) {
    return null;
  }
  const countdown = describeCountdown(window, clock);
  // Where the countdown is actually spent: the catalogue while the window is
  // open, add/drop once results are out.
  const to = window.status === 'ALLOCATED' ? '/student/add-drop' : '/student/courses';

  return (
    <Link to={to} className={styles.pill}>
      <span className={styles.pillTop}>
        <StatusBadge kind="window" status={window.status} />
      </span>
      <span className={styles.pillBottom}>
        {countdown.remaining ? (
          <>
            {countdown.label} <strong className={styles.pillValue}>{countdown.remaining}</strong>
          </>
        ) : (
          countdown.text
        )}
      </span>
      <Icon icon={ArrowRight} className={styles.pillArrow} />
    </Link>
  );
}

/** Opens, closes, and the four steps between, with the current one marked. */
function WindowTimeline({ window, clock }: { window: RegistrationWindowSummary; clock: Date }) {
  const current = windowStepIndex(window, clock);
  return (
    <div className={styles.window}>
      <p className={styles.windowName}>{window.name}</p>
      <dl className={styles.schedule}>
        <div className={styles.scheduleItem}>
          <dt>Opens</dt>
          <dd>{formatDateTime(window.startsAt)}</dd>
        </div>
        <div className={styles.scheduleItem}>
          <dt>Closes</dt>
          <dd>{formatDateTime(window.endsAt)}</dd>
        </div>
      </dl>
      {/* An ordered list, so the steps are read as a sequence; the current one
          says so in words as well as in colour. */}
      <ol className={styles.timeline}>
        {WINDOW_STEPS.map((step, index) => (
          <li
            key={step}
            className={styles.step}
            data-state={index < current ? 'done' : index === current ? 'current' : 'todo'}
          >
            <span className={styles.dot} />
            <span className={styles.stepLabel}>
              {step}
              {index === current && <span className="visually-hidden"> (now)</span>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function NoWindow() {
  return <p className={styles.muted}>No registration window has been scheduled yet.</p>;
}

/**
 * The seat the student holds, if any. A course taken during add/drop was never
 * part of the run, so it has a seat but no explanation to show.
 */
function Allocation({ results }: { results: StudentAllocationResults }) {
  if (!results.ranAt) {
    return <p className={styles.muted}>Results appear here once allocation has run.</p>;
  }
  const held = results.allocated ?? results.held;
  if (!held) {
    return (
      <div className={styles.allocation}>
        <div className={styles.allocationText}>
          <p className={styles.courseName}>No seat this round</p>
          <p className={styles.muted}>
            Open your results to see how close you came on each course you ranked.
          </p>
          <LinkButton to="/student/results" size="sm" iconEnd={ArrowRight}>
            See details
          </LinkButton>
        </div>
        <SeatCube />
      </div>
    );
  }

  return (
    <div className={styles.allocation}>
      <div className={styles.allocationText}>
        <p className={styles.courseCode}>{held.course.code}</p>
        <p className={styles.courseName}>{held.course.name}</p>
        <p className={styles.muted}>
          {results.allocated
            ? `Your choice ${results.allocated.preferenceRank}.${
                results.allocated.type === 'PROMOTED' ? ' Promoted from the waitlist.' : ''
              }`
            : 'You took this seat yourself during add/drop.'}
        </p>
        <StatusBadge kind="allocation" status="ALLOCATED" />
        <LinkButton to="/student/results" size="sm" iconEnd={ArrowRight}>
          See details
        </LinkButton>
      </div>
      <SeatCube />
    </div>
  );
}

/**
 * Decoration: a seat drawn as a solid block inside the space that was open for
 * it. Original artwork, drawn here rather than shipped as an image so it takes
 * the theme's colours and costs no request.
 */
function SeatCube() {
  return (
    <svg className={styles.cube} viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      {/* The open space around the seat: an isometric wireframe box. */}
      <g className={styles.cubeFrame}>
        <path d="M60 8 L112 38 L60 68 L8 38 Z" />
        <path d="M8 38 L8 82 L60 112 L112 82 L112 38" />
        <path d="M60 68 L60 112" />
      </g>
      {/* The seat itself, solid: top, left face, right face. */}
      <path className={styles.cubeTop} d="M60 34 L95 54 L60 74 L25 54 Z" />
      <path className={styles.cubeLeft} d="M25 54 L25 82 L60 102 L60 74 Z" />
      <path className={styles.cubeRight} d="M95 54 L95 82 L60 102 L60 74 Z" />
    </svg>
  );
}

/** The proportion of the catalogue this student can take, and why. */
function EligibilityStatus({ overview }: { overview: EligibilityOverview }) {
  const { eligibleCount, totalCount } = overview.summary;
  return (
    <div className={styles.eligibility}>
      <ProgressRing value={eligibleCount} max={totalCount} label="courses" size={120} />
      <div className={styles.eligibilityText}>
        <p className={styles.count}>
          You’re eligible for {eligibleCount} of {totalCount} courses
        </p>
        <p className={styles.muted}>
          Based on your programme, semester {overview.student.semester},{' '}
          {overview.student.creditsCompleted} credits and {overview.student.completedCourses.length}{' '}
          passed courses.
        </p>
        <LinkButton to="/student/eligibility" size="sm" iconStart={ScanSearch} iconEnd={ArrowRight}>
          Run full pre-check
        </LinkButton>
      </div>
    </div>
  );
}

/** The last few events, in the words the history page uses. */
function RecentActivity({ page }: { page: HistoryPage }) {
  if (page.events.length === 0) {
    return (
      <p className={styles.muted}>
        Nothing has happened yet. Submissions, allocation and add/drop changes all appear here.
      </p>
    );
  }
  return (
    <ol className={styles.activity}>
      {page.events.map((event) => (
        <li key={event.id} className={styles.event}>
          <span className={styles.eventIcon}>
            <Icon icon={historyEventIcon(event.detail.type)} />
          </span>
          <span className={styles.eventText}>{describeHistoryEvent(event)}</span>
          <time dateTime={event.at} className={styles.eventTime}>
            {formatRelative(event.at)}
          </time>
        </li>
      ))}
    </ol>
  );
}

interface SectionProps<T> {
  title: string;
  icon: LucideIcon;
  state: AsyncState<T>;
  /** A badge beside the title: what the card is about, not an action. */
  titleAside?: ReactNode;
  /** A link or button aligned with the title. */
  action?: ReactNode;
  onRetry: () => void;
  children: (data: T) => ReactNode;
}

/** One dashboard card with its own loading, error-with-retry and success states. */
function Section<T>({
  title,
  icon,
  state,
  titleAside,
  action,
  onRetry,
  children,
}: SectionProps<T>) {
  return (
    <Card
      title={title}
      titleIcon={icon}
      titleAside={state.status === 'success' ? titleAside : undefined}
      headingLevel={2}
      actions={state.status === 'success' ? action : undefined}
    >
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
