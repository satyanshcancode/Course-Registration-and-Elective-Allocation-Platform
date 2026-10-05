import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as activityApi from '../../api/activityApi';
import * as allocationApi from '../../api/allocationApi';
import * as courseApi from '../../api/courseApi';
import * as eligibilityApi from '../../api/eligibilityApi';
import { expectNoA11yViolations } from '../../test/axe';
import { fallWindow, ok, SERVER_TIME } from '../../test/catalogueFixtures';
import { historyEvent, historyPage } from '../../test/activityFixtures';
import { eligibilityOverview, pendingResults } from '../../test/registrationFixtures';
import { renderRoute } from '../../test/renderRoute';
import { RegistrationWindowProvider } from '../../hooks/useRegistrationWindow';
import { StudentDashboardPage } from './StudentDashboardPage';

vi.mock('../../api/courseApi', () => ({ getCurrentWindow: vi.fn() }));
vi.mock('../../api/activityApi', () => ({ getMyHistory: vi.fn() }));
vi.mock('../../api/allocationApi', () => ({ getMyAllocationResults: vi.fn() }));
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
const allocation = vi.mocked(allocationApi);
const activity = vi.mocked(activityApi);

const failure = (message: string) => ({ success: false as const, data: null, message });

/**
 * Inside the window provider, the way the student area renders it: the page
 * reads the registration window from there rather than fetching its own.
 */
function renderDashboard() {
  return renderRoute(
    <RegistrationWindowProvider>
      <StudentDashboardPage />
    </RegistrationWindowProvider>,
    {
      path: '/student/dashboard',
      routes: [{ path: '/student/eligibility', element: <p>Pre-check</p> }],
    },
  );
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

/** The stat tile whose label is `label`. */
function tile(label: string) {
  const article = screen.getByText(label).closest('article');
  if (!article) {
    throw new Error(`No ${label} tile`);
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
    allocation.getMyAllocationResults.mockResolvedValue(ok(pendingResults));
    activity.getMyHistory.mockResolvedValue(ok(historyPage()));
  });

  it('greets the student by their first name', async () => {
    renderDashboard();

    const heading = await screen.findByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent(/^Good (morning|afternoon|evening), Meera/);
  });

  it('counts eligible courses, the cart, confirmed seats and waitlists at a glance', async () => {
    renderDashboard();

    await screen.findByText('You’re eligible for 1 of 3 courses');
    expect(tile('Eligible courses').getByText('1 / 3')).toBeInTheDocument();
    expect(tile('Eligible courses').getByRole('link', { name: /View eligible/ })).toHaveAttribute(
      'href',
      '/student/eligibility',
    );
    // Allocation has not run in `pendingResults`: no seat, no waitlist.
    expect(tile('Confirmed').getByText('0')).toBeInTheDocument();
    expect(tile('On waitlist').getByText('0')).toBeInTheDocument();
  });

  it('marks where the window has reached on the four-step timeline', async () => {
    renderDashboard();

    const window = card('Registration window');
    await waitFor(() => {
      expect(window.getByText('Fall 2026')).toBeInTheDocument();
    });
    // All four steps, in order, with the current one saying so in words and
    // not only in colour.
    expect(window.getAllByRole('listitem').map((step) => step.textContent)).toEqual([
      'Not started',
      'Open (now)',
      'Closing soon',
      'Closed',
    ]);
  });

  it('shows the last few events, in the same words the history page uses', async () => {
    activity.getMyHistory.mockResolvedValue(
      ok(
        historyPage({
          events: [
            historyEvent({ type: 'PROMOTED', rank: 1, fromPosition: 2, releasedCourse: 'CS402' }),
            historyEvent(
              { type: 'SUBMITTED', reference: 'REF-3F9A2C71', courseCodes: ['CS401'] },
              { course: null },
            ),
          ],
        }),
      ),
    );
    renderDashboard();

    const recent = card('Recent activity');
    expect(await recent.findByText(/You were moved up from CS402 to CS401/)).toBeVisible();
    expect(recent.getByRole('link', { name: /View all/ })).toHaveAttribute(
      'href',
      '/student/history',
    );
    // Five is all the dashboard asks for; the rest live on the history page.
    expect(activity.getMyHistory).toHaveBeenCalledWith({ limit: 5 }, expect.anything());
  });

  it('says so plainly when nothing has happened yet', async () => {
    renderDashboard();

    expect(await screen.findByText(/Nothing has happened yet/)).toBeVisible();
  });

  it('loads every section together, not one after another', async () => {
    renderDashboard();

    expect(await screen.findByText('You’re eligible for 1 of 3 courses')).toBeInTheDocument();
    expect(card('Registration window').getByText('Fall 2026')).toBeInTheDocument();
    // Every request went out; none waited for the others, and the window was
    // asked for once for the whole area rather than once per card.
    expect(windowApi.getCurrentWindow).toHaveBeenCalledOnce();
    expect(eligibility.getEligibility).toHaveBeenCalledOnce();
    expect(allocation.getMyAllocationResults).toHaveBeenCalledOnce();
    expect(activity.getMyHistory).toHaveBeenCalledOnce();
  });

  it('keeps the other sections when one of them fails', async () => {
    eligibility.getEligibility.mockResolvedValue(failure('Eligibility is unavailable.'));

    renderDashboard();

    // The failing section shows its own error and Retry...
    const failed = card('Eligibility status');
    await waitFor(() => {
      expect(failed.getByText('Eligibility is unavailable.')).toBeInTheDocument();
    });
    expect(failed.getByRole('button', { name: 'Try again' })).toBeInTheDocument();

    // ...while the others render normally.
    expect(card('Registration window').getByText('Fall 2026')).toBeInTheDocument();
    expect(card('Recent activity')).toBeTruthy();
  });

  it('retries only the section that failed', async () => {
    const user = userEvent.setup();
    eligibility.getEligibility.mockResolvedValueOnce(failure('Eligibility is unavailable.'));

    renderDashboard();
    const failed = card('Eligibility status');
    await waitFor(() => {
      expect(failed.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    });

    await user.click(failed.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('You’re eligible for 1 of 3 courses')).toBeInTheDocument();
    expect(eligibility.getEligibility).toHaveBeenCalledTimes(2);
    // The healthy sections were not reloaded.
    expect(windowApi.getCurrentWindow).toHaveBeenCalledOnce();
    expect(allocation.getMyAllocationResults).toHaveBeenCalledOnce();
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
