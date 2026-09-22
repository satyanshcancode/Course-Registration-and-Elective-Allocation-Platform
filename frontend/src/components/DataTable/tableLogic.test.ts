import { describe, expect, it } from 'vitest';
import {
  compareValues,
  filterRows,
  nextSort,
  paginate,
  sortRows,
  type Column,
} from './tableLogic';

interface Course {
  code: string;
  name: string;
  seats: number | null;
}

const rows: Course[] = [
  { code: 'CS401', name: 'Artificial Intelligence', seats: 0 },
  { code: 'CS10', name: 'Intro to Computing', seats: 30 },
  { code: 'MA202', name: 'Linear Algebra', seats: null },
  { code: 'CS202', name: 'Databases', seats: 12 },
];

const columns: Column<Course>[] = [
  { id: 'code', header: 'Code', key: 'code' },
  { id: 'name', header: 'Name', key: 'name' },
  { id: 'seats', header: 'Seats', accessor: (row) => row.seats, searchable: false },
];

describe('table logic', () => {
  it('compares numbers numerically and strings naturally (CS10 before CS202)', () => {
    expect(compareValues(2, 10)).toBeLessThan(0);
    expect(compareValues('CS10', 'CS202')).toBeLessThan(0);
    expect(compareValues('ai', 'AI')).toBe(0);
    expect(compareValues(null, 1)).toBeGreaterThan(0);
  });

  it('sorts in both directions, keeping empty values last', () => {
    const ascending = sortRows(rows, columns, { columnId: 'seats', direction: 'ascending' });
    const descending = sortRows(rows, columns, { columnId: 'seats', direction: 'descending' });

    expect(ascending.map((row) => row.seats)).toEqual([0, 12, 30, null]);
    expect(descending.map((row) => row.seats)).toEqual([30, 12, 0, null]);
    expect(rows[0]?.code).toBe('CS401'); // input untouched
  });

  it('filters across searchable columns, case-insensitively', () => {
    expect(filterRows(rows, columns, 'cs').map((row) => row.code)).toEqual([
      'CS401',
      'CS10',
      'CS202',
    ]);
    expect(filterRows(rows, columns, 'ALGEBRA').map((row) => row.code)).toEqual(['MA202']);
    // Seats isn't searchable, so "30" matches nothing.
    expect(filterRows(rows, columns, '30')).toEqual([]);
    expect(filterRows(rows, columns, '  ')).toHaveLength(4);
  });

  it('paginates and clamps out-of-range pages', () => {
    const many = Array.from({ length: 23 }, (_, index) => index + 1);

    expect(paginate(many, 2, 10)).toMatchObject({ page: 2, pageCount: 3, firstRow: 11, lastRow: 20 });
    expect(paginate(many, 9, 10)).toMatchObject({ page: 3, firstRow: 21, lastRow: 23 });
    expect(paginate([], 1, 10)).toMatchObject({ page: 1, pageCount: 1, firstRow: 0, lastRow: 0 });
  });

  it('cycles sort direction on the same column and resets on a new one', () => {
    const first = nextSort(null, 'code');
    expect(first).toEqual({ columnId: 'code', direction: 'ascending' });
    expect(nextSort(first, 'code').direction).toBe('descending');
    expect(nextSort(first, 'name')).toEqual({ columnId: 'name', direction: 'ascending' });
  });
});
