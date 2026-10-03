import type { TeamList, TeamMember } from '@course-reg/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as authApi from '../../api/authApi';
import * as teamApi from '../../api/teamApi';
import { routes } from '../../app/routes';
import { adminUser, coAdminUser, ok } from '../../test/authFixtures';
import { expectNoA11yViolations } from '../../test/axe';
import { findLoadedTable } from '../../test/tables';

vi.mock('../../api/teamApi', () => ({
  getTeam: vi.fn(),
  inviteCoAdmin: vi.fn(),
  resendTeamInvitation: vi.fn(),
  setTeamMemberActive: vi.fn(),
}));

vi.mock('../../api/authApi', () => ({
  login: vi.fn(),
  logout: vi.fn(),
  getCurrentUser: vi.fn(),
}));

const api = vi.mocked(teamApi);
const auth = vi.mocked(authApi);

function member(overrides: Partial<TeamMember> = {}): TeamMember {
  return {
    id: 'b2f5b3a0-0000-4000-8000-000000000002',
    email: 'admin@university.edu',
    name: 'Priya Raman',
    role: 'ADMIN',
    status: 'ACTIVE',
    createdAt: '2026-09-01T09:00:00.000Z',
    isSelf: true,
    ...overrides,
  };
}

const deputy = member({
  id: 'b2f5b3a0-0000-4000-8000-000000000003',
  email: 'coadmin@university.edu',
  name: 'Devika Menon',
  role: 'CO_ADMIN',
  isSelf: false,
});

function team(members: TeamMember[] = [member(), deputy], activeAdmins = 2): TeamList {
  return { members, activeAdmins };
}

function renderAt(path = '/admin/team') {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return { router, ...render(<RouterProvider router={router} />) };
}

async function openTeam() {
  const view = renderAt();
  await screen.findByRole('heading', { level: 1, name: 'Team' });
  await waitFor(() => {
    expect(api.getTeam).toHaveBeenCalled();
  });
  return view;
}

/** The row for one member, found by the name its first cell prints. */
async function rowFor(name: string): Promise<HTMLElement> {
  const table = await findLoadedTable();
  const cell = await within(table).findByText(name);
  const row = cell.closest('tr');
  if (!row) {
    throw new Error(`No row for ${name}`);
  }
  return row;
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.getCurrentUser.mockResolvedValue(ok(adminUser));
  api.getTeam.mockResolvedValue(ok(team()));
});

