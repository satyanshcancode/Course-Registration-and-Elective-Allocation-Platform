import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientFailure } from '../../api/apiClient';
import * as adminStudentApi from '../../api/adminStudentApi';
import * as authApi from '../../api/authApi';
import { routes } from '../../app/routes';
import { referenceData, studentDetail, studentListItem } from '../../test/adminFixtures';
import { adminUser, ok } from '../../test/authFixtures';
import { expectNoA11yViolations } from '../../test/axe';

vi.mock('../../api/adminStudentApi', async (original) => ({
  ...(await original<typeof adminStudentApi>()),
  getStudents: vi.fn(),
  getStudent: vi.fn(),
  createStudent: vi.fn(),
  updateStudent: vi.fn(),
  resendInvitation: vi.fn(),
  setStudentActive: vi.fn(),
  previewStudentImport: vi.fn(),
  confirmStudentImport: vi.fn(),
  getReferenceData: vi.fn(),
}));

vi.mock('../../api/authApi', () => ({
  login: vi.fn(),
  logout: vi.fn(),
  getCurrentUser: vi.fn(),
}));

const api = vi.mocked(adminStudentApi);
const auth = vi.mocked(authApi);

async function openDetail(rollNumber = 'CSE26001') {
  const router = createMemoryRouter(routes, {
    initialEntries: [`/admin/students/${rollNumber}`],
  });
  const view = render(<RouterProvider router={router} />);
  await waitFor(() => {
    expect(api.getStudent).toHaveBeenCalled();
  });
  return { router, ...view };
}

/**
 * The <article> a card's heading belongs to.
 *
 * Needed because jsdom's <dialog> shim does not hide a closed dialog's
 * contents, so the edit form's course picker matches the same course names the
 * record does. Scoping asks the question the test actually means.
 */
function card(heading: string) {
  const title = screen.getByRole('heading', { name: heading });
  const article = title.closest('article');
  if (!article) {
    throw new Error(`No card found for "${heading}"`);
  }
  return within(article);
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.getCurrentUser.mockResolvedValue(ok(adminUser));
  api.getReferenceData.mockResolvedValue(ok(referenceData));
  api.getStudent.mockResolvedValue(ok(studentDetail()));
});

