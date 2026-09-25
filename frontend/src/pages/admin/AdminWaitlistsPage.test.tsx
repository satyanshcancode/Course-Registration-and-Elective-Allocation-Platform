import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as waitlistApi from '../../api/waitlistApi';
import { expectNoA11yViolations } from '../../test/axe';
import { fallWindow, ok } from '../../test/catalogueFixtures';
import { adminWaitlistView, promotionSummary } from '../../test/registrationFixtures';
import { renderRoute } from '../../test/renderRoute';
import { AdminWaitlistsPage } from './AdminWaitlistsPage';

vi.mock('../../api/waitlistApi', () => ({
  getAdminWaitlists: vi.fn(),
  withdrawEnrollment: vi.fn(),
  processWaitlists: vi.fn(),
}));

const api = vi.mocked(waitlistApi);

const renderPage = (url = '/admin/waitlists?course=CS401') =>
  renderRoute(<AdminWaitlistsPage />, { path: '/admin/waitlists', url });

beforeEach(() => {
  vi.clearAllMocks();
  api.getAdminWaitlists.mockResolvedValue(ok(adminWaitlistView()));
  api.withdrawEnrollment.mockResolvedValue(
    ok({
      student: { name: 'Ada Iyer', email: 'ada@university.edu', program: 'CSE', semester: 7 },
      course: { code: 'CS401', name: 'Artificial Intelligence' },
      dropReason: 'ADMIN_WITHDRAWAL',
      promotions: promotionSummary,
    }),
  );
  api.processWaitlists.mockResolvedValue(ok({ coursesChecked: 2, promotions: promotionSummary }));
});

describe('AdminWaitlistsPage', () => {
  it('shows the roster and the queue for the course in the URL', async () => {
    const { container } = renderPage();

    expect(
      await screen.findByRole('heading', { level: 2, name: /Artificial Intelligence/ }),
    ).toBeVisible();
    expect(api.getAdminWaitlists).toHaveBeenCalledWith('CS401', expect.anything());

    const roster = screen.getByRole('table', { name: /holding a seat in CS401/ });
    expect(within(roster).getByText('Ada Iyer')).toBeVisible();

    const queue = screen.getByRole('table', { name: /waiting for a seat in CS401/ });
    expect(within(queue).getByText('Bo Nair')).toBeVisible();
    // The live position, not the stored one.
    expect(within(queue).getByText('#1')).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('asks for a course before showing anything', async () => {
    api.getAdminWaitlists.mockResolvedValue(
      ok(adminWaitlistView({ course: null, enrolled: [], waitlist: [] })),
    );
    renderPage('/admin/waitlists');

    expect(await screen.findByRole('heading', { name: 'No course chosen' })).toBeVisible();
    expect(api.getAdminWaitlists).toHaveBeenCalledWith(null, expect.anything());
  });

  it('puts the chosen course in the URL', async () => {
    const user = userEvent.setup();
    const { router } = renderPage('/admin/waitlists');
    await screen.findByLabelText('Course');

    await user.selectOptions(screen.getByLabelText('Course'), 'CS402');

    await waitFor(() => {
      expect(router.state.location.search).toBe('?course=CS402');
    });
  });

  it('refuses to withdraw without a reason, then withdraws and reports the cascade', async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await screen.findByRole('table', { name: /holding a seat in CS401/ });

    await user.click(screen.getByRole('button', { name: 'Withdraw' }));
    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.getByText(/the next eligible student waiting for it takes it/)).toBeVisible();
    await expectNoA11yViolations(container);

    await user.click(dialog.getByRole('button', { name: 'Withdraw' }));
    expect(await screen.findByText(/at least 5 characters/)).toBeVisible();
    expect(api.withdrawEnrollment).not.toHaveBeenCalled();

    await user.type(dialog.getByLabelText(/Reason/), 'Transferred out of the programme');
    await user.click(dialog.getByRole('button', { name: 'Withdraw' }));

    await waitFor(() => {
      expect(api.withdrawEnrollment).toHaveBeenCalledWith(
        'enrollment-1',
        'Transferred out of the programme',
      );
    });
    // The toast names who moved where, cascade included.
    expect(
      await screen.findByText('1 student promoted: Bo Nair → CS401 (from CS403).'),
    ).toBeVisible();
  });

  it('can be cancelled without withdrawing anyone', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('table', { name: /holding a seat in CS401/ });

    await user.click(screen.getByRole('button', { name: 'Withdraw' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }),
    );

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(api.withdrawEnrollment).not.toHaveBeenCalled();
  });

  it('reports a refusal from the server instead of pretending it worked', async () => {
    api.withdrawEnrollment.mockResolvedValue({
      success: false,
      data: null,
      message: 'That enrollment does not exist, or has already been released.',
      httpStatus: 404,
    });
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('table', { name: /holding a seat in CS401/ });

    await user.click(screen.getByRole('button', { name: 'Withdraw' }));
    const dialog = within(await screen.findByRole('dialog'));
    await user.type(dialog.getByLabelText(/Reason/), 'Left the university');
    await user.click(dialog.getByRole('button', { name: 'Withdraw' }));

    expect(await screen.findByText('Nobody was withdrawn')).toBeVisible();
  });

  it('runs the sweep and says what it found', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('table', { name: /holding a seat in CS401/ });

    await user.click(screen.getByRole('button', { name: 'Process waitlists' }));

    await waitFor(() => {
      expect(api.processWaitlists).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText('2 courses had a free seat')).toBeVisible();
  });

  it('says there is nothing to promote before allocation has run', async () => {
    api.getAdminWaitlists.mockResolvedValue(
      ok(adminWaitlistView({ window: { ...fallWindow, status: 'OPEN' } })),
    );
    renderPage();

    expect(await screen.findByText(/Waitlists exist once allocation has run/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Process waitlists' })).not.toBeInTheDocument();
  });
});
