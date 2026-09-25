import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as courseApi from '../../api/courseApi';
import { expectNoA11yViolations } from '../../test/axe';
import { courseDetail, ok } from '../../test/catalogueFixtures';
import { renderRoute } from '../../test/renderRoute';
import { CourseDetailPage } from './CourseDetailPage';

vi.mock('../../api/courseApi', async (importOriginal) => ({
  ...(await importOriginal<typeof courseApi>()),
  getCourse: vi.fn(),
  getSeats: vi.fn(),
}));

const api = vi.mocked(courseApi);

function renderDetail(url = '/student/courses/cs401', state?: unknown) {
  return renderRoute(<CourseDetailPage />, { path: '/student/courses/:code', url, state });
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getSeats.mockResolvedValue({ kind: 'not-modified' });
});

describe('CourseDetailPage', () => {
  it('lays the course out in sections, with every requirement as text', async () => {
    api.getCourse.mockResolvedValue(
      ok(
        courseDetail({
          personal: {
            eligibility: {
              eligible: false,
              reasons: [
                { type: 'SEMESTER_TOO_LOW', required: 5, actual: 3 },
                {
                  type: 'PREREQUISITE_MISSING',
                  course: { code: 'MA201', name: 'Probability and Statistics' },
                },
              ],
            },
            myStatus: { code: 'NOT_SELECTED' },
          },
        }),
      ),
    );
    const { container } = renderDetail();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Artificial Intelligence' }),
    ).toBeInTheDocument();
    expect(api.getCourse).toHaveBeenCalledWith('CS401', expect.any(AbortSignal));
    // The title is set by an effect, which React may flush after the heading
    // renders; asserting it directly is a race under a loaded test run.
    await waitFor(() => {
      expect(document.title).toBe('CS401 Artificial Intelligence · Course Registration');
    });

    const article = screen.getByRole('article', { name: 'CS401 Artificial Intelligence' });
    expect(within(article).getByRole('heading', { name: 'About this course' })).toBeVisible();
    expect(article).toHaveTextContent('Assessed through four programming assignments.');

    const eligibility = within(article)
      .getByRole('heading', { name: 'Your eligibility' })
      .closest('section')!;
    expect(eligibility).toHaveTextContent('Not eligible');
    expect(eligibility).toHaveTextContent('Needs semester 5 — you’re in semester 3');
    expect(eligibility).toHaveTextContent('Complete MA201 Probability and Statistics first');

    const prerequisites = within(article)
      .getByRole('heading', { name: 'Prerequisites' })
      .closest('section')!;
    const items = within(prerequisites).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('CS201Data Structures and AlgorithmsPassed');
    expect(items[1]).toHaveTextContent('MA201Probability and StatisticsNot passed yet');

    expect(screen.getByRole('meter', { name: 'Seats in Artificial Intelligence' })).toBeVisible();
    expect(article).toHaveTextContent('114 requests · 5.7×');
    expect(article).toHaveTextContent('Oversubscribed');
    expect(article).toHaveTextContent('Not selected');
    // No fake cart button: that action arrives with the registration cart.
    expect(screen.queryByRole('button', { name: /cart/i })).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('links back to the catalogue with the filters the student came from', async () => {
    api.getCourse.mockResolvedValue(ok(courseDetail()));
    renderDetail('/student/courses/CS401', { catalogueSearch: '?department=CSE&view=table' });

    expect(await screen.findByRole('link', { name: 'Back to the catalogue' })).toHaveAttribute(
      'href',
      '/student/courses?department=CSE&view=table',
    );
  });

  it('says plainly when a course code is not in the catalogue', async () => {
    api.getCourse.mockResolvedValue({
      success: false,
      data: null,
      message: 'No course with code XX999 is offered in Fall 2026.',
      httpStatus: 404,
    } as Awaited<ReturnType<typeof courseApi.getCourse>>);
    const { container } = renderDetail('/student/courses/xx999');

    expect(
      await screen.findByRole('heading', { name: 'XX999 isn’t in this term’s catalogue' }),
    ).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to the catalogue' })).toHaveAttribute(
      'href',
      '/student/courses',
    );
    await expectNoA11yViolations(container);
  });

  it('offers a retry for other failures', async () => {
    api.getCourse.mockResolvedValueOnce({
      success: false,
      data: null,
      message: 'Could not reach the server.',
    });
    api.getCourse.mockResolvedValueOnce(ok(courseDetail()));
    renderDetail();

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server.');
    screen.getByRole('button', { name: 'Try again' }).click();
    expect(await screen.findByRole('heading', { name: 'About this course' })).toBeVisible();
  });
});
