import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as courseApi from '../../api/courseApi';
import { SEAT_POLL_INTERVAL_MS } from '../../hooks/useLiveSeats';
import { expectNoA11yViolations } from '../../test/axe';
import {
  cataloguePage,
  catalogueCourses,
  currentWindow,
  ok,
  seatSnapshot,
} from '../../test/catalogueFixtures';
import { renderRoute } from '../../test/renderRoute';
import { SEARCH_DELAY_MS } from './catalogue/CatalogueFilterForm';
import { StudentCoursesPage } from './StudentCoursesPage';

vi.mock('../../api/courseApi', async (importOriginal) => ({
  ...(await importOriginal<typeof courseApi>()),
  getCurrentWindow: vi.fn(),
  getCatalogue: vi.fn(),
  getSeats: vi.fn(),
}));

const api = vi.mocked(courseApi);

function renderCatalogue(url = '/student/courses') {
  return renderRoute(<StudentCoursesPage />, {
    path: '/student/courses',
    url,
    routes: [{ path: '/student/courses/:code', element: <h1>Course detail page</h1> }],
  });
}

/** The catalogue query of the latest request. */
function lastQuery() {
  return api.getCatalogue.mock.lastCall?.[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  api.getCurrentWindow.mockResolvedValue(ok(currentWindow));
  api.getCatalogue.mockResolvedValue(ok(cataloguePage()));
  api.getSeats.mockResolvedValue({ kind: 'not-modified' });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('StudentCoursesPage', () => {
  it('loads the window and the first page together, and shows the courses', async () => {
    const { container } = renderCatalogue();

    expect(await screen.findByRole('heading', { name: 'Showing 1–3 of 3 courses' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 1, name: 'Course catalogue' })).toBeInTheDocument();
    expect(screen.getByText('Fall 2026 · Registration')).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(3);
    expect(api.getCurrentWindow).toHaveBeenCalledTimes(1);
    expect(api.getCatalogue).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('writes filters to the URL, and reads them back on load', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    const { router } = renderCatalogue('/student/courses?view=table&credits=4');
    await screen.findByRole('table');
    expect(lastQuery()).toMatchObject({ credits: 4 });

    await user.selectOptions(screen.getByLabelText('Department'), 'ME');
    await user.click(screen.getByLabelText('Only courses with seats left'));
    await user.selectOptions(screen.getByLabelText('Sort by'), 'demandRatio');

    const params = new URLSearchParams(router.state.location.search);
    expect(Object.fromEntries(params)).toEqual({
      department: 'ME',
      credits: '4',
      onlyAvailable: 'true',
      sort: 'demandRatio',
      view: 'table',
    });
    await waitFor(() => {
      expect(lastQuery()).toMatchObject({
        department: 'ME',
        onlyAvailable: true,
        sort: 'demandRatio',
      });
    });

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(router.state.location.search).toBe('?view=table');
  });

  it('searches only once typing stops (debounced)', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    const { router } = renderCatalogue();
    await screen.findAllByRole('article');
    const calls = api.getCatalogue.mock.calls.length;

    await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'secu');
    // Still typing: nothing sent, URL unchanged.
    expect(router.state.location.search).toBe('');
    expect(api.getCatalogue).toHaveBeenCalledTimes(calls);

    act(() => {
      vi.advanceTimersByTime(SEARCH_DELAY_MS);
    });
    expect(router.state.location.search).toBe('?search=secu');
    await waitFor(() => {
      expect(lastQuery()).toMatchObject({ search: 'secu', page: 1 });
    });
    expect(api.getCatalogue).toHaveBeenCalledTimes(calls + 1);
  });

  it('handles row buttons with one delegated listener, even for clicks on the icon inside', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    const { router } = renderCatalogue('/student/courses?view=table&department=CSE');
    const table = await screen.findByRole('table');

    const button = within(table).getByRole('button', {
      name: 'View details of Cloud Security',
    });
    // The click lands on the <svg> inside the button, not the button itself.
    await user.click(button.querySelector('svg')!);

    expect(router.state.location.pathname).toBe('/student/courses/CS402');
    expect(router.state.location.state).toEqual({ catalogueSearch: '?view=table&department=CSE' });
  });

  it('merges polled seat numbers into the loaded courses without refetching them', async () => {
    api.getSeats
      .mockResolvedValueOnce({ kind: 'modified', data: seatSnapshot(), etag: '"v1"' })
      .mockResolvedValueOnce({
        kind: 'modified',
        data: seatSnapshot(
          catalogueCourses,
          { CS401: { allocated: 6 } },
          '2026-09-22T09:00:15.000Z',
        ),
        etag: '"v2"',
      });
    renderCatalogue();
    const card = (await screen.findByRole('link', { name: 'Artificial Intelligence' })).closest(
      'article',
    )!;
    expect(card).toHaveTextContent('0 of 20 allocated · 20 left');
    await waitFor(() => {
      expect(screen.getByText(/Seats updated/)).toBeInTheDocument();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SEAT_POLL_INTERVAL_MS);
    });

    expect(card).toHaveTextContent('6 of 20 allocated · 14 left');
    // Highlighted for a moment, then back to normal.
    expect(card.querySelector('[data-changed="true"]')).not.toBeNull();
    expect(api.getSeats).toHaveBeenLastCalledWith('"v1"', expect.any(AbortSignal));
    expect(api.getCatalogue).toHaveBeenCalledTimes(1);
  });

  it('offers to clear filters when nothing matches', async () => {
    api.getCatalogue.mockResolvedValue(ok(cataloguePage([])));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    const { router } = renderCatalogue('/student/courses?search=zzz');

    expect(
      await screen.findByRole('heading', { name: 'No courses match these filters' }),
    ).toBeVisible();
    const buttons = screen.getAllByRole('button', { name: 'Clear filters' });
    await user.click(buttons[buttons.length - 1]!);
    expect(router.state.location.search).toBe('');
  });

  it('shows an error with a working retry', async () => {
    api.getCatalogue.mockResolvedValueOnce({
      success: false,
      data: null,
      message: 'Could not reach the server.',
    });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    renderCatalogue();

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server.');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findAllByRole('article')).toHaveLength(3);
  });
});
