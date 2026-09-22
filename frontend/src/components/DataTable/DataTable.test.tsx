import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '../../test/axe';
import { DataTable } from './DataTable';
import type { Column } from './tableLogic';

interface Course {
  id: string;
  code: string;
  name: string;
  capacity: number;
}

const COURSES: Course[] = Array.from({ length: 25 }, (_, index) => ({
  id: `c${index + 1}`,
  code: `CS${String(101 + index)}`,
  name: index === 7 ? 'Artificial Intelligence' : `Elective ${String(index + 1).padStart(2, '0')}`,
  capacity: 60 - index * 2,
}));

const COLUMNS: Column<Course>[] = [
  { id: 'code', header: 'Code', key: 'code', sortable: true },
  { id: 'name', header: 'Course', key: 'name', sortable: true },
  { id: 'capacity', header: 'Capacity', key: 'capacity', sortable: true, align: 'end' },
];

function renderTable(props: Partial<Parameters<typeof DataTable<Course>>[0]> = {}) {
  return render(
    <DataTable
      caption="Fall 2026 courses"
      rows={COURSES}
      columns={COLUMNS}
      getRowId={(course) => course.id}
      itemName={{ one: 'course', other: 'courses' }}
      filterLabel="Filter courses"
      {...props}
    />,
  );
}

/** Text of the first cell of each body row. */
function firstColumn(): string[] {
  const table = screen.getByRole('table', { name: 'Fall 2026 courses' });
  const bodyRows = within(table).getAllByRole('row').slice(1);
  return bodyRows.map((row) => within(row).getAllByRole('cell')[0]?.textContent ?? '');
}

describe('DataTable', () => {
  it('renders a semantic, captioned table in a labelled, focusable scroll region', async () => {
    const { container } = renderTable();

    expect(screen.getByRole('table', { name: 'Fall 2026 courses' })).toBeInTheDocument();
    const region = screen.getByRole('region', { name: 'Fall 2026 courses' });
    expect(region).toHaveAttribute('tabindex', '0');
    for (const header of screen.getAllByRole('columnheader')) {
      expect(header).toHaveAttribute('scope', 'col');
    }
    expect(firstColumn()).toHaveLength(10);
    expect(screen.getByText('Showing 1–10 of 25 courses')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('sorts when a header is clicked and keeps aria-sort in step', async () => {
    const user = userEvent.setup();
    renderTable();
    const capacityHeader = screen.getByRole('columnheader', { name: 'Capacity' });
    expect(capacityHeader).toHaveAttribute('aria-sort', 'none');

    await user.click(within(capacityHeader).getByRole('button', { name: 'Capacity' }));
    expect(capacityHeader).toHaveAttribute('aria-sort', 'ascending');
    expect(firstColumn()[0]).toBe('CS125'); // smallest capacity

    await user.click(within(capacityHeader).getByRole('button', { name: 'Capacity' }));
    expect(capacityHeader).toHaveAttribute('aria-sort', 'descending');
    expect(firstColumn()[0]).toBe('CS101');

    await user.click(screen.getByRole('button', { name: 'Code' }));
    expect(capacityHeader).toHaveAttribute('aria-sort', 'none');
    expect(screen.getByRole('columnheader', { name: 'Code' })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
  });

  it('filters with the debounced search box and can show everything again', async () => {
    const user = userEvent.setup();
    renderTable();

    await user.type(screen.getByRole('searchbox', { name: 'Filter courses' }), 'intelligence');
    await waitFor(() => {
      expect(firstColumn()).toEqual(['CS108']);
    });
    expect(screen.getByText('Showing 1–1 of 1 course matching “intelligence”')).toBeInTheDocument();

    await user.clear(screen.getByRole('searchbox', { name: 'Filter courses' }));
    await user.type(screen.getByRole('searchbox', { name: 'Filter courses' }), 'no such course');
    expect(await screen.findByRole('button', { name: 'Show all courses' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show all courses' }));
    expect(firstColumn()).toHaveLength(10);
    expect(screen.getByRole('searchbox', { name: 'Filter courses' })).toHaveValue('');
  });

  it('paginates, and returns to page 1 when the sort changes', async () => {
    const user = userEvent.setup();
    renderTable();

    await user.click(screen.getByRole('button', { name: 'Page 3' }));
    expect(firstColumn()).toEqual(['CS121', 'CS122', 'CS123', 'CS124', 'CS125']);
    expect(screen.getByRole('button', { name: 'Page 3' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Code' }));
    expect(screen.getByRole('button', { name: 'Page 1' })).toHaveAttribute('aria-current', 'page');
  });

  it('has built-in empty, loading and error states', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const { rerender } = renderTable({
      rows: [],
      emptyTitle: 'No courses offered yet',
    });
    expect(screen.getByRole('heading', { name: 'No courses offered yet' })).toBeInTheDocument();

    rerender(
      <DataTable
        caption="Fall 2026 courses"
        rows={[]}
        columns={COLUMNS}
        getRowId={(course) => course.id}
        status={{ kind: 'loading' }}
      />,
    );
    expect(screen.getByRole('region', { name: 'Fall 2026 courses' })).toHaveAttribute(
      'aria-busy',
      'true',
    );

    rerender(
      <DataTable
        caption="Fall 2026 courses"
        rows={[]}
        columns={COLUMNS}
        getRowId={(course) => course.id}
        status={{ kind: 'error', message: 'The catalogue could not be loaded.', onRetry }}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('The catalogue could not be loaded.');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
