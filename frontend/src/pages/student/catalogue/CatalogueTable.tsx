import type { CatalogueCourse } from '@course-reg/shared';
import { ArrowRight } from 'lucide-react';
import type { MouseEvent } from 'react';
import { EligibilityBadge, MyStatusBadge } from '../../../components/CourseBadges';
import { CourseCode } from '../../../components/CourseCode';
import { DataTable } from '../../../components/DataTable';
import type { Column } from '../../../components/DataTable/tableLogic';
import { Icon } from '../../../components/Icon';
import { SeatMeter } from '../../../components/SeatMeter';
import { CartAction } from '../../../components/CartAction';
import { cartActionFor, type CART_ACTIONS, type CartSnapshot } from '../../../utils/cartActions';
import { describeDemand } from '../../../utils/courseText';
import { describeReason } from '../../../utils/eligibilityText';
import { findRowAction } from '../../../utils/tableActions';
import styles from './CatalogueTable.module.css';

/** Every action a row button can ask for; "view" is always handled. */
export type CatalogueRowActionName = 'view' | (typeof CART_ACTIONS)[keyof typeof CART_ACTIONS];

export type CatalogueRowActions = Partial<
  Record<CatalogueRowActionName, (courseCode: string) => void>
> &
  Record<'view', (courseCode: string) => void>;

export interface CatalogueTableProps {
  courses: readonly CatalogueCourse[];
  /** Codes whose seat numbers just changed (briefly highlighted). */
  changed: ReadonlySet<string>;
  actions: CatalogueRowActions;
  caption: string;
  /** The cart the add/remove column acts on; null hides the column. */
  cart?: CartSnapshot | null;
}

function isKnownAction(
  action: string,
  actions: CatalogueRowActions,
): action is CatalogueRowActionName {
  return Object.hasOwn(actions, action);
}

/**
 * The catalogue as a table: the same data as the cards, one page from the
 * server (which sorts and pages). Row buttons carry data-action and
 * data-course-code, and ONE listener on the table body handles them all.
 */
export function CatalogueTable({
  courses,
  changed,
  actions,
  caption,
  cart = null,
}: CatalogueTableProps) {
  const columns: Column<CatalogueCourse>[] = [
    {
      id: 'code',
      header: 'Code',
      key: 'code',
      cell: (course) => <CourseCode code={course.code} size="sm" />,
    },
    { id: 'name', header: 'Course', key: 'name' },
    { id: 'credits', header: 'Credits', key: 'credits', align: 'end' },
    { id: 'department', header: 'Dept', accessor: (course) => course.department.code },
    {
      id: 'seats',
      header: 'Seats',
      key: 'available',
      cell: (course) => (
        <span className={styles.live} data-changed={changed.has(course.code) ? 'true' : undefined}>
          <SeatMeter
            compact
            allocated={course.allocated}
            capacity={course.capacity}
            label={`Seats in ${course.name}`}
          />
          <span className={styles.left}>{course.available} left</span>
        </span>
      ),
    },
    {
      id: 'demand',
      header: 'Demand',
      key: 'demand',
      cell: (course) => (
        <span className={styles.live} data-changed={changed.has(course.code) ? 'true' : undefined}>
          {describeDemand(course.demand, course.capacity)}
        </span>
      ),
    },
    {
      id: 'eligibility',
      header: 'Eligibility',
      accessor: (course) => (course.personal?.eligibility.eligible ? 'Eligible' : 'Not eligible'),
      cell: (course) =>
        course.personal && (
          <span className={styles.eligibility}>
            <EligibilityBadge eligibility={course.personal.eligibility} />
            {!course.personal.eligibility.eligible && course.personal.eligibility.reasons[0] && (
              <span className={styles.reason}>
                {describeReason(course.personal.eligibility.reasons[0])}
              </span>
            )}
          </span>
        ),
    },
    {
      id: 'status',
      header: 'Your status',
      accessor: (course) => course.personal?.myStatus.code,
      cell: (course) => course.personal && <MyStatusBadge status={course.personal.myStatus} />,
    },
    ...(cart
      ? [
          {
            id: 'cart',
            header: 'Cart',
            accessor: (course: CatalogueCourse) => cart.codes.indexOf(course.code) + 1 || null,
            searchable: false,
            cell: (course: CatalogueCourse) => (
              <CartAction
                compact
                action={cartActionFor(course.code, course.personal?.eligibility, cart)}
                code={course.code}
                name={course.name}
              />
            ),
          } satisfies Column<CatalogueCourse>,
        ]
      : []),
    {
      id: 'actions',
      header: 'Actions',
      accessor: () => null,
      searchable: false,
      cell: (course) => (
        // No onClick here: the click bubbles to the <tbody> listener below.
        <button
          type="button"
          className={styles.action}
          data-action="view"
          data-course-code={course.code}
        >
          <span>View details</span>
          <span className="visually-hidden"> of {course.name}</span>
          <Icon icon={ArrowRight} />
        </button>
      ),
    },
  ];

  // Event delegation. event.currentTarget is the <tbody> this single listener
  // is attached to; event.target is whatever was actually clicked, which may be
  // the icon or text inside a button. The click bubbles from the target up to
  // the tbody, and findRowAction walks back up with closest() to the button.
  const handleBodyClick = (event: MouseEvent<HTMLTableSectionElement>) => {
    const found = findRowAction(event.target, event.currentTarget);
    if (found && isKnownAction(found.action, actions)) {
      actions[found.action]?.(found.courseCode);
    }
  };

  return (
    <DataTable
      caption={caption}
      captionHidden
      rows={courses}
      columns={columns}
      getRowId={(course) => course.code}
      filterable={false}
      paginated={false}
      itemName={{ one: 'course', other: 'courses' }}
      onBodyClick={handleBodyClick}
    />
  );
}
