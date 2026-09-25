import type { CourseDetail, MyCourseStatusCode } from '@course-reg/shared';
import { ArrowLeft, BookX, CircleCheck, CircleX, TrendingUp, Users } from 'lucide-react';
import type { MouseEvent } from 'react';
import { useLocation, useParams } from 'react-router';
import { isNotFound } from '../../api/unwrap';
import { Badge } from '../../components/Badge';
import { CartAction } from '../../components/CartAction';
import { LinkButton } from '../../components/Button';
import { EligibilityBadge, MyStatusBadge } from '../../components/CourseBadges';
import { CourseCode } from '../../components/CourseCode';
import { EmptyState } from '../../components/EmptyState';
import { ErrorMessage } from '../../components/ErrorMessage';
import { Icon } from '../../components/Icon';
import { LiveSeatsIndicator } from '../../components/LiveSeatsIndicator';
import { PageHeader } from '../../components/PageHeader';
import { RegistrationStatusBanner } from '../../components/RegistrationStatusBanner';
import { SeatMeter } from '../../components/SeatMeter';
import { Skeleton } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import { useCart } from '../../hooks/useCart';
import { useCourseDetail } from '../../hooks/useCourseDetail';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useLiveSeats } from '../../hooks/useLiveSeats';
import { cartActionFor, CART_ACTIONS } from '../../utils/cartActions';
import { describeDemand, isOversubscribed } from '../../utils/courseText';
import { describeReason } from '../../utils/eligibilityText';
import { seatsNewerThan, withLiveSeats } from '../../utils/liveSeats';
import { findRowAction } from '../../utils/tableActions';
import styles from './CourseDetailPage.module.css';

/** The catalogue URL to go back to, with the filters the student came from. */
function catalogueHref(state: unknown): string {
  const search =
    typeof state === 'object' &&
    state !== null &&
    'catalogueSearch' in state &&
    typeof state.catalogueSearch === 'string' &&
    state.catalogueSearch.startsWith('?')
      ? state.catalogueSearch
      : '';
  return `/student/courses${search}`;
}

export function CourseDetailPage() {
  const { code = '' } = useParams();
  const upperCode = code.toUpperCase();
  const location = useLocation();
  const backHref = catalogueHref(location.state);
  const { state, retry } = useCourseDetail(upperCode);
  const live = useLiveSeats({ enabled: state.status === 'success' });

  const loaded = state.status === 'success' ? state.data : undefined;
  const course = loaded
    ? withLiveSeats(loaded, seatsNewerThan(live.snapshot, live.seats, loaded.serverTime))
    : undefined;
  useDocumentTitle(course ? `${course.code} ${course.name}` : upperCode);

  const backLink = (
    <LinkButton to={backHref} variant="ghost" iconStart={ArrowLeft}>
      Back to the catalogue
    </LinkButton>
  );

  return (
    <>
      <PageHeader
        title={course?.name ?? upperCode}
        kicker={course ? `${course.window.name} · Catalogue` : 'Catalogue'}
        description={
          course && (
            <span className={styles.meta}>
              <CourseCode code={course.code} />
              <span>{course.credits} credits</span>
              <span>{course.department.name}</span>
            </span>
          )
        }
        actions={backLink}
      >
        <RegistrationStatusBanner />
        {course && <LiveSeatsIndicator updatedAt={live.updatedAt} failing={live.failing} />}
      </PageHeader>

      <div className={styles.body}>
        {state.status === 'error' &&
          (isNotFound(state.error) ? (
            <EmptyState title={`${upperCode} isn’t in this term’s catalogue`} icon={BookX}>
              <p>
                Check the code, or find the course in the catalogue. Only courses offered in the
                current registration window are listed.
              </p>
            </EmptyState>
          ) : (
            <ErrorMessage
              title="This course couldn’t be loaded"
              message={state.message}
              onRetry={retry}
            />
          ))}

        {(state.status === 'loading' || state.status === 'idle') && <DetailSkeleton />}

        {course && (
          <CourseDetailBody course={course} seatsChanged={live.changed.has(course.code)} />
        )}
      </div>
    </>
  );
}

