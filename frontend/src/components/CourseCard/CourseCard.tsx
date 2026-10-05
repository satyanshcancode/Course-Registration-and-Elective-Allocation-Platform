import type { CatalogueCourse } from '@course-reg/shared';
import { Ban, Users } from 'lucide-react';
import { Link, type To } from 'react-router';
import { describeDemand } from '../../utils/courseText';
import type { CartAction as CartActionState } from '../../utils/cartActions';
import { describeReason } from '../../utils/eligibilityText';
import { CartAction } from '../CartAction';
import { CourseArtwork } from '../CourseArtwork';
import { EligibilityBadge, MyStatusBadge } from '../CourseBadges';
import { CourseCode } from '../CourseCode';
import { Icon } from '../Icon';
import { SeatMeter } from '../SeatMeter';
import styles from './CourseCard.module.css';

export interface CourseCardProps {
  course: CatalogueCourse;
  /** The course detail page (carrying the catalogue's filters for the way back). */
  to: To;
  /** History state for the link (e.g. the catalogue filters to return to). */
  linkState?: unknown;
  /** The seat numbers just changed: flash them briefly. */
  seatsChanged?: boolean;
  headingLevel?: 2 | 3;
  /**
   * What the cart offers for this course (from `cartActionFor`). The button it
   * draws has no onClick: the list around these cards delegates the click.
   */
  cartAction?: CartActionState | null;
}

/**
 * One catalogue entry: a band of the department's generated artwork, then the
 * code, the student's own standing, the name and summary, live seats and
 * demand, and the two things there are to do with it.
 *
 * Why the department's full name is not printed here: the row above has room
 * for the code and the student's status, and the department code sits beside
 * the credits. The full name is on the course page and in the table view.
 */
export function CourseCard({
  course,
  to,
  linkState,
  seatsChanged = false,
  headingLevel = 2,
  cartAction = null,
}: CourseCardProps) {
  const Heading = `h${headingLevel}` as const;
  const { personal } = course;
  // The first reason only: it is what explains the disabled button beside it,
  // and the rest of the checklist is on the course page.
  const firstReason =
    personal && !personal.eligibility.eligible ? personal.eligibility.reasons[0] : undefined;

  return (
    <article className={styles.card} data-course-code={course.code}>
      <CourseArtwork code={course.code} departmentCode={course.department.code} />

      <div className={styles.body}>
        <p className={styles.meta}>
          <CourseCode code={course.code} size="sm" />
          {/* One chip, not two: a student who has already ranked, been given
              or been waitlisted for a course is told THAT, because it is what
              has happened; otherwise the chip answers the question they came
              with, which is whether they may take it. */}
          {personal &&
            (personal.myStatus.code === 'NOT_SELECTED' ? (
              <EligibilityBadge eligibility={personal.eligibility} />
            ) : (
              <>
                <span className="visually-hidden">Your status: </span>
                <MyStatusBadge status={personal.myStatus} />
              </>
            ))}
          <span className={styles.credits}>
            {course.department.code} · {course.credits} credits
          </span>
        </p>

        <Heading className={styles.title}>
          <Link to={to} state={linkState} className={styles.link}>
            {course.name}
          </Link>
        </Heading>
        {course.shortDescription && <p className={styles.summary}>{course.shortDescription}</p>}

        <div className={styles.live} data-changed={seatsChanged ? 'true' : undefined}>
          <SeatMeter
            allocated={course.allocated}
            capacity={course.capacity}
            label={`Seats in ${course.name}`}
          />
          <p className={styles.demand}>
            <Icon icon={Users} />
            <span>{describeDemand(course.demand, course.capacity)}</span>
          </p>
        </div>

        {firstReason && (
          <p className={styles.reason}>
            <Icon icon={Ban} />
            {describeReason(firstReason)}
          </p>
        )}

        <div className={styles.actions}>
          <Link to={to} state={linkState} className={styles.details}>
            View details
            <span className="visually-hidden"> for {course.name}</span>
          </Link>
          {cartAction && <CartAction action={cartAction} code={course.code} name={course.name} />}
        </div>
      </div>
    </article>
  );
}
