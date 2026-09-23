import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as apiClientModule from '../../api/apiClient';
import * as courseApi from '../../api/courseApi';
import * as eligibilityApi from '../../api/eligibilityApi';
import { expectNoA11yViolations } from '../../test/axe';
import { fallWindow, ok, SERVER_TIME } from '../../test/catalogueFixtures';
import { eligibilityOverview } from '../../test/registrationFixtures';
import { renderRoute } from '../../test/renderRoute';
import { StudentDashboardPage } from './StudentDashboardPage';

vi.mock('../../api/courseApi', () => ({ getCurrentWindow: vi.fn() }));
vi.mock('../../api/eligibilityApi', () => ({ getEligibility: vi.fn() }));
vi.mock('../../api/apiClient', () => ({
  apiClient: { get: vi.fn() },
  isAbortError: (error: unknown) => error instanceof Error && error.name === 'AbortError',
}));
vi.mock('../../hooks/useAuth', () => ({
  useCurrentStudent: () => ({
    student: {
      name: 'Meera Iyer',
      rollNumber: 'ME23002',
      program: { code: 'BTECH-ME', name: 'B.Tech Mechanical Engineering' },
      semester: 3,
      creditsCompleted: 44,
    },
  }),
}));

const windowApi = vi.mocked(courseApi);
const eligibility = vi.mocked(eligibilityApi);
const client = vi.mocked(apiClientModule.apiClient);

const failure = (message: string) => ({ success: false as const, data: null, message });

function renderDashboard() {
  return renderRoute(<StudentDashboardPage />, {
    path: '/student/dashboard',
    routes: [{ path: '/student/eligibility', element: <p>Pre-check</p> }],
  });
}

/** The card whose heading is `name`. */
function card(name: string) {
  const heading = screen.getByRole('heading', { name });
  const article = heading.closest('article');
  if (!article) {
    throw new Error(`No ${name} card`);
  }
  return within(article);
}

describe('StudentDashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    windowApi.getCurrentWindow.mockResolvedValue(
      ok({ window: { ...fallWindow, status: 'OPEN' }, serverTime: SERVER_TIME }),
    );
    eligibility.getEligibility.mockResolvedValue(ok(eligibilityOverview));
    client.get.mockResolvedValue({ success: true, data: { unread: 3 } });
  });

  it('loads the window, eligibility and notifications together', async () => {
    renderDashboard();

    expect(await screen.findByText('You’re eligible for 1 of 3 courses')).toBeInTheDocument();
    expect(card('Registration window').getByText('Fall 2026')).toBeInTheDocument();
    expect(card('Notifications').getByText('3 unread messages.')).toBeInTheDocument();
    // All three requests went out; none waited for the others.
    expect(windowApi.getCurrentWindow).toHaveBeenCalledOnce();
    expect(eligibility.getEligibility).toHaveBeenCalledOnce();
    expect(client.get).toHaveBeenCalledOnce();
  });

  it('keeps the other sections when one of them fails', async () => {
    eligibility.getEligibility.mockResolvedValue(failure('Eligibility is unavailable.'));

    renderDashboard();

    // The failing section shows its own error and Retry...
    const failed = card('Eligibility');
    await waitFor(() => {
      expect(failed.getByText('Eligibility is unavailable.')).toBeInTheDocument();
    });
    expect(failed.getByRole('button', { name: 'Try again' })).toBeInTheDocument();

    // ...while the others render normally.
    expect(card('Registration window').getByText('Fall 2026')).toBeInTheDocument();
    expect(card('Notifications').getByText('3 unread messages.')).toBeInTheDocument();
  });

  it('retries only the section that failed', async () => {
    const user = userEvent.setup();
    eligibility.getEligibility.mockResolvedValueOnce(failure('Eligibility is unavailable.'));

    renderDashboard();
    const failed = card('Eligibility');
    await waitFor(() => {
      expect(failed.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    });

    await user.click(failed.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('You’re eligible for 1 of 3 courses')).toBeInTheDocument();
    expect(eligibility.getEligibility).toHaveBeenCalledTimes(2);
    // The healthy sections were not reloaded.
    expect(windowApi.getCurrentWindow).toHaveBeenCalledOnce();
    expect(client.get).toHaveBeenCalledOnce();
  });

  it('shows what to do next for an open window', async () => {
    renderDashboard();
    await screen.findByText('You’re eligible for 1 of 3 courses');

    expect(card('What to do next').getByText(/Rank up to five courses/)).toBeInTheDocument();
  });

  it('shows draft guidance before registration opens', async () => {
    windowApi.getCurrentWindow.mockResolvedValue(
      ok({ window: { ...fallWindow, status: 'DRAFT' }, serverTime: SERVER_TIME }),
    );

    renderDashboard();
    expect(await screen.findByText(/Run the eligibility pre-check/)).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = renderDashboard();
    await screen.findByText('You’re eligible for 1 of 3 courses');
    await expectNoA11yViolations(container, { isolated: false });
  });
});
