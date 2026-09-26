import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as allocationApi from '../../api/allocationApi';
import { expectNoA11yViolations } from '../../test/axe';
import { ok } from '../../test/catalogueFixtures';
import { pendingResults, studentResults } from '../../test/registrationFixtures';
import { renderRoute } from '../../test/renderRoute';
import { ResultsPage } from './ResultsPage';

vi.mock('../../api/allocationApi', () => ({ getMyAllocationResults: vi.fn() }));

const api = vi.mocked(allocationApi);

const renderResults = () => renderRoute(<ResultsPage />, { path: '/student/results' });

/** The card for one course, found by its heading. */
function cardFor(name: string) {
  const heading = screen.getByRole('heading', { level: 3, name: new RegExp(name) });
  const card = heading.closest('article');
  if (!card) {
    throw new Error(`No result card for ${name}`);
  }
  return within(card);
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getMyAllocationResults.mockResolvedValue(ok(studentResults));
});

describe('ResultsPage', () => {
  it('says when results will exist, before allocation has run', async () => {
    api.getMyAllocationResults.mockResolvedValue(ok(pendingResults));
    const { container } = renderResults();

    expect(await screen.findByRole('heading', { name: 'Results aren’t out yet' })).toBeVisible();
    expect(screen.getByText(/Allocation runs once registration closes on/)).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('leads with the seat the student holds', async () => {
    const { container } = renderResults();

    expect(await screen.findByText('You have a seat')).toBeVisible();
    expect(screen.getByRole('heading', { level: 2, name: /Cloud Security/ })).toBeVisible();
    expect(screen.getByText(/Your second choice\./)).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('explains a waitlisted course with its position, score and cut-off', async () => {
    renderResults();
    await screen.findByText('You have a seat');

    const card = cardFor('Artificial Intelligence');
    expect(card.getByText('Waitlisted, #7')).toBeVisible();
    expect(card.getByText('You ranked it 1st.')).toBeVisible();
    expect(
      card.getByText('Your score for this course was 120 (1st preference 100 + final year 20).'),
    ).toBeVisible();
    expect(
      card.getByText('20 seats went to applicants with scores of 185 or higher.'),
    ).toBeVisible();
    expect(
      card.getByText('You are 7th in the queue and move up automatically if a seat opens.'),
    ).toBeVisible();
  });

  it('shows the score as a sum inside a details disclosure', async () => {
    const user = userEvent.setup();
    renderResults();
    await screen.findByText('You have a seat');

    const card = cardFor('Artificial Intelligence');
    const summary = card.getByText('How your score was worked out');
    // Closed by default: the detail is there for whoever wants it.
    expect(summary.closest('details')?.open).toBe(false);

    await user.click(summary);
    expect(summary.closest('details')?.open).toBe(true);
    expect(card.getByText('Final year')).toBeVisible();
    expect(card.getByText('+20')).toBeVisible();
    expect(card.getByText('120')).toBeVisible();
  });

  it('says plainly when nothing was allocated', async () => {
    api.getMyAllocationResults.mockResolvedValue(
      ok({
        ...studentResults,
        allocated: null,
        held: null,
        results: [studentResults.results[0]!],
      }),
    );
    renderResults();

    expect(await screen.findByText('No seat this round')).toBeVisible();
    expect(
      screen.getByRole('heading', { level: 2, name: 'None of your choices had a seat left' }),
    ).toBeVisible();
  });

  it('names a seat taken during add/drop, which the run never decided', async () => {
    api.getMyAllocationResults.mockResolvedValue(
      ok({
        ...studentResults,
        allocated: null,
        held: { course: { code: 'MG301', name: 'Financial Management' }, source: 'ADD' },
        results: [studentResults.results[0]!],
      }),
    );
    renderResults();

    // "No seat this round" would be wrong: they do hold one.
    expect(await screen.findByText('You have a seat')).toBeVisible();
    expect(screen.getByRole('heading', { level: 2, name: /MG301/ })).toBeVisible();
    expect(screen.getByText(/took this seat yourself during add\/drop/)).toBeVisible();
  });

  it('offers a retry when the request fails', async () => {
    api.getMyAllocationResults.mockResolvedValue({
      success: false,
      data: null,
      message: 'Could not reach the server.',
      httpStatus: null,
    });
    renderResults();

    expect(await screen.findByText('Your results couldn’t be loaded')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
  });
});