describe('TeamPage', () => {
  it('lists each staff account with its role and status in words', async () => {
    const { container } = await openTeam();

    const admin = await rowFor('Priya Raman');
    expect(within(admin).getByText('Administrator')).toBeVisible();
    expect(within(admin).getByText('Active')).toBeVisible();

    const coAdmin = await rowFor('Devika Menon');
    expect(within(coAdmin).getByText('Co-administrator')).toBeVisible();
    expect(within(coAdmin).getByText('Everything except managing staff accounts.')).toBeVisible();

    await expectNoA11yViolations(container);
  });

  it('marks which row is the signed-in administrator', async () => {
    await openTeam();
    const admin = await rowFor('Priya Raman');
    expect(within(admin).getByText('(you)')).toBeVisible();
  });

  it('invites a co-administrator by name and address', async () => {
    const user = userEvent.setup();
    await openTeam();
    const invited = member({
      id: 'b2f5b3a0-0000-4000-8000-000000000004',
      email: 'new.deputy@university.edu',
      name: 'New Deputy',
      role: 'CO_ADMIN',
      status: 'INVITED',
      isSelf: false,
    });
    api.inviteCoAdmin.mockResolvedValue(
      ok({ member: invited, team: team([member(), deputy, invited]) }),
    );

    await user.click(screen.getByRole('button', { name: 'Invite co-admin' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Name/), 'New Deputy');
    await user.type(within(dialog).getByLabelText(/e-mail/i), 'new.deputy@university.edu');
    await user.click(within(dialog).getByRole('button', { name: 'Send invitation' }));

    await waitFor(() => {
      expect(api.inviteCoAdmin).toHaveBeenCalledWith({
        name: 'New Deputy',
        email: 'new.deputy@university.edu',
      });
    });
    expect(await rowFor('New Deputy')).toBeTruthy();
  });

  it('has no way to choose a role when inviting', async () => {
    const user = userEvent.setup();
    await openTeam();
    await user.click(screen.getByRole('button', { name: 'Invite co-admin' }));
    const dialog = await screen.findByRole('dialog');

    // The form can only ever create a co-administrator; a role picker would be
    // a way to mint another administrator.
    expect(within(dialog).queryByLabelText(/role/i)).toBeNull();
    expect(within(dialog).queryByRole('combobox')).toBeNull();
  });

  it('shows a duplicate address against the field', async () => {
    const user = userEvent.setup();
    await openTeam();
    api.inviteCoAdmin.mockResolvedValue({
      success: false,
      data: null,
      message: 'That e-mail address already belongs to another account.',
      errors: [
        { field: 'email', message: 'That e-mail address already belongs to another account.' },
      ],
    });

    await user.click(screen.getByRole('button', { name: 'Invite co-admin' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Name/), 'Clash');
    await user.type(within(dialog).getByLabelText(/e-mail/i), 'coadmin@university.edu');
    await user.click(within(dialog).getByRole('button', { name: 'Send invitation' }));

    // Twice on purpose: once against the field, once in the banner.
    const shown = await within(dialog).findAllByText(
      'That e-mail address already belongs to another account.',
    );
    expect(shown.length).toBeGreaterThanOrEqual(1);
    expect(within(dialog).getByLabelText(/e-mail/i)).toHaveAccessibleDescription(
      /already belongs to another account/,
    );
  });

  it('confirms before deactivating, and says what happens', async () => {
    const user = userEvent.setup();
    await openTeam();
    api.setTeamMemberActive.mockResolvedValue(
      ok(team([member(), { ...deputy, status: 'DEACTIVATED' }])),
    );

    const row = await rowFor('Devika Menon');
    await user.click(within(row).getByRole('button', { name: 'Deactivate' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/signed out immediately/)).toBeVisible();
    expect(within(dialog).getByText(/stays in the audit log/)).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Deactivate' }));

    await waitFor(() => {
      expect(api.setTeamMemberActive).toHaveBeenCalledWith(deputy.id, false);
    });
  });

  it('does nothing when the confirmation is cancelled', async () => {
    const user = userEvent.setup();
    await openTeam();

    const row = await rowFor('Devika Menon');
    await user.click(within(row).getByRole('button', { name: 'Deactivate' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(api.setTeamMemberActive).not.toHaveBeenCalled();
  });

  it('offers to resend an invitation only while one is outstanding', async () => {
    const pending = { ...deputy, status: 'INVITED' as const };
    api.getTeam.mockResolvedValue(ok(team([member(), pending])));
    const user = userEvent.setup();
    await openTeam();
    api.resendTeamInvitation.mockResolvedValue(ok(team([member(), pending])));

    const invitedRow = await rowFor('Devika Menon');
    await user.click(within(invitedRow).getByRole('button', { name: 'Resend invitation' }));
    await waitFor(() => {
      expect(api.resendTeamInvitation).toHaveBeenCalledWith(deputy.id);
    });

    const activeRow = await rowFor('Priya Raman');
    expect(within(activeRow).queryByRole('button', { name: 'Resend invitation' })).toBeNull();
  });

  it('will not deactivate the last active administrator', async () => {
    api.getTeam.mockResolvedValue(ok(team([member(), deputy], 1)));
    await openTeam();

    const admin = await rowFor('Priya Raman');
    expect(within(admin).getByRole('button', { name: 'Deactivate' })).toBeDisabled();
    // The co-administrator is unaffected: the rule is about administrators.
    const coAdmin = await rowFor('Devika Menon');
    expect(within(coAdmin).getByRole('button', { name: 'Deactivate' })).toBeEnabled();
  });

  it('reports a failure without pretending the change happened', async () => {
    const user = userEvent.setup();
    await openTeam();
    api.setTeamMemberActive.mockResolvedValue({
      success: false,
      data: null,
      message: 'That is the last active administrator. There must always be one.',
      errors: [],
    });

    const row = await rowFor('Devika Menon');
    await user.click(within(row).getByRole('button', { name: 'Deactivate' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Deactivate' }));

    expect(
      await screen.findByText('That is the last active administrator. There must always be one.'),
    ).toBeVisible();
    // Still listed as it was: the page shows the server's answer, not a guess.
    expect(within(await rowFor('Devika Menon')).getByText('Active')).toBeVisible();
  });
});

describe('a co-administrator', () => {
  beforeEach(() => {
    auth.getCurrentUser.mockResolvedValue(ok(coAdminUser));
  });

  it('has no Team item in the navigation', async () => {
    renderAt('/admin/dashboard');
    await screen.findByRole('navigation');
    expect(screen.queryByRole('link', { name: 'Team' })).toBeNull();
    // The pages they DO have are still there.
    expect(screen.getByRole('link', { name: 'Students' })).toBeVisible();
  });

  it('is sent to the dashboard if they open /admin/team directly', async () => {
    const { router } = renderAt('/admin/team');
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/admin/dashboard');
    });
    expect(api.getTeam).not.toHaveBeenCalled();
  });

  it('keeps the rest of the administrative navigation', async () => {
    renderAt('/admin/dashboard');
    await screen.findByRole('navigation');
    for (const label of ['Dashboard', 'Courses', 'Students', 'Waitlists']) {
      expect(screen.getByRole('link', { name: label })).toBeVisible();
    }
  });
});

describe('an administrator', () => {
  it('has the Team item in the navigation', async () => {
    renderAt('/admin/dashboard');
    await screen.findByRole('navigation');
    expect(await screen.findByRole('link', { name: 'Team' })).toBeVisible();
  });
});
