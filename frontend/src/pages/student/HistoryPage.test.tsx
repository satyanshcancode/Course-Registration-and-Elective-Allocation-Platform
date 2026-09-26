import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as activityApi from '../../api/activityApi';
import { historyEvent, historyPage, studentStatus } from '../../test/activityFixtures';
import { expectNoA11yViolations } from '../../test/axe';
import { ok } from '../../test/catalogueFixtures';
import { renderRoute } from '../../test/renderRoute';
import { HistoryPage } from './HistoryPage';

vi.mock('../../api/activityApi', () => ({ getMyStatus: vi.fn(), getMyHistory: vi.fn() }));

const api = vi.mocked(activityApi);

const renderHistory = (url = '/student/history') =>
  renderRoute(<HistoryPage />, { path: '/student/history', url });

const THREE_EVENTS = [
  historyEvent(
    { type: 'PROMOTED', rank: 1, fromPosition: 2, releasedCourse: 'CS402' },
    { id: '30', at: '2026-09-21T14:00:00.000Z' },
  ),
  historyEvent(
    { type: 'ALLOCATED', rank: 2, finalRank: 7, waitlisted: [] },
    { id: '20', at: '2026-09-21T09:00:00.000Z', course: { code: 'CS402', name: 'Cloud Security' } },
  ),
  historyEvent(
    { type: 'SUBMITTED', reference: 'REF-3F9A2C71', courseCodes: ['CS401', 'CS402'] },
    { id: '10', at: '2026-09-19T09:00:00.000Z', course: null },
  ),
];

beforeEach(() => {
  vi.clearAllMocks();
  api.getMyStatus.mockResolvedValue(ok(studentStatus));
  api.getMyHistory.mockResolvedValue(ok(historyPage({ events: THREE_EVENTS })));
});

describe('HistoryPage', () => {
  it('says where the student stands before listing how they got there', async () => {
    const { container } = renderHistory();

    expect(
      await screen.findByText('You hold a seat in CS401 Artificial Intelligence.'),
    ).toBeVisible();
    // The receipt is in the standing card, beside its own term.
    const submission = screen.getByText('Submission').nextElementSibling;
    expect(submission).toHaveTextContent('REF-3F9A2C71');
    expect(screen.getByText('Given by allocation, your 1st choice')).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('writes each event as one sentence, with a machine-readable time', async () => {
    renderHistory();

    expect(
      await screen.findByText(
        /You were moved up from CS402 to CS401 Artificial Intelligence, your 1st choice, when a seat opened/,
      ),
    ).toBeVisible();
    const times = screen.getAllByText(/^\d{2}:\d{2}$/);
    expect(times[0]?.tagName).toBe('TIME');
    expect(times[0]).toHaveAttribute('dateTime', '2026-09-21T14:00:00.000Z');
  });

  it('groups the events by day, as ordered lists inside an ordered list', async () => {
    renderHistory();

    await screen.findByText(/You were moved up/);
    const days = screen.getAllByRole('heading', { level: 3 });
    // Two days for three events: the 21st holds two of them.
    expect(days).toHaveLength(2);
    const firstDay = days[0]?.closest('li');
    expect(firstDay?.tagName).toBe('LI');
    expect(within(firstDay as HTMLElement).getAllByRole('listitem')).toHaveLength(2);
  });

  it('shows an empty state, and says so differently when a filter hid everything', async () => {
    api.getMyHistory.mockResolvedValue(ok(historyPage({ events: [], types: [] })));
    renderHistory();
    expect(await screen.findByText('Nothing recorded yet')).toBeVisible();

    api.getMyHistory.mockResolvedValue(ok(historyPage({ events: [] })));
    renderHistory('/student/history?type=DROPPED');
    expect(await screen.findByText('Nothing matches those filters')).toBeVisible();
  });

  describe('filters', () => {
    it('puts the chosen event type in the URL and asks the server for it', async () => {
      const user = userEvent.setup();
      const { router } = renderHistory();
      await screen.findByText(/You were moved up/);

      await user.selectOptions(screen.getByLabelText('Event'), 'ALLOCATED');

      await waitFor(() => {
        expect(router.state.location.search).toBe('?type=ALLOCATED');
      });
      expect(api.getMyHistory).toHaveBeenLastCalledWith({ type: 'ALLOCATED' }, expect.anything());
    });

    it('does the same for a course, and keeps both in the URL together', async () => {
      const user = userEvent.setup();
      const { router } = renderHistory('/student/history?type=ALLOCATED');
      await screen.findByText(/You were moved up/);

      await user.selectOptions(screen.getByLabelText('Course'), 'CS401');

      await waitFor(() => {
        expect(router.state.location.search).toBe('?type=ALLOCATED&course=CS401');
      });
    });

    it('leaves a default out of the URL rather than writing it as empty', async () => {
      const user = userEvent.setup();
      const { router } = renderHistory('/student/history?type=ALLOCATED');
      await screen.findByText(/You were moved up/);

      await user.selectOptions(screen.getByLabelText('Event'), '');

      await waitFor(() => {
        expect(router.state.location.search).toBe('');
      });
    });

    it('reads the filters out of the URL on the first request', async () => {
      renderHistory('/student/history?type=DROPPED&course=CS402');

      await waitFor(() => {
        expect(api.getMyHistory).toHaveBeenCalledWith(
          { type: 'DROPPED', course: 'CS402' },
          expect.anything(),
        );
      });
    });
  });

  describe('load more', () => {
    beforeEach(() => {
      api.getMyHistory.mockResolvedValue(
        ok(historyPage({ events: THREE_EVENTS, nextCursor: '10' })),
      );
    });

    it('appends older events instead of replacing what is on screen', async () => {
      const user = userEvent.setup();
      renderHistory();
      await screen.findByText(/You were moved up/);

      api.getMyHistory.mockResolvedValue(
        ok(
          historyPage({
            events: [
              historyEvent(
                { type: 'DRAFT_SAVED', courseCodes: ['CS401'] },
                { id: '5', at: '2026-09-18T09:00:00.000Z' },
              ),
            ],
            nextCursor: null,
          }),
        ),
      );
      await user.click(screen.getByRole('button', { name: 'Load more' }));

      expect(await screen.findByText(/You saved a draft ranking CS401/)).toBeVisible();
      // The first page is still there.
      expect(screen.getByText(/You were moved up/)).toBeVisible();
      expect(api.getMyHistory).toHaveBeenLastCalledWith({ cursor: '10', limit: 20 });
    });

    it('stops offering more once the list is exhausted', async () => {
      const user = userEvent.setup();
      renderHistory();
      await screen.findByText(/You were moved up/);

      api.getMyHistory.mockResolvedValue(ok(historyPage({ events: [], nextCursor: null })));
      await user.click(screen.getByRole('button', { name: 'Load more' }));

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
      });
    });
  });

  it('offers a retry when the timeline fails, without losing the status card', async () => {
    api.getMyHistory.mockResolvedValue({
      success: false,
      data: null,
      message: 'Server error.',
      httpStatus: 500,
    });
    renderHistory();

    expect(await screen.findByText('Your history couldn’t be loaded')).toBeVisible();
    expect(screen.getByText('You hold a seat in CS401 Artificial Intelligence.')).toBeVisible();

    api.getMyHistory.mockResolvedValue(ok(historyPage({ events: THREE_EVENTS })));
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(/You were moved up/)).toBeVisible();
  });
});