describe('AdminStudentDetailPage', () => {
  it('shows the record, the status and when the invitation expires', async () => {
    await openDetail();

    expect(await screen.findByRole('heading', { level: 1, name: 'Asha Menon' })).toBeVisible();
    const record = card('Record');
    expect(record.getByText('asha.menon@university.edu')).toBeVisible();
    expect(record.getByText('Invited')).toBeVisible();
    expect(record.getByText('Data Structures')).toBeVisible();
    expect(record.getByText(/The invitation expires in about \d+ (hour|day)/)).toBeVisible();
  });

  it('says a student with no completed courses has none recorded', async () => {
    api.getStudent.mockResolvedValue(ok(studentDetail({ completedCourses: [] })));
    await openDetail();

    await screen.findByRole('heading', { level: 1, name: 'Asha Menon' });
    expect(card('Record').getByText('None recorded')).toBeVisible();
  });

  it('offers Resend invitation while an invitation is outstanding', async () => {
    await openDetail();

    expect(await screen.findByRole('button', { name: 'Resend invitation' })).toBeVisible();
  });

  it('does not offer it once the student has set a password', async () => {
    // An activated account gets a password reset, not another invitation.
    api.getStudent.mockResolvedValue(
      ok(
        studentDetail({
          student: studentListItem({ status: 'ACTIVE', invitationPending: false }),
          invitationExpiresAt: null,
        }),
      ),
    );
    await openDetail();
    await screen.findByRole('heading', { level: 1, name: 'Asha Menon' });

    expect(screen.queryByRole('button', { name: 'Resend invitation' })).not.toBeInTheDocument();
    expect(card('Record').getByText('Active')).toBeVisible();
  });

  it('resends the invitation and reports what that means', async () => {
    const user = userEvent.setup();
    api.resendInvitation.mockResolvedValue({
      success: true,
      data: studentListItem(),
      message:
        'A new invitation is on its way to asha.menon@university.edu. The previous link no longer works.',
    });
    await openDetail();
    await screen.findByRole('button', { name: 'Resend invitation' });

    await user.click(screen.getByRole('button', { name: 'Resend invitation' }));

    expect(api.resendInvitation).toHaveBeenCalledWith('CSE26001');
    expect(await screen.findByText(/The previous link no longer works/)).toBeVisible();
  });

  it('deactivates through a confirm dialog that says nothing is deleted', async () => {
    const user = userEvent.setup();
    api.setStudentActive.mockResolvedValue({
      success: true,
      data: studentListItem({ status: 'INACTIVE', invitationPending: false }),
      message: 'Asha Menon can no longer sign in. Their record and history are unchanged.',
    });
    await openDetail();
    await screen.findByRole('button', { name: 'Deactivate' });

    await user.click(screen.getByRole('button', { name: 'Deactivate' }));
    const dialog = await screen.findByRole('dialog', { name: 'Deactivate this account?' });
    expect(dialog).toHaveTextContent(/nothing is deleted/i);
    // An irreversible-looking action starts focused on the safe choice.
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();

    await user.click(within(dialog).getByRole('button', { name: 'Deactivate' }));

    expect(api.setStudentActive).toHaveBeenCalledWith('CSE26001', false);
  });

  it('offers Reactivate for a deactivated account', async () => {
    const user = userEvent.setup();
    api.getStudent.mockResolvedValue(
      ok(
        studentDetail({
          student: studentListItem({ status: 'INACTIVE', invitationPending: false }),
          invitationExpiresAt: null,
        }),
      ),
    );
    api.setStudentActive.mockResolvedValue({
      success: true,
      data: studentListItem(),
      message: 'ok',
    });
    await openDetail();
    await screen.findByRole('button', { name: 'Reactivate' });

    await user.click(screen.getByRole('button', { name: 'Reactivate' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Reactivate' }),
    );

    expect(api.setStudentActive).toHaveBeenCalledWith('CSE26001', true);
  });

  it('edits the record through the same form the list uses', async () => {
    const user = userEvent.setup();
    api.updateStudent.mockResolvedValue(ok(studentListItem({ semester: 6 })));
    await openDetail();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Edit record' })).toBeEnabled();
    });

    await user.click(screen.getByRole('button', { name: 'Edit record' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Edit Asha Menon' }));
    // Pre-filled from the record, completed courses included.
    expect(dialog.getByLabelText('Roll number')).toHaveValue('CSE26001');
    expect(dialog.getByRole('list', { name: /Completed courses, chosen/ })).toHaveTextContent(
      'CS201',
    );

    await user.selectOptions(dialog.getByLabelText('Semester'), '6');
    await user.click(dialog.getByRole('button', { name: 'Save changes' }));

    expect(api.updateStudent).toHaveBeenCalledWith(
      'CSE26001',
      expect.objectContaining({ semester: 6, completedCourses: ['CS201'] }),
    );
  });

  it('shows a proper not-found state for an unknown roll number', async () => {
    // A ClientFailure, because isNotFound reads the HTTP status off it.
    const notFound: ClientFailure = {
      success: false,
      data: null,
      message: 'No student with roll number NOSUCH99.',
      httpStatus: 404,
    };
    api.getStudent.mockResolvedValue(notFound);
    await openDetail('NOSUCH99');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Student not found' }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Back to the student list' })).toHaveAttribute(
      'href',
      '/admin/students',
    );
  });

  it('offers Retry for any other failure', async () => {
    const unreachable: ClientFailure = {
      success: false,
      data: null,
      message: 'Could not reach the server. Check your connection and try again.',
      httpStatus: null,
    };
    api.getStudent.mockResolvedValue(unreachable);
    await openDetail();

    expect(await screen.findByText(/Could not reach the server/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  it('has no accessibility violations', async () => {
    const { container } = await openDetail();
    await screen.findByRole('heading', { level: 1, name: 'Asha Menon' });

    await expectNoA11yViolations(container, { isolated: false });
  });
});
