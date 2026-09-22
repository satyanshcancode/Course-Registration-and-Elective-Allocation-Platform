import type { ReactNode } from 'react';

/** Values a column can sort and filter on. */
export type CellValue = string | number | Date | null | undefined;

/** Keys of T whose values are CellValues, e.g. 'code' | 'capacity' for a course. */
export type KeysMatching<T, V> = {
  [K in keyof T]-?: T[K] extends V ? K : never;
}[keyof T];

interface ColumnBase<T> {
  /** Unique within the table; used for sorting state and React keys. */
  id: string;
  header: string;
  sortable?: boolean;
  /** Numbers and seat counts align to the end, like a printed timetable. */
  align?: 'start' | 'center' | 'end';
  /** Custom rendering; sorting and filtering still use the raw value. */
  cell?: (row: T) => ReactNode;
  /** Include in the text filter (default true). */
  searchable?: boolean;
  /** CSS width hint for the column, e.g. "7rem". */
  width?: string;
}

/**
 * A column reads its value either by `key` (only keys whose type is a
 * CellValue are allowed) or through an `accessor` function — never both.
 */
export type Column<T> = ColumnBase<T> &
  (
    | { key: KeysMatching<T, CellValue>; accessor?: never }
    | { accessor: (row: T) => CellValue; key?: never }
  );

export type SortDirection = 'ascending' | 'descending';

export interface SortState {
  columnId: string;
  direction: SortDirection;
}

export function cellValue<T>(row: T, column: Column<T>): CellValue {
  if (column.accessor) {
    return column.accessor(row);
  }
  // KeysMatching guarantees this property holds a CellValue; TypeScript
  // cannot follow that through the indexed access, hence the assertion.
  return row[column.key] as CellValue;
}

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/** Orders values of one column; empty values always sort last. */
export function compareValues(a: CellValue, b: CellValue): number {
  const aEmpty = a === null || a === undefined || a === '';
  const bEmpty = b === null || b === undefined || b === '';
  if (aEmpty || bEmpty) {
    return aEmpty === bEmpty ? 0 : aEmpty ? 1 : -1;
  }
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() - b.getTime();
  }
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }
  return collator.compare(String(a), String(b));
}

/** A sorted copy (stable, so equal rows keep their original order). */
export function sortRows<T>(
  rows: readonly T[],
  columns: readonly Column<T>[],
  sort: SortState | null,
): T[] {
  const column = sort ? columns.find((candidate) => candidate.id === sort.columnId) : undefined;
  if (!sort || !column) {
    return [...rows];
  }
  const direction = sort.direction === 'ascending' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const result = compareValues(cellValue(a, column), cellValue(b, column));
    // Empty values stay at the bottom in both directions.
    const emptyInvolved = [cellValue(a, column), cellValue(b, column)].some(
      (value) => value === null || value === undefined || value === '',
    );
    return emptyInvolved ? result : result * direction;
  });
}

function toSearchText(value: CellValue): string {
  if (value === null || value === undefined) {
    return '';
  }
  return value instanceof Date ? value.toISOString() : String(value);
}

/** Rows where any searchable column contains the query (case-insensitive). */
export function filterRows<T>(
  rows: readonly T[],
  columns: readonly Column<T>[],
  query: string,
): T[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) {
    return [...rows];
  }
  const searchable = columns.filter((column) => column.searchable !== false);
  return rows.filter((row) =>
    searchable.some((column) =>
      toSearchText(cellValue(row, column)).toLocaleLowerCase().includes(needle),
    ),
  );
}

export interface PageSlice<T> {
  rows: T[];
  /** The page actually shown (clamped into range), 1-based. */
  page: number;
  pageCount: number;
  /** 1-based index of the first row shown; 0 when there are none. */
  firstRow: number;
  lastRow: number;
}

export function paginate<T>(rows: readonly T[], page: number, pageSize: number): PageSlice<T> {
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(Math.max(1, page), pageCount);
  const start = (current - 1) * pageSize;
  const slice = rows.slice(start, start + pageSize);
  return {
    rows: slice,
    page: current,
    pageCount,
    firstRow: slice.length > 0 ? start + 1 : 0,
    lastRow: start + slice.length,
  };
}

/** Next sort after clicking a header: new column ascending, same column flips. */
export function nextSort(current: SortState | null, columnId: string): SortState {
  if (current?.columnId === columnId) {
    return {
      columnId,
      direction: current.direction === 'ascending' ? 'descending' : 'ascending',
    };
  }
  return { columnId, direction: 'ascending' };
}
