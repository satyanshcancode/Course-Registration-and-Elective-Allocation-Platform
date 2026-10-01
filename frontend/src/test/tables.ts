import { screen, waitFor } from '@testing-library/react';

/**
 * The page's table, once its rows are real ones.
 *
 * `DataTable` renders a full <table> of skeleton rows while it loads, so a bare
 * `findByRole('table')` resolves before any data is on screen. A test that then
 * reached for a row or a row button with `getBy*` failed at random — more often
 * on a loaded machine, which is what made these files look flaky. The
 * `aria-busy` that DataTable puts on its scroll region is the real "still
 * loading" signal, so wait for that to go instead.
 */
export async function findLoadedTable(): Promise<HTMLElement> {
  const table = await screen.findByRole('table');
  await waitFor(() => {
    if (table.closest('[aria-busy]')) {
      throw new Error('the table is still loading');
    }
  });
  return table;
}
