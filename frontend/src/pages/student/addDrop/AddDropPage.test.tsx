import type { AddDropResult } from '@course-reg/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as addDropApi from '../../../api/addDropApi';
import { expectNoA11yViolations } from '../../../test/axe';
import { ok } from '../../../test/catalogueFixtures';
import {
  addDropClosed,
  addDropForNewcomer,
  addDropView,
  makeAddDropCourse,
} from '../../../test/registrationFixtures';
import { renderRoute } from '../../../test/renderRoute';
import { AddDropPage } from './AddDropPage';

vi.mock('../../../api/addDropApi', () => ({
  getAddDrop: vi.fn(),
  dropCourse: vi.fn(),
  addCourse: vi.fn(),
  swapCourse: vi.fn(),
  joinWaitlist: vi.fn(),
  leaveWaitlist: vi.fn(),
}));
// The seat poll is a separate concern; this page only merges its numbers.
vi.mock('../../../hooks/useLiveSeats', () => ({
  useLiveSeats: () => ({
    snapshot: null,
    seats: null,
    changed: new Set(),
    updatedAt: null,
    failing: false,
  }),
}));

const api = vi.mocked(addDropApi);

const render = () => renderRoute(<AddDropPage />, { path: '/student/add-drop' });

/** The card for one course, found by its heading. */
function cardFor(code: string) {
  const heading = screen.getByRole('heading', { level: 3, name: new RegExp(code) });
  const card = heading.closest('article');
  if (!card) {
    throw new Error(`No card for ${code}`);
  }
  return within(card);
}

const result = (outcome: AddDropResult['result'], view = addDropView): AddDropResult => ({
  result: outcome,
  view,
  replayed: false,
});

beforeEach(() => {
  vi.clearAllMocks();
  api.getAddDrop.mockResolvedValue(ok(addDropView));
});

