import { SearchX } from 'lucide-react';
import { useId, useMemo, useState, type MouseEventHandler, type ReactNode } from 'react';
import { Button } from '../Button';
import { EmptyState } from '../EmptyState';
import { ErrorMessage } from '../ErrorMessage';
import { Icon } from '../Icon';
import { Pagination } from '../Pagination';
import { SearchBar } from '../SearchBar';
import { Skeleton } from '../Skeleton';
import styles from './DataTable.module.css';
import {
  cellValue,
  filterRows,
  nextSort,
  paginate,
  sortRows,
  type Column,
  type SortState,
} from './tableLogic';

/** Loading and error are part of the table's contract, not bolted on. */
export type DataTableStatus =
  | { kind: 'ready' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string; onRetry?: () => void };

export interface DataTableProps<T> {
  /** Describes the table; also names its scroll region. */
  caption: string;
  captionHidden?: boolean;
  rows: readonly T[];
  columns: readonly Column<T>[];
  getRowId: (row: T) => string;
  /** Rows per page (default 10). */
  pageSize?: number;
  initialSort?: SortState;
  /** Show a text filter above the table (default true). */
  filterable?: boolean;
  filterLabel?: string;
  filterPlaceholder?: string;
  status?: DataTableStatus;
  /** Nouns for result counts, e.g. { one: 'course', other: 'courses' }. */
  itemName?: { one: string; other: string };
  emptyTitle?: string;
  emptyMessage?: ReactNode;
  /**
   * Page the rows here (default true). Pass false when the rows are already
   * one page from the server, which then also owns sorting and paging.
   */
  paginated?: boolean;
  /** Marks a row, e.g. 'warning' for an oversubscribed course (pair with text). */
  getRowTone?: (row: T) => 'warning' | undefined;
  /**
   * ONE click handler on <tbody> for every row's buttons (event delegation):
   * read event.target and find the button with closest().
   */
  onBodyClick?: MouseEventHandler<HTMLTableSectionElement>;
}

const SKELETON_ROWS = 5;

/**
 * Generic data table: typed columns, client-side sorting (aria-sort), text
 * filtering and pagination, inside a horizontally scrollable, labelled region
 * with a sticky header row. Empty, loading and error states are built in.
 */
export function DataTable<T>({
  caption,
  captionHidden = false,
  rows,
  columns,
  getRowId,
  pageSize = 10,
  initialSort,
  filterable = true,
  filterLabel = 'Filter rows',
  filterPlaceholder = 'Filter…',
  status = { kind: 'ready' },
  itemName = { one: 'row', other: 'rows' },
  emptyTitle = 'Nothing to show yet',
  emptyMessage,
  paginated = true,
  getRowTone,
  onBodyClick,
}: DataTableProps<T>) {
  const captionId = useId();
  const [sort, setSort] = useState<SortState | null>(initialSort ?? null);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  // Bumped to remount (and so clear) the filter field from outside it.
  const [filterFieldKey, setFilterFieldKey] = useState(0);

  const visible = useMemo(
    () => sortRows(filterRows(rows, columns, query), columns, sort),
    [rows, columns, query, sort],
  );
  const slice = paginate(visible, page, paginated ? pageSize : Math.max(1, visible.length));
  const noun = (count: number) => (count === 1 ? itemName.one : itemName.other);

  const changeSort = (columnId: string) => {
    setSort((current) => nextSort(current, columnId));
    setPage(1);
  };
  const changeQuery = (next: string) => {
    setQuery(next);
    setPage(1);
  };

  if (status.kind === 'error') {
    return <ErrorMessage message={status.message} onRetry={status.onRetry} />;
  }
  if (status.kind === 'ready' && rows.length === 0) {
    return <EmptyState title={emptyTitle}>{emptyMessage}</EmptyState>;
  }

  const loading = status.kind === 'loading';
  const summary = loading
    ? `Loading ${itemName.other}…`
    : visible.length === 0
      ? `No ${itemName.other} match “${query}”.`
      : `Showing ${slice.firstRow}–${slice.lastRow} of ${visible.length} ${noun(visible.length)}` +
        (query ? ` matching “${query}”` : '');

  return (
    <div className={styles.table}>
      {(filterable || !captionHidden) && (
        <div className={styles.toolbar}>
          {filterable && (
            <div className={styles.filter}>
              <SearchBar
                key={filterFieldKey}
                label={filterLabel}
                placeholder={filterPlaceholder}
                onSearch={changeQuery}
              />
            </div>
          )}
          <p className={styles.summary} aria-live="polite">
            {summary}
          </p>
        </div>
      )}

      <div
        className={styles.scroll}
        role="region"
        aria-labelledby={captionId}
        aria-busy={loading || undefined}
        // Focusable so keyboard users can scroll a table wider than the screen
        // (WCAG 2.1.1; axe rule scrollable-region-focusable).
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
      >
        <table className={styles.grid}>
          <caption id={captionId} className={captionHidden ? 'visually-hidden' : styles.caption}>
            {caption}
          </caption>
          <thead>
            <tr>
              {columns.map((column) => {
                const direction = sort?.columnId === column.id ? sort.direction : undefined;
                return (
                  <th
                    key={column.id}
                    scope="col"
                    className={styles.headerCell}
                    data-align={column.align ?? 'start'}
                    style={column.width ? { width: column.width } : undefined}
                    aria-sort={column.sortable ? (direction ?? 'none') : undefined}
                  >
                    {column.sortable ? (
                      <button
                        type="button"
                        className={styles.sortButton}
                        data-direction={direction ?? 'none'}
                        onClick={() => {
                          changeSort(column.id);
                        }}
                      >
                        {column.header}
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          {/* Clicks from any row's buttons bubble up to this one listener. */}
          {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- delegation only: the clicks come from real <button>s, which handle the keyboard themselves */}
          <tbody onClick={onBodyClick}>
            {loading &&
              Array.from({ length: SKELETON_ROWS }, (_, index) => (
                <tr key={`skeleton-${index}`} className={styles.row} aria-hidden="true">
                  {columns.map((column) => (
                    <td key={column.id} className={styles.cell}>
                      <Skeleton width={index % 2 ? '70%' : '85%'} />
                    </td>
                  ))}
                </tr>
              ))}
            {!loading &&
              slice.rows.map((row) => (
                <tr key={getRowId(row)} className={styles.row} data-tone={getRowTone?.(row)}>
                  {columns.map((column) => (
                    <td
                      key={column.id}
                      className={styles.cell}
                      data-align={column.align ?? 'start'}
                    >
                      {column.cell ? column.cell(row) : renderValue(row, column)}
                    </td>
                  ))}
                </tr>
              ))}
            {!loading && visible.length === 0 && (
              <tr className={styles.row}>
                <td colSpan={columns.length} className={styles.noMatch}>
                  <span className={styles.noMatchText}>
                    <Icon icon={SearchX} />
                    No {itemName.other} match “{query}”.
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      changeQuery('');
                      setFilterFieldKey((current) => current + 1);
                    }}
                  >
                    Show all {itemName.other}
                  </Button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!loading && paginated && (
        <Pagination
          page={slice.page}
          pageCount={slice.pageCount}
          onPageChange={setPage}
          label={`${caption}, pages`}
        />
      )}
    </div>
  );
}

function renderValue<T>(row: T, column: Column<T>): ReactNode {
  const value = cellValue(row, column);
  if (value instanceof Date) {
    return value.toLocaleDateString();
  }
  return value === null || value === undefined ? '—' : String(value);
}
