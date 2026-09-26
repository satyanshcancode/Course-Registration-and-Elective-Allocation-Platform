import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as adminCatalogueApi from '../../api/adminCatalogueApi';
import * as authApi from '../../api/authApi';
import { routes } from '../../app/routes';
import { catalogue, courseRecord, importReport, okRow } from '../../test/adminFixtures';
import { adminUser, ok } from '../../test/authFixtures';
import { expectNoA11yViolations } from '../../test/axe';

vi.mock('../../api/adminCatalogueApi', () => ({
  getAdminCatalogue: vi.fn(),
  createCourse: vi.fn(),
  updateCourse: vi.fn(),
  setCourseActive: vi.fn(),
  previewCourseImport: vi.fn(),
  confirmCourseImport: vi.fn(),
}));

vi.mock('../../api/authApi', () => ({
  login: vi.fn(),
  logout: vi.fn(),
  getCurrentUser: vi.fn(),
}));

const api = vi.mocked(adminCatalogueApi);
const auth = vi.mocked(authApi);

async function openPage() {
  const router = createMemoryRouter(routes, { initialEntries: ['/admin/course-catalogue'] });
  const view = render(<RouterProvider router={router} />);
  await screen.findByRole('heading', { level: 1, name: 'Course catalogue' });
  await screen.findByRole('table');
  return { router, ...view };
}

/** Several courses, so the prerequisite picker has something to choose. */
const MANY = catalogue([
  courseRecord(),
  courseRecord({
    code: 'CS301',
    name: 'Operating Systems',
    prerequisites: [],
    relevantPrograms: [],
  }),
]);

beforeEach(() => {
  vi.clearAllMocks();
  auth.getCurrentUser.mockResolvedValue(ok(adminUser));
  api.getAdminCatalogue.mockResolvedValue(ok(catalogue()));
});

/** The submit button INSIDE the open dialog; the page header has one too. */
function dialogButton(name: string): HTMLElement {
  return within(screen.getByRole('dialog')).getByRole('button', { name });
}

