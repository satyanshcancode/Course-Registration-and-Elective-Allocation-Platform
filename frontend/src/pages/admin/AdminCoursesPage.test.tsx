import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as adminApi from '../../api/adminApi';
import { expectNoA11yViolations } from '../../test/axe';
import { adminOffering, fallWindow, ok } from '../../test/catalogueFixtures';
import { renderRoute } from '../../test/renderRoute';
import { AdminCoursesPage } from './AdminCoursesPage';

vi.mock('../../api/adminApi', () => ({
  getAdminCourses: vi.fn(),
  updateCapacity: vi.fn(),
}));

const api = vi.mocked(adminApi);

const offerings = [
  adminOffering(),
  adminOffering({
    code: 'ME302',
    name: 'Renewable Energy Systems',
    department: { code: 'ME', name: 'Mechanical Engineering' },
    capacity: 40,
    allocated: 3,
    available: 37,
    demand: 12,
    demandRatio: 0.3,
    oversubscribed: false,
  }),
];

function renderAdminCourses() {
  return renderRoute(<AdminCoursesPage />, { path: '/admin/courses' });
}

async function openEditor(user: ReturnType<typeof userEvent.setup>, code = 'CS401') {
  await user.click(await screen.findByRole('button', { name: `Edit capacity of ${code}` }));
  return screen.getByRole('dialog', { name: `Edit capacity · ${code}` });
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getAdminCourses.mockResolvedValue(ok({ window: fallWindow, items: offerings }));
});

describe('AdminCoursesPage', () => {
  it('marks oversubscribed rows with an icon and words', async () => {
    const { container } = renderAdminCourses();
    const row = (await screen.findByText('Artificial Intelligence')).closest('tr')!;

    expect(row).toHaveAttribute('data-tone', 'warning');
    expect(within(row).getByText('Oversubscribed')).toBeVisible();
    expect(within(row).getByText('5.7×')).toBeVisible();
    const calm = screen.getByText('Renewable Energy Systems').closest('tr')!;
    expect(within(calm).getByText('Within capacity')).toBeVisible();
    expect(screen.getByText('2 offerings · 1 oversubscribed')).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('validates the capacity form before sending anything', async () => {
    const user = userEvent.setup();
    renderAdminCourses();
    const dialog = await openEditor(user);

    const capacity = within(dialog).getByLabelText('New capacity');
    expect(capacity).toHaveAttribute('min', '12');
    expect(capacity).toBeRequired();
    await user.clear(capacity);
    await user.type(capacity, '5');
    await user.click(within(dialog).getByRole('button', { name: 'Save capacity' }));

    expect(capacity).toHaveAccessibleDescription(
      expect.stringContaining('Capacity can’t be lower than 12'),
    );
    expect(capacity).toHaveFocus();
    expect(within(dialog).getByLabelText('Reason')).toHaveAttribute('aria-invalid', 'true');
    expect(api.updateCapacity).not.toHaveBeenCalled();
  });

  it('shows the server’s field error next to the field', async () => {
    api.updateCapacity.mockResolvedValue({
      success: false,
      data: null,
      message: 'Capacity can’t be lower than 14: 14 seats are already allocated.',
      errors: [
        {
          field: 'capacity',
          message: 'Capacity can’t be lower than 14: 14 seats are already allocated.',
        },
      ],
    });
    const user = userEvent.setup();
    renderAdminCourses();
    const dialog = await openEditor(user);

    const capacity = within(dialog).getByLabelText('New capacity');
    await user.clear(capacity);
    await user.type(capacity, '13');
    await user.type(within(dialog).getByLabelText('Reason'), 'Room is smaller');
    await user.click(within(dialog).getByRole('button', { name: 'Save capacity' }));

    expect(api.updateCapacity).toHaveBeenCalledWith('CS401', {
      capacity: 13,
      reason: 'Room is smaller',
    });
    expect(capacity).toHaveAccessibleDescription(
      expect.stringContaining('14 seats are already allocated'),
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('saves, closes, confirms with a toast and updates the row', async () => {
    api.updateCapacity.mockResolvedValue(
      ok(adminOffering({ capacity: 30, available: 18, demandRatio: 3.8 })),
    );
    const user = userEvent.setup();
    renderAdminCourses();
    const dialog = await openEditor(user);

    const capacity = within(dialog).getByLabelText('New capacity');
    await user.clear(capacity);
    await user.type(capacity, '30');
    await user.type(within(dialog).getByLabelText('Reason'), 'Second lab room approved');
    await user.click(within(dialog).getByRole('button', { name: 'Save capacity' }));

    expect(await screen.findByText('CS401 capacity is now 30')).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const row = screen.getByText('Artificial Intelligence').closest('tr')!;
    // Columns: code, course, department, capacity, …
    expect(row.cells[3]).toHaveTextContent(/^30$/);
    expect(within(row).getByText('3.8×')).toBeVisible();
  });
});
