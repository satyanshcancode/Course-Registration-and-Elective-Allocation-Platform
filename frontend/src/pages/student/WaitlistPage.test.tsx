import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as waitlistApi from '../../api/waitlistApi';
import { expectNoA11yViolations } from '../../test/axe';
import { ok } from '../../test/catalogueFixtures';
import { emptyWaitlist, studentWaitlist, waitlistEntry } from '../../test/registrationFixtures';
import { renderRoute } from '../../test/renderRoute';
import { WaitlistPage } from './WaitlistPage';

vi.mock('../../api/waitlistApi', () => ({ getMyWaitlist: vi.fn() }));
// The seat poll is a separate concern; this page only merges its numbers.
vi.mock('../../hooks/useLiveSeats', () => ({
  useLiveSeats: () => ({
    snapshot: null,
    seats: null,
    changed: new Set(),
    updatedAt: null,
    failing: false,
  }),
}));

const api = vi.mocked(waitlistApi);

const renderWaitlist = () => renderRoute(<WaitlistPage />, { path: '/student/waitlist' });

/** The card for one course, found by its heading. */
function cardFor(code: string) {
  const heading = screen.getByRole('heading', { level: 3, name: new RegExp(code) });
  const card = heading.closest('article');
  if (!card) {
    throw new Error(`No card for ${code}`);
  }
  return within(card);
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getMyWaitlist.mockResolvedValue(ok(studentWaitlist));
});

describe('WaitlistPage', () => {
  it('says where the student stands in the queue, live', async () => {
    const { container } = renderWaitlist();

    expect(await screen.findByRole('heading', { name: 'Waiting for a seat' })).toBeVisible();
    const card = cardFor('CS401');
    expect(card.getByText('#3 of 18')).toBeVisible();
    expect(card.getByText(/You are 3rd of 18 waiting/)).toBeVisible();
    expect(card.getByText(/Every seat is taken/)).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('explains that a promotion is always an upgrade, naming the seat held', async () => {
    renderWaitlist();

    expect(
      await screen.findByText(/You hold a seat in CS402 Cloud Security, your 2nd choice/),
    ).toBeVisible();
    expect(screen.getByText(/your CS402 seat would be released/)).toBeVisible();
  });

  it('shows the score and the preference rank behind the position', async () => {
    renderWaitlist();
    await screen.findByRole('heading', { name: 'Waiting for a seat' });

    const card = cardFor('CS401');
    expect(card.getByText('Your choice').nextElementSibling).toHaveTextContent('1st');
    expect(card.getByText('Your score').nextElementSibling).toHaveTextContent('120');
  });

  it('says a seat is being offered down the list when one is free', async () => {
    api.getMyWaitlist.mockResolvedValue(
      ok({ ...studentWaitlist, waiting: [waitlistEntry({ allocated: 19 })] }),
    );
    renderWaitlist();

    expect(await screen.findByText(/1 seat is free right now/)).toBeVisible();
  });

  it('lists entries that ended, with the reason they ended', async () => {
    api.getMyWaitlist.mockResolvedValue(
      ok({
        ...studentWaitlist,
        waiting: [],
        ended: [
          waitlistEntry({ status: 'PROMOTED', position: null, endedAt: '2026-09-26T09:00:00Z' }),
          waitlistEntry({
            course: { code: 'CS403', name: 'Blockchain' },
            preferenceRank: 3,
            status: 'REMOVED',
            position: null,
            reason: 'RANKED_BELOW_SEAT',
          }),
        ],
      }),
    );
    const { container } = renderWaitlist();

    expect(await screen.findByRole('heading', { name: 'No longer waiting' })).toBeVisible();
    expect(cardFor('CS401').getByText(/you were next in line, so this one is yours/)).toBeVisible();
    expect(cardFor('CS403').getByText(/you were given a course you ranked higher/)).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('has an empty state for a student who is not waiting for anything', async () => {
    api.getMyWaitlist.mockResolvedValue(ok(emptyWaitlist));
    const { container } = renderWaitlist();

    expect(await screen.findByText('You’re not on any waitlist')).toBeVisible();
    expect(screen.getByText(/either had a seat for you or was ruled out/)).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('offers a retry when the request fails', async () => {
    api.getMyWaitlist.mockResolvedValue({
      success: false,
      data: null,
      message: 'Could not reach the server.',
      httpStatus: null,
    });
    renderWaitlist();

    expect(await screen.findByText('Your waitlist couldn’t be loaded')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
  });
});