describe('AdminCataloguePage', () => {
  it('lists each course with its rules and where it is offered', async () => {
    api.getAdminCatalogue.mockResolvedValue(
      ok(
        catalogue([
          courseRecord(),
          courseRecord({
            code: 'CS420',
            name: 'Compilers',
            offeredIn: [{ windowName: 'Fall 2026', status: 'OPEN' }],
            canDeactivate: false,
          }),
        ]),
      ),
    );
    await openPage();

    const table = within(screen.getByRole('table'));
    expect(table.getByText('Distributed Systems')).toBeVisible();
    expect(table.getByText('Not offered in any window')).toBeVisible();
    expect(table.getByText('Fall 2026 (open)')).toBeVisible();
    // Requirements are spelled out rather than left as raw numbers.
    expect(table.getAllByText(/Sem 5/).length).toBe(2);
  });

  it('marks a retired course with words as well as a tone', async () => {
    api.getAdminCatalogue.mockResolvedValue(
      ok(catalogue([courseRecord({ isActive: false, canDeactivate: false })])),
    );
    await openPage();

    expect(within(screen.getByRole('table')).getByText('Retired')).toBeVisible();
    expect(screen.getByText(/1 retired/)).toBeVisible();
  });

  it('disables Retire for a course a live window offers, and says why', async () => {
    api.getAdminCatalogue.mockResolvedValue(
      ok(
        catalogue([
          courseRecord({
            offeredIn: [{ windowName: 'Fall 2026', status: 'OPEN' }],
            canDeactivate: false,
          }),
        ]),
      ),
    );
    await openPage();

    const retire = screen.getByRole('button', { name: /Retire CS410/ });
    expect(retire).toBeDisabled();
    expect(retire).toHaveAttribute('title', expect.stringContaining('open or later'));
  });

  it('retires a course through the confirm dialog', async () => {
    const user = userEvent.setup();
    api.setCourseActive.mockResolvedValue(
      ok(courseRecord({ isActive: false, canDeactivate: false })),
    );
    await openPage();

    await user.click(screen.getByRole('button', { name: /Retire CS410/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Retire CS410?' });
    // The dialog says plainly that nothing is deleted.
    expect(dialog).toHaveTextContent(/nothing is deleted/i);

    await user.click(within(dialog).getByRole('button', { name: 'Retire' }));

    expect(api.setCourseActive).toHaveBeenCalledWith('CS410', false);
    await waitFor(() => {
      expect(api.getAdminCatalogue).toHaveBeenCalledTimes(2);
    });
  });

  it('starts the retire dialog on Cancel, not on the irreversible action', async () => {
    const user = userEvent.setup();
    await openPage();

    await user.click(screen.getByRole('button', { name: /Retire CS410/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Retire CS410?' });

    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('reinstates a retired course', async () => {
    const user = userEvent.setup();
    api.getAdminCatalogue.mockResolvedValue(
      ok(catalogue([courseRecord({ isActive: false, canDeactivate: false })])),
    );
    api.setCourseActive.mockResolvedValue(ok(courseRecord()));
    await openPage();

    await user.click(screen.getByRole('button', { name: /Reinstate CS410/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Reinstate CS410?' });
    await user.click(within(dialog).getByRole('button', { name: 'Reinstate' }));

    expect(api.setCourseActive).toHaveBeenCalledWith('CS410', true);
  });

  it('reports a refused retirement without changing the row', async () => {
    const user = userEvent.setup();
    api.setCourseActive.mockResolvedValue({
      success: false,
      data: null,
      message: 'CS410 is offered in Fall 2026 (open), so it cannot be retired.',
    });
    await openPage();

    await user.click(screen.getByRole('button', { name: /Retire CS410/ }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Retire' }),
    );

    expect(await screen.findByText(/Could not retire CS410/)).toBeVisible();
    expect(within(screen.getByRole('table')).getByText('Active')).toBeVisible();
  });

  it('has no accessibility violations', async () => {
    const { container } = await openPage();
    await expectNoA11yViolations(container, { isolated: false });
  });
});

describe('the course form', () => {
  async function openCreateForm() {
    const user = userEvent.setup();
    api.getAdminCatalogue.mockResolvedValue(ok(MANY));
    await openPage();
    await user.click(screen.getByRole('button', { name: 'Add course' }));
    await screen.findByRole('dialog', { name: 'Add a course' });
    return user;
  }

  /** Adds one option from a picker, matching its code exactly. */
  async function pick(
    user: ReturnType<typeof userEvent.setup>,
    label: string,
    code: string,
  ): Promise<void> {
    const dialog = within(screen.getByRole('dialog'));
    await user.clear(dialog.getByLabelText(label));
    await user.type(dialog.getByLabelText(label), code);
    const option = dialog
      .getAllByRole('button')
      .find((button) => button.textContent.startsWith(code));
    if (!option) {
      throw new Error(`No ${label} option starting with ${code}`);
    }
    await user.click(option);
  }

  async function fillValid(user: ReturnType<typeof userEvent.setup>) {
    const dialog = within(screen.getByRole('dialog'));
    await user.type(dialog.getByLabelText('Course code'), 'CS411');
    await user.type(dialog.getByLabelText('Course name'), 'Compilers');
    await user.selectOptions(dialog.getByLabelText('Department'), 'CSE');
    await user.selectOptions(dialog.getByLabelText('Credits'), '4');
    await user.selectOptions(dialog.getByLabelText('Earliest semester'), '5');
    await user.clear(dialog.getByLabelText('Credits required'));
    await user.type(dialog.getByLabelText('Credits required'), '80');
  }

  it('creates a course with its rule lists', async () => {
    const user = await openCreateForm();
    api.createCourse.mockResolvedValue(ok(courseRecord({ code: 'CS411', name: 'Compilers' })));

    await fillValid(user);
    await pick(user, 'Prerequisites', 'CS301');
    await pick(user, 'Eligible programmes', 'BTECH-CSE');

    await user.click(dialogButton('Add course'));

    expect(api.createCourse).toHaveBeenCalledWith({
      code: 'CS411',
      name: 'Compilers',
      credits: 4,
      department: 'CSE',
      description: '',
      minSemester: 5,
      minCredits: 80,
      prerequisites: ['CS301'],
      eligiblePrograms: ['BTECH-CSE'],
      relevantPrograms: [],
    });
  });

  it('validates before sending', async () => {
    const user = await openCreateForm();

    await user.click(dialogButton('Add course'));

    expect(api.createCourse).not.toHaveBeenCalled();
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByLabelText('Course code')).toHaveAccessibleDescription(
      /2 to 4 letters then 3 digits/,
    );
    expect(dialog.getByLabelText('Course name')).toHaveAccessibleDescription(
      /Enter the course name/,
    );
    expect(dialog.getByLabelText('Department')).toHaveAccessibleDescription(/Choose a department/);
  });

  it('refuses a course that is its own prerequisite', async () => {
    const user = await openCreateForm();
    await fillValid(user);
    const dialog = within(screen.getByRole('dialog'));

    // The rule is about the code, so the new course is given a code the
    // catalogue already offers as a prerequisite option.
    await user.clear(dialog.getByLabelText('Course code'));
    await user.type(dialog.getByLabelText('Course code'), 'CS301');
    await pick(user, 'Prerequisites', 'CS301');

    await user.click(dialogButton('Add course'));

    expect(api.createCourse).not.toHaveBeenCalled();
    expect(dialog.getByLabelText('Prerequisites')).toHaveAccessibleDescription(
      /cannot be its own prerequisite/,
    );
  });

  it('refuses a relevance bonus for a programme that may not take the course', async () => {
    const user = await openCreateForm();
    await fillValid(user);
    const dialog = within(screen.getByRole('dialog'));

    await pick(user, 'Eligible programmes', 'BTECH-CSE');
    await pick(user, 'Programme relevance', 'BTECH-ECE');

    await user.click(dialogButton('Add course'));

    expect(api.createCourse).not.toHaveBeenCalled();
    expect(dialog.getByLabelText('Programme relevance')).toHaveAccessibleDescription(
      /would never apply/,
    );
  });

  it('opens the edit form with the course’s current values, and fixes the code', async () => {
    const user = userEvent.setup();
    await openPage();

    await user.click(screen.getByRole('button', { name: /Edit CS410/ }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Edit CS410' }));

    expect(dialog.getByLabelText('Course code')).toHaveValue('CS410');
    expect(dialog.getByLabelText('Course code')).toHaveAttribute('readonly');
    expect(dialog.getByLabelText('Course name')).toHaveValue('Distributed Systems');
    expect(dialog.getByLabelText('Credits required')).toHaveValue(80);
    // The chosen rules are listed back as chips.
    expect(dialog.getByRole('list', { name: /Prerequisites, chosen/ })).toHaveTextContent('CS301');
  });

  it('saves an edit without the code', async () => {
    const user = userEvent.setup();
    api.updateCourse.mockResolvedValue(ok(courseRecord({ name: 'Renamed' })));
    await openPage();
    await user.click(screen.getByRole('button', { name: /Edit CS410/ }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Edit CS410' }));

    await user.clear(dialog.getByLabelText('Course name'));
    await user.type(dialog.getByLabelText('Course name'), 'Renamed');
    await user.click(dialogButton('Save changes'));

    expect(api.updateCourse).toHaveBeenCalledWith(
      'CS410',
      expect.objectContaining({ name: 'Renamed' }),
    );
    // The code is not in the payload: it identifies the course, it is not data.
    expect(api.updateCourse.mock.calls[0]?.[1]).not.toHaveProperty('code');
  });

  it('shows the server’s field error against the field it names', async () => {
    const user = await openCreateForm();
    api.createCourse.mockResolvedValue({
      success: false,
      data: null,
      message: 'A course with that code already exists.',
      errors: [{ field: 'code', message: 'A course with that code already exists.' }],
    });

    await fillValid(user);
    await user.click(dialogButton('Add course'));

    await waitFor(() => {
      expect(
        within(screen.getByRole('dialog')).getByLabelText('Course code'),
      ).toHaveAccessibleDescription(/already exists/);
    });
  });

  it('has no accessibility violations, including with errors showing', async () => {
    const user = await openCreateForm();

    await expectNoA11yViolations(document.body, { isolated: false });

    await user.click(dialogButton('Add course'));
    await expectNoA11yViolations(document.body, { isolated: false });
  });
});

describe('the course CSV import', () => {
  it('previews and then imports', async () => {
    const user = userEvent.setup();
    await openPage();
    await user.click(screen.getByRole('button', { name: 'Import CSV' }));
    await screen.findByRole('heading', { name: /Import courses from a CSV file/ });

    const rows = [okRow(1, { code: 'CS411', name: 'Compilers' })];
    api.previewCourseImport.mockResolvedValue(ok(importReport(rows)));
    api.confirmCourseImport.mockResolvedValue(
      ok(
        importReport(rows, {
          applied: true,
          counts: { total: 1, ok: 1, duplicate: 0, invalid: 0, imported: 1 },
        }),
      ),
    );

    await user.upload(
      screen.getByLabelText('CSV file'),
      new File(['code,name\nCS411,Compilers\n'], 'courses.csv', { type: 'text/csv' }),
    );
    expect(await screen.findByText(/1 of 1 rows can be imported/)).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Import 1 course' }));

    expect(api.confirmCourseImport).toHaveBeenCalled();
    // The report survives the list reload the import triggers: an administrator
    // must not lose the record of what just happened.
    expect(await screen.findByText(/Imported 1 of 1 rows/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Import another file' })).toBeVisible();
  });

  it('says a prerequisite may name a course the same file creates', async () => {
    const user = userEvent.setup();
    await openPage();

    await user.click(screen.getByRole('button', { name: 'Import CSV' }));

    expect(
      await screen.findByText(/prerequisite may name a course an earlier row of the same file/),
    ).toBeVisible();
  });
});
