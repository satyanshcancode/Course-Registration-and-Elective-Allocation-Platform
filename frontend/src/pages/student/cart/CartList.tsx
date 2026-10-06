import type { CartItem } from '@course-reg/shared';
import { TriangleAlert } from 'lucide-react';
import { useState, type DragEvent, type Ref } from 'react';
import { CourseCode } from '../../../components/CourseCode';
import { Icon } from '../../../components/Icon';
import { SeatMeter } from '../../../components/SeatMeter';
import { Select } from '../../../components/Select';
import { describeReason } from '../../../utils/eligibilityText';
import type { ProblemsByCode } from './cartProblems';
import styles from './CartPage.module.css';

export interface CartListProps {
  /** In working order: index 0 is the first choice. */
  items: readonly CartItem[];
  editable: boolean;
  /** Server refusals, keyed by course code. */
  problems: ProblemsByCode;
  /** Put the course at `from` at position `to` (both zero-based). */
  onReorder: (from: number, to: number) => void;
  onRemove: (code: string) => void;
  listRef: Ref<HTMLTableSectionElement>;
}

/**
 * The ranked list as a table, with the rank in its own column so it survives
 * with CSS off and is read as part of each row.
 *
 * The Priority select is the real control: it works with a keyboard, a screen
 * reader and a touch screen, and it moves a course straight to a rank instead
 * of a step at a time. Dragging is added on top with the native HTML5 drag
 * events and never becomes the only way to reorder.
 */
export function CartList({
  items,
  editable,
  problems,
  onReorder,
  onRemove,
  listRef,
}: CartListProps) {
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const handleDragStart = (index: number) => (event: DragEvent<HTMLTableRowElement>) => {
    setDraggingIndex(index);
    event.dataTransfer.effectAllowed = 'move';
    // Firefox only starts a drag once some data is set.
    event.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragOver = (index: number) => (event: DragEvent<HTMLTableRowElement>) => {
    if (draggingIndex === null) {
      return;
    }
    // Without preventDefault the browser refuses the drop.
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setOverIndex(index);
  };

  const handleDrop = (index: number) => (event: DragEvent<HTMLTableRowElement>) => {
    event.preventDefault();
    if (draggingIndex !== null && draggingIndex !== index) {
      onReorder(draggingIndex, index);
    }
    setDraggingIndex(null);
    setOverIndex(null);
  };

  const endDrag = () => {
    setDraggingIndex(null);
    setOverIndex(null);
  };

  const ranks = items.map((_, index) => ({ value: String(index + 1), label: String(index + 1) }));

  return (
    <div
      className={styles.tableWrap}
      role="region"
      aria-label="Your ranked choices"
      // Focusable so keyboard users can scroll a table wider than the screen
      // (WCAG 2.1.1; axe rule scrollable-region-focusable).
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
    >
      <table className={styles.table}>
        <caption className="visually-hidden">
          Your ranked choices, first choice first. Change a course’s Priority to move it.
        </caption>
        <thead>
          <tr>
            <th scope="col" className={styles.rankHead}>
              #
            </th>
            <th scope="col">Code</th>
            <th scope="col">Course</th>
            <th scope="col" className={styles.numeric}>
              Credits
            </th>
            <th scope="col">Priority</th>
            <th scope="col">Action</th>
          </tr>
        </thead>
        <tbody ref={listRef}>
          {items.map((item, index) => {
            const rank = index + 1;
            const itemProblems = problems.get(item.code) ?? [];
            // Narrowed here so the reasons can be read below.
            const ineligible = item.eligibility.eligible ? null : item.eligibility;
            const flagged = itemProblems.length > 0 || ineligible !== null;
            return (
              <tr
                key={item.code}
                className={styles.row}
                data-code={item.code}
                data-dragging={draggingIndex === index ? 'true' : undefined}
                data-over={overIndex === index && draggingIndex !== index ? 'true' : undefined}
                data-problem={flagged ? 'true' : undefined}
                draggable={editable}
                onDragStart={handleDragStart(index)}
                onDragOver={handleDragOver(index)}
                onDrop={handleDrop(index)}
                onDragEnd={endDrag}
              >
                <th scope="row" className={styles.rank}>
                  {rank}
                </th>
                <td>
                  <CourseCode code={item.code} size="sm" />
                </td>
                <td>
                  <span className={styles.itemName}>{item.name}</span>
                  {/* The seat count keeps polling while the cart is open, so
                      the student can see a course fill up as they rank it. */}
                  <span className={styles.itemMeta}>
                    {item.department.code}
                    <SeatMeter
                      compact
                      allocated={item.allocated}
                      capacity={item.capacity}
                      label={`Seats in ${item.name}`}
                    />
                  </span>
                  {ineligible && (
                    <span className={styles.itemProblem}>
                      <Icon icon={TriangleAlert} />
                      {ineligible.reasons[0]
                        ? describeReason(ineligible.reasons[0])
                        : 'You are no longer eligible for this course.'}
                    </span>
                  )}
                  {itemProblems.map((problem) => (
                    <span key={problem.type} className={styles.itemProblem}>
                      <Icon icon={TriangleAlert} />
                      {describeItemProblem(problem.type, item.name)}
                    </span>
                  ))}
                </td>
                <td className={styles.numeric}>{item.credits}</td>
                <td>
                  {editable ? (
                    <Select
                      className={styles.priority}
                      aria-label={`Priority of ${item.name}`}
                      value={String(rank)}
                      options={ranks}
                      onChange={(event) => {
                        onReorder(index, Number(event.target.value) - 1);
                      }}
                    />
                  ) : (
                    rank
                  )}
                </td>
                <td>
                  {editable && (
                    <button
                      type="button"
                      className={styles.remove}
                      data-action="remove"
                      onClick={() => {
                        onRemove(item.code);
                      }}
                    >
                      Remove
                      <span className="visually-hidden"> {item.name} from your cart</span>
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** The few problems that can name a course in a cart that is already loaded. */
function describeItemProblem(type: string, name: string): string {
  switch (type) {
    case 'NOT_ELIGIBLE':
      return `You are not eligible for ${name}.`;
    case 'NOT_OFFERED':
      return `${name} is no longer offered in this window.`;
    case 'UNKNOWN_COURSE':
      return `${name} is not in the catalogue any more.`;
    case 'DUPLICATE':
      return `${name} is listed twice.`;
    default:
      return `${name} was refused by the server.`;
  }
}