describe('AddDropPage', () => {
  it('names the seat held, how it was got, and offers Drop', async () => {
    const { container } = render();

    expect(await screen.findByRole('heading', { name: 'Your elective' })).toBeVisible();
    const held = cardFor('CS402');
    expect(held.getByText(/Allocated to you in the registration round/)).toBeVisible();
    expect(held.getByRole('button', { name: 'Drop CS402' })).toBeEnabled();
    await expectNoA11yViolations(container);
  });

  it('offers Swap, not Add, to a student who already holds a seat', async () => {
    api.getAddDrop.mockResolvedValue(
      ok({
        ...addDropView,
        full: [
          makeAddDropCourse({ code: 'PH400', name: 'Photonics', allocated: 25, capacity: 25 }),
        ],
      }),
    );
    render();
    await screen.findByRole('heading', { name: 'Your elective' });

    expect(cardFor('CS404').getByRole('button', { name: 'Swap into CS404' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /^Add / })).not.toBeInTheDocument();
    // A queue place needs an empty timetable, so a full course offers nothing.
    expect(cardFor('PH400').getByText(/a waitlist place needs an empty timetable/)).toBeVisible();
  });

  it('lists a course the student is already waiting for only once', async () => {
    // CS401 is full AND one of their queues; the queue section is where the
    // place in line is, so the "Full courses" list must not repeat it.
    render();
    await screen.findByRole('heading', { name: 'Your elective' });

    expect(screen.getAllByRole('heading', { level: 3, name: /CS401/ })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Leave waitlist' })).toBeEnabled();
  });

  it('offers Add and Join waitlist to a student holding nothing', async () => {
    api.getAddDrop.mockResolvedValue(ok(addDropForNewcomer));
    render();

    expect(await screen.findByText(/You don’t hold an elective/)).toBeVisible();
    expect(cardFor('CS404').getByRole('button', { name: 'Add CS404' })).toBeEnabled();
    expect(cardFor('CS401').getByRole('button', { name: 'Join waitlist' })).toBeEnabled();
  });

  it('states the consequence plainly before dropping, and needs confirming', async () => {
    const user = userEvent.setup();
    api.dropCourse.mockResolvedValue(
      ok(
        result({
          outcome: 'DROPPED',
          course: { code: 'CS402', name: 'Cloud Security' },
          dropReason: 'STUDENT_DROP',
          promotions: {
            promoted: [
              {
                student: { name: 'Priya', email: 'p@x', program: 'CSE', semester: 5 },
                course: { code: 'CS402', name: 'Cloud Security' },
                fromCourse: null,
              },
            ],
            removed: [],
          },
          leftWaitlists: [],
        }),
      ),
    );
    render();
    await screen.findByRole('heading', { name: 'Your elective' });

    await user.click(screen.getByRole('button', { name: 'Drop CS402' }));

    const dialog = within(await screen.findByRole('dialog'));
    expect(
      dialog.getByText(/Your seat in CS402 Cloud Security goes to the next student/),
    ).toBeVisible();
    expect(dialog.getByText(/won’t get it back unless another seat opens/)).toBeVisible();

    await user.click(dialog.getByRole('button', { name: 'Drop the course' }));

    await waitFor(() => {
      expect(api.dropCourse).toHaveBeenCalledWith(
        { code: 'CS402', leaveWaitlists: false },
        expect.any(String),
      );
    });
    // The message reaches both the toast and the page's own live region.
    expect(
      (await screen.findAllByText(/The seat went straight to the next student/)).length,
    ).toBeGreaterThan(0);
  });

  it('can leave the waitlists in the same action', async () => {
    const user = userEvent.setup();
    api.dropCourse.mockResolvedValue(
      ok(
        result({
          outcome: 'DROPPED',
          course: { code: 'CS402', name: 'Cloud Security' },
          dropReason: 'STUDENT_DROP',
          promotions: { promoted: [], removed: [] },
          leftWaitlists: [{ code: 'CS401', name: 'Artificial Intelligence' }],
        }),
      ),
    );
    render();
    await screen.findByRole('heading', { name: 'Your elective' });

    await user.click(screen.getByRole('button', { name: 'Drop CS402' }));
    const dialog = within(await screen.findByRole('dialog'));
    await user.click(dialog.getByRole('checkbox', { name: /Also leave my 1 waitlist/ }));
    await user.click(dialog.getByRole('button', { name: 'Drop the course' }));

    await waitFor(() => {
      expect(api.dropCourse).toHaveBeenCalledWith(
        { code: 'CS402', leaveWaitlists: true },
        expect.any(String),
      );
    });
  });

  it('shows “That seat was just taken” with a one-click Join waitlist', async () => {
    const user = userEvent.setup();
    api.getAddDrop.mockResolvedValue(ok(addDropForNewcomer));
    api.addCourse.mockResolvedValue({
      success: false,
      data: null,
      message: 'That seat was just taken.',
      httpStatus: 409,
      details: [{ type: 'SEAT_TAKEN', code: 'CS404', capacity: 30 }],
    });
    api.joinWaitlist.mockResolvedValue(
      ok(
        result(
          {
            outcome: 'WAITLISTED',
            course: { code: 'CS404', name: 'Computer Vision' },
            position: 4,
            waiting: 4,
            courseWasFull: true,
          },
          addDropForNewcomer,
        ),
      ),
    );
    const { container } = render();
    await screen.findByText(/You don’t hold an elective/);

    await user.click(cardFor('CS404').getByRole('button', { name: 'Add CS404' }));

    const alert = within(await screen.findByRole('alert'));
    expect(alert.getByText('That seat was just taken')).toBeVisible();
    expect(alert.getByText(/All 30 seats are held/)).toBeVisible();
    await expectNoA11yViolations(container);

    // One click from the message itself, with no need to find the card again.
    await user.click(alert.getByRole('button', { name: 'Join the waitlist for CS404' }));
    await waitFor(() => {
      expect(api.joinWaitlist).toHaveBeenCalledWith({ code: 'CS404' }, expect.any(String));
    });
    expect((await screen.findAllByText(/joined its waitlist at 4th of 4/)).length).toBeGreaterThan(
      0,
    );
  });

  it('reuses the idempotency key when the answer never arrives', async () => {
    const user = userEvent.setup();
    api.getAddDrop.mockResolvedValue(ok(addDropForNewcomer));
    // httpStatus null means the server was never reached.
    api.addCourse.mockResolvedValue({
      success: false,
      data: null,
      message: 'Could not reach the server.',
      httpStatus: null,
    });
    render();
    await screen.findByText(/You don’t hold an elective/);

    const button = cardFor('CS404').getByRole('button', { name: 'Add CS404' });
    await user.click(button);
    expect(await screen.findByText(/won’t move a second seat/)).toBeVisible();

    await user.click(cardFor('CS404').getByRole('button', { name: 'Add CS404' }));
    await waitFor(() => {
      expect(api.addCourse).toHaveBeenCalledTimes(2);
    });
    const [first, second] = api.addCourse.mock.calls;
    // The SAME key: the server replays its first answer rather than adding
    // twice.
    expect(second?.[1]).toBe(first?.[1]);
  });

  it('is read-only outside the period, and says when it ran', async () => {
    api.getAddDrop.mockResolvedValue(ok(addDropClosed));
    const { container } = render();

    expect(await screen.findByText(/The add\/drop period has closed/)).toBeVisible();
    expect(screen.getByText(/Add\/drop runs/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Drop CS402' })).toBeDisabled();
    expect(cardFor('CS404').getByRole('button', { name: 'Swap into CS404' })).toBeDisabled();
    await expectNoA11yViolations(container);
  });

  it('filters the courses without another request', async () => {
    const user = userEvent.setup();
    api.getAddDrop.mockResolvedValue(
      ok({
        ...addDropForNewcomer,
        available: [
          makeAddDropCourse(),
          makeAddDropCourse({ code: 'MG301', name: 'Financial Management' }),
        ],
      }),
    );
    render();
    await screen.findByText(/You don’t hold an elective/);

    await user.type(screen.getByRole('searchbox', { name: 'Filter these courses' }), 'financial');

    await waitFor(() => {
      expect(screen.queryByRole('heading', { level: 3, name: /CS404/ })).not.toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { level: 3, name: /MG301/ })).toBeVisible();
    expect(api.getAddDrop).toHaveBeenCalledTimes(1);
  });

  it('explains a refusal beside the course it belongs to', async () => {
    const user = userEvent.setup();
    api.getAddDrop.mockResolvedValue(ok(addDropView));
    api.swapCourse.mockResolvedValue({
      success: false,
      data: null,
      message: 'You are not eligible for CS404.',
      httpStatus: 409,
      details: [
        {
          type: 'NOT_ELIGIBLE',
          code: 'CS404',
          eligibility: {
            eligible: false,
            reasons: [{ type: 'SEMESTER_TOO_LOW', required: 7, actual: 5 }],
          },
        },
      ],
    });
    render();
    await screen.findByRole('heading', { name: 'Your elective' });

    await user.click(cardFor('CS404').getByRole('button', { name: 'Swap into CS404' }));

    // Beside the course, and in the toast.
    expect((await screen.findAllByText('You are not eligible for CS404.')).length).toBe(2);
  });
});
