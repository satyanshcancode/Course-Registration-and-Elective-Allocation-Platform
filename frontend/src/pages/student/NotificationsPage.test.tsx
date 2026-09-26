import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as activityApi from '../../api/activityApi';
import { notification, notificationPage } from '../../test/activityFixtures';
import { expectNoA11yViolations } from '../../test/axe';
import { ok } from '../../test/catalogueFixtures';
import { renderRoute } from '../../test/renderRoute';
import { NotificationsPage } from './NotificationsPage';

vi.mock('../../api/activityApi', () => ({
  getMyNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
}));

/** The nav badge lives in a context; the page must push the new count into it. */
const setUnread = vi.fn();
vi.mock('../../hooks/useUnreadNotifications', () => ({
  useUnreadNotifications: () => ({ unread: 2, setUnread, refresh: vi.fn() }),
}));

const api = vi.mocked(activityApi);

const UNREAD = notification({
  id: '00000000-0000-4000-8000-000000000001',
  title: 'You have a seat in CS401 Artificial Intelligence',
});
const READ = notification({
  id: '00000000-0000-4000-8000-000000000002',
  type: 'WAITLIST_PROMOTION',
  title: 'A seat in CS402 Cloud Security is yours',
  body: 'You were next in line.',
  readAt: '2026-09-21T12:00:00.000Z',
});

const renderPage = (url = '/student/notifications') =>
  renderRoute(<NotificationsPage />, {
    path: '/student/notifications',
    url,
    routes: [{ path: '/student/results', element: <p>Results</p> }],
  });

/** The row for one message, found by its title. */
function row(title: string) {
  const heading = screen.getByRole('heading', { name: title });
  const article = heading.closest('article');
  if (!article) {
    throw new Error(`No row for ${title}`);
  }
  return { article, ...within(article) };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getMyNotifications.mockResolvedValue(
    ok(notificationPage({ items: [UNREAD, READ], unread: 1 })),
  );
});

describe('NotificationsPage', () => {
  it('marks unread messages with an icon AND the word, never colour alone', async () => {
    const { container } = renderPage();

    await screen.findByRole('heading', { name: UNREAD.title });
    expect(row(UNREAD.title).getByText('Unread')).toBeVisible();
    expect(row(READ.title).getByText('Read')).toBeVisible();
    expect(row(UNREAD.title).article).toHaveAttribute('data-unread', 'true');
    await expectNoA11yViolations(container);
  });

  it('links each message to the page where it is acted on', async () => {
    renderPage();

    await screen.findByRole('heading', { name: UNREAD.title });
    expect(row(UNREAD.title).getByRole('link', { name: 'See your result' })).toHaveAttribute(
      'href',
      '/student/results',
    );
    expect(row(READ.title).getByRole('link', { name: 'See your waitlist' })).toHaveAttribute(
      'href',
      '/student/waitlist',
    );
  });

  it('marks one as read, updating the row and the navigation count at once', async () => {
    const user = userEvent.setup();
    api.markNotificationRead.mockResolvedValue(ok({ marked: 1, unread: 0 }));
    renderPage();
    await screen.findByRole('heading', { name: UNREAD.title });

    await user.click(screen.getByRole('button', { name: `Mark "${UNREAD.title}" as read` }));

    expect(await within(row(UNREAD.title).article).findByText('Read')).toBeVisible();
    expect(api.markNotificationRead).toHaveBeenCalledWith(UNREAD.id);
    // The count came from the reply, so the badge never needed a second call.
    expect(setUnread).toHaveBeenCalledWith(0);
    expect(api.getMyNotifications).toHaveBeenCalledOnce();
  });

  it('marks everything as read and reloads the list', async () => {
    const user = userEvent.setup();
    api.markAllNotificationsRead.mockResolvedValue(ok({ marked: 1, unread: 0 }));
    renderPage();
    await screen.findByRole('heading', { name: UNREAD.title });

    api.getMyNotifications.mockResolvedValue(
      ok(notificationPage({ items: [{ ...UNREAD, readAt: '2026-09-21T13:00:00.000Z' }, READ] })),
    );
    await user.click(screen.getByRole('button', { name: 'Mark all as read' }));

    await waitFor(() => {
      expect(setUnread).toHaveBeenCalledWith(0);
    });
    // Nothing is unread any more, so the action has nothing left to do.
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Mark all as read' })).not.toBeInTheDocument();
    });
    expect(api.getMyNotifications).toHaveBeenCalledTimes(2);
  });

  it('hides "Mark all as read" when there is nothing unread', async () => {
    api.getMyNotifications.mockResolvedValue(ok(notificationPage({ items: [READ] })));
    renderPage();

    await screen.findByRole('heading', { name: READ.title });
    expect(screen.queryByRole('button', { name: 'Mark all as read' })).not.toBeInTheDocument();
  });

  describe('the Unread / All filter', () => {
    it('puts "unread" in the URL and asks the server for it', async () => {
      const user = userEvent.setup();
      const { router } = renderPage();
      await screen.findByRole('heading', { name: UNREAD.title });

      await user.click(screen.getByRole('button', { name: 'Unread' }));

      await waitFor(() => {
        expect(router.state.location.search).toBe('?filter=unread');
      });
      expect(api.getMyNotifications).toHaveBeenLastCalledWith(
        { filter: 'unread' },
        expect.anything(),
      );
    });

    it('leaves the default out of the URL', async () => {
      const user = userEvent.setup();
      const { router } = renderPage('/student/notifications?filter=unread');
      await screen.findByRole('heading', { name: UNREAD.title });

      await user.click(screen.getByRole('button', { name: 'All' }));

      await waitFor(() => {
        expect(router.state.location.search).toBe('');
      });
    });

    it('says something different when unread is empty', async () => {
      api.getMyNotifications.mockResolvedValue(ok(notificationPage()));

      renderPage('/student/notifications?filter=unread');
      expect(await screen.findByText('Nothing unread')).toBeVisible();

      renderPage();
      expect(await screen.findByText('No notifications yet')).toBeVisible();
    });
  });

  it('appends older messages rather than replacing them', async () => {
    const user = userEvent.setup();
    api.getMyNotifications.mockResolvedValue(
      ok(notificationPage({ items: [UNREAD], unread: 1, nextCursor: 'cursor-1' })),
    );
    renderPage();
    await screen.findByRole('heading', { name: UNREAD.title });

    api.getMyNotifications.mockResolvedValue(ok(notificationPage({ items: [READ] })));
    await user.click(screen.getByRole('button', { name: 'Load more' }));

    expect(await screen.findByRole('heading', { name: READ.title })).toBeVisible();
    expect(screen.getByRole('heading', { name: UNREAD.title })).toBeVisible();
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
    });
  });

  it('offers a retry when the list fails to load', async () => {
    api.getMyNotifications.mockResolvedValue({
      success: false,
      data: null,
      message: 'Server error.',
      httpStatus: 500,
    });
    renderPage();

    expect(await screen.findByText('Your notifications couldn’t be loaded')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
  });
});