function CourseDetailBody({
  course,
  seatsChanged,
}: {
  course: CourseDetail;
  seatsChanged: boolean;
}) {
  const { personal } = course;
  const cartContext = useCart();
  const cart = cartContext?.snapshot ?? null;
  const toast = useToast();

  // The same delegated handler as the catalogue: the button carries its intent
  // in data-action, and this one listener on the <article> reads it.
  const handleClick = (event: MouseEvent<HTMLElement>) => {
    const found = findRowAction(event.target, event.currentTarget);
    if (!found || !cartContext) {
      return;
    }
    const adding = found.action === CART_ACTIONS.add;
    void (adding ? cartContext.add(found.courseCode) : cartContext.remove(found.courseCode)).then(
      (result) => {
        toast.show(
          result.ok
            ? { tone: 'success', title: adding ? 'Added to your cart' : 'Removed from your cart' }
            : { tone: 'warning', title: 'Your cart wasn’t changed', message: result.message },
        );
      },
    );
  };

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- delegation only: the click comes from a real button
    <article
      className={styles.layout}
      aria-label={`${course.code} ${course.name}`}
      onClick={handleClick}
    >
      <div className={styles.main}>
        <section className={styles.section} aria-labelledby="about-heading">
          <h2 id="about-heading" className={styles.heading}>
            About this course
          </h2>
          <p className={styles.description}>{course.description}</p>
        </section>

        {personal && (
          <section className={styles.section} aria-labelledby="eligibility-heading">
            <h2 id="eligibility-heading" className={styles.heading}>
              Your eligibility
            </h2>
            <EligibilityBadge eligibility={personal.eligibility} />
            {personal.eligibility.eligible ? (
              <p className={styles.note}>
                You meet every requirement: semester {course.minSemester} or later,{' '}
                {course.minCredits} completed credits, the programme and the prerequisites.
              </p>
            ) : (
              <ul className={styles.checklist}>
                {personal.eligibility.reasons.map((reason) => (
                  <li key={describeReason(reason)} className={styles.check} data-met="false">
                    <Icon icon={CircleX} />
                    <span>{describeReason(reason)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section className={styles.section} aria-labelledby="prerequisites-heading">
          <h2 id="prerequisites-heading" className={styles.heading}>
            Prerequisites
          </h2>
          {course.prerequisites.length === 0 ? (
            <p className={styles.note}>None: any student who meets the other rules can take it.</p>
          ) : (
            <ul className={styles.checklist}>
              {course.prerequisites.map((prerequisite) => (
                <li
                  key={prerequisite.code}
                  className={styles.check}
                  data-met={prerequisite.met === null ? undefined : String(prerequisite.met)}
                >
                  {prerequisite.met !== null && (
                    <Icon icon={prerequisite.met ? CircleCheck : CircleX} />
                  )}
                  <CourseCode code={prerequisite.code} size="sm" />
                  <span>{prerequisite.name}</span>
                  {prerequisite.met !== null && (
                    <span className={styles.checkState}>
                      {prerequisite.met ? 'Passed' : 'Not passed yet'}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={styles.section} aria-labelledby="programmes-heading">
          <h2 id="programmes-heading" className={styles.heading}>
            Eligible programmes
          </h2>
          {course.eligiblePrograms.length === 0 ? (
            <p className={styles.note}>Open to students of every programme.</p>
          ) : (
            <ul className={styles.plainList}>
              {course.eligiblePrograms.map((program) => (
                <li key={program.code}>{program.name}</li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <aside className={styles.aside} aria-label="Seats and your status">
        <section
          className={styles.panel}
          aria-labelledby="seats-heading"
          data-changed={seatsChanged ? 'true' : undefined}
        >
          <h2 id="seats-heading" className={styles.panelHeading}>
            Seats
          </h2>
          <SeatMeter
            allocated={course.allocated}
            capacity={course.capacity}
            label={`Seats in ${course.name}`}
          />
          <p className={styles.demand}>
            <Icon icon={Users} />
            <span>{describeDemand(course.demand, course.capacity)}</span>
          </p>
          {isOversubscribed(course.demand, course.capacity) && (
            <>
              <Badge tone="warning" icon={TrendingUp}>
                Oversubscribed
              </Badge>
              <p className={styles.note}>
                More students ranked this course than it has seats, so seats go by preference and
                priority when the window closes.
              </p>
            </>
          )}
        </section>

        {personal && (
          <section className={styles.panel} aria-labelledby="status-heading">
            <h2 id="status-heading" className={styles.panelHeading}>
              Your status
            </h2>
            <MyStatusBadge status={personal.myStatus} />
            <p className={styles.note}>{statusExplanation(personal.myStatus.code)}</p>
            <div className={styles.cartSlot} data-slot="cart-action">
              <CartAction
                action={cartActionFor(course.code, personal.eligibility, cart)}
                code={course.code}
                name={course.name}
              />
            </div>
          </section>
        )}
      </aside>
    </article>
  );
}

function statusExplanation(code: MyCourseStatusCode): string {
  switch (code) {
    case 'NOT_SELECTED':
      return 'This course isn’t in your cart.';
    case 'IN_DRAFT_CART':
      return 'Saved in your draft cart. It counts once you submit.';
    case 'SUBMITTED':
      return 'Part of your submitted preferences. Results come after allocation.';
    case 'ENROLLED':
      return 'You hold a seat in this course.';
    case 'WAITLISTED':
      return 'You’re on the waitlist and move up automatically when a seat frees up.';
  }
}

function DetailSkeleton() {
  return (
    <div className={styles.layout} aria-hidden="true">
      <div className={styles.main}>
        <Skeleton width="30%" />
        <Skeleton lines={3} />
        <Skeleton width="40%" />
        <Skeleton lines={2} />
      </div>
      <div className={styles.aside}>
        <Skeleton height="7rem" />
      </div>
    </div>
  );
}
