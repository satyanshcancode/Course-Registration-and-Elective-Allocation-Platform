import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as courseApi from '../../api/courseApi';
import * as eligibilityApi from '../../api/eligibilityApi';
import { expectNoA11yViolations } from '../../test/axe';
import { fallWindow, ok, SERVER_TIME } from '../../test/catalogueFixtures';
import { eligibilityOverview } from '../../test/registrationFixtures';
import { renderRoute } from '../../test/renderRoute';
import { EligibilityPage } from './EligibilityPage';

vi.mock('../../api/eligibilityApi', () => ({ getEligibility: vi.fn() }));
vi.mock('../../api/courseApi', () => ({ getCurrentWindow: vi.fn() }));

const api = vi.mocked(eligibilityApi);

function renderEligibility() {
  return renderRoute(<EligibilityPage />, {
    path: '/student/eligibility',
    routes: [{ path: '/student/courses/:code', element: <p>Course detail</p> }],
  });
}

/** The <details> group with the given summary text. */
function group(name: 'Eligible' | 'Not eligible') {
  const summary = screen.getByText(new RegExp(`^${name} · \\d+$`));
  const details = summary.closest('details');
  if (!details) {
    throw new Error(`No ${name} group`);
  }
  return within(details);
}

describe('EligibilityPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(courseApi).getCurrentWindow.mockResolvedValue(
      ok({ window: fallWindow, serverTime: SERVER_TIME }),
    );
    api.getEligibility.mockResolvedValue(ok(eligibilityOverview));
  });

  it('shows the record the check is based on', async () => {
    renderEligibility();

    const record = (await screen.findByRole('heading', { name: 'Your record' })).closest('article');
    expect(record).toHaveTextContent('B.Tech Mechanical Engineering');
    expect(record).toHaveTextContent('3');
    expect(record).toHaveTextContent('44');
    expect(record).toHaveTextContent('CS101');
    expect(record).toHaveTextContent('Programming Fundamentals');
  });

  it('summarises how many courses the student can take', async () => {
    renderEligibility();
    expect(
      await screen.findByRole('heading', { name: 'You’re eligible for 1 of 3 courses' }),
    ).toBeInTheDocument();
  });

  it('groups the courses and gives every reason in plain English', async () => {
    renderEligibility();
    await screen.findByText(/^Eligible · 1$/);

    expect(group('Eligible').getByText('Renewable Energy Systems')).toBeInTheDocument();

    const notEligible = group('Not eligible');
    expect(notEligible.getByText('Artificial Intelligence')).toBeInTheDocument();
    // Both of AI's reasons, each as its own sentence.
    expect(notEligible.getByText('Open to CSE only — you’re in BTECH-ME')).toBeInTheDocument();
    expect(notEligible.getByText('Needs semester 5 — you’re in semester 3')).toBeInTheDocument();
    expect(notEligible.getByText('Complete CS302 Computer Networks first')).toBeInTheDocument();
  });

  it('tells the student to check now, while the window is still a draft', async () => {
    renderEligibility();
    expect(await screen.findByText(/check now so there are no surprises/i)).toBeInTheDocument();
  });

  it('filters by department', async () => {
    const user = userEvent.setup();
    renderEligibility();
    await screen.findByText('Renewable Energy Systems');

    await user.selectOptions(screen.getByLabelText('Department'), 'CSE');

    expect(screen.queryByText('Renewable Energy Systems')).not.toBeInTheDocument();
    expect(screen.getByText('Artificial Intelligence')).toBeInTheDocument();
    expect(screen.getByText('Cloud Security')).toBeInTheDocument();
  });

  it('searches by code or name once typing stops', async () => {
    const user = userEvent.setup();
    renderEligibility();
    await screen.findByText('Cloud Security');

    await user.type(screen.getByRole('searchbox', { name: 'Search courses' }), 'cloud');

    // The search is debounced, so the list changes after typing stops.
    await waitFor(() => {
      expect(screen.queryByText('Artificial Intelligence')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Cloud Security')).toBeInTheDocument();
  });

  it('shows an empty state when nothing matches', async () => {
    const user = userEvent.setup();
    renderEligibility();
    await screen.findByText('Cloud Security');

    await user.type(screen.getByRole('searchbox', { name: 'Search courses' }), 'zzz');

    expect(await screen.findByText('No courses match these filters')).toBeInTheDocument();
  });

  it('shows the error with a retry when the check fails', async () => {
    api.getEligibility.mockResolvedValue({
      success: false,
      data: null,
      message: 'The service is unavailable.',
    });

    renderEligibility();
    expect(await screen.findByText('The service is unavailable.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = renderEligibility();
    await screen.findByText('Renewable Energy Systems');
    await expectNoA11yViolations(container, { isolated: false });
  });
});
