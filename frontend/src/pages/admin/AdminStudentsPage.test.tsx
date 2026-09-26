import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as adminStudentApi from '../../api/adminStudentApi';
import * as authApi from '../../api/authApi';
import { routes } from '../../app/routes';
import {
  invalidRow,
  importReport,
  okRow,
  referenceData,
  studentListItem,
  studentPage,
} from '../../test/adminFixtures';
import { adminUser, ok } from '../../test/authFixtures';
import { expectNoA11yViolations } from '../../test/axe';

vi.mock('../../api/adminStudentApi', async (original) => ({
  // buildStudentQuery is pure and is what the page's URL handling relies on.
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

function renderAt(path = '/admin/students') {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const view = render(<RouterProvider router={router} />);
  return { router, ...view };
}

async function openList(path = '/admin/students') {
  const view = renderAt(path);
  await screen.findByRole('heading', { level: 1, name: 'Students' });
  // The table only settles once the first request resolves.
  await waitFor(() => {
    expect(api.getStudents).toHaveBeenCalled();
  });
  return view;
}

/**
 * The filter controls. Scoped to the <select>s, because the table's column
 * headers use the same words ("Programme", "Semester") as the filter labels.
 */
function filter(name: 'Programme' | 'Semester' | 'Status'): HTMLSelectElement {
  const found = screen
    .getAllByLabelText(name)
    .find((element): element is HTMLSelectElement => element instanceof HTMLSelectElement);
  if (!found) {
    throw new Error(`No ${name} filter select found`);
  }
  return found;
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.getCurrentUser.mockResolvedValue(ok(adminUser));
  api.getReferenceData.mockResolvedValue(ok(referenceData));
  api.getStudents.mockResolvedValue(ok(studentPage()));
});

describe('AdminStudentsPage list', () => {
  it('lists students with their status', async () => {
    api.getStudents.mockResolvedValue(
      ok(
        studentPage([
          studentListItem(),
          studentListItem({
            rollNumber: 'CSE26002',
            name: 'Ravi Shah',
            email: 'ravi@university.edu',
            status: 'ACTIVE',
            invitationPending: false,
          }),
          studentListItem({
            rollNumber: 'CSE26003',
            name: 'Uma Rao',
            email: 'uma@university.edu',
            status: 'INACTIVE',
            invitationPending: false,
          }),
        ]),
      ),
    );
    await openList();

    const table = within(await screen.findByRole('table'));
    expect(table.getByRole('link', { name: 'CSE26001' })).toHaveAttribute(
      'href',
      '/admin/students/CSE26001',
    );
    // Status is words plus an icon, never colour alone.
    expect(table.getByText('Invited')).toBeVisible();
    expect(table.getByText('Active')).toBeVisible();
    expect(table.getByText('Deactivated')).toBeVisible();
  });

  it('puts the filters in the URL and asks the server for them', async () => {
    const user = userEvent.setup();
    const { router } = await openList();

    await user.selectOptions(filter('Programme'), 'BTECH-ECE');

    await waitFor(() => {
      expect(router.state.location.search).toBe('?program=BTECH-ECE');
    });
    await waitFor(() => {
      expect(api.getStudents).toHaveBeenLastCalledWith(
        expect.objectContaining({ program: 'BTECH-ECE' }),
        expect.any(AbortSignal),
      );
    });
  });

  it('reads the filters back out of the URL on load', async () => {
    await openList('/admin/students?status=INVITED&semester=5&program=BTECH-CSE&search=asha');

    expect(api.getStudents).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'INVITED',
        semester: 5,
        program: 'BTECH-CSE',
        search: 'asha',
      }),
      expect.any(AbortSignal),
    );
    expect(filter('Status')).toHaveValue('INVITED');
    expect(filter('Semester')).toHaveValue('5');
  });

  it('ignores a nonsense filter in the URL rather than sending it', async () => {
    await openList('/admin/students?status=NOPE&semester=99');

    expect(api.getStudents).toHaveBeenCalledWith({}, expect.any(AbortSignal));
  });

  it('shows the empty state when nothing matches', async () => {
    api.getStudents.mockResolvedValue(ok(studentPage([], { total: 0 })));
    await openList();

    expect(await screen.findByText('No students match these filters')).toBeVisible();
  });

  it('offers Retry when the list fails', async () => {
    const user = userEvent.setup();
    api.getStudents.mockResolvedValue({
      success: false,
      data: null,
      message: 'Could not reach the server. Check your connection and try again.',
    });
    await openList();

    expect(await screen.findByText(/Could not reach the server/)).toBeVisible();
    api.getStudents.mockResolvedValue(ok(studentPage()));
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('table')).toBeVisible();
  });

  it('has no accessibility violations', async () => {
    const { container } = await openList();
    await screen.findByRole('table');

    await expectNoA11yViolations(container, { isolated: false });
  });
});

