import type { CartItem } from '@course-reg/shared';
import { ChevronDown, ChevronUp, GripVertical, TriangleAlert, X } from 'lucide-react';
import { useState, type DragEvent, type Ref } from 'react';
import { CourseCode } from '../../../components/CourseCode';
import { Icon } from '../../../components/Icon';
import { SeatMeter } from '../../../components/SeatMeter';
import { describeReason } from '../../../utils/eligibilityText';
import type { ProblemsByCode } from './cartProblems';
import styles from './CartPage.module.css';

export interface CartListProps {
  /** In working order: index 0 is the first choice. */
  items: readonly CartItem[];
  editable: boolean;
  /** Server refusals, keyed by course code. */
  problems: ProblemsByCode;
  onMove: (code: string, delta: -1 | 1) => void;
  onRemove: (code: string) => void;
  /** A drag finished: move the item at `from` to `to`. */
  onReorder: (from: number, to: number) => void;
  listRef: Ref<HTMLOListElement>;
}

/**
 * The ranked list, as an ordered list — the ranking is the content, not a
 * decoration, so `<ol>` is the right element and the numbers survive with
 * CSS off.
 *
 * Move up / Move down are the real controls: they work with a keyboard, a
 * screen reader and a touch screen. Dragging is added on top with the native
 * HTML5 drag events and never becomes the only way to reorder.
 */
export function CartList({
  items,
  editable,
  problems,
  onMove,
  onRemove,
  onReorder,
  listRef,
}: CartListProps) {
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const handleDragStart = (index: number) => (event: DragEvent<HTMLLIElement>) => {
    setDraggingIndex(index);
    event.dataTransfer.effectAllowed = 'move';
    // Firefox only starts a drag once some data is set.
    event.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragOver = (index: number) => (event: DragEvent<HTMLLIElement>) => {
    if (draggingIndex === null) {
      return;
    }
    // Without preventDefault the browser refuses the drop.
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setOverIndex(index);
  };

  const handleDrop = (index: number) => (event: DragEvent<HTMLLIElement>) => {
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

  return (
    <ol className={styles.list} ref={listRef}>
      {items.map((item, index) => {
        const rank = index + 1;
        const itemProblems = problems.get(item.code) ?? [];
        // Narrowed here so the reasons can be read below.
        const ineligible = item.eligibility.eligible ? null : item.eligibility;
        return (
          <li
            key={item.code}
            className={styles.item}
            data-code={item.code}
            data-dragging={draggingIndex === index ? 'true' : undefined}
            data-over={overIndex === index && draggingIndex !== index ? 'true' : undefined}
            data-problem={itemProblems.length > 0 || ineligible ? 'true' : undefined}
            draggable={editable}
            onDragStart={handleDragStart(index)}
            onDragOver={handleDragOver(index)}
            onDrop={handleDrop(index)}
            onDragEnd={endDrag}
          >
            <p className={styles.rank} aria-hidden="true">
              {rank}
            </p>

            <div className={styles.itemBody}>
              <p className={styles.itemMeta}>
                <CourseCode code={item.code} size="sm" />
                <span>{item.credits} credits</span>
                <span>{item.department.code}</span>
              </p>
              <h3 className={styles.itemName}>
                <span className="visually-hidden">Choice {rank}: </span>
                {item.name}
              </h3>
              <SeatMeter
                compact
                allocated={item.allocated}
                capacity={item.capacity}
                label={`Seats in ${item.name}`}
              />

              {ineligible && (
                <p className={styles.itemProblem}>
                  <Icon icon={TriangleAlert} />
                  <span>
                    {ineligible.reasons[0]
                      ? describeReason(ineligible.reasons[0])
                      : 'You are no longer eligible for this course.'}
                  </span>
                </p>
              )}
              {itemProblems.map((problem) => (
                <p key={problem.type} className={styles.itemProblem}>
                  <Icon icon={TriangleAlert} />
                  <span>{describeItemProblem(problem.type, item.name)}</span>
                </p>
              ))}
            </div>

            {editable && (
              <div className={styles.itemActions}>
                {/* Decorative: dragging is an extra, never the only way. */}
                <span className={styles.grip} aria-hidden="true">
                  <Icon icon={GripVertical} />
                </span>
                <button
                  type="button"
                  className={styles.iconButton}
                  data-action="move-up"
                  disabled={index === 0}
                  onClick={() => {
                    onMove(item.code, -1);
                  }}
                >
                  <Icon icon={ChevronUp} />
                  <span className="visually-hidden">
                    Move {item.name} up to rank {rank - 1}
                  </span>
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  data-action="move-down"
                  disabled={index === items.length - 1}
                  onClick={() => {
                    onMove(item.code, 1);
                  }}
                >
                  <Icon icon={ChevronDown} />
                  <span className="visually-hidden">
                    Move {item.name} down to rank {rank + 1}
                  </span>
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  data-action="remove"
                  onClick={() => {
                    onRemove(item.code);
                  }}
                >
                  <Icon icon={X} />
                  <span className="visually-hidden">Remove {item.name} from your cart</span>
                </button>
              </div>
            )}
          </li>
        );
      })}
    </ol>
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
