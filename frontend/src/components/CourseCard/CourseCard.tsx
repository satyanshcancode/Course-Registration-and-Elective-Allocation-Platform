import type { CatalogueCourse } from '@course-reg/shared';
import { TrendingUp, Users } from 'lucide-react';
import { Link, type To } from 'react-router';
import { describeDemand, isOversubscribed } from '../../utils/courseText';
import type { CartAction as CartActionState } from '../../utils/cartActions';
import { describeReason } from '../../utils/eligibilityText';
import { CartAction } from '../CartAction';
import { Badge } from '../Badge';
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
 * One catalogue entry, set like an index card: code and credits, the name,
 * live seats, demand, the student's eligibility and their own status, which
 * sits in the corner like a registrar's stamp.
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
  const firstReason =
    personal && !personal.eligibility.eligible ? personal.eligibility.reasons[0] : undefined;
  const hot = isOversubscribed(course.demand, course.capacity);

  return (
    <article className={styles.card} data-course-code={course.code}>
      {personal && (
        <div className={styles.stamp}>
          <span className="visually-hidden">Your status: </span>
          <MyStatusBadge status={personal.myStatus} />
        </div>
      )}

      <header className={styles.header}>
        <p className={styles.meta}>
          <CourseCode code={course.code} size="sm" />
          <span>{course.credits} credits</span>
        </p>
        <p className={styles.department}>{course.department.name}</p>
        <Heading className={styles.title}>
          <Link to={to} state={linkState} className={styles.link}>
            {course.name}
          </Link>
        </Heading>
        {course.shortDescription && <p className={styles.summary}>{course.shortDescription}</p>}
      </header>

      <div className={styles.live} data-changed={seatsChanged ? 'true' : undefined}>
        <SeatMeter
          allocated={course.allocated}
          capacity={course.capacity}
          label={`Seats in ${course.name}`}
        />
        <p className={styles.demand}>
          <Icon icon={Users} />
          <span>{describeDemand(course.demand, course.capacity)}</span>
          {hot && (
            <Badge tone="warning" icon={TrendingUp}>
              Oversubscribed
            </Badge>
          )}
        </p>
      </div>

      <dl className={styles.facts}>
        {personal && (
          <div className={styles.fact}>
            <dt>Eligibility</dt>
            <dd className={styles.eligibility}>
              <EligibilityBadge eligibility={personal.eligibility} />
              {firstReason && <span className={styles.reason}>{describeReason(firstReason)}</span>}
            </dd>
          </div>
        )}
        <div className={styles.fact}>
          <dt>Prerequisites</dt>
          <dd className={styles.codes}>
            {course.prerequisites.length === 0
              ? 'None'
              : course.prerequisites.map((prerequisite) => (
                  <abbr key={prerequisite.code} title={prerequisite.name}>
                    <CourseCode code={prerequisite.code} size="sm" />
                  </abbr>
                ))}
          </dd>
        </div>
      </dl>

      {cartAction && (
        <div className={styles.cart}>
          <CartAction action={cartAction} code={course.code} name={course.name} />
        </div>
      )}
    </article>
  );
}
