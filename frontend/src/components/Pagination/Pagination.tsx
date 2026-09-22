import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Icon } from '../Icon';
import styles from './Pagination.module.css';

export interface PaginationProps {
  /** 1-based. */
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  label?: string;
}

type PageSlot = number | 'gap';

/** Page numbers to show: first, last, and a window around the current page. */
export function pageSlots(page: number, pageCount: number, window = 1): PageSlot[] {
  const pages = new Set([1, pageCount]);
  for (let offset = -window; offset <= window; offset += 1) {
    const candidate = page + offset;
    if (candidate >= 1 && candidate <= pageCount) {
      pages.add(candidate);
    }
  }
  const sorted = [...pages].sort((a, b) => a - b);
  return sorted.flatMap((current, index): PageSlot[] => {
    const previous = sorted[index - 1];
    return previous !== undefined && current - previous > 1 ? ['gap', current] : [current];
  });
}

export function Pagination({ page, pageCount, onPageChange, label = 'Pages' }: PaginationProps) {
  if (pageCount <= 1) {
    return null;
  }
  return (
    <nav className={styles.pagination} aria-label={label}>
      <button
        type="button"
        className={styles.step}
        disabled={page <= 1}
        onClick={() => {
          onPageChange(page - 1);
        }}
      >
        <Icon icon={ChevronLeft} />
        <span className={styles.stepLabel}>Previous</span>
      </button>
      <ol className={styles.pages}>
        {pageSlots(page, pageCount).map((slot, index) =>
          slot === 'gap' ? (
            <li key={`gap-${index}`} className={styles.gap} aria-hidden="true">
              …
            </li>
          ) : (
            <li key={slot}>
              <button
                type="button"
                className={styles.page}
                aria-current={slot === page ? 'page' : undefined}
                onClick={() => {
                  onPageChange(slot);
                }}
              >
                <span className="visually-hidden">Page </span>
                {slot}
              </button>
            </li>
          ),
        )}
      </ol>
      <button
        type="button"
        className={styles.step}
        disabled={page >= pageCount}
        onClick={() => {
          onPageChange(page + 1);
        }}
      >
        <span className={styles.stepLabel}>Next</span>
        <Icon icon={ChevronRight} />
      </button>
    </nav>
  );
}