describe('creating a student', () => {
  async function openForm() {
    const user = userEvent.setup();
    await openList();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add student' })).toBeEnabled();
    });
    await user.click(screen.getByRole('button', { name: 'Add student' }));
    await screen.findByRole('dialog', { name: 'Add a student' });
    return user;
  }

  /** Fills every required field with a valid value. */
  async function fillValid(user: ReturnType<typeof userEvent.setup>) {
    const dialog = within(screen.getByRole('dialog'));
    await user.type(dialog.getByLabelText('Roll number'), 'CSE26009');
    await user.type(dialog.getByLabelText('Full name'), 'New Student');
    await user.type(dialog.getByLabelText('E-mail address'), 'new.student@university.edu');
    await user.selectOptions(dialog.getByLabelText('Programme'), 'BTECH-CSE');
    await user.selectOptions(dialog.getByLabelText('Semester'), '5');
    await user.clear(dialog.getByLabelText('Credits completed'));
    await user.type(dialog.getByLabelText('Credits completed'), '88');
    await user.type(dialog.getByLabelText('Expected graduation term'), '2028-SPRING');
  }

  it('sends the whole record and says the invitation went out', async () => {
    const user = await openForm();
    api.createStudent.mockResolvedValue(
      ok({
        student: studentListItem({ rollNumber: 'CSE26009', name: 'New Student' }),
        invitationSent: true,
      }),
    );

    await fillValid(user);
    await user.click(screen.getByRole('button', { name: 'Create and send invitation' }));

    expect(api.createStudent).toHaveBeenCalledWith({
      rollNumber: 'CSE26009',
      name: 'New Student',
      email: 'new.student@university.edu',
      program: 'BTECH-CSE',
      semester: 5,
      creditsCompleted: 88,
      expectedGraduationTerm: '2028-SPRING',
      completedCourses: [],
    });
    expect(await screen.findByText(/An invitation has been e-mailed/)).toBeVisible();
  });

  it('validates before sending, and reports every bad field', async () => {
    const user = await openForm();

    await user.click(screen.getByRole('button', { name: 'Create and send invitation' }));

    expect(api.createStudent).not.toHaveBeenCalled();
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByLabelText('Roll number')).toHaveAccessibleDescription(
      /4 to 20 letters or digits/,
    );
    expect(dialog.getByLabelText('Full name')).toHaveAccessibleDescription(/Enter the student/);
    expect(dialog.getByLabelText('E-mail address')).toHaveAccessibleDescription(
      /valid e-mail address/,
    );
    expect(dialog.getByLabelText('Programme')).toHaveAccessibleDescription(/Choose a programme/);
  });

  it('shows the server’s uniqueness error against the field it names', async () => {
    const user = await openForm();
    api.createStudent.mockResolvedValue({
      success: false,
      data: null,
      message: 'That roll number already belongs to another student.',
      errors: [
        { field: 'rollNumber', message: 'That roll number already belongs to another student.' },
      ],
    });

    await fillValid(user);
    await user.click(screen.getByRole('button', { name: 'Create and send invitation' }));

    await waitFor(() => {
      expect(
        within(screen.getByRole('dialog')).getByLabelText('Roll number'),
      ).toHaveAccessibleDescription(/already belongs to another student/);
    });
    // The dialog stays open so the roll number can be corrected.
    expect(screen.getByRole('dialog')).toBeVisible();
  });

  it('adds completed courses through the searchable picker', async () => {
    const user = await openForm();
    api.createStudent.mockResolvedValue(ok({ student: studentListItem(), invitationSent: true }));

    const dialog = within(screen.getByRole('dialog'));
    await user.type(dialog.getByLabelText('Completed courses'), 'Data');
    await user.click(dialog.getByRole('button', { name: /CS201 Data Structures/ }));
    // The chosen course is listed back as a removable chip.
    expect(dialog.getByRole('list', { name: /Completed courses, chosen/ })).toHaveTextContent(
      'CS201',
    );

    await fillValid(user);
    await user.click(screen.getByRole('button', { name: 'Create and send invitation' }));

    expect(api.createStudent).toHaveBeenCalledWith(
      expect.objectContaining({ completedCourses: ['CS201'] }),
    );
  });

  it('removes a chosen course again', async () => {
    const user = await openForm();
    const dialog = within(screen.getByRole('dialog'));

    await user.type(dialog.getByLabelText('Completed courses'), 'CS201');
    await user.click(dialog.getByRole('button', { name: /CS201 Data Structures/ }));
    await user.click(dialog.getByRole('button', { name: /Remove CS201/ }));

    expect(
      dialog.queryByRole('list', { name: /Completed courses, chosen/ }),
    ).not.toBeInTheDocument();
  });

  it('has no accessibility violations, including with errors showing', async () => {
    const user = await openForm();

    // The whole body: the dialog renders in the <dialog> top layer.
    await expectNoA11yViolations(document.body, { isolated: false });

    await user.click(screen.getByRole('button', { name: 'Create and send invitation' }));
    await expectNoA11yViolations(document.body, { isolated: false });
  });
});

describe('the CSV import panel', () => {
  async function openImport() {
    const user = userEvent.setup();
    await openList();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Import CSV' })).toBeVisible();
    });
    await user.click(screen.getByRole('button', { name: 'Import CSV' }));
    await screen.findByRole('heading', { name: /Import students from a CSV file/ });
    return user;
  }

  /** Uploads a file to the panel's input. */
  async function upload(user: ReturnType<typeof userEvent.setup>, text: string) {
    const file = new File([text], 'students.csv', { type: 'text/csv' });
    await user.upload(screen.getByLabelText('CSV file'), file);
  }

  it('lists the verdict of every row without importing anything', async () => {
    const user = await openImport();
    api.previewStudentImport.mockResolvedValue(
      ok(
        importReport([
          okRow(1, { rollNumber: 'IMP0001', name: 'One' }),
          invalidRow(2, { rollNumber: 'bad', name: '' }, 'email', 'is not a valid e-mail address'),
        ]),
      ),
    );

    await upload(user, 'rollNumber,name\nIMP0001,One\nbad,\n');

    expect(await screen.findByText(/1 of 2 rows can be imported/)).toBeVisible();
    const table = within(screen.getByRole('table', { name: /What the file contains/ }));
    expect(table.getByText('Ready')).toBeVisible();
    expect(table.getByText('Not imported')).toBeVisible();
    expect(table.getByText(/is not a valid e-mail address/)).toBeVisible();
    expect(api.confirmStudentImport).not.toHaveBeenCalled();
  });

  it('imports the valid rows only after the confirm', async () => {
    const user = await openImport();
    const rows = [
      okRow(1, { rollNumber: 'IMP0001', name: 'One' }),
      invalidRow(2, { rollNumber: 'bad', name: '' }, 'email', 'is not a valid e-mail address'),
    ];
    api.previewStudentImport.mockResolvedValue(ok(importReport(rows)));
    api.confirmStudentImport.mockResolvedValue(
      ok(
        importReport(rows, {
          applied: true,
          invitationsSent: 1,
          counts: {
            total: 2,
            ok: 1,
            duplicate: 0,
            invalid: 1,
            imported: 1,
          },
        }),
      ),
    );

    await upload(user, 'rollNumber,name\nIMP0001,One\nbad,\n');
    await user.click(await screen.findByRole('button', { name: 'Import 1 student' }));

    expect(api.confirmStudentImport).toHaveBeenCalledWith('rollNumber,name\nIMP0001,One\nbad,\n');
    expect(await screen.findByText(/Imported 1 of 2 rows/)).toBeVisible();
    // Both the panel's summary and the toast say so; one of each is enough.
    expect(screen.getAllByText(/1 invited by e-mail/).length).toBeGreaterThan(0);
    // The table now reports what happened rather than what would.
    expect(screen.getByRole('table', { name: /What was imported/ })).toBeVisible();
  });

  it('will not offer an import when no row is valid', async () => {
    const user = await openImport();
    api.previewStudentImport.mockResolvedValue(
      ok(
        importReport([
          invalidRow(1, { rollNumber: 'bad' }, 'rollNumber', 'must be 4 to 20 letters or digits'),
        ]),
      ),
    );

    await upload(user, 'rollNumber\nbad\n');

    expect(await screen.findByRole('button', { name: 'Nothing to import' })).toBeDisabled();
  });

  it('reports an unreadable file and offers no import', async () => {
    const user = await openImport();
    api.previewStudentImport.mockResolvedValue(
      ok(importReport([], { fileError: 'Line 2: A quoted value is never closed.' })),
    );

    await upload(user, 'rollNumber\n"unclosed\n');

    expect(await screen.findByText(/A quoted value is never closed/)).toBeVisible();
    expect(screen.getByText(/Nothing was imported/)).toBeVisible();
    expect(screen.queryByRole('button', { name: /^Import/ })).not.toBeInTheDocument();
  });

  it('explains that importing writes only the valid rows', async () => {
    const user = await openImport();
    api.previewStudentImport.mockResolvedValue(
      ok(
        importReport([
          okRow(1, { rollNumber: 'IMP0001' }),
          invalidRow(2, { rollNumber: 'bad' }, 'email', 'is required'),
        ]),
      ),
    );

    await upload(user, 'rollNumber\nIMP0001\nbad\n');

    expect(await screen.findByText(/all in one transaction.*The rest are left out/s)).toBeVisible();
  });

  it('has no accessibility violations with a report showing', async () => {
    const user = await openImport();
    api.previewStudentImport.mockResolvedValue(
      ok(
        importReport([
          okRow(1, { rollNumber: 'IMP0001', name: 'One' }),
          invalidRow(2, { rollNumber: 'bad' }, 'email', 'is required'),
        ]),
      ),
    );

    await upload(user, 'rollNumber,name\nIMP0001,One\nbad,\n');
    await screen.findByRole('table', { name: /What the file contains/ });

    await expectNoA11yViolations(document.body, { isolated: false });
  });
});
